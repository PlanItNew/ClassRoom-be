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
}

export const verificationTypes = {
    SIGNUP: "sign-up",
    FORGOT: "sign-in",
    LOGIN: "login"
}


export const bullMqQueues = {
    EMAIL: "email_brevo"
}


export const redisConstantKeys: any = {
    TOTP: "totp:"
}

export const redisTTLs: any = {
    TOTP: 60 * 3,
    CLASSROOM: 60 * 60,
    CLASSROOM_STUDENTS: 60 * 60 * 2
}

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