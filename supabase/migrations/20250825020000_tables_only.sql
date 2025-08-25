-- Essential tables from existing database
-- This migration creates only the tables, without functions that may have syntax issues

-- Enable required extensions that aren't pre-installed
CREATE EXTENSION IF NOT EXISTS "btree_gin" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";

-- Create private schema
CREATE SCHEMA IF NOT EXISTS "private";
ALTER SCHEMA "private" OWNER TO "postgres";

-- ============================================
-- CORE TABLES
-- ============================================

CREATE TABLE IF NOT EXISTS "private"."cron_secrets" (
    "key" text NOT NULL,
    "value" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" uuid NOT NULL DEFAULT auth.uid(),
    "email" text,
    "full_name" text,
    "avatar_url" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "slug" text UNIQUE NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "metadata" jsonb DEFAULT '{}',
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."tenant_users" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "role" text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
    "status" text DEFAULT 'active',
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "tenant_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    CONSTRAINT "tenant_users_unique" UNIQUE ("tenant_id", "user_id")
);

CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "google_place_id" text,
    "name" text NOT NULL,
    "address" text,
    "city" text,
    "state" text,
    "postal_code" text,
    "country" text,
    "phone" text,
    "website" text,
    "business_hours" jsonb,
    "metadata" jsonb DEFAULT '{}',
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "location_id" uuid NOT NULL,
    "platform" text NOT NULL,
    "platform_review_id" text,
    "reviewer_name" text,
    "reviewer_avatar" text,
    "rating" integer CHECK (rating >= 1 AND rating <= 5),
    "title" text,
    "content" text,
    "response" text,
    "responded_at" timestamptz,
    "review_date" timestamptz,
    "sentiment_score" float,
    "keywords" text[],
    "metadata" jsonb DEFAULT '{}',
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "reviews_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."ai_model_config" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "model_type" text NOT NULL,
    "provider" text NOT NULL,
    "model_name" text NOT NULL,
    "config" jsonb DEFAULT '{}',
    "is_active" boolean DEFAULT true,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "ai_model_config_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_model_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."ai_responses" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "review_id" uuid NOT NULL,
    "model_config_id" uuid,
    "generated_response" text NOT NULL,
    "confidence_score" float,
    "tokens_used" integer,
    "generation_time_ms" integer,
    "status" text DEFAULT 'draft',
    "approved_by" uuid,
    "approved_at" timestamptz,
    "published_at" timestamptz,
    "metadata" jsonb DEFAULT '{}',
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "ai_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "ai_responses_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."response_templates" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "name" text NOT NULL,
    "category" text,
    "template" text NOT NULL,
    "variables" jsonb DEFAULT '[]',
    "is_active" boolean DEFAULT true,
    "usage_count" integer DEFAULT 0,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "response_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "response_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."response_queue" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "review_id" uuid NOT NULL,
    "ai_response_id" uuid,
    "status" text DEFAULT 'pending',
    "priority" integer DEFAULT 5,
    "scheduled_for" timestamptz,
    "attempts" integer DEFAULT 0,
    "last_attempt_at" timestamptz,
    "error_message" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "response_queue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "response_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "response_queue_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."oauth_tokens" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "provider" text NOT NULL,
    "access_token" text,
    "refresh_token" text,
    "expires_at" timestamptz,
    "scopes" text[],
    "metadata" jsonb DEFAULT '{}',
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oauth_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "tenant_id" uuid NOT NULL,
    "channel" text NOT NULL,
    "event_type" text NOT NULL,
    "enabled" boolean DEFAULT true,
    "config" jsonb DEFAULT '{}',
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
    CONSTRAINT "notification_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."alert_notifications" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "user_id" uuid,
    "type" text NOT NULL,
    "severity" text DEFAULT 'info',
    "title" text NOT NULL,
    "message" text,
    "data" jsonb DEFAULT '{}',
    "read_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "alert_notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alert_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "user_id" uuid,
    "action" text NOT NULL,
    "entity_type" text,
    "entity_id" uuid,
    "old_values" jsonb,
    "new_values" jsonb,
    "ip_address" inet,
    "user_agent" text,
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."billing_usage" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "metric_type" text NOT NULL,
    "quantity" integer DEFAULT 0,
    "period_start" date NOT NULL,
    "period_end" date NOT NULL,
    "metadata" jsonb DEFAULT '{}',
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "billing_usage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."batch_generation_jobs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "status" text DEFAULT 'pending',
    "total_reviews" integer DEFAULT 0,
    "processed_reviews" integer DEFAULT 0,
    "successful_count" integer DEFAULT 0,
    "failed_count" integer DEFAULT 0,
    "config" jsonb DEFAULT '{}',
    "started_at" timestamptz,
    "completed_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "batch_generation_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "batch_generation_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."business_guidance" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "category" text NOT NULL,
    "title" text NOT NULL,
    "content" text NOT NULL,
    "metadata" jsonb DEFAULT '{}',
    "is_active" boolean DEFAULT true,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "business_guidance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_guidance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."context_caches" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "cache_key" text NOT NULL,
    "cache_type" text NOT NULL,
    "data" jsonb NOT NULL,
    "expires_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "context_caches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "context_caches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."cron_job_executions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "job_name" text NOT NULL,
    "status" text DEFAULT 'running',
    "started_at" timestamptz DEFAULT now(),
    "completed_at" timestamptz,
    "error_message" text,
    "metadata" jsonb DEFAULT '{}',
    CONSTRAINT "cron_job_executions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."performance_metrics" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "metric_type" text NOT NULL,
    "metric_value" float NOT NULL,
    "metadata" jsonb DEFAULT '{}',
    "recorded_at" timestamptz DEFAULT now(),
    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "performance_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."response_analytics" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "period_start" date NOT NULL,
    "period_end" date NOT NULL,
    "total_reviews" integer DEFAULT 0,
    "responded_count" integer DEFAULT 0,
    "ai_generated_count" integer DEFAULT 0,
    "manual_count" integer DEFAULT 0,
    "avg_response_time_hours" float,
    "sentiment_improvement" float,
    "metadata" jsonb DEFAULT '{}',
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "response_analytics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "response_analytics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."response_settings" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "auto_generate" boolean DEFAULT false,
    "auto_publish" boolean DEFAULT false,
    "min_rating_to_respond" integer DEFAULT 1,
    "response_delay_hours" integer DEFAULT 24,
    "tone_settings" jsonb DEFAULT '{}',
    "custom_instructions" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "response_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "response_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."system_alerts" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "alert_type" text NOT NULL,
    "severity" text DEFAULT 'info',
    "title" text NOT NULL,
    "message" text,
    "metadata" jsonb DEFAULT '{}',
    "acknowledged_at" timestamptz,
    "acknowledged_by" uuid,
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "system_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."workflow_executions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "workflow_type" text NOT NULL,
    "status" text DEFAULT 'pending',
    "input_data" jsonb DEFAULT '{}',
    "output_data" jsonb DEFAULT '{}',
    "error_message" text,
    "started_at" timestamptz DEFAULT now(),
    "completed_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_executions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "public"."workflow_step_executions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "execution_id" uuid NOT NULL,
    "step_name" text NOT NULL,
    "step_type" text NOT NULL,
    "status" text DEFAULT 'pending',
    "input_data" jsonb DEFAULT '{}',
    "output_data" jsonb DEFAULT '{}',
    "error_message" text,
    "started_at" timestamptz,
    "completed_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    CONSTRAINT "workflow_step_executions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_step_executions_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "public"."workflow_executions"("id") ON DELETE CASCADE
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS "idx_reviews_tenant_id" ON "public"."reviews"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_location_id" ON "public"."reviews"("location_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_platform" ON "public"."reviews"("platform");
CREATE INDEX IF NOT EXISTS "idx_reviews_rating" ON "public"."reviews"("rating");
CREATE INDEX IF NOT EXISTS "idx_reviews_created_at" ON "public"."reviews"("created_at" DESC);

