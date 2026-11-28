-- Row-level security (ADR-024): a second layer of school isolation, inside Postgres.
-- Hand-written, not generated: drizzle-kit does not create roles or grants.
--
-- The server does not read as the user that owns the tables. For each school it
-- switches, inside one read-only transaction, to the role `rezen_app` and sets
-- `app.school_id`; the policies below then show that role only that school's rows.
-- `rezen_app` is not a login role and holds no write privilege anywhere.

-- Roles belong to the whole server, not to one database, so this may already exist
-- (another database, or a parallel run). Both errors below mean "someone just made it".
DO $$
BEGIN
  CREATE ROLE rezen_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
EXCEPTION WHEN duplicate_object OR unique_violation THEN
  NULL;
END
$$;--> statement-breakpoint
-- Whoever runs migrations is whoever the app connects as, and it must be able to switch to the role.
-- (A superuser can already; this is for a plain owner role, such as on a hosted database.)
-- If the role was made by someone else and this user may not grant it, the migration still
-- finishes: the server's startup check then says how to fix it (ADR-024).
DO $$
BEGIN
  GRANT "rezen_app" TO CURRENT_USER;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Could not grant "rezen_app" to %; grant it as a user that may.', CURRENT_USER;
END
$$;--> statement-breakpoint

-- Read access to exactly these tables, and nothing else. `school_tokens` and the
-- migrations table are deliberately absent: the role that serves tools cannot read
-- token hashes (ADR-020). A table added later has no access until it is granted here.
GRANT USAGE ON SCHEMA public TO "rezen_app";--> statement-breakpoint
GRANT SELECT ON "schools", "classes", "students", "scores", "subjects", "terms" TO "rezen_app";--> statement-breakpoint

-- `subjects` and `terms` are shared by every school (ADR-021) and have no policy.
-- The tenant tables do. There is no FORCE: the owner (seeding, migrations, token
-- checks) keeps full access, and the policies apply to `rezen_app` only.
ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- `current_setting(..., true)` is NULL when `app.school_id` was never set, and
-- `school_id = NULL` matches no row: with no school, a query sees nothing.
-- The `(select ...)` makes Postgres evaluate it once per query, not once per row.
CREATE POLICY "schools_one_school" ON "schools" AS PERMISSIVE FOR SELECT TO "rezen_app"
  USING ("id" = (select current_setting('app.school_id', true)));--> statement-breakpoint
CREATE POLICY "classes_one_school" ON "classes" AS PERMISSIVE FOR SELECT TO "rezen_app"
  USING ("school_id" = (select current_setting('app.school_id', true)));--> statement-breakpoint
CREATE POLICY "students_one_school" ON "students" AS PERMISSIVE FOR SELECT TO "rezen_app"
  USING ("school_id" = (select current_setting('app.school_id', true)));--> statement-breakpoint
CREATE POLICY "scores_one_school" ON "scores" AS PERMISSIVE FOR SELECT TO "rezen_app"
  USING ("school_id" = (select current_setting('app.school_id', true)));
