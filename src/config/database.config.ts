import { databaseKey, dbUserKey, dbPassKey, dbNameKey, dbHostKey, dbPortKey } from './database.key.js';

export const databaseConfig = {
    databaseURL: databaseKey,
    host: dbHostKey,
    port: dbPortKey,
    user: dbUserKey,
    password: dbPassKey,
    database: dbNameKey,
    maxConnections: 10,
    ssl: false,
};

