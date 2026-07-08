CREATE INDEX "idx_attempt_answers_attempt" ON "attempt_answers" USING btree ("exam_attempt_id");--> statement-breakpoint
CREATE INDEX "idx_classroom_students_student" ON "classroom_students" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_exam_attempts_exam" ON "exam_attempts" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_exam_attempts_student" ON "exam_attempts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "idx_exams_classroom" ON "exams" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "idx_questions_paper" ON "questions" USING btree ("question_paper_id");