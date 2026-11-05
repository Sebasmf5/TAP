ALTER TABLE "attendance"."attendance_records" ALTER COLUMN "session_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance"."attendance_records" ADD COLUMN "voided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance"."attendance_records" ADD COLUMN "voided_by" uuid;--> statement-breakpoint
ALTER TABLE "attendance"."attendance_records" ADD COLUMN "ip_hash" text;--> statement-breakpoint
ALTER TABLE "attendance"."attendance_records" ADD COLUMN "user_agent" text;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attendance_event_session_person_valid" ON "attendance"."attendance_records" USING btree ("event_id","session_id","person_id") WHERE "attendance"."attendance_records"."status" = 'valid';--> statement-breakpoint
CREATE OR REPLACE VIEW "attendance"."v_pub_attendance_records" AS
SELECT
  "id",
  "organization_id",
  "event_id",
  "session_id",
  "person_id",
  "checked_in_at",
  "method",
  "registered_by",
  "status",
  "client_duration_ms"
FROM "attendance"."attendance_records";--> statement-breakpoint
CREATE OR REPLACE VIEW "attendance"."v_pub_attendance_daily_summary" AS
SELECT
  "organization_id",
  "event_id",
  date_trunc('day', "checked_in_at" AT TIME ZONE 'America/Bogota') AS "day_bogota",
  count(*) FILTER (WHERE "status" = 'valid')::int AS "valid_checkins",
  count(DISTINCT "person_id") FILTER (WHERE "status" = 'valid')::int AS "unique_attendees",
  percentile_cont(0.5) WITHIN GROUP (ORDER BY "client_duration_ms") FILTER (WHERE "status" = 'valid' AND "client_duration_ms" IS NOT NULL) AS "median_client_duration_ms"
FROM "attendance"."attendance_records"
GROUP BY "organization_id", "event_id", date_trunc('day', "checked_in_at" AT TIME ZONE 'America/Bogota');
