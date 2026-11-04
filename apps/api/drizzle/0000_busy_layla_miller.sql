CREATE SCHEMA IF NOT EXISTS "shared";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "access";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "attendance";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "certificates";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "events";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "inventory";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "loans";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "notifications";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "organizations";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "people";
--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "reports";
--> statement-breakpoint
CREATE TABLE "shared"."audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_hash" text,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access"."users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"token_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance"."attendance_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"session_id" uuid,
	"person_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	"registered_by" uuid,
	"status" text DEFAULT 'valid' NOT NULL,
	"void_reason" text,
	"client_duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "certificates"."certificates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text DEFAULT 'issued' NOT NULL,
	"pdf_path" text,
	"pdf_sha256" text,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_reason" text
);
--> statement-breakpoint
CREATE TABLE "events"."events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"public_code" text NOT NULL,
	"capacity" integer,
	"confirm_identity" boolean DEFAULT true NOT NULL,
	"allow_walk_in" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory"."units" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"model_id" uuid NOT NULL,
	"code" text NOT NULL,
	"qr_token" text NOT NULL,
	"condition" text DEFAULT 'good' NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans"."loans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"status" text DEFAULT 'pending_delivery' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications"."notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"template" text NOT NULL,
	"recipient" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"deduplication_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations"."organizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"type" text NOT NULL,
	"plan" text DEFAULT 'pilot' NOT NULL,
	"features" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timezone" text DEFAULT 'America/Bogota' NOT NULL,
	"retention_days" integer DEFAULT 365 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people"."people" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"document_type" text NOT NULL,
	"document_number" text NOT NULL,
	"institutional_code" text,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"person_type" text DEFAULT 'student' NOT NULL,
	"is_minor" boolean DEFAULT false NOT NULL,
	"qr_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports"."runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"type" text NOT NULL,
	"format" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"file_path" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_audit_logs_org_occurred" ON "shared"."audit_logs" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "shared"."audit_logs" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_access_users_org_email" ON "access"."users" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "idx_attendance_org_event_time" ON "attendance"."attendance_records" USING btree ("organization_id","event_id","checked_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_certificates_code" ON "certificates"."certificates" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_certificates_org_event" ON "certificates"."certificates" USING btree ("organization_id","event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_events_public_code" ON "events"."events" USING btree ("public_code");--> statement-breakpoint
CREATE INDEX "idx_events_org_status" ON "events"."events" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_units_org_code" ON "inventory"."units" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "idx_inventory_units_org_site_status" ON "inventory"."units" USING btree ("organization_id","site_id","status");--> statement-breakpoint
CREATE INDEX "idx_loans_org_status" ON "loans"."loans" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_notifications_dedup" ON "notifications"."notifications" USING btree ("organization_id","deduplication_key");--> statement-breakpoint
CREATE INDEX "idx_notifications_org_status" ON "notifications"."notifications" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_organizations_slug" ON "organizations"."organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_people_org_doc" ON "people"."people" USING btree ("organization_id","document_type","document_number");--> statement-breakpoint
CREATE INDEX "idx_people_org_code" ON "people"."people" USING btree ("organization_id","institutional_code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_people_qr_token" ON "people"."people" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "idx_reports_runs_org_created" ON "reports"."runs" USING btree ("organization_id","created_at");