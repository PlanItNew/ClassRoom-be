import * as dotenv from 'dotenv';
dotenv.config();

export const databaseKey = process.env.DATABASE_URL_NEON || "";
export const dbUserKey = process.env.DB_USER || "kaif";
export const dbPassKey = process.env.DB_PASSWORD || "";
export const dbNameKey = process.env.DB_NAME || "Eamxify";
export const dbHostKey = process.env.DB_HOST || "localhost";
export const dbPortKey = Number(process.env.DB_PORT) || 5432;

