import { Worker, Job } from "bullmq";
import { applicationConfig } from "../config/index.js";
import { bullMqQueues, redisTTLs } from "../constants/constants.js";
import { EmailTemplateType, type ExamSchedulerJobData } from "../constants/types.js";
import { getPostgresDb } from "../database/db.js";
import { exams, questions, classrooms, classroomStudents, users } from "../database/schema.js";
import { eq, and } from "drizzle-orm";
import { getEmailQueue } from "../queues/email.queue.js";
import {
    cacheExamQuestions,
    initExamLeaderboard,
    setExamShadowKey,
} from "../redis/redis.api.js";
import { appConfig } from "../config/app.config.js";

export let examSchedulerWorker: Worker | null = null;

export const initExamSchedulerWorker = (): Worker => {
    if (!examSchedulerWorker) {
        examSchedulerWorker = new Worker(
            bullMqQueues.EXAM_SCHEDULER,
            async (job: Job<ExamSchedulerJobData>) => {
                const { type, examId, classroomId, generationVersion, scheduledStart } = job.data;
                const db = getPostgresDb();

                console.log(
                    `[ExamSchedulerWorker] Handling job ${job.id} - type: ${type} for exam ${examId}`
                );

                const examRows = await db
                    .select()
                    .from(exams)
                    .where(eq(exams.id, examId))
                    .limit(1);

                if (examRows.length === 0) {
                    console.error(`[ExamSchedulerWorker] Exam ${examId} not found in database.`);
                    return;
                }

                const exam = examRows[0];

                // ─────────────────────────────────────────────────────────────
                // 1. PREPARE_EXAM (Triggers at scheduledStart - 5 minutes)
                // ─────────────────────────────────────────────────────────────
                if (type === "PREPARE_EXAM") {
                    // Check if exam is ready
                    if (exam.status !== "READY") {
                        console.warn(
                            `[ExamSchedulerWorker] Exam ${examId} is not in READY state (current: ${exam.status}). Setting to DELAYED.`
                        );

                        const failureReason =
                            exam.statusReason ||
                            (exam.status === "GENERATING_QUESTIONS"
                                ? "Question generation is still in progress"
                                : "Exam failed preparation checks");

                        await db
                            .update(exams)
                            .set({
                                status: "DELAYED",
                                statusReason: failureReason,
                                updatedAt: new Date(),
                            })
                            .where(eq(exams.id, examId));

                        // Notify Teacher via Brevo email
                        const [teacher] = await db
                            .select({ fullName: users.fullName, email: users.email })
                            .from(users)
                            .where(eq(users.id, exam.teacherId))
                            .limit(1);

                        const [classroom] = await db
                            .select({ name: classrooms.name })
                            .from(classrooms)
                            .where(eq(classrooms.id, exam.classroomId))
                            .limit(1);

                        if (teacher && teacher.email) {
                            const emailQueue = getEmailQueue();
                            await emailQueue.add("exam-technical-failure-notice", {
                                to: teacher.email,
                                fullName: teacher.fullName,
                                template: EmailTemplateType.EXAM_FAILURE,
                                customParams: {
                                    name: teacher.fullName,
                                    exam_title: exam.title || "Scheduled Exam",
                                    classroom_name: classroom?.name || "Classroom",
                                    start_time: exam.scheduledStart
                                        ? new Date(exam.scheduledStart).toLocaleString()
                                        : "Scheduled Time",
                                    failure_reason: failureReason,
                                },
                            });
                        }
                        return;
                    }

                    // Primary Verification PASSED -> Transition to PREPARED
                    console.log(`[ExamSchedulerWorker] Exam ${examId} verified. Preparing cache and notifications...`);

                    const examQuestions = await db
                        .select()
                        .from(questions)
                        .where(eq(questions.examId, examId));

                    if (examQuestions.length === 0) {
                        console.error(`[ExamSchedulerWorker] Exam ${examId} has no questions. Marking PREPARATION_FAILED.`);
                        await db
                            .update(exams)
                            .set({
                                status: "PREPARATION_FAILED",
                                statusReason: "No questions exist in database for this exam",
                                updatedAt: new Date(),
                            })
                            .where(eq(exams.id, examId));
                        return;
                    }

                    // A. Cache questions in Redis
                    await cacheExamQuestions(examId, examQuestions);

                    // B. Initialize Redis Leaderboard
                    await initExamLeaderboard(examId);

                    // C. Setup Shadow Key with extended TTL
                    const gracePeriod = redisTTLs.EXAM_GRACE_PERIOD_MINUTES || 15;
                    const scheduledStartTime = exam.scheduledStart
                        ? new Date(exam.scheduledStart).getTime()
                        : Date.now();
                    const examEndTimestamp =
                        scheduledStartTime +
                        (exam.accessWindowMinutes + exam.durationMinutes + gracePeriod) * 60 * 1000;
                    const ttlSeconds = Math.max(300, Math.ceil((examEndTimestamp - Date.now()) / 1000));

                    await setExamShadowKey(examId, ttlSeconds);
                    console.log(
                        `[ExamSchedulerWorker] Shadow key set for exam ${examId} with TTL: ${ttlSeconds} seconds`
                    );

                    // D. Update Exam status to PREPARED
                    await db
                        .update(exams)
                        .set({
                            status: "PREPARED",
                            updatedAt: new Date(),
                        })
                        .where(eq(exams.id, examId));

                    // E. Send reminder emails to classroom students and teacher
                    const [classroom] = await db
                        .select({ name: classrooms.name })
                        .from(classrooms)
                        .where(eq(classrooms.id, exam.classroomId))
                        .limit(1);

                    const enrolledStudents = await db
                        .select({
                            studentId: classroomStudents.studentId,
                            email: users.email,
                            fullName: users.fullName,
                        })
                        .from(classroomStudents)
                        .innerJoin(users, eq(classroomStudents.studentId, users.id))
                        .where(
                            and(
                                eq(classroomStudents.classroomId, exam.classroomId),
                                eq(classroomStudents.status, "APPROVED")
                            )
                        );

                    const [teacher] = await db
                        .select({ fullName: users.fullName, email: users.email })
                        .from(users)
                        .where(eq(users.id, exam.teacherId))
                        .limit(1);

                    const recipients = [...enrolledStudents];
                    if (teacher) {
                        recipients.push({
                            studentId: exam.teacherId,
                            email: teacher.email,
                            fullName: teacher.fullName,
                        });
                    }

                    const emailQueue = getEmailQueue();
                    const examLink = `${appConfig.clientUrl}/classrooms/${exam.classroomId}?tab=exams&examId=${exam.id}`;
                    const formattedStartTime = exam.scheduledStart
                        ? new Date(exam.scheduledStart).toLocaleString()
                        : "In 5 minutes";

                    const emailJobs = recipients
                        .filter((r) => r.email)
                        .map((recipient) => ({
                            name: `exam-start-reminder-${recipient.studentId}`,
                            data: {
                                to: recipient.email,
                                fullName: recipient.fullName,
                                template: EmailTemplateType.EXAM_REMINDER,
                                customParams: {
                                    name: recipient.fullName,
                                    exam_title: exam.title || "Examination",
                                    classroom_name: classroom?.name || "Classroom",
                                    start_time: formattedStartTime,
                                    duration_minutes: String(exam.durationMinutes),
                                    access_window_minutes: String(exam.accessWindowMinutes),
                                    exam_link: examLink,
                                },
                            },
                        }));

                    if (emailJobs.length > 0) {
                        await emailQueue.addBulk(emailJobs);
                        console.log(
                            `[ExamSchedulerWorker] Dispatched ${emailJobs.length} exam reminder email jobs`
                        );
                    }
                }

                // ─────────────────────────────────────────────────────────────
                // 2. ACTIVATE_EXAM (Triggers at scheduledStart)
                // ─────────────────────────────────────────────────────────────
                else if (type === "ACTIVATE_EXAM") {
                    if (exam.status === "PREPARED") {
                        await db
                            .update(exams)
                            .set({
                                status: "LIVE",
                                updatedAt: new Date(),
                            })
                            .where(eq(exams.id, examId));

                        console.log(`[ExamSchedulerWorker] Exam ${examId} marked LIVE! Students can now attempt.`);
                    } else {
                        console.log(
                            `[ExamSchedulerWorker] ACTIVATE_EXAM skipped because status is ${exam.status} (expected PREPARED).`
                        );
                    }
                }
            },
            {
                connection: applicationConfig.redis,
                concurrency: 5,
            }
        );

        examSchedulerWorker.on("completed", (job: Job) => {
            console.log(`[ExamSchedulerWorker] Job ${job.id} completed successfully`);
        });

        examSchedulerWorker.on("failed", (job: Job | undefined, err: Error) => {
            console.error(`[ExamSchedulerWorker] Job ${job?.id} failed:`, err.message);
        });

        examSchedulerWorker.on("error", (err: Error) => {
            console.error("[ExamSchedulerWorker] Worker error:", err.message);
        });

        console.log("Initialized Exam Scheduler Worker");
    }
    return examSchedulerWorker;
};

export const closeExamSchedulerWorker = async (): Promise<void> => {
    if (examSchedulerWorker) {
        await examSchedulerWorker.close();
        examSchedulerWorker = null;
        console.log("Exam scheduler worker closed successfully");
    }
};
