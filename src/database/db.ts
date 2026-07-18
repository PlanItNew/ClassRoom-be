import { neon } from "@neondatabase/serverless";
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { applicationConfig } from "../config/index.js";

let neonDb: any;

export const connectNeonDb = async () => {
    if (!applicationConfig.database.databaseURL) {
        throw new Error("DATABASE_URL environment variable is missing");
    }

    const neonDatabase = neon(applicationConfig.database.databaseURL);
    neonDb = drizzle(neonDatabase);

    // Test
    await neonDb.execute(sql`SELECT 1`);

    console.log("Connected to Neon Database");
    return neonDb;
};


export const getNeonDb = () => {
    if (!neonDb) {
        throw new Error("Database not initialized");
    }
    return neonDb;
};