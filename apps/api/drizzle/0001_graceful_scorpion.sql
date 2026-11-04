CREATE TABLE "access"."oauth_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "access"."refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"family_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"family_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"user_agent" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations"."sites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"address" text,
	"loan_point_code" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "access"."uq_access_users_org_email";--> statement-breakpoint
ALTER TABLE "organizations"."organizations" ALTER COLUMN "features" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "access"."users" ADD COLUMN "full_name" text DEFAULT 'Funcionario' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations"."organizations" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "organizations"."organizations" ADD COLUMN "allowed_email_domains" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations"."organizations" ADD COLUMN "data_consent_version" text DEFAULT 'v1.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations"."organizations" ADD COLUMN "data_consent_text" text DEFAULT 'Autorizo de manera previa, expresa e informada el tratamiento de mis datos personales conforme a la Ley 1581 de 2012.' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations"."organizations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "access"."oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "access"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "access"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "access"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_access_oauth_provider_account" ON "access"."oauth_accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "idx_access_oauth_user" ON "access"."oauth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_access_refresh_tokens_hash" ON "access"."refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_access_refresh_tokens_family" ON "access"."refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "idx_access_refresh_tokens_user" ON "access"."refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_organizations_sites_org_code" ON "organizations"."sites" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_organizations_sites_loan_point_code" ON "organizations"."sites" USING btree ("loan_point_code");--> statement-breakpoint
CREATE INDEX "idx_organizations_sites_org" ON "organizations"."sites" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_access_users_email" ON "access"."users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_access_users_org_id" ON "access"."users" USING btree ("organization_id");