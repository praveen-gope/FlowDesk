CREATE TABLE "crm_audit_events" (
	"id" serial PRIMARY KEY,
	"actor" integer,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_rate_limits" (
	"key" text PRIMARY KEY,
	"count" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'New' NOT NULL,
	"details" jsonb DEFAULT '{}' NOT NULL,
	"owner" integer,
	"team" integer,
	"assigned_to" jsonb DEFAULT '[]' NOT NULL,
	"support_access" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crm_teams" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "crm_users" (
	"id" serial PRIMARY KEY,
	"identity_id" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"role" text DEFAULT 'support' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"teams" jsonb DEFAULT '[]' NOT NULL,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "crm_records_kind_idx" ON "crm_records" ("kind");--> statement-breakpoint
CREATE INDEX "crm_records_team_idx" ON "crm_records" ("team");--> statement-breakpoint
ALTER TABLE "crm_audit_events" ADD CONSTRAINT "crm_audit_events_actor_crm_users_id_fkey" FOREIGN KEY ("actor") REFERENCES "crm_users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_owner_crm_users_id_fkey" FOREIGN KEY ("owner") REFERENCES "crm_users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "crm_records" ADD CONSTRAINT "crm_records_team_crm_teams_id_fkey" FOREIGN KEY ("team") REFERENCES "crm_teams"("id") ON DELETE SET NULL;