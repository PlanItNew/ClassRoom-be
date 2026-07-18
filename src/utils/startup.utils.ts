import { ENV_TOKENS_REQUIED } from "../constants/constants.js";
import dotenv from "dotenv";
import { connectNeonDb } from "../database/db.js";
import { getInMilliSec } from "./common.utils.js";
import type { StringValue } from "ms";

dotenv.config();

export const verifyAndSetupEnv = () => {
    // 1. Check presence of required environment variables
    for (const envKey of ENV_TOKENS_REQUIED) {
        if (!process.env[envKey] || process.env[envKey]?.trim() === "") {
            throw new Error(`Missing environment variable: ${envKey}`);
        }
    }

    // 2. PORT
    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error(`Invalid PORT: "${process.env.PORT}". Must be an integer between 1 and 65535.`);
    }

    // 3. ENVIRONMENT
    const allowedEnvironments = ["development", "production", "test"];
    if (!allowedEnvironments.includes(process.env.ENVIRONMENT!)) {
        throw new Error(`Invalid ENVIRONMENT: "${process.env.ENVIRONMENT}". Allowed values: ${allowedEnvironments.join(", ")}`);
    }

    // 4. DATABASE_URL
    const dbUrl = process.env.DATABASE_URL!;
    try {
        new URL(dbUrl);
    } catch {
        throw new Error(`Invalid DATABASE_URL format: "${dbUrl}". Must be a valid URL.`);
    }

    // 5. JWT_ACCESS_EXPIRY 
    const accessMs = getInMilliSec(process.env.JWT_ACCESS_EXPIRY as StringValue);
    if (typeof accessMs !== "number" || isNaN(accessMs) || accessMs <= 0) {
        throw new Error(`Invalid JWT_ACCESS_EXPIRY format: "${process.env.JWT_ACCESS_EXPIRY}". Must be a valid duration (e.g. "30m", "1h").`);
    }

    // 6. JWT_REFRESH_EXPIRY 
    const refreshMs = getInMilliSec(process.env.JWT_REFRESH_EXPIRY as StringValue);
    if (typeof refreshMs !== "number" || isNaN(refreshMs) || refreshMs <= 0) {
        throw new Error(`Invalid JWT_REFRESH_EXPIRY format: "${process.env.JWT_REFRESH_EXPIRY}". Must be a valid duration (e.g. "10d", "7d").`);
    }

    // 7. SALT_ROUNDS
    const saltRounds = Number(process.env.SALT_ROUNDS);
    if (!Number.isInteger(saltRounds) || saltRounds <= 0) {
        throw new Error(`Invalid SALT_ROUNDS: "${process.env.SALT_ROUNDS}". Must be a positive integer.`);
    }

    return true;
};

export const connectAllDb = async () => {
    try {
        await connectNeonDb();
    } catch (error: any) {
        throw new Error(`Failed to connect to database: ${error.message || error}`);
    }
};