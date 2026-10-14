import { eq, and } from "drizzle-orm";
import { getPostgresDb } from "../database/db.js";
import { exams, examAttempts, classroomStudents, questions, classrooms } from "../database/schema.js";
import {
    calculateExamTiming,
    calculateAttemptExpiry,
    isStartWindowOpen,
    getRemainingMs,
} from "../utils/examTiming.utils.js";
import { deterministicShuffle } from "../utils/shuffle.utils.js";
import { ExamAttemptRedisRepository } from "../redis/examAttempt.redis.js";
import { ExamSubmissionService } from "./examSubmission.service.js";
import { getExamSchedulerQueue } from "../queues/exam.queue.js";
import type {
    ExamParticipationStatus,
    PublicQuestionItem,
} from "../constants/types.js";

export class ExamAttemptService {
    /**
     * Returns the student's current participation status and server-authoritative timing.
     */
    static async getParticipationStatus(examId: string, userId: string) {
        const db = getPostgresDb();
        const now = new Date();

        const [exam] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        if (!exam) {
            return null;
        }

        const timing = calculateExamTiming({
            scheduledStart: exam.scheduledStart,
            accessWindowMinutes: exam.accessWindowMinutes,
            durationMinutes: exam.durationMinutes,
        });

        // Find existing attempt
        const [existingAttempt] = await db
            .select()
            .from(examAttempts)
            .where(
                and(
                    eq(examAttempts.examId, examId),
                    eq(examAttempts.studentId, userId)
                )
            )
            .limit(1);

        let participationStatus: ExamParticipationStatus = "NOT_STARTED";
        let canStart = false;
        let canResume = false;
        let remainingSeconds = 0;

        if (existingAttempt) {
            if (existingAttempt.status === "SUBMITTED") {
                participationStatus =
                    existingAttempt.submissionType === "AUTO_TIMEOUT"
                        ? "AUTO_SUBMITTED"
                        : "SUBMITTED";
            } else if (existingAttempt.status === "IN_PROGRESS") {
                const expiresAt = existingAttempt.expiresAt
                    ? new Date(existingAttempt.expiresAt)
                    : timing.hardEndAt;

                if (now.getTime() >= expiresAt.getTime()) {
                    // Trigger asynchronous auto-finalization in background
                    ExamSubmissionService.finalizeAttempt({
                        examId,
                        userId,
                        reason: "AUTO_TIMEOUT",
                        attemptId: existingAttempt.id,
                    }).catch((err) =>
                        console.error("[getParticipationStatus] Finalize error:", err.message)
                    );

                    participationStatus = "AUTO_SUBMITTED";
                } else {
                    participationStatus = "IN_PROGRESS";
                    canResume = true;
                    remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
                }
            } else {
                participationStatus = "ENDED";
            }
        } else {
            // No attempt started yet
            if (now.getTime() > timing.latestStartAt.getTime()) {
                participationStatus = "ENDED";
            } else if (exam.status === "LIVE" && isStartWindowOpen(timing.scheduledStart, timing.latestStartAt, now)) {
                participationStatus = "NOT_STARTED";
                canStart = true;
            } else {
                participationStatus = "NOT_STARTED";
            }
        }

        return {
            examStatus: exam.status,
            participationStatus,
            scheduledStart: timing.scheduledStart.toISOString(),
            latestStartAt: timing.latestStartAt.toISOString(),
            hardEndAt: timing.hardEndAt.toISOString(),
            serverTime: now.toISOString(),
            startedAt: existingAttempt?.startedAt ? new Date(existingAttempt.startedAt).toISOString() : null,
            expiresAt: existingAttempt?.expiresAt ? new Date(existingAttempt.expiresAt).toISOString() : null,
            canStart,
            canResume,
            remainingSeconds,
        };
    }

