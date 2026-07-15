import { neon } from "@neondatabase/serverless";
import { drizzle } from 'drizzle-orm/neon-http';
import { databaseKey } from '../config/database.key.js';

if (!databaseKey) {
    throw new Error("DATABASE_URL environment variable is missing");
}

const neonDatabase = neon(databaseKey);
export const db = drizzle(neonDatabase);