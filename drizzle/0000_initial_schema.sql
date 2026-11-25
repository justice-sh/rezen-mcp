CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	"level" integer NOT NULL,
	CONSTRAINT "classes_id_school_id_key" UNIQUE("id","school_id")
);
--> statement-breakpoint
CREATE TABLE "schools" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"student_id" text NOT NULL,
	"school_id" text NOT NULL,
	"subject" text NOT NULL,
	"term" text NOT NULL,
	"ca" integer,
	"exam" integer,
	CONSTRAINT "scores_pkey" PRIMARY KEY("student_id","subject","term"),
	CONSTRAINT "scores_ca_range" CHECK ("scores"."ca" is null or "scores"."ca" between 0 and 40),
	CONSTRAINT "scores_exam_range" CHECK ("scores"."exam" is null or "scores"."exam" between 0 and 60)
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"school_id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "students_id_school_id_key" UNIQUE("id","school_id")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"name" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "subjects_position_key" UNIQUE("position")
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"is_current" boolean DEFAULT false NOT NULL,
	CONSTRAINT "terms_position_key" UNIQUE("position")
);
--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_subject_subjects_name_fk" FOREIGN KEY ("subject") REFERENCES "public"."subjects"("name") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_term_terms_id_fk" FOREIGN KEY ("term") REFERENCES "public"."terms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_student_school_fk" FOREIGN KEY ("student_id","school_id") REFERENCES "public"."students"("id","school_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_class_school_fk" FOREIGN KEY ("class_id","school_id") REFERENCES "public"."classes"("id","school_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classes_school_id_idx" ON "classes" USING btree ("school_id");--> statement-breakpoint
CREATE INDEX "students_class_id_idx" ON "students" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_one_current_idx" ON "terms" USING btree ("is_current") WHERE "terms"."is_current";