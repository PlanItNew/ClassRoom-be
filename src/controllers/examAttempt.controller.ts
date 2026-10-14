import type { Response } from "express";
import type { AuthenticatedRequest } from "../constants/types.js";
import { ExamAttemptService } from "../services/examAttempt.service.js";
import { ExamSubmissionService } from "../services/examSubmission.service.js";
import { logger } from "../utils/common.utils.js";

/**
 * GET /exams/:examId/participation-status
 */
export const getExamParticipationStatus = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const examId = req.params.examId as string;
        const userId = req.user!.id;

        const statusInfo = await ExamAttemptService.getParticipationStatus(
            examId,
            userId
        );

        if (!statusInfo) {
            return res.status(404).json({ message: "Exam not found" });
        }

        return res.status(200).json({
            message: "Participation status retrieved successfully",
            data: statusInfo,
        });
    } catch (error: any) {
        logger("error", "getExamParticipationStatus", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * POST /exams/:examId/start
 */
export const startExamAttempt = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const examId = req.params.examId as string;
        const userId = req.user!.id;

        const attemptData = await ExamAttemptService.startAttempt(examId, userId);

        return res.status(200).json({
            message: "Exam attempt initialized successfully",
            data: attemptData,
        });
    } catch (error: any) {
        logger("error", "startExamAttempt", error);

        if (error.message === "EXAM_NOT_FOUND") {
            return res.status(404).json({ message: "Exam not found" });
        }
        if (error.message === "UNAUTHORIZED_STUDENT") {
            return res.status(403).json({ message: "You are not an approved student for this exam" });
        }
        if (error.message.startsWith("EXAM_NOT_LIVE")) {
            return res.status(400).json({ message: "Exam is not currently live" });
        }
        if (error.message === "ACCESS_WINDOW_CLOSED") {
            return res.status(400).json({ message: "The access window to start this exam has closed" });
        }
        if (error.message === "ATTEMPT_ALREADY_SUBMITTED") {
            return res.status(400).json({ message: "You have already completed your attempt for this exam" });
        }
        if (error.message === "ATTEMPT_EXPIRED") {
            return res.status(400).json({ message: "Your attempt time has already expired" });
        }

        return res.status(500).json({ message: error.message || "Failed to start exam attempt" });
    }
};

/**
 * POST /exams/:examId/submit
 */
export const submitExamAttempt = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const examId = req.params.examId as string;
        const userId = req.user!.id;

        const result = await ExamSubmissionService.finalizeAttempt({
            examId,
            userId,
            reason: "MANUAL",
        });

        if (!result) {
            return res.status(404).json({ message: "Attempt not found for this exam" });
        }

        return res.status(200).json({
            message: result.alreadyFinalized
                ? "Exam attempt was already finalized"
                : "Exam attempt submitted and graded successfully",
            data: {
                attemptId: result.attempt.id,
                status: result.attempt.status,
                score: result.score,
                resultsReleased: result.resultsReleased,
                submittedAt: result.attempt.submittedAt,
            },
        });
    } catch (error: any) {
        logger("error", "submitExamAttempt", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

/**
 * GET /exams/:examId/results
 */
export const getExamResults = async (
    req: AuthenticatedRequest,
    res: Response
) => {
    try {
        const examId = req.params.examId as string;
        const userId = req.user!.id;
        const userRole = req.user!.role;

        const results = await ExamSubmissionService.getExamResults(
            examId,
            userId,
            userRole
        );

        if (!results) {
            return res.status(404).json({ message: "Exam not found" });
        }

        return res.status(200).json({
            message: "Exam results retrieved successfully",
            data: results,
        });
    } catch (error: any) {
        logger("error", "getExamResults", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
