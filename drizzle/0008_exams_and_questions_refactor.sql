DO $$ BEGIN
    CREATE TYPE "exam_status" AS ENUM ('DRAFT', 'GENERATING_QUESTIONS', 'READY', 'PREPARED', 'LIVE', 'DELAYED', 'PREPARATION_FAILED', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "exam_difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "exams" DROP CONSTRAINT IF EXISTS "exams_question_paper_id_question_papers_id_fk";
--> statement-breakpoint
ALTER TABLE "questions" DROP CONSTRAINT IF EXISTS "questions_question_paper_id_question_papers_id_fk";
--> statement-breakpoint
ALTER TABLE "exams" DROP COLUMN IF EXISTS "question_paper_id";
--> statement-breakpoint
ALTER TABLE "exams" ALTER COLUMN "title" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "exams" ALTER COLUMN "scheduled_start" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "teacher_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "exams" ADD CONSTRAINT "exams_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "ai_prompt" text;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "no_of_questions" integer DEFAULT 10 NOT NULL;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "difficulty" "exam_difficulty" DEFAULT 'MEDIUM' NOT NULL;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "access_window_minutes" integer DEFAULT 30 NOT NULL;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "pdf_s3_key" text;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "pdf_original_filename" text;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "generation_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "status" "exam_status" DEFAULT 'DRAFT' NOT NULL;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "status_reason" text;
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exams_teacher" ON "exams" ("teacher_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exams_status" ON "exams" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_exams_scheduled_start" ON "exams" ("scheduled_start");
--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN IF EXISTS "question_paper_id";
--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN IF EXISTS "marks_awarded";
--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN IF EXISTS "correct_answer";
--> statement-breakpoint
ALTER TABLE "questions" DROP COLUMN IF EXISTS "question_text";
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "exam_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "question" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "correct_option" varchar(255) NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "difficulty" "exam_difficulty" DEFAULT 'MEDIUM' NOT NULL;
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questions_exam" ON "questions" ("exam_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_questions_order" ON "questions" ("exam_id", "order_sequence");
--> statement-breakpoint
DROP TABLE IF EXISTS "question_papers" CASCADE;
