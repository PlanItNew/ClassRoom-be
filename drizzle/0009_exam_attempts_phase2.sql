ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "submission_type" varchar(50);
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "answers" jsonb;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "question_order" jsonb;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
