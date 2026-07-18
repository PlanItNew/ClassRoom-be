import { databaseKey } from './database.key.js';

export const databaseConfig = {
    databaseURL: databaseKey,
    maxConnections: 10,
    ssl: true,
};
