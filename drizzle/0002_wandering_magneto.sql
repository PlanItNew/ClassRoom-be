ALTER TABLE "subjects" RENAME COLUMN "syallabus_file_url" TO "syllabus_file_url";--> statement-breakpoint
DROP INDEX "idx_attempt_answers_attempt";--> statement-breakpoint
ALTER TABLE "attempt_answers" ADD COLUMN "marks_obtained" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password" varchar(1024) NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_attempt_answers_question" ON "attempt_answers" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "idx_classrooms_teacher" ON "classrooms" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "idx_question_papers_teacher" ON "question_papers" USING btree ("teacher_id");