import * as dotenv from "dotenv";
dotenv.config();

export const appKeys = {
    jwt_token: process.env.JWT_SECRET || "",
    refresh_jwt_token: process.env.REFRESH_JWT_SECRET || "",
    jwt_access_expiry: process.env.JWT_ACCESS_EXPIRY || "30m",
    jwt_refresh_expiry: process.env.JWT_REFRESH_EXPIRY || "10d",
    password_salt: process.env.PASSWORD_SALT || "",
    salt_rounds: parseInt(process.env.SALT_ROUNDS || process.env.SALT_ROUND || "10", 10),
};
