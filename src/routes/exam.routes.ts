import { Router } from "express";
import {
    getExamUploadUrl,
    verifyExamPdf,
    publishExam,
    getExamDetails,
    deleteExam,
    seedExamQuestions,
} from "../controllers/exam.controller.js";
import {
    getExamParticipationStatus,
    startExamAttempt,
    submitExamAttempt,
    getExamResults,
} from "../controllers/examAttempt.controller.js";
import { authenticateToken, authorized } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticateToken);

// Teacher-managed exam operations
router.post("/:examId/upload-url", authorized("TEACHER"), getExamUploadUrl);
router.post("/:examId/verify-file", authorized("TEACHER"), verifyExamPdf);
router.post("/:examId/publish", authorized("TEACHER"), publishExam);
router.post("/:examId/questions", authorized("TEACHER"), seedExamQuestions);
router.delete("/:examId", authorized("TEACHER"), deleteExam);

// Phase 2: Live attempt, participation, and result endpoints
router.get("/:examId/participation-status", getExamParticipationStatus);
router.post("/:examId/start", authorized("STUDENT"), startExamAttempt);
router.post("/:examId/submit", authorized("STUDENT"), submitExamAttempt);
router.get("/:examId/results", getExamResults);
router.get("/:examId", getExamDetails);

export default router;
