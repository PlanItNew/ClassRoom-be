ALTER TABLE "exam_attempts" ADD COLUMN IF EXISTS "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF EXISTS "submitted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF EXISTS "submission_type" varchar(50);
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF EXISTS "answers" jsonb;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF EXISTS "question_order" jsonb;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD COLUMN IF EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
