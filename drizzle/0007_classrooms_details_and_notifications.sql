ALTER TABLE "classrooms" ADD COLUMN "subject" varchar(255);
ALTER TABLE "classrooms" ADD COLUMN "section" varchar(100);
ALTER TABLE "classrooms" ADD COLUMN "room" varchar(100);
ALTER TABLE "classrooms" ADD COLUMN "description" text;
ALTER TABLE "classrooms" ADD COLUMN "theme_color" varchar(50) DEFAULT '#1d4ed8';
ALTER TABLE "classrooms" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;
ALTER TABLE "classrooms" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now();
ALTER TABLE "classroom_students" ADD COLUMN "is_notification_read" boolean DEFAULT false NOT NULL;
