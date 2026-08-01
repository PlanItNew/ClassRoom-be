import * as dotenv from "dotenv";
dotenv.config();

export const appKeys = {
    jwt_token: process.env.JWT_SECRET || "",
    refresh_jwt_token: process.env.REFRESH_JWT_SECRET || "",
    jwt_access_expiry: process.env.JWT_ACCESS_EXPIRY || "30m",
    jwt_refresh_expiry: process.env.JWT_REFRESH_EXPIRY || "10d",
    password_salt: process.env.PASSWORD_SALT || "",
    salt_rounds: parseInt(process.env.SALT_ROUNDS || "10", 10),
    otp_secret_key: process.env.OTP_SECRET_KEY || "",
    time_window: parseInt(process.env.TIME_WINDOW as string, 10),
    look_back: parseInt(process.env.LOOK_BACK || "1", 10),
    look_forward: parseInt(process.env.LOOK_FORWARD || "0", 10),
};
