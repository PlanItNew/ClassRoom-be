import type { Response } from "express";
import type { AuthenticatedRequest } from "../constants/types.js";
import { getPostgresDb } from "../database/db.js";
import { exams, questions, classrooms, classroomStudents } from "../database/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { logger } from "../utils/common.utils.js";
import {
    buildExamS3Key,
    generatePresignedPutUrl,
    doesObjectExist,
} from "../services/s3AWS.js";
import {
    getExamGenerationQueue,
    getExamSchedulerQueue,
} from "../queues/exam.queue.js";
import { ExamAttemptRedisRepository } from "../redis/examAttempt.redis.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. CREATE EXAM DRAFT
// ─────────────────────────────────────────────────────────────────────────────
export const createExamDraft = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const classroomId = req.params.classroomId as string;
        const teacherId = req.user!.id;

        if (!classroomId) {
            return res.status(400).json({ message: "Classroom ID is required" });
        }

        // Verify classroom exists and belongs to requesting teacher
        const [classroom] = await db
            .select({ id: classrooms.id, teacherId: classrooms.teacherId })
            .from(classrooms)
            .where(eq(classrooms.id, classroomId))
            .limit(1);

        if (!classroom) {
            return res.status(404).json({ message: "Classroom not found" });
        }

        if (classroom.teacherId !== teacherId) {
            return res.status(403).json({ message: "Only the teacher of this classroom can create exams" });
        }

        // Insert initial Draft
        const [draft] = await db
            .insert(exams)
            .values({
                classroomId,
                teacherId,
                status: "DRAFT",
                generationVersion: 1,
            })
            .returning();

        return res.status(201).json({
            message: "Exam draft created successfully",
            data: draft,
        });
    } catch (error: any) {
        logger("error", "createExamDraft", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET PRESIGNED S3 UPLOAD URL FOR TOPIC PDF
// ─────────────────────────────────────────────────────────────────────────────
export const getExamUploadUrl = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const examId = req.params.examId as string;
        const teacherId = req.user!.id;

        if (!examId) {
            return res.status(400).json({ message: "Exam ID is required" });
        }

        const [exam] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        if (exam.teacherId !== teacherId) {
            return res.status(403).json({ message: "Only the exam creator can upload materials" });
        }

        const { originalFilename, mimeType, sizeBytes } = req.body;
        if (!originalFilename || typeof originalFilename !== "string") {
            return res.status(400).json({ message: "originalFilename is required" });
        }

        if (!originalFilename.toLowerCase().endsWith(".pdf")) {
            return res.status(400).json({ message: "Only PDF documents are supported for exam question extraction" });
        }

        const s3Key = buildExamS3Key(exam.classroomId, exam.id, originalFilename);
        const presignedUrl = await generatePresignedPutUrl(
            s3Key,
            mimeType || "application/pdf",
            sizeBytes
        );

        return res.status(200).json({
            message: "Presigned upload URL generated successfully",
            data: {
                s3Key,
                presignedUrl,
            },
        });
    } catch (error: any) {
        logger("error", "getExamUploadUrl", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. VERIFY EXAM PDF UPLOAD
// ─────────────────────────────────────────────────────────────────────────────
export const verifyExamPdf = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const examId = req.params.examId as string;
        const teacherId = req.user!.id;

        const [exam] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        if (exam.teacherId !== teacherId) {
            return res.status(403).json({ message: "Only the exam creator can verify materials" });
        }

        const { s3Key, originalFilename } = req.body;
        if (!s3Key || typeof s3Key !== "string") {
            return res.status(400).json({ message: "s3Key is required" });
        }

        // Verify existence in S3
        const exists = await doesObjectExist(s3Key);
        if (!exists) {
            return res.status(400).json({
                message: "Uploaded file was not found in S3 storage. Please retry uploading.",
            });
        }

        // Save S3 key to exam record
        const [updated] = await db
            .update(exams)
            .set({
                pdfS3Key: s3Key,
                pdfOriginalFilename: originalFilename || "document.pdf",
                updatedAt: new Date(),
            })
            .where(eq(exams.id, examId))
            .returning();

        return res.status(200).json({
            message: "Topic PDF verified successfully",
            data: updated,
        });
    } catch (error: any) {
        logger("error", "verifyExamPdf", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. PUBLISH EXAM & SCHEDULE ASYNCHRONOUS PIPELINE
// ─────────────────────────────────────────────────────────────────────────────
export const publishExam = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const examId = req.params.examId as string;
        const teacherId = req.user!.id;

        const [exam] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        if (exam.teacherId !== teacherId) {
            return res.status(403).json({ message: "Only the exam creator can publish" });
        }

        const {
            title,
            aiPrompt,
            noOfQuestions,
            difficulty,
            scheduledStart,
            durationMinutes,
            accessWindowMinutes,
        } = req.body;

        if (!title || typeof title !== "string" || title.trim().length === 0) {
            return res.status(400).json({ message: "Exam title is required" });
        }

        if (!exam.pdfS3Key) {
            return res.status(400).json({ message: "A topic PDF document must be uploaded and verified before publishing" });
        }

        const parsedStart = new Date(scheduledStart);
        if (isNaN(parsedStart.getTime())) {
            return res.status(400).json({ message: "Invalid scheduledStart datetime" });
        }

        const questionCount = Math.max(1, Math.min(50, Number(noOfQuestions) || 10));
        const duration = Math.max(5, Number(durationMinutes) || 60);
        const accessWindow = Math.max(5, Number(accessWindowMinutes) || 30);
        const diff: "EASY" | "MEDIUM" | "HARD" = ["EASY", "MEDIUM", "HARD"].includes(difficulty)
            ? difficulty
            : "MEDIUM";

        const newVersion = exam.generationVersion + 1;

        // Update exam state to GENERATING_QUESTIONS
        const [updatedExam] = await db
            .update(exams)
            .set({
                title: title.trim(),
                aiPrompt: aiPrompt?.trim() || null,
                noOfQuestions: questionCount,
                difficulty: diff,
                scheduledStart: parsedStart,
                durationMinutes: duration,
                accessWindowMinutes: accessWindow,
                status: "GENERATING_QUESTIONS",
                statusReason: null,
                generationVersion: newVersion,
                updatedAt: new Date(),
            })
            .where(eq(exams.id, examId))
            .returning();

        // 1. Enqueue GENERATE_EXAM_QUESTIONS immediately
        const generationQueue = getExamGenerationQueue();
        const genJobId = `exam-generation:${exam.id}:${newVersion}`;
        await generationQueue.add(
            "generate-questions",
            {
                examId: exam.id,
                classroomId: exam.classroomId,
                teacherId: exam.teacherId,
                title: title.trim(),
                difficulty: diff,
                questionCount,
                teacherAiInstructions: aiPrompt?.trim(),
                s3Key: exam.pdfS3Key,
                generationVersion: newVersion,
            },
            {
                jobId: genJobId,
            }
        );

        // 2. Schedule PREPARE_EXAM for scheduledStart - 5 minutes
        const schedulerQueue = getExamSchedulerQueue();
        const startTimeMs = parsedStart.getTime();
        const prepareDelay = Math.max(0, startTimeMs - 5 * 60 * 1000 - Date.now());
        const prepJobId = `prepare-exam:${exam.id}:${newVersion}`;

        await schedulerQueue.add(
            "prepare-exam",
            {
                type: "PREPARE_EXAM",
                examId: exam.id,
                classroomId: exam.classroomId,
                generationVersion: newVersion,
                scheduledStart: parsedStart.toISOString(),
            },
            {
                jobId: prepJobId,
                delay: prepareDelay,
            }
        );

        // 3. Schedule ACTIVATE_EXAM for scheduledStart
        const activateDelay = Math.max(0, startTimeMs - Date.now());
        const actJobId = `activate-exam:${exam.id}:${newVersion}`;

        await schedulerQueue.add(
            "activate-exam",
            {
                type: "ACTIVATE_EXAM",
                examId: exam.id,
                classroomId: exam.classroomId,
                generationVersion: newVersion,
                scheduledStart: parsedStart.toISOString(),
            },
            {
                jobId: actJobId,
                delay: activateDelay,
            }
        );

        return res.status(200).json({
            message: "Exam published. Question generation started and launch schedule registered.",
            data: updatedExam,
        });
    } catch (error: any) {
        logger("error", "publishExam", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 5. GET CLASSROOM EXAMS
// ─────────────────────────────────────────────────────────────────────────────
export const getClassroomExams = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const classroomId = req.params.classroomId as string;
        const userId = req.user!.id;
        const userRole = req.user!.role;

        // Verify membership
        const [classroom] = await db
            .select()
            .from(classrooms)
            .where(eq(classrooms.id, classroomId))
            .limit(1);

        if (!classroom) {
            return res.status(404).json({ message: "Classroom not found" });
        }

        const isTeacher = classroom.teacherId === userId;
        if (!isTeacher) {
            const [membership] = await db
                .select()
                .from(classroomStudents)
                .where(
                    and(
                        eq(classroomStudents.classroomId, classroomId),
                        eq(classroomStudents.studentId, userId),
                        eq(classroomStudents.status, "APPROVED")
                    )
                )
                .limit(1);

            if (!membership) {
                return res.status(403).json({ message: "You are not an approved student of this classroom" });
            }
        }

        // Query exams
        const examRows = await db
            .select()
            .from(exams)
            .where(eq(exams.classroomId, classroomId))
            .orderBy(desc(exams.scheduledStart), desc(exams.createdAt));

        // Filter for students: hide DRAFT and non-public states
        const filtered = isTeacher
            ? examRows
            : examRows.filter((e: any) => e.status !== "DRAFT");

        return res.status(200).json({
            message: "Classroom exams retrieved successfully",
            data: filtered,
        });
    } catch (error: any) {
        logger("error", "getClassroomExams", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 6. GET EXAM DETAILS
// ─────────────────────────────────────────────────────────────────────────────
export const getExamDetails = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const examId = req.params.examId as string;
        const userId = req.user!.id;

        const [exam] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        const isTeacher = exam.teacherId === userId;

        // Fetch questions if teacher
        let examQuestions: any[] = [];
        if (isTeacher) {
            examQuestions = await db
                .select()
                .from(questions)
                .where(eq(questions.examId, examId))
                .orderBy(questions.orderSequence);
        }

        return res.status(200).json({
            message: "Exam details retrieved successfully",
            data: {
                ...exam,
                questions: examQuestions,
            },
        });
    } catch (error: any) {
        logger("error", "getExamDetails", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. DELETE DRAFT EXAMS (TEMP / CLEANUP OPTION)
// ─────────────────────────────────────────────────────────────────────────────
export const deleteAllDraftExams = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const classroomId = req.params.classroomId as string;
        const teacherId = req.user!.id;

        const deleted = await db
            .delete(exams)
            .where(
                and(
                    eq(exams.classroomId, classroomId),
                    eq(exams.teacherId, teacherId),
                    sql`${exams.status} IN ('DRAFT', 'FAILED')`
                )
            )
            .returning({ id: exams.id });

        return res.status(200).json({
            message: `Successfully deleted ${deleted.length} draft/failed exams`,
            deletedCount: deleted.length,
        });
    } catch (error: any) {
        logger("error", "deleteAllDraftExams", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const deleteExam = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const examId = req.params.examId as string;
        const teacherId = req.user!.id;

        const [exam] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        if (exam.teacherId !== teacherId) {
            return res.status(403).json({ message: "Only the exam creator can delete it" });
        }

        await db.delete(exams).where(eq(exams.id, examId));

        return res.status(200).json({
            message: "Exam deleted successfully",
        });
    } catch (error: any) {
        logger("error", "deleteExam", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

export const seedExamQuestions = async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = getPostgresDb();
        const examId = req.params.examId as string;
        const teacherId = req.user!.id;

        if (!examId) {
            return res.status(400).json({ message: "Exam ID is required" });
        }

        const [exam] = await db
            .select()
            .from(exams)
            .where(eq(exams.id, examId))
            .limit(1);

        if (!exam) {
            return res.status(404).json({ message: "Exam not found" });
        }

        if (exam.teacherId !== teacherId) {
            return res.status(403).json({ message: "Only the exam creator can add questions" });
        }

        const {
            title,
            difficulty = "MEDIUM",
            status = "LIVE",
            scheduledStart,
            durationMinutes = 60,
            accessWindowMinutes = 525600, // 1 year by default for demo exams so they never expire
            questions: inputQuestions = []
        } = req.body;

        if (!Array.isArray(inputQuestions) || inputQuestions.length === 0) {
            return res.status(400).json({ message: "questions array is required and cannot be empty" });
        }

        const diff: "EASY" | "MEDIUM" | "HARD" = ["EASY", "MEDIUM", "HARD"].includes(difficulty)
            ? difficulty
            : "MEDIUM";

        const parsedStart = scheduledStart ? new Date(scheduledStart) : new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
        const examStatus = ["DRAFT", "READY", "LIVE", "COMPLETED"].includes(status) ? status : "LIVE";

        const insertedQuestions = await db.transaction(async (tx: any) => {
            // Remove previous questions if any
            await tx.delete(questions).where(eq(questions.examId, examId));

            const rowsToInsert = inputQuestions.map((q: any, idx: number) => {
                let opts = q.options;
                if (Array.isArray(opts)) {
                    opts = {
                        A: opts[0] || "",
                        B: opts[1] || "",
                        C: opts[2] || "",
                        D: opts[3] || ""
                    };
                }
                return {
                    examId,
                    question: q.question,
                    options: opts,
                    correctOption: String(q.correctOption || "A").toUpperCase(),
                    reason: q.reason || "Standard answer rationale.",
                    difficulty: q.difficulty || diff,
                    orderSequence: idx + 1,
                };
            });

            const inserted = await tx.insert(questions).values(rowsToInsert).returning();

            await tx
                .update(exams)
                .set({
                    title: title || exam.title || "Exam Assessment",
                    noOfQuestions: inserted.length,
                    difficulty: diff,
                    scheduledStart: parsedStart,
                    durationMinutes: Number(durationMinutes) || 60,
                    accessWindowMinutes: Number(accessWindowMinutes) || 525600,
                    status: examStatus,
                    statusReason: null,
                    updatedAt: new Date(),
                })
                .where(eq(exams.id, examId));

            return inserted;
        });

        // Cache questions in Redis if available
        try {
            await ExamAttemptRedisRepository.cachePublicQuestionsAndAnswerKey(
                examId,
                insertedQuestions
            );
        } catch (cacheErr) {
            // non-fatal
        }

        return res.status(200).json({
            message: `Successfully seeded ${insertedQuestions.length} questions and set status to ${examStatus}`,
            data: {
                examId,
                questionCount: insertedQuestions.length,
                status: examStatus,
            }
        });
    } catch (error: any) {
        logger("error", "seedExamQuestions", error);
        return res.status(500).json({ message: "Internal server error", error: error.message });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// STUBS FOR SUBSEQUENT PHASES
// ─────────────────────────────────────────────────────────────────────────────
export const submitExamAttempt = async (req: AuthenticatedRequest, res: Response) => {
    return res.status(501).json({ message: "Submit exam attempt is part of Phase 2" });
};

export const getExamResults = async (req: AuthenticatedRequest, res: Response) => {
    return res.status(501).json({ message: "Get exam results is part of Phase 2" });
};
