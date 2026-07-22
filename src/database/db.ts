import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import { applicationConfig } from "../config/index.js";
import { startDockerContainer } from "../utils/docker.utils.js";

let localPostgresDb: any;
let pgPool: pg.Pool | null = null;

export const startLocalDb = async () => {
    // 1. Ensure Docker container is running
    await startDockerContainer({
        cwd: process.cwd(),
        config: 'docker.yml',
        log: true
    });

    const { host, port, user, password, database, maxConnections } = applicationConfig.database;

    // 2. Initialize pg pool with max pool of 10
    pgPool = new pg.Pool({
        host,
        port,
        user,
        password,
        database,
        max: maxConnections,
    });

    localPostgresDb = drizzle(pgPool);

    // 3. Verify database connection with retry (wait for container readiness)
    let retries = 5;
    while (retries > 0) {
        try {
            await localPostgresDb.execute(sql`SELECT 1`);
            break;
        } catch (error: any) {
            retries--;
            if (retries === 0) {
                throw new Error(`Failed to connect to local Postgres DB: ${error.message || error}`);
            }
            console.log(`Waiting for Postgres to accept connections... (${retries} retries left)`);
            await new Promise((res) => setTimeout(res, 2000));
        }
    }

    console.log("Connected to Local Postgres Database with pool size 10");

    // 4. Run automatic migrations onto the local database
    try {
        await migrate(localPostgresDb, { migrationsFolder: './drizzle' });
        console.log("✅ Database migrations applied successfully!");
    } catch (migrationError: any) {
        console.error("Failed to run database migrations:", migrationError.message || migrationError);
        throw migrationError;
    }

    return localPostgresDb;
};


export const getPostgresDb = () => {
    if (!localPostgresDb) {
        throw new Error("Database not initialized");
    }
    return localPostgresDb;
};