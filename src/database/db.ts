import { neon } from "@neondatabase/serverless";
import { drizzle } from 'drizzle-orm/neon-http';
import * as dotenv from 'dotenv';

dotenv.config()

if(!process.env.DATABASE_URL){
    throw new Error("DATABASE_URL environment variable is missing");
}

const neonDatabase = neon(process.env.DATABASE_URL)
export const db = drizzle(neonDatabase);