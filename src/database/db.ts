import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { applicationConfig } from "../config/index.js";
import { startDockerContainer } from "../utils/docker.utils.js";

import { Redis } from 'ioredis';

let localPostgresDb: any;
let pgPool: pg.Pool | null = null;
let redisClient: Redis | null = null;

export const startLocalDb = async () => {
    // 1. Ensure Docker container is running
    await startDockerContainer({
        cwd: process.cwd(),
        config: 'docker.yml',
        log: true
    });

    const { host, port, user, password, database, maxConnections } = applicationConfig.database;

    // 2. Initialize pg pool
    const pool = new pg.Pool({
        host,
        port,
        user,
        password,
        database,
        max: maxConnections,
    });

    const db = drizzle(pool);

    try {
        // 3. Verify database connection with retry (wait for container readiness)
        let retries = 5;
        while (retries > 0) {
            try {
                await db.execute(sql`SELECT 1`);
                break;
            } catch (error: any) {
                retries--;
                if (retries === 0) {
                    await closeLocalDb();
                    throw new Error(`Failed to connect to local Postgres DB: ${error.message || error}`);
                }
                console.log(`Waiting for Postgres to accept connections... (${retries} retries left)`);
                await new Promise((res) => setTimeout(res, 2000));
            }
        }

        console.log("Connected to Local Postgres Database with pool size 10");

        // 4. Run automatic migrations onto the local database
        await migrate(db, { migrationsFolder: './drizzle' });
        console.log("✅ Database migrations applied successfully!");

        // 5. Publish state only after readiness and migrations succeed
        pgPool = pool;
        localPostgresDb = db;
        return localPostgresDb;
    } catch (error: any) {
        await closeLocalDb();
        console.error("Failed to initialize database:", error.message || error);
        throw error;
    }
};

export const closeLocalDb = async () => {
    if (pgPool) {
        await pgPool.end().then(res => console.log("Pool closed successfully")).catch((e) => {
            console.error("Failed to close pool:", e.message || e)
        });
        pgPool = null;
    }
    localPostgresDb = null;
};


export const getPostgresDb = () => {
    if (!localPostgresDb) {
        throw new Error("Database not initialized");
    }
    return localPostgresDb;
};


export const startRedis = async () => {
    const { host, port, password } = applicationConfig.redis;

    redisClient = new Redis({
        host,
        port,
        password,
    });

    try {
        await redisClient.ping();
        console.log("Connected to Redis");
        return redisClient;
    } catch (error: any) {
        console.error("Failed to connect to Redis:", error.message || error);
        throw error;
    }
}

export const closeRedis = async () => {
    if (redisClient) {
        await redisClient.quit().then(res => console.log("Redis client closed successfully")).catch((e) => {
            console.error("Failed to close Redis client:", e.message || e)
        });
        redisClient = null;
    }
}

export const getRedis = () => {
    if (redisClient) return redisClient;
    throw new Error("Redis not initialized");
}
