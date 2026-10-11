import * as dotenv from 'dotenv';
import { databaseConfig } from './database.config.js';
import { appConfig } from './app.config.js';
import { redisConfig } from './redis.config.js';
import { s3Config } from './s3.config.js';

dotenv.config();

export const applicationConfig = {
    database: databaseConfig,
    app: appConfig,
    redis: redisConfig,
    s3: s3Config
};
