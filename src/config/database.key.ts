import * as dotenv from 'dotenv';
dotenv.config();

export const databaseKey = process.env.DATABASE_URL || "";