    /**
     * Starts a new attempt or resumes an existing active attempt.
     */
    static async startAttempt(examId: string, userId: string) {
        const db = getPostgresDb();
        const now = new Date();

        // 1. Verify exam exists
        const [exam] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        if (!exam) {
            throw new Error("EXAM_NOT_FOUND");
        }

        // 2. Verify student authorization / classroom membership
        const [membership] = await db
            .select()
            .from(classroomStudents)
            .where(
                and(
                    eq(classroomStudents.classroomId, exam.classroomId),
                    eq(classroomStudents.studentId, userId),
                    eq(classroomStudents.status, "APPROVED")
                )
            )
            .limit(1);

        if (!membership) {
            throw new Error("UNAUTHORIZED_STUDENT");
        }

        // 3. Verify exam status permits participation
        if (exam.status !== "LIVE") {
            throw new Error(`EXAM_NOT_LIVE: Current status is ${exam.status}`);
        }

        // 4. Verify timing boundaries
        const timing = calculateExamTiming({
            scheduledStart: exam.scheduledStart,
            accessWindowMinutes: exam.accessWindowMinutes,
            durationMinutes: exam.durationMinutes,
        });

        // 5. Check if attempt already exists (strictly one attempt per student)
        const [existing] = await db
            .select()
            .from(examAttempts)
            .where(
                and(
                    eq(examAttempts.examId, examId),
                    eq(examAttempts.studentId, userId)
                )
            )
            .limit(1);

        if (existing) {
            if (existing.status === "SUBMITTED" || existing.status === "ABANDONED") {
                throw new Error("ATTEMPT_ALREADY_SUBMITTED");
            }

            // Existing attempt in progress -> check if already expired
            const expiresAt = existing.expiresAt ? new Date(existing.expiresAt) : timing.hardEndAt;
            if (now.getTime() >= expiresAt.getTime()) {
                await ExamSubmissionService.finalizeAttempt({
                    examId,
                    userId,
                    reason: "AUTO_TIMEOUT",
                    attemptId: existing.id,
                });
                throw new Error("ATTEMPT_EXPIRED");
            }

            // Return snapshot to resume
            return await this.getAttemptSnapshot(examId, userId);
        }

        // Must be within start window for NEW attempts
        if (!isStartWindowOpen(timing.scheduledStart, timing.latestStartAt, now)) {
            throw new Error("ACCESS_WINDOW_CLOSED");
        }

        // 6. Calculate startedAt and attemptExpiresAt
        const startedAt = now;
        const attemptExpiresAt = calculateAttemptExpiry(
            startedAt,
            exam.durationMinutes,
            timing.hardEndAt
        );

        // 7. Fetch public questions from Redis or DB
        let publicQuestions = await ExamAttemptRedisRepository.getPublicQuestions(examId);
        if (!publicQuestions || publicQuestions.length === 0) {
            const dbQuestions = await db
                .select()
                .from(questions)
                .where(eq(questions.examId, examId))
                .orderBy(questions.orderSequence);

            await ExamAttemptRedisRepository.cachePublicQuestionsAndAnswerKey(
                examId,
                dbQuestions
            );
            publicQuestions = await ExamAttemptRedisRepository.getPublicQuestions(examId);
        }

        if (!publicQuestions || publicQuestions.length === 0) {
            throw new Error("NO_QUESTIONS_FOUND");
        }

        // 8. Deterministic question shuffle: seed = examId:userId:generationVersion
        const shuffleSeed = `${examId}:${userId}:${exam.generationVersion || 1}`;
        const orderedQuestions = deterministicShuffle(publicQuestions, shuffleSeed);
        const questionOrderIds = orderedQuestions.map((q) => q.id);

        // 9. Create durable DB Attempt row immediately
        const [newAttempt] = await db
            .insert(examAttempts)
            .values({
                examId,
                studentId: userId,
                status: "IN_PROGRESS",
                startedAt,
                expiresAt: attemptExpiresAt,
                questionOrder: questionOrderIds,
            })
            .returning();

        // 10. Initialize Redis working state hash with comfortable TTL buffer
        const ttlSeconds = Math.max(
            300,
            Math.ceil((attemptExpiresAt.getTime() - now.getTime()) / 1000) + 7200
        );

        await ExamAttemptRedisRepository.initAttemptState(
            examId,
            userId,
            {
                attemptId: newAttempt.id,
                classroomId: exam.classroomId,
                startedAt: startedAt.toISOString(),
                expiresAt: attemptExpiresAt.toISOString(),
                questionOrder: questionOrderIds,
            },
            ttlSeconds
        );

        // 11. Schedule durable BullMQ AUTO_SUBMIT_ATTEMPT job
        try {
            const schedulerQueue = getExamSchedulerQueue();
            const jobDelay = Math.max(0, attemptExpiresAt.getTime() - Date.now());
            const autoSubmitJobId = `auto-submit:${examId}:${userId}`;

            await schedulerQueue.add(
                "auto-submit-attempt",
                {
                    type: "AUTO_SUBMIT_ATTEMPT",
                    examId,
                    userId,
                    attemptId: newAttempt.id,
                    expiresAt: attemptExpiresAt.toISOString(),
                },
                {
                    jobId: autoSubmitJobId,
                    delay: jobDelay,
                }
            );
        } catch (jobErr: any) {
            console.error(
                `[ExamAttemptService] Failed to schedule AUTO_SUBMIT_ATTEMPT job:`,
                jobErr.message
            );
        }

        return {
            attemptId: newAttempt.id,
            status: "IN_PROGRESS",
            startedAt: startedAt.toISOString(),
            expiresAt: attemptExpiresAt.toISOString(),
            serverTime: now.toISOString(),
            remainingSeconds: Math.max(
                0,
                Math.floor((attemptExpiresAt.getTime() - now.getTime()) / 1000)
            ),
            questions: orderedQuestions,
            answers: {},
            reviews: {},
            revision: 1,
        };
    }

    /**
     * Builds complete snapshot to restore exam UI upon reconnect or reload.
     */
    static async getAttemptSnapshot(examId: string, userId: string) {
        const db = getPostgresDb();
        const now = new Date();

        const [attempt] = await db
            .select()
            .from(examAttempts)
            .where(
                and(
                    eq(examAttempts.examId, examId),
                    eq(examAttempts.studentId, userId)
                )
            )
            .limit(1);

        if (!attempt) {
            return null;
        }

        // If submitted, return submission state
        if (attempt.status === "SUBMITTED" || attempt.status === "ABANDONED") {
            return {
                attemptId: attempt.id,
                status: attempt.status,
                startedAt: attempt.startedAt ? new Date(attempt.startedAt).toISOString() : null,
                expiresAt: attempt.expiresAt ? new Date(attempt.expiresAt).toISOString() : null,
                submittedAt: attempt.submittedAt ? new Date(attempt.submittedAt).toISOString() : null,
                serverTime: now.toISOString(),
                remainingSeconds: 0,
                questions: [],
                answers: {},
                reviews: {},
                revision: 1,
            };
        }

        const expiresAt = attempt.expiresAt ? new Date(attempt.expiresAt) : now;

        // If already expired, finalize now
        if (now.getTime() >= expiresAt.getTime()) {
            await ExamSubmissionService.finalizeAttempt({
                examId,
                userId,
                reason: "AUTO_TIMEOUT",
                attemptId: attempt.id,
            });

            return {
                attemptId: attempt.id,
                status: "SUBMITTED",
                startedAt: attempt.startedAt ? new Date(attempt.startedAt).toISOString() : null,
                expiresAt: expiresAt.toISOString(),
                submittedAt: now.toISOString(),
                serverTime: now.toISOString(),
                remainingSeconds: 0,
                questions: [],
                answers: {},
                reviews: {},
                revision: 1,
            };
        }

        // Read Redis working state
        const redisState = await ExamAttemptRedisRepository.getAttemptState(examId, userId);

        // Fetch questions
        let publicQuestions = await ExamAttemptRedisRepository.getPublicQuestions(examId);
        if (!publicQuestions || publicQuestions.length === 0) {
            const dbQuestions = await db
                .select()
                .from(questions)
                .where(eq(questions.examId, examId))
                .orderBy(questions.orderSequence);

            await ExamAttemptRedisRepository.cachePublicQuestionsAndAnswerKey(
                examId,
                dbQuestions
            );
            publicQuestions = await ExamAttemptRedisRepository.getPublicQuestions(examId);
        }

        // Maintain persistent question order from attempt
        const questionMap = new Map<string, PublicQuestionItem>();
        for (const q of publicQuestions || []) {
            questionMap.set(q.id, q);
        }

        const order: string[] =
            Array.isArray(attempt.questionOrder) && attempt.questionOrder.length > 0
                ? attempt.questionOrder
                : redisState?.questionOrder || (publicQuestions || []).map((q) => q.id);

        const orderedQuestions = order
            .map((id) => questionMap.get(id))
            .filter(Boolean) as PublicQuestionItem[];

        return {
            attemptId: attempt.id,
            status: "IN_PROGRESS",
            startedAt: attempt.startedAt ? new Date(attempt.startedAt).toISOString() : null,
            expiresAt: expiresAt.toISOString(),
            serverTime: now.toISOString(),
            remainingSeconds: Math.max(
                0,
                Math.floor((expiresAt.getTime() - now.getTime()) / 1000)
            ),
            questions: orderedQuestions,
            answers: redisState?.answers || {},
            reviews: redisState?.reviews || {},
            revision: redisState?.revision || 1,
        };
    }
}
