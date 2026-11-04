CREATE TABLE "events"."event_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"session_number" integer NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."consents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"channel" text NOT NULL,
	"ip_hash" text
);
--> statement-breakpoint
ALTER TABLE "events"."events" ADD COLUMN "checkin_opens_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "events"."events" ADD COLUMN "checkin_closes_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "events"."events" ADD COLUMN "allowed_identification_modes" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events"."events" ADD COLUMN "certificate_rule" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "events"."events" ADD COLUMN "auto_issue_certificates" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events"."events" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "people"."people" ADD COLUMN "guardian_name" text;--> statement-breakpoint
ALTER TABLE "people"."people" ADD COLUMN "guardian_document" text;--> statement-breakpoint
ALTER TABLE "people"."people" ADD COLUMN "guardian_phone" text;--> statement-breakpoint
ALTER TABLE "people"."people" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "events"."event_sessions" ADD CONSTRAINT "event_sessions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "events"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people"."consents" ADD CONSTRAINT "consents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "people"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_event_sessions_event" ON "events"."event_sessions" USING btree ("organization_id","event_id","session_number");--> statement-breakpoint
CREATE INDEX "idx_people_consents_person" ON "people"."consents" USING btree ("organization_id","person_id");