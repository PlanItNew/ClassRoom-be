import { Worker, Job } from "bullmq";
import fs from "fs";
import path from "path";
import os from "os";
import { applicationConfig } from "../config/index.js";
import { bullMqQueues } from "../constants/constants.js";
import type { ExamGenerationJobData } from "../constants/types.js";
import { getPostgresDb } from "../database/db.js";
import { exams, questions } from "../database/schema.js";
import { eq } from "drizzle-orm";
import {
    downloadPdfLocally,
    extractPdfContent,
    generateQuestionsWithOpenRouter,
} from "../services/examAI.service.js";

export let examGenerationWorker: Worker | null = null;

export const initExamGenerationWorker = (): Worker => {
    if (!examGenerationWorker) {
        examGenerationWorker = new Worker(
            bullMqQueues.EXAM_GENERATION,
            async (job: Job<ExamGenerationJobData>) => {
                const {
                    examId,
                    classroomId,
                    title,
                    difficulty,
                    questionCount,
                    teacherAiInstructions,
                    s3Key,
                    generationVersion,
                } = job.data;

                console.log(
                    `[ExamGenerationWorker] Starting generation for exam ${examId} (v${generationVersion}) "${title}"`
                );

                const db = getPostgresDb();
                let tempDir: string | null = null;

                try {
                    // 1. Create a unique temporary directory
                    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), `exam-${examId}-`));
                    const localPdfPath = path.join(tempDir, "topic_source.pdf");

                    // 2. Download the topic PDF using fresh presigned GET URL
                    await downloadPdfLocally(s3Key, localPdfPath);

                    // 3. Extract text lines with proportional sampling
                    const extracted = await extractPdfContent(localPdfPath);

                    // 4. Generate structured questions via OpenRouter (qwen/qwen-2.5-72b-instruct)
                    const generatedQuestions = await generateQuestionsWithOpenRouter({
                        title,
                        difficulty,
                        questionCount,
                        teacherInstructions: teacherAiInstructions,
                        sampledText: extracted.sampledText,
                        images: extracted.images,
                    });

                    // 5. Transactional and idempotent DB persistence
                    await db.transaction(async (tx: any) => {
                        // Ensure clean slate for this exam in case of retry
                        await tx.delete(questions).where(eq(questions.examId, examId));

                        // Bulk insert questions
                        const rowsToInsert = generatedQuestions.map((q, idx) => ({
                            examId,
                            question: q.question,
                            options: q.options,
                            correctOption: q.correctOption,
                            reason: q.reason,
                            difficulty: q.difficulty,
                            orderSequence: idx + 1,
                        }));

                        await tx.insert(questions).values(rowsToInsert);

                        // Update status to READY
                        await tx
                            .update(exams)
                            .set({
                                status: "READY",
                                statusReason: null,
                                updatedAt: new Date(),
                            })
                            .where(eq(exams.id, examId));
                    });

                    console.log(
                        `[ExamGenerationWorker] Successfully persisted ${generatedQuestions.length} questions for exam ${examId}. Status set to READY.`
                    );
                } catch (error: any) {
                    console.error(
                        `[ExamGenerationWorker] Failed generation for exam ${examId}:`,
                        error.message || error
                    );

                    // Update exam status to FAILED with error reason
                    try {
                        await db
                            .update(exams)
                            .set({
                                status: "FAILED",
                                statusReason: error.message || "Failed to generate questions with AI",
                                updatedAt: new Date(),
                            })
                            .where(eq(exams.id, examId));
                    } catch (dbErr) {
                        console.error("[ExamGenerationWorker] Failed to update exam failure state:", dbErr);
                    }

                    throw error; // Let BullMQ retry according to backoff settings
                } finally {
                    // 6. Guarantee cleanup of downloaded PDF, images, and temp files
                    if (tempDir) {
                        try {
                            await fs.promises.rm(tempDir, { recursive: true, force: true });
                        } catch (cleanErr) {
                            console.warn(`[ExamGenerationWorker] Warning cleaning temp dir ${tempDir}:`, cleanErr);
                        }
                    }
                }
            },
            {
                connection: applicationConfig.redis,
                concurrency: 2,
            }
        );

        examGenerationWorker.on("completed", (job: Job) => {
            console.log(`[ExamGenerationWorker] Job ${job.id} completed successfully`);
        });

        examGenerationWorker.on("failed", (job: Job | undefined, err: Error) => {
            console.error(`[ExamGenerationWorker] Job ${job?.id} failed:`, err.message);
        });

        examGenerationWorker.on("error", (err: Error) => {
            console.error("[ExamGenerationWorker] Worker error:", err.message);
        });

        console.log("Initialized Exam Generation Worker");
    }
    return examGenerationWorker;
};

export const closeExamGenerationWorker = async (): Promise<void> => {
    if (examGenerationWorker) {
        await examGenerationWorker.close();
        examGenerationWorker = null;
        console.log("Exam generation worker closed successfully");
    }
};
