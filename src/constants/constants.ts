import path from "path";
import { applicationConfig } from "../config/index.js";

export const ENV_TOKENS_REQUIED = [
    "PORT",
    // "DATABASE_URL_NEON",
    "JWT_SECRET",
    "REFRESH_JWT_SECRET",
    "JWT_ACCESS_EXPIRY",
    "JWT_REFRESH_EXPIRY",
    "ENVIRONMENT",
    "SALT_ROUNDS",
    "PASSWORD_SALT"
]

export const templateMap = {
    "signup-otp": path.resolve(process.cwd(), "src/templates/signupTemplate.html"),
    "signin-otp": path.resolve(process.cwd(), "src/templates/signinTemplate.html"),
    "exam-reminder": path.resolve(process.cwd(), "src/templates/examReminderTemplate.html"),
    "exam-failure": path.resolve(process.cwd(), "src/templates/examFailureTemplate.html"),
}

export const verificationTypes = {
    SIGNUP: "sign-up",
    FORGOT: "sign-in",
    LOGIN: "login"
}


export const bullMqQueues = {
    EMAIL: "email_brevo",
    S3_CLEANUP: "s3_cleanup",
    EXAM_GENERATION: "exam_generation",
    EXAM_SCHEDULER: "exam_scheduler",
}


export const redisConstantKeys: any = {
    TOTP: "totp:",
    CLASSROOM: "classroom:",
    CLASSROOM_STUDENTS: "classroom:students:",
    CLASSROOM_POSTS: "classroom:posts:",
    EXAM_QUESTIONS: "exam:questions:",
    EXAM_QUESTIONS_PUBLIC: (examId: string) => `exam:${examId}:questions:public`,
    EXAM_ANSWER_KEY: (examId: string) => `exam:${examId}:answer-key`,
    EXAM_ATTEMPT: (examId: string, userId: string) => `exam:attempt:${examId}:${userId}`,
    EXAM_ACTIVE_ATTEMPTS: (examId: string) => `exam:${examId}:active-attempts`,
    EXAM_LEADERBOARD: "exam:leaderboard:",
    EXAM_LEADERBOARD_KEY: (examId: string) => `exam:leaderboard:${examId}`,
    EXAM_SHADOW: "exam:shadow:",
};

export const redisTTLs: any = {
    TOTP: 60 * 3,
    CLASSROOM: 60 * 60,
    CLASSROOM_STUDENTS: 60 * 60 * 2,
    CLASSROOM_POSTS: 60 * 15,
    EXAM_GRACE_PERIOD_MINUTES: 15,
    EXAM_ATTEMPT_BUFFER_SECONDS: 3600 * 2, // 2 hour buffer past expiresAt
};

export const socketEvents = {
    // Client -> Server
    ATTEMPT_ANSWER_SAVE: "attempt:answer-save",
    ATTEMPT_ANSWER_CLEAR: "attempt:answer-clear",
    ATTEMPT_REVIEW_MARK: "attempt:review-mark",
    ATTEMPT_REVIEW_UNMARK: "attempt:review-unmark",
    ATTEMPT_SUBMIT: "attempt:submit",
    ATTEMPT_HEARTBEAT: "attempt:heartbeat",

    // Server -> Client
    ATTEMPT_SNAPSHOT: "attempt:snapshot",
    ATTEMPT_ANSWER_SAVED: "attempt:answer-saved",
    ATTEMPT_ANSWER_CLEARED: "attempt:answer-cleared",
    ATTEMPT_REVIEW_UPDATED: "attempt:review-updated",
    ATTEMPT_TIMER_SYNC: "attempt:timer-sync",
    ATTEMPT_SUBMITTED: "attempt:submitted",
    ATTEMPT_EXPIRED: "attempt:expired",
    EXAM_ENDED: "exam:ended",
    ATTEMPT_ERROR: "attempt:error",
} as const;

export const otpCommonSetting: any = {
    removeOnComplete: true,
    removeOnFail: true,
    attempts: applicationConfig.app.otp_max_attempts,
    backoff: {
        type: "exponential",
        delay: 1000,
    }
}

export const ErrorCodes: any = {
    INVALID_OTP: 5432,
    OTP_SWW: 5433,
}