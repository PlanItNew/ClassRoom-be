import type { Config } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const user = process.env.DB_USER;
const pass = process.env.DB_PASSWORD || "";
const host = process.env.DB_HOST;
const port = process.env.DB_PORT;
const name = process.env.DB_NAME;

const connectionString = process.env.DATABASE_URL || `postgresql://${user}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;

export default {
  schema: './src/database/schema.ts',
  out: './drizzle',
  connectionString,
} satisfies Config;