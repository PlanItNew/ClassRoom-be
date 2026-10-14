import { Router } from "express";
import {
    getExamUploadUrl,
    verifyExamPdf,
    publishExam,
    getExamDetails,
    deleteExam,
    submitExamAttempt,
    getExamResults,
} from "../controllers/exam.controller.js";
import { authenticateToken, authorized } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticateToken);

// Teacher-managed exam operations
router.post("/:examId/upload-url", authorized("TEACHER"), getExamUploadUrl);
router.post("/:examId/verify-file", authorized("TEACHER"), verifyExamPdf);
router.post("/:examId/publish", authorized("TEACHER"), publishExam);
router.delete("/:examId", authorized("TEACHER"), deleteExam);

// General exam details & phase 2 endpoints
router.get("/:examId", getExamDetails);
router.post("/:examId/submit", submitExamAttempt);
router.get("/:examId/results", getExamResults);

export default router;
