import path from "path";

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
}

export const verificationTypes = {
    SIGNUP: "sign-up",
    FORGOT: "forgot",
    LOGIN: "login"
}