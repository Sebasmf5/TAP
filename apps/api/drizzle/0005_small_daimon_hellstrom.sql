CREATE TABLE "inventory"."categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_loan_duration_hours" integer DEFAULT 4 NOT NULL,
	"max_units_per_borrower" integer DEFAULT 2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory"."item_models" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code_prefix" text NOT NULL,
	"description" text,
	"tracking_type" text DEFAULT 'trackable' NOT NULL,
	"loan_duration_hours" integer DEFAULT 4 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loans"."lending_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"public_code" text NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"require_operator_approval" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory"."units" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "lending_point_id" uuid;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "unit_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "model_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "condition_out" text DEFAULT 'good' NOT NULL;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "condition_in" text;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "signature_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "signature_sha256" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "returned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD COLUMN "return_notes" text;--> statement-breakpoint
ALTER TABLE "inventory"."item_models" ADD CONSTRAINT "item_models_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "inventory"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inventory_categories_org" ON "inventory"."categories" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_models_org_prefix" ON "inventory"."item_models" USING btree ("organization_id","code_prefix");--> statement-breakpoint
CREATE INDEX "idx_inventory_models_org_cat" ON "inventory"."item_models" USING btree ("organization_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_lending_points_public_code" ON "loans"."lending_points" USING btree ("public_code");--> statement-breakpoint
CREATE INDEX "idx_lending_points_org_site" ON "loans"."lending_points" USING btree ("organization_id","site_id");--> statement-breakpoint
ALTER TABLE "loans"."loans" ADD CONSTRAINT "loans_lending_point_id_lending_points_id_fk" FOREIGN KEY ("lending_point_id") REFERENCES "loans"."lending_points"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inventory_units_qr_token" ON "inventory"."units" USING btree ("qr_token");--> statement-breakpoint
CREATE INDEX "idx_inventory_units_org_model_status" ON "inventory"."units" USING btree ("organization_id","model_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_loans_org_idempotency" ON "loans"."loans" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_loans_org_person_status" ON "loans"."loans" USING btree ("organization_id","person_id","status");--> statement-breakpoint
CREATE INDEX "idx_loans_org_unit_status" ON "loans"."loans" USING btree ("organization_id","unit_id","status");--> statement-breakpoint
CREATE OR REPLACE VIEW "inventory"."v_pub_inventory_summary" AS
SELECT
  m.id AS model_id,
  m.organization_id,
  m.category_id,
  c.name AS category_name,
  m.name AS model_name,
  m.code_prefix,
  COUNT(u.id) FILTER (WHERE u.status = 'available')::int AS available_count,
  COUNT(u.id) FILTER (WHERE u.status = 'loaned')::int AS loaned_count,
  COUNT(u.id)::int AS total_count
FROM "inventory"."item_models" m
JOIN "inventory"."categories" c ON c.id = m.category_id
LEFT JOIN "inventory"."units" u ON u.model_id = m.id
GROUP BY m.id, c.name;--> statement-breakpoint
CREATE OR REPLACE VIEW "loans"."v_pub_loans" AS
SELECT
  l.id,
  l.organization_id,
  l.site_id,
  l.lending_point_id,
  l.person_id,
  l.unit_id,
  l.model_id,
  l.status,
  l.condition_out,
  l.condition_in,
  l.due_at,
  l.delivered_at,
  l.returned_at,
  l.created_at
FROM "loans"."loans" l;
