import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config();

const user = process.env.DB_USER || 'kaif';
const pass = process.env.DB_PASS || process.env.DB_PASSWORD || '';
const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || '5432';
const name = process.env.DB_NAME || 'Eamxify';

const connectionString = process.env.DATABASE_URL || `postgresql://${user}:${encodeURIComponent(pass)}@${host}:${port}/${name}`;

export default defineConfig({
  schema: './src/database/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: connectionString,
  },
});