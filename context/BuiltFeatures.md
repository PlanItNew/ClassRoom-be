# Built Features

This document tracks all completed features and architectural foundations in the `edu-ex` backend application.

---

## 1. Project Core & Setup
- **TypeScript & Express Engine**: Express 5 framework setup integrated with Nodemon hot-reloading and dotenv configuration loading.
- **Server Entry (`index.ts`)**: Base HTTP server configured with JSON request parsing, global error middleware, and sub-router mounting under `/api`.

---

## 2. Database & Data Modeling (`src/database/`)
- **Neon PostgreSQL & Drizzle ORM Integration**: High-performance HTTP serverless connection setup.
- **Schema & Indexes (`schema.ts`)**:
  - `users`: User registration & authentication profiles supporting `TEACHER` and `STUDENT` roles.
  - `subjects`: Course and syllabus metadata storage.
  - `classrooms`: Digital learning spaces with teacher associations and unique join code generation (`join_code`).
  - `classroom_students`: Junction table with composite primary key `(classroom_id, student_id)`, enrollment status workflow (`PENDING`, `APPROVED`, `REJECTED`), and indexed `student_id` for efficient query execution.
  - `question_papers` & `questions`: Flexible question paper authoring with JSON options, answer keys, and point weightings.
  - `exams`: Exam scheduling associated with classrooms and target question papers.
  - `exam_attempts`: Attempt session management preventing duplicate submissions via unique constraint `(exam_id, student_id)`.
  - `attempt_answers`: Detailed response logging and scoring breakdown for every question.

---

## 3. Application Infrastructure & Organization

### Configuration Layer (`src/config/`)
- Separated environment loader system (`database.key.ts`, `database.config.ts`, `index.ts`) providing structured database keys, server ports, and app credentials.

### Middleware Layer (`src/middlewares/`)
- `auth.middleware.ts`: Token verification helper and RBAC (`requireRole`) middleware.
- `error.middleware.ts`: Centralized Express error handler catching asynchronous/unhandled application errors.

### Route & Controller Layer (`src/routes/` & `src/controllers/`)
- Modular router modules created for:
  - **Auth Service**: `/api/auth` (User registration and authentication handlers)
  - **Classroom Service**: `/api/classrooms` (Classroom management, join requests, listings)
  - **Exam Service**: `/api/exams` (Exam creation, attempt submission, and grade/result reporting)
