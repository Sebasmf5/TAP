CREATE TABLE "attendance"."event_preregistrations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_preregistration_event_person" ON "attendance"."event_preregistrations" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_preregistration_org_event" ON "attendance"."event_preregistrations" USING btree ("organization_id","event_id");