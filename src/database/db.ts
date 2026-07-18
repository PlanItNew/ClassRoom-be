import { neon } from "@neondatabase/serverless";
import { drizzle } from 'drizzle-orm/neon-http';
import { applicationConfig } from "../config/index.js";

let neonDb: any;

export const connetNeonDb = async () => {
    if (!applicationConfig.database.databaseURL) {
        throw new Error("DATABASE_URL environment variable is missing");
    }

    const neonDatabase = await neon(applicationConfig.database.databaseURL);
    neonDb = drizzle(neonDatabase);
    console.log("Connected to Neon Database");
    return neonDb;
}

export const getNeonDb = () => {
    if (!neonDb) {
        throw new Error("Database not initialized");
    }
    return neonDb;
}