CREATE INDEX IF NOT EXISTS "idx_ai_responses_tenant_id" ON "public"."ai_responses"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ai_responses_review_id" ON "public"."ai_responses"("review_id");
CREATE INDEX IF NOT EXISTS "idx_ai_responses_status" ON "public"."ai_responses"("status");

CREATE INDEX IF NOT EXISTS "idx_response_queue_status" ON "public"."response_queue"("status");
CREATE INDEX IF NOT EXISTS "idx_response_queue_scheduled" ON "public"."response_queue"("scheduled_for");

CREATE INDEX IF NOT EXISTS "idx_locations_tenant_id" ON "public"."locations"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_users_tenant_id" ON "public"."tenant_users"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_tenant_users_user_id" ON "public"."tenant_users"("user_id");

CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_id" ON "public"."audit_logs"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_audit_logs_created_at" ON "public"."audit_logs"("created_at" DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_model_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."response_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."response_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."oauth_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."alert_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."batch_generation_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."business_guidance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."context_caches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."performance_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."response_analytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."response_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workflow_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workflow_step_executions" ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (you'll need to add more specific ones based on your requirements)
CREATE POLICY "Users can view own profile" ON "public"."profiles"
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON "public"."profiles"
    FOR UPDATE USING (auth.uid() = id);

-- Grant permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;