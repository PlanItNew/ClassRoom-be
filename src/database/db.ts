import { neon } from "@neondatabase/serverless";
import { drizzle } from 'drizzle-orm/neon-http';
import { applicationConfig } from "../config/index.js";

if (!applicationConfig.database.databaseURL) {
    throw new Error("DATABASE_URL environment variable is missing");
}

const neonDatabase = neon(applicationConfig.database.databaseURL);
export const db = drizzle(neonDatabase);