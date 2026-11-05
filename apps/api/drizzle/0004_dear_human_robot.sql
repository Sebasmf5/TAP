CREATE TABLE "certificates"."certificate_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_template" text NOT NULL,
	"logo_url" text,
	"signers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"orientation" text DEFAULT 'landscape' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"template_key" text NOT NULL,
	"subject_template" text NOT NULL,
	"html_template" text NOT NULL,
	"text_template" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "certificates"."certificates" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "certificates"."certificates" ADD COLUMN "template_snapshot" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "certificates"."certificates" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "certificates"."certificates" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "certificates"."certificates" ADD COLUMN "revoked_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "certificates"."certificates" ADD COLUMN "verification_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications"."notifications" ADD COLUMN "subject" text NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications"."notifications" ADD COLUMN "related_entity_type" text;--> statement-breakpoint
ALTER TABLE "notifications"."notifications" ADD COLUMN "related_entity_id" uuid;--> statement-breakpoint
ALTER TABLE "notifications"."notifications" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_certificate_templates_org" ON "certificates"."certificate_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notification_templates_org_key" ON "notifications"."templates" USING btree ("organization_id","template_key");--> statement-breakpoint
CREATE INDEX "idx_certificates_event_person" ON "certificates"."certificates" USING btree ("event_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_certificates_event_person_active" ON "certificates"."certificates" ("event_id","person_id") WHERE status = 'issued';--> statement-breakpoint
CREATE OR REPLACE VIEW "certificates"."v_pub_certificates" AS
SELECT
  id,
  organization_id,
  event_id,
  person_id,
  code,
  status,
  issued_at,
  delivered_at,
  revoked_at,
  verification_count
FROM "certificates"."certificates";--> statement-breakpoint
CREATE OR REPLACE VIEW "notifications"."v_pub_notifications" AS
SELECT
  id,
  organization_id,
  channel,
  template,
  status,
  attempts,
  related_entity_type,
  related_entity_id,
  sent_at,
  created_at
FROM "notifications"."notifications";
