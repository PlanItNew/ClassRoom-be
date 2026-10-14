import { eq, and, sql, desc } from "drizzle-orm";
import { getPostgresDb } from "../database/db.js";
import { exams, examAttempts, questions, users } from "../database/schema.js";
import { ExamAttemptRedisRepository } from "../redis/examAttempt.redis.js";
import { AnswerEvaluationService, type EvaluationResult } from "./answerEvaluation.service.js";
import { calculateExamTiming } from "../utils/examTiming.utils.js";
import type { AnswerKeyItem, AttemptAnswerItem } from "../constants/types.js";

export interface FinalizeResult {
    alreadyFinalized: boolean;
    attempt: any;
    score: number;
    resultsReleased: boolean;
    evaluation?: EvaluationResult | undefined;
}

export class ExamSubmissionService {
    /**
     * Central idempotent attempt finalization service.
     * Guaranteed safe against concurrent calls from:
     * - manual submit
     * - socket timer
     * - BullMQ timeout worker
     */
    static async finalizeAttempt(params: {
        examId: string;
        userId: string;
        reason: "MANUAL" | "AUTO_TIMEOUT";
        attemptId?: string | undefined;
    }): Promise<FinalizeResult | null> {
        const { examId, userId, reason } = params;
        const db = getPostgresDb();

        let finalScore = 0;
        let isAlreadyFinalized = false;
        let finalAttemptRecord: any = null;
        let evaluationResult: EvaluationResult | undefined;

        // 1. Transaction with Row-Level Lock (FOR UPDATE) to prevent races
        await db.transaction(async (tx: any) => {
            const attemptRows = await tx
                .select()
                .from(examAttempts)
                .where(
                    and(
                        eq(examAttempts.examId, examId),
                        eq(examAttempts.studentId, userId)
                    )
                )
                .for("update")
                .limit(1);

            if (!attemptRows || attemptRows.length === 0) {
                return;
            }

            const currentAttempt = attemptRows[0];

            // 2. Detect already finalized attempt
            if (currentAttempt.status === "SUBMITTED" || currentAttempt.status === "ABANDONED") {
                isAlreadyFinalized = true;
                finalAttemptRecord = currentAttempt;
                finalScore = parseFloat(String(currentAttempt.totalScore || "0"));
                return;
            }

            // 3. Read active working state from Redis
            const activeState = await ExamAttemptRedisRepository.getAttemptState(examId, userId);
            const activeAnswers = activeState?.answers || {};
            const activeReviews = activeState?.reviews || {};

            // 4. Obtain private answer key (Redis or fallback to DB)
            let answerKey = await ExamAttemptRedisRepository.getAnswerKey(examId);
            if (!answerKey || answerKey.length === 0) {
                const dbQuestions = await tx
                    .select()
                    .from(questions)
                    .where(eq(questions.examId, examId))
                    .orderBy(questions.orderSequence);

                answerKey = dbQuestions.map((q: any) => ({
                    questionId: q.id,
                    correctOption: q.correctOption,
                    reason: q.reason || null,
                }));
            }

            // 5. Determine question ordering
            let questionOrder: string[] = [];
            if (Array.isArray(currentAttempt.questionOrder)) {
                questionOrder = currentAttempt.questionOrder;
            } else if (activeState?.questionOrder && activeState.questionOrder.length > 0) {
                questionOrder = activeState.questionOrder;
            }

            // 6. Grade answers
            evaluationResult = AnswerEvaluationService.evaluate(
                activeAnswers,
                activeReviews,
                answerKey as AnswerKeyItem[],
                questionOrder
            );

            finalScore = evaluationResult.totalScore;
            const now = new Date();

            // 7. Persist to DB
            const [updatedAttempt] = await tx
                .update(examAttempts)
                .set({
                    status: "SUBMITTED",
                    submissionType: reason,
                    completedAt: now,
                    submittedAt: now,
                    totalScore: sql`${finalScore}::numeric(5, 2)`,
                    answers: evaluationResult.finalAnswersJSON,
                    questionOrder: questionOrder.length > 0 ? questionOrder : null,
                    updatedAt: now,
                })
                .where(eq(examAttempts.id, currentAttempt.id))
                .returning();

            finalAttemptRecord = updatedAttempt;
        });

        if (!finalAttemptRecord) {
            return null;
        }

        // Only perform side effects if we were the winner of the race
        if (!isAlreadyFinalized) {
            try {
                // 8. Update Redis Leaderboard Sorted Set
                await ExamAttemptRedisRepository.updateLeaderboard(examId, userId, finalScore);

                // 9. Remove from active attempts set
                await ExamAttemptRedisRepository.removeActiveAttempt(examId, userId);

                // 10. Delete working Redis hash AFTER successful DB persistence
                await ExamAttemptRedisRepository.deleteAttemptState(examId, userId);
            } catch (err: any) {
                console.error(`[ExamSubmissionService] Error in post-finalization cleanup:`, err.message);
            }
        }

        // Check if results are released yet
        const [examRecord] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        const isReleased = examRecord ? this.areResultsReleased(examRecord) : false;

        return {
            alreadyFinalized: isAlreadyFinalized,
            attempt: finalAttemptRecord,
            score: finalScore,
            resultsReleased: isReleased,
            evaluation: evaluationResult,
        };
    }

