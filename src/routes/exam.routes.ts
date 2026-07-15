import { Router } from "express";
import { createExam, submitExamAttempt, getExamResults } from "../controllers/exam.controller.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

router.use(authenticateToken);
router.post("/", createExam);
router.post("/:examId/submit", submitExamAttempt);
router.get("/:examId/results", getExamResults);

export default router;
