import * as dotenv from 'dotenv';
import { databaseConfig } from './database.config.js';

dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    jwtSecret: process.env.JWT_SECRET || 'supersecretkey',
    database: databaseConfig,
};

export * from './database.config.js';
export * from './database.key.js';