    /**
     * Determines whether exam results and answer keys may be securely released.
     */
    static areResultsReleased(exam: any): boolean {
        if (exam.status === "COMPLETED") return true;
        const timing = calculateExamTiming({
            scheduledStart: exam.scheduledStart,
            accessWindowMinutes: exam.accessWindowMinutes,
            durationMinutes: exam.durationMinutes,
        });
        return Date.now() >= timing.hardEndAt.getTime();
    }

    /**
     * Securely retrieves exam results for student or teacher.
     */
    static async getExamResults(examId: string, userId: string, userRole: "TEACHER" | "STUDENT") {
        const db = getPostgresDb();

        const [exam] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        if (!exam) {
            return null;
        }

        const resultsReleased = userRole === "TEACHER" || this.areResultsReleased(exam);

        // Fetch question paper
        const questionRows = await db
            .select()
            .from(questions)
            .where(eq(questions.examId, examId))
            .orderBy(questions.orderSequence);

        const questionMap = new Map<string, any>();
        for (const q of questionRows) {
            questionMap.set(q.id, q);
        }

        if (userRole === "TEACHER") {
            // Teacher View: Canonical ordering, all submissions, leaderboard
            const submissions = await db
                .select({
                    attemptId: examAttempts.id,
                    studentId: examAttempts.studentId,
                    studentName: users.fullName,
                    studentEmail: users.email,
                    status: examAttempts.status,
                    totalScore: examAttempts.totalScore,
                    submissionType: examAttempts.submissionType,
                    startedAt: examAttempts.startedAt,
                    submittedAt: examAttempts.submittedAt,
                    answers: examAttempts.answers,
                })
                .from(examAttempts)
                .innerJoin(users, eq(examAttempts.studentId, users.id))
                .where(eq(examAttempts.examId, examId))
                .orderBy(desc(examAttempts.totalScore));

            const redisLeaderboard = await ExamAttemptRedisRepository.getLeaderboard(examId, 100);

            return {
                exam,
                isTeacher: true,
                resultsReleased: true,
                questions: questionRows,
                submissions,
                leaderboard: redisLeaderboard,
            };
        }

        // Student View: Deterministic shuffle ordering preserved from attempt!
        const [studentAttempt] = await db
            .select()
            .from(examAttempts)
            .where(
                and(
                    eq(examAttempts.examId, examId),
                    eq(examAttempts.studentId, userId)
                )
            )
            .limit(1);

        if (!studentAttempt) {
            return {
                exam,
                isTeacher: false,
                hasAttempt: false,
                resultsReleased,
            };
        }

        // Use the saved questionOrder from student's attempt
        const rawAnswers: AttemptAnswerItem[] = (studentAttempt.answers as any) || [];
        const answersMap = new Map<string, AttemptAnswerItem>();
        for (const ans of rawAnswers) {
            answersMap.set(ans.questionId, ans);
        }

        const studentQuestionOrder: string[] =
            Array.isArray(studentAttempt.questionOrder) && studentAttempt.questionOrder.length > 0
                ? studentAttempt.questionOrder
                : questionRows.map((q: any) => q.id);

        const studentQuestions = studentQuestionOrder
            .map((qId) => questionMap.get(qId))
            .filter(Boolean)
            .map((q) => {
                const studentAns = answersMap.get(q.id);
                const selectedOpt = studentAns?.selectedOption;
                const markedForReview = studentAns?.markedForReview || false;

                if (!resultsReleased) {
                    // Safe View: NO correctOption, NO reason
                    return {
                        id: q.id,
                        question: q.question,
                        options: q.options,
                        difficulty: q.difficulty,
                        selectedOption: selectedOpt,
                        markedForReview,
                    };
                }

                // Released View: full explanations and verification
                const isCorrect =
                    selectedOpt !== undefined &&
                    selectedOpt.toUpperCase() === q.correctOption.toUpperCase();

                return {
                    id: q.id,
                    question: q.question,
                    options: q.options,
                    difficulty: q.difficulty,
                    selectedOption: selectedOpt,
                    correctOption: q.correctOption,
                    isCorrect,
                    reason: q.reason,
                    markedForReview,
                };
            });

        return {
            exam,
            isTeacher: false,
            hasAttempt: true,
            resultsReleased,
            attempt: {
                id: studentAttempt.id,
                status: studentAttempt.status,
                startedAt: studentAttempt.startedAt,
                submittedAt: studentAttempt.submittedAt,
                submissionType: studentAttempt.submissionType,
                totalScore: studentAttempt.totalScore,
            },
            questions: studentQuestions,
        };
    }
}
