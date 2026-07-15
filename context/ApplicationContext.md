# Application Context: edu-ex (Backend)

## 📌 Project Overview
`edu-ex` is a full-stack educational platform. This codebase serves as the Node.js / Express backend service written in TypeScript.

### Motive & Core Capabilities
The core goal of `edu-ex` is to empower educators and students:
- **Teachers**: Can create and manage digital classrooms, generate question papers with custom questions and answers, schedule exams, evaluate student submissions, and analyze exam results.
- **Students**: Can request entry to classrooms via join codes, attempt scheduled exams within allocated durations, and track their performance results.

---

## 🏗 Directory & Architectural Structure

The backend application is modularly organized under `src/` into 5 primary architectural layers:

```
src/
├── config/             # Environment variable loaders and module configurations
│   ├── database.key.ts
│   ├── database.config.ts
│   └── index.ts
├── database/           # Database setup and Drizzle ORM schema definitions
│   ├── db.ts
│   └── schema.ts
├── middlewares/        # Middlewares for authentication, authorization, error handling, parsing
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   └── index.ts
├── controllers/        # Core business logic handlers for application endpoints
│   ├── auth.controller.ts
│   ├── classroom.controller.ts
│   ├── exam.controller.ts
│   └── index.ts
└── routes/             # Mini-applications/routers matching specific services
    ├── auth.routes.ts
    ├── classroom.routes.ts
    ├── exam.routes.ts
    └── index.ts
```

### Layer Breakdown

1. **Config (`src/config/`)**
   - Loads data from environment variables (`.env`) for each section separately.
   - Contains modular files like `database.key.ts` for secrets/connection strings and `database.config.ts` for database parameters.

2. **Database (`src/database/`)**
   - Configures the Neon PostgreSQL connection via Drizzle ORM HTTP adapter (`db.ts`).
   - Defines all database entities, relations, enums, composite keys, and performance indexes in `schema.ts`.

3. **Middlewares (`src/middlewares/`)**
   - Handles request preprocessing, body parsing, JWT token authentication (`authenticateToken`), role authorization (`requireRole`), and global error handling (`errorHandler`).

4. **Controllers (`src/controllers/`)**
   - Houses the business logic corresponding to routed endpoints.
   - Interfaces directly with the database layer to execute actions and format HTTP responses.

5. **Routes (`src/routes/`)**
   - Express Router instances mapping endpoint URIs to appropriate middleware chains and controller execution functions.
