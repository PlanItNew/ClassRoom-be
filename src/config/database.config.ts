import { databaseKey } from './database.key.js';

export const databaseConfig = {
    url: databaseKey,
    maxConnections: 10,
    ssl: true,
};
