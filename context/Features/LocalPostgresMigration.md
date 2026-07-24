# Local PostgreSQL Database Migration & Docker Integration

## Overview
Migrated the application database layer from Neon PostgreSQL serverless HTTP driver (`@neondatabase/serverless`) to a local Docker-managed PostgreSQL database using `pg` connection pooling and `drizzle-orm/node-postgres`.

---

## Key Changes & Implementation Details

### 1. Docker Container Automation (`src/utils/docker.utils.ts`)
- Implemented a generic `startDockerContainer` helper using `docker-compose`.
- Programmatically spins up and verifies the PostgreSQL container specified in `docker.yml` (`postgres:15-alpine`, container name `examify-postgres-server`, port `5432`).

### 2. Database Configuration & Connection Pool (`src/config/`)
- Updated `database.key.ts` and `database.config.ts` to read local database credentials:
  - `DB_USER`
  - `DB_PASSWORD`
  - `DB_NAME`
  - `DB_HOST` (default: `localhost`)
  - `DB_PORT` (default: `5432`)
- Configured connection pool size with `maxConnections: 10`.

### 3. Database Layer & Driver Update (`src/database/db.ts`)
- Replaced Neon HTTP serverless driver with `pg.Pool` and `drizzle-orm/node-postgres`.
- Implemented `startLocalDb()`:
  1. Starts the Docker container via `startDockerContainer`.
  2. Instantiates `pg.Pool` with pool size of 10.
  3. Initializes Drizzle ORM instance (`localPostgresDb`).
  4. Performs connection health checks with retries (`SELECT 1`).
  5. Automatically executes schema migrations from `./drizzle` folder on application startup.
- Exported `getPostgresDb()` to return the active Drizzle instance for database queries.

### 4. Drizzle Kit & Migration Setup (`drizzle.config.ts`)
- Updated `drizzle.config.ts` to dynamically construct local database connection strings for Drizzle Kit CLI commands (`db:generate`, `db:migrate`).
- Integrated `drizzle-orm/node-postgres/migrator` into `startLocalDb()` for hands-free local migration execution.

### 5. Application-Wide Refactoring (`getNeonDb` -> `getPostgresDb`)
- Replaced `connectNeonDb()` with `startLocalDb()` inside `connectAllDb()` in `src/utils/startup.utils.ts`.
- Updated environment variable checks in `src/utils/startup.utils.ts` and `src/constants/constants.ts`.
- Replaced all imports and function calls from `getNeonDb()` to `getPostgresDb()` across:
  - `src/controllers/auth.controller.ts`
  - `src/controllers/user.controller.ts`
  - `src/middlewares/auth.middleware.ts`
  - `src/utils/auth.utils.ts`

### 6. Dependencies & Runtime Scripts (`package.json`)
- Added `pg` to dependencies and `@types/pg`, `tsx`, `ts-node` to devDependencies.
- Updated `dev` script in `package.json` to execute via `tsx` (`nodemon --watch . --ext ts --exec tsx index.ts`).
