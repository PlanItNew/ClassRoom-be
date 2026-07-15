import * as dotenv from 'dotenv';
import { databaseConfig } from './database.config.js';
import { appConfig } from './app.config.js';

dotenv.config();

export const applicationConfig = {
    database: databaseConfig,
    app: appConfig,
};
