CREATE TYPE "public"."attachment_status" AS ENUM('PENDING_UPLOAD', 'UPLOADED', 'FAILED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('IN_PROGRESS', 'SUBMITTED', 'ABANDONED');--> statement-breakpoint
CREATE TYPE "public"."exam_difficulty" AS ENUM('EASY', 'MEDIUM', 'HARD');--> statement-breakpoint
CREATE TYPE "public"."exam_status" AS ENUM('DRAFT', 'GENERATING_QUESTIONS', 'READY', 'PREPARED', 'LIVE', 'DELAYED', 'PREPARATION_FAILED', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."join_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('DRAFT', 'PUBLISHED', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('TEACHER', 'STUDENT');--> statement-breakpoint
CREATE TABLE "post_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"s3_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text,
	"size_bytes" bigint,
	"status" "attachment_status" DEFAULT 'PENDING_UPLOAD' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "post_attachments_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
CREATE TABLE "attempt_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"selected_option" varchar(255),
	"marks_obtained" numeric(5, 2),
	"is_correct" boolean,
	"option_reason" text,
	"answered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_answers_exam_attempt_id_question_id_unique" UNIQUE("exam_attempt_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"content" text,
	"status" "post_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "classroom_students" (
	"classroom_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "join_status" DEFAULT 'PENDING' NOT NULL,
	"is_notification_read" boolean DEFAULT false NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "classroom_students_classroom_id_student_id_pk" PRIMARY KEY("classroom_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"subject_id" uuid,
	"name" varchar(255) NOT NULL,
	"subject" varchar(255),
	"section" varchar(100),
	"room" varchar(100),
	"purpose" text,
	"description" text,
	"theme_color" varchar(50) DEFAULT '#1d4ed8',
	"join_code" varchar(15),
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "classrooms_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "exam_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attempt_status" DEFAULT 'IN_PROGRESS' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"total_score" numeric(5, 2),
	"submission_type" varchar(50),
	"answers" jsonb,
	"question_order" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exam_attempts_exam_id_student_id_unique" UNIQUE("exam_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "exams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"title" varchar(255),
	"ai_prompt" text,
	"no_of_questions" integer DEFAULT 10 NOT NULL,
	"difficulty" "exam_difficulty" DEFAULT 'MEDIUM' NOT NULL,
	"scheduled_start" timestamp with time zone,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"access_window_minutes" integer DEFAULT 30 NOT NULL,
	"pdf_s3_key" text,
	"pdf_original_filename" text,
	"generation_version" integer DEFAULT 1 NOT NULL,
	"status" "exam_status" DEFAULT 'DRAFT' NOT NULL,
	"status_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_option" varchar(255) NOT NULL,
	"reason" text,
	"difficulty" "exam_difficulty" DEFAULT 'MEDIUM' NOT NULL,
	"order_sequence" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"syllabus_description" text,
	"syllabus_file_url" varchar(1024),
	CONSTRAINT "subjects_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "user_role" NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"password" varchar(1024) NOT NULL,
	"user_name" varchar(255) NOT NULL,
	"phone_number" varchar(15),
	"profile_picture_url" varchar(1024),
	"verified" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_user_name_unique" UNIQUE("user_name"),
	CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number")
);
--> statement-breakpoint
ALTER TABLE "post_attachments" ADD CONSTRAINT "post_attachments_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_exam_attempt_id_exam_attempts_id_fk" FOREIGN KEY ("exam_attempt_id") REFERENCES "public"."exam_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD CONSTRAINT "attempt_answers_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_students" ADD CONSTRAINT "classroom_students_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_attempts" ADD CONSTRAINT "exam_attempts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exams" ADD CONSTRAINT "exams_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_post_attachments_post" ON "post_attachments" USING btree ("post_id");--> statement-breakpoint
CREATE INDEX "idx_post_attachments_post_status" ON "post_attachments" USING btree ("post_id","status");--> statement-breakpoint
CREATE INDEX "idx_attempt_answers_question" ON "attempt_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_posts_classroom_published" ON "posts" USING btree ("classroom_id","published_at");--> statement-breakpoint
CREATE INDEX "idx_posts_classroom_status" ON "posts" USING btree ("classroom_id","status");--> statement-breakpoint
CREATE INDEX "idx_posts_teacher" ON "posts" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "idx_classroom_students_student" ON "classroom_students" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_classrooms_teacher" ON "classrooms" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "idx_exam_attempts_exam" ON "exam_attempts" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_exam_attempts_student" ON "exam_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_exams_classroom" ON "exams" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_exams_teacher" ON "exams" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "idx_exams_status" ON "exams" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_exams_scheduled_start" ON "exams" USING btree ("scheduled_start");--> statement-breakpoint
CREATE INDEX "idx_questions_exam" ON "questions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_questions_order" ON "questions" USING btree ("exam_id","order_sequence");