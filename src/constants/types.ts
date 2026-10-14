import type { Request } from "express";

export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        role: "TEACHER" | "STUDENT";
        email: string;
        userName?: string;
    };
}

export interface JwtPayload {
    userId: string;
    iat?: number;
    exp?: number;
}

export enum EmailTemplateType {
    SIGNUP_OTP = "signup-otp",
    SIGNIN_OTP = "signin-otp",
    EXAM_REMINDER = "exam-reminder",
    EXAM_FAILURE = "exam-failure",
}

export interface ExamGenerationJobData {
    examId: string;
    classroomId: string;
    teacherId: string;
    title: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
    questionCount: number;
    teacherAiInstructions?: string;
    s3Key: string;
    generationVersion: number;
}

export interface ExamSchedulerJobData {
    type: "PREPARE_EXAM" | "ACTIVATE_EXAM";
    examId: string;
    classroomId: string;
    generationVersion: number;
    scheduledStart: string;
}

export interface GeneratedQuestionItem {
    question: string;
    options: {
        A: string;
        B: string;
        C: string;
        D: string;
    };
    correctOption: "A" | "B" | "C" | "D";
    reason: string;
    difficulty: "EASY" | "MEDIUM" | "HARD";
}