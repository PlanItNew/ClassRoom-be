import { ENV_TOKENS_REQUIED } from "../constants/constants.js"
import dotenv from "dotenv"
import { connetNeonDb } from "../database/db.js";
dotenv.config();

export const verifyAndSetupEnv = () => {
    for (const envKey of ENV_TOKENS_REQUIED) {
        if (!process.env[envKey]) {
            throw new Error(`Missing environment variable: ${envKey}`)
        }
    }
    return true;
}

export const connectAllDb = async () => {
    try {
        const neonDb = await connetNeonDb();
    } catch (error: any) {
        throw new Error(`Failed to connect to database`)
    }
}