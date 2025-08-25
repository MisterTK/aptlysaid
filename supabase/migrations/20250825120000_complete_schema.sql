-- Complete Schema for Review Management System
-- Cleaned and ready for deployment

-- ============================================
-- SCHEMAS
-- ============================================
CREATE SCHEMA IF NOT EXISTS "private";
CREATE SCHEMA IF NOT EXISTS "public";

-- ============================================
-- EXTENSIONS (only non-default ones)
-- ============================================
-- Most extensions are pre-installed in Supabase
-- Only add those that might not be available by default

-- ============================================
-- TABLES - CORE
-- ============================================

-- TODO: [MIGRATION] Add data migration scripts for existing production data
-- Current schema creates empty tables - need to migrate from old project

-- Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" uuid NOT NULL,
    "email" text NOT NULL,
    "full_name" text,
    "avatar_url" text,
    "phone" text,
    "preferred_language" text DEFAULT 'en'::text,
    "timezone" text DEFAULT 'UTC'::text,
    "notification_preferences" jsonb NOT NULL DEFAULT '{"sms": {"system": false, "reviews": false, "responses": false}, "push": {"system": true, "reviews": true, "responses": true}, "email": {"system": true, "reviews": true, "responses": true}}'::jsonb,
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "last_active_at" timestamp with time zone NOT NULL DEFAULT now(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE
);

-- Tenants table (organizations)
CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" text NOT NULL,
    "slug" text NOT NULL,
    "subscription_plan" text NOT NULL DEFAULT 'trial'::text,
    "subscription_status" text NOT NULL DEFAULT 'active'::text,
    "trial_ends_at" timestamp with time zone,
    "subscription_ends_at" timestamp with time zone,
    "stripe_customer_id" text,
    "stripe_subscription_id" text,
    "business_type" text,
    "industry" text,
    "employee_count" int4range,
    "annual_revenue" numrange,
    "timezone" text DEFAULT 'UTC'::text,
    "country_code" text,
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "features" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "onboarding_completed" boolean DEFAULT false,
    "onboarding_step" text,
    "onboarding_data" jsonb DEFAULT '{}'::jsonb,
    "monthly_review_limit" integer,
    "monthly_ai_generation_limit" integer,
    "locations_limit" integer DEFAULT 1,
    "team_members_limit" integer DEFAULT 5,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- Tenant users (membership)
CREATE TABLE IF NOT EXISTS "public"."tenant_users" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "role" text NOT NULL DEFAULT 'member'::text,
    "status" text DEFAULT 'active'::text,
    "permissions" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "invited_by" uuid,
    "invited_at" timestamp with time zone,
    "joined_at" timestamp with time zone DEFAULT now(),
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "tenant_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE
);

-- ============================================
-- TABLES - LOCATIONS & REVIEWS
-- ============================================

-- OAuth tokens for API integrations
CREATE TABLE IF NOT EXISTS "public"."oauth_tokens" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "user_id" uuid,
    "provider" text NOT NULL,
    "provider_scope" text NOT NULL,
    "encrypted_access_token" text NOT NULL,
    "encrypted_refresh_token" text,
    "expires_at" timestamp with time zone NOT NULL,
    "status" text NOT NULL DEFAULT 'active'::text,
    "refresh_attempts" integer NOT NULL DEFAULT 0,
    "last_refresh_at" timestamp with time zone,
    "last_refresh_error" text,
    "last_used_at" timestamp with time zone,
    "token_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "provider_user_id" text,
    "provider_user_email" text,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "created_by" uuid,
    "needs_refresh" boolean DEFAULT false,
    CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "oauth_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- Locations table
CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "name" text NOT NULL,
    "address" text,
    "phone" text,
    "website" text,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "timezone" text DEFAULT 'UTC'::text,
    "google_place_id" text,
    "facebook_page_id" text,
    "yelp_business_id" text,
    "tripadvisor_location_id" text,
    "trustpilot_business_id" text,
    "platform_tokens" jsonb DEFAULT '{}'::jsonb,
    "business_type" text,
    "industry" text,
    "price_level" integer,
    "rating" numeric(3,2),
    "review_count" integer DEFAULT 0,
    "status" text DEFAULT 'active'::text,
    "sync_enabled" boolean DEFAULT true,
    "auto_sync_frequency" interval DEFAULT '01:00:00'::interval,
    "last_sync_at" timestamp with time zone,
    "next_sync_at" timestamp with time zone,
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "platform_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "deleted_at" timestamp with time zone,
    "oauth_token_id" uuid,
    CONSTRAINT "locations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "locations_oauth_token_id_fkey" FOREIGN KEY ("oauth_token_id") REFERENCES "public"."oauth_tokens"("id") ON DELETE SET NULL
);

-- Reviews table
CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "location_id" uuid NOT NULL,
    "platform" text NOT NULL,
    "platform_review_id" text NOT NULL,
    "platform_reviewer_id" text,
    "reviewer_name" text,
    "reviewer_avatar_url" text,
    "rating" integer NOT NULL,
    "review_text" text,
    "review_language" text DEFAULT 'en'::text,
    "sentiment_score" numeric(5,4),
    "sentiment_label" text,
    "keywords" text[],
    "topics" text[],
    "confidence_score" numeric(5,4),
    "review_date" timestamp with time zone NOT NULL,
    "response_deadline" timestamp with time zone,
    "priority_score" integer DEFAULT 50,
    "is_verified" boolean DEFAULT false,
    "is_local_guide" boolean DEFAULT false,
    "reviewer_review_count" integer,
    "status" text DEFAULT 'new'::text,
    "needs_response" boolean DEFAULT true,
    "is_flagged" boolean DEFAULT false,
    "flagged_reason" text,
    "platform_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "deleted_at" timestamp with time zone,
    "reviewer_is_anonymous" boolean DEFAULT false,
    "review_updated_at" timestamp with time zone,
    "is_review_edited" boolean DEFAULT false,
    "review_url" text,
    "response_source" text,
    "external_response_date" timestamp with time zone,
    "has_owner_reply" boolean DEFAULT false,
    "owner_reply_text" text,
    "owner_reply_date" timestamp with time zone,
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "reviews_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE
);

-- ============================================
-- TABLES - AI & RESPONSES
-- ============================================

-- Response templates
CREATE TABLE IF NOT EXISTS "public"."response_templates" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "category" text,
    "template_text" text NOT NULL,
    "template_language" text DEFAULT 'en'::text,
    "variables" jsonb DEFAULT '[]'::jsonb,
    "rating_range" int4range,
    "keywords" text[],
    "sentiment_range" numrange,
    "platforms" text[],
    "usage_count" integer DEFAULT 0,
    "success_rate" numeric(5,4),
    "avg_response_time" interval,
    "status" text DEFAULT 'active'::text,
    "is_default" boolean DEFAULT false,
    "priority" integer DEFAULT 50,
    "created_by" uuid NOT NULL,
    "last_modified_by" uuid,
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "response_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "response_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- AI model configuration
CREATE TABLE IF NOT EXISTS "public"."ai_model_config" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "primary_model" text NOT NULL DEFAULT 'gemini-2.5-flash-lite'::text,
    "temperature" numeric(3,2) DEFAULT 1.0,
    "max_tokens" integer DEFAULT 65535,
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "api_version" text DEFAULT 'v1beta'::text,
    "auth_method" text DEFAULT 'service_account'::text,
    CONSTRAINT "ai_model_config_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_model_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- AI-generated responses
CREATE TABLE IF NOT EXISTS "public"."ai_responses" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "review_id" uuid NOT NULL,
    "response_text" text NOT NULL,
    "response_language" text DEFAULT 'en'::text,
    "version" integer DEFAULT 1,
    "ai_model" text NOT NULL,
    "ai_model_version" text,
    "generation_prompt" text,
    "generation_cost" numeric(10,6),
    "generation_tokens" integer,
    "generation_time_ms" integer,
    "confidence_score" numeric(5,4),
    "quality_score" numeric(5,4),
    "tone" text,
    "status" text DEFAULT 'draft'::text,
    "approved_by" uuid,
    "approved_at" timestamp with time zone,
    "rejected_by" uuid,
    "rejected_at" timestamp with time zone,
    "rejection_reason" text,
    "rejection_feedback" text,
    "published_at" timestamp with time zone,
    "published_by" uuid,
    "platform_response_id" text,
    "template_id" uuid,
    "business_context" jsonb DEFAULT '{}'::jsonb,
    "personalization_data" jsonb DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "deleted_at" timestamp with time zone,
    CONSTRAINT "ai_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_responses_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE,
    CONSTRAINT "ai_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_ai_responses_template_id" FOREIGN KEY ("template_id") REFERENCES "public"."response_templates"("id") ON DELETE SET NULL
);

-- Response queue for publishing
CREATE TABLE IF NOT EXISTS "public"."response_queue" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "response_id" uuid NOT NULL,
    "location_id" uuid NOT NULL,
    "status" text DEFAULT 'pending'::text,
    "priority" integer DEFAULT 50,
    "scheduled_for" timestamp with time zone DEFAULT now(),
    "platform" text NOT NULL,
    "platform_rate_limit" integer,
    "last_platform_request_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0,
    "max_attempts" integer DEFAULT 3,
    "last_attempt_at" timestamp with time zone,
    "next_retry_at" timestamp with time zone,
    "error_message" text,
    "error_code" text,
    "error_details" jsonb,
    "processing_started_at" timestamp with time zone,
    "processing_completed_at" timestamp with time zone,
    "processed_by" text,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "response_queue_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "response_queue_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."ai_responses"("id") ON DELETE CASCADE,
    CONSTRAINT "response_queue_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE,
    CONSTRAINT "response_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- ============================================
-- TABLES - BUSINESS SETTINGS
-- ============================================

-- Business guidance and tone settings
CREATE TABLE IF NOT EXISTS "public"."business_guidance" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "brand_voice" text,
    "response_tone" jsonb DEFAULT '{"neutral": "professional", "negative": "empathetic", "positive": "grateful"}'::jsonb,
    "writing_style" text,
    "key_messaging" text[],
    "max_response_length" integer DEFAULT 500,
    "min_response_length" integer DEFAULT 50,
    "include_business_name" boolean DEFAULT true,
    "include_call_to_action" boolean DEFAULT true,
    "default_call_to_action" text,
    "primary_language" text DEFAULT 'en'::text,
    "supported_languages" text[] DEFAULT '{en}'::text[],
    "auto_translate" boolean DEFAULT false,
    "prohibited_words" text[],
    "required_phrases" text[],
    "compliance_requirements" text[],
    "auto_respond_positive" boolean DEFAULT true,
    "auto_respond_neutral" boolean DEFAULT false,
    "auto_respond_negative" boolean DEFAULT false,
    "review_threshold_for_auto_response" integer DEFAULT 4,
    "business_hours" jsonb,
    "contact_information" jsonb DEFAULT '{}'::jsonb,
    "services_offered" text[],
    "unique_selling_points" text[],
    "industry_guidelines" jsonb DEFAULT '{}'::jsonb,
    "regulatory_compliance" jsonb DEFAULT '{}'::jsonb,
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "business_guidance_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "business_guidance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- Response settings per location
CREATE TABLE IF NOT EXISTS "public"."response_settings" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "location_id" uuid,
    "auto_publish_enabled" boolean DEFAULT false,
    "auto_publish_positive" boolean DEFAULT false,
    "auto_publish_neutral" boolean DEFAULT false,
    "auto_publish_negative" boolean DEFAULT false,
    "min_confidence_score" numeric(5,4) DEFAULT 0.8,
    "min_quality_score" numeric(5,4) DEFAULT 0.7,
    "require_human_review_below_threshold" boolean DEFAULT true,
    "max_response_length" integer DEFAULT 500,
    "require_personalization" boolean DEFAULT true,
    "include_business_name" boolean DEFAULT true,
    "include_upsell" boolean DEFAULT false,
    "platform_settings" jsonb DEFAULT '{}'::jsonb,
    "rate_limits" jsonb DEFAULT '{}'::jsonb,
    "notify_on_auto_publish" boolean DEFAULT true,
    "notify_on_review_threshold" boolean DEFAULT true,
    "notification_recipients" text[],
    "working_hours_only" boolean DEFAULT false,
    "working_hours" jsonb,
    "excluded_keywords" text[],
    "settings" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "response_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "response_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "response_settings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE
);

-- ============================================
-- TABLES - WORKFLOWS & AUTOMATION
-- ============================================

-- Workflow definitions
CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "workflow_type" text NOT NULL,
    "workflow_name" text NOT NULL,
    "correlation_id" uuid,
    "parent_workflow_id" uuid,
    "status" text DEFAULT 'pending'::text,
    "current_step" text,
    "step_index" integer DEFAULT 0,
    "total_steps" integer DEFAULT 0,
    "completed_steps" integer DEFAULT 0,
    "progress_percentage" integer,
    "input_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "output_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "context_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "estimated_completion_at" timestamp with time zone,
    "error_message" text,
    "error_details" jsonb,
    "compensation_data" jsonb DEFAULT '{}'::jsonb,
    "depends_on" uuid[],
    "blocks" uuid[],
    "priority" integer DEFAULT 50,
    "tags" text[],
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    "retry_count" integer DEFAULT 0,
    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflows_parent_workflow_id_fkey" FOREIGN KEY ("parent_workflow_id") REFERENCES "public"."workflows"("id"),
    CONSTRAINT "workflows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- Workflow templates
CREATE TABLE IF NOT EXISTS "public"."workflow_templates" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "name" text NOT NULL,
    "description" text,
    "category" text,
    "version" text DEFAULT '1.0.0'::text,
    "workflow_type" text NOT NULL,
    "step_definitions" jsonb NOT NULL,
    "default_input" jsonb DEFAULT '{}'::jsonb,
    "timeout_minutes" integer DEFAULT 60,
    "retry_policy" jsonb DEFAULT '{"backoff": "exponential", "max_attempts": 3}'::jsonb,
    "status" text DEFAULT 'active'::text,
    "is_system_template" boolean DEFAULT false,
    "usage_count" integer DEFAULT 0,
    "success_rate" numeric(5,4),
    "avg_duration" interval,
    "created_by" uuid,
    "last_modified_by" uuid,
    "tags" text[],
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- Workflow steps
CREATE TABLE IF NOT EXISTS "public"."workflow_steps" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" uuid NOT NULL,
    "step_name" text NOT NULL,
    "step_type" text NOT NULL,
    "step_index" integer NOT NULL,
    "status" text DEFAULT 'pending'::text,
    "attempts" integer DEFAULT 0,
    "max_attempts" integer DEFAULT 3,
    "input_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "output_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "error_message" text,
    "error_details" jsonb,
    "retry_count" integer DEFAULT 0,
    "next_retry_at" timestamp with time zone,
    "compensation_action" text,
    "compensation_data" jsonb DEFAULT '{}'::jsonb,
    "compensated_at" timestamp with time zone,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE
);

-- Workflow events
CREATE TABLE IF NOT EXISTS "public"."workflow_events" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "workflow_id" uuid NOT NULL,
    "event_type" text NOT NULL,
    "event_source" text NOT NULL,
    "event_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "processed" boolean DEFAULT false,
    "processed_at" timestamp with time zone,
    "processing_error" text,
    "correlation_id" uuid,
    "causation_id" uuid,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "event_timestamp" timestamp with time zone NOT NULL DEFAULT now(),
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workflow_events_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE
);

-- ============================================
-- TABLES - ANALYTICS & MONITORING
-- ============================================

-- Response analytics
CREATE TABLE IF NOT EXISTS "public"."response_analytics" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "location_id" uuid,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "period_type" text NOT NULL,
    "total_reviews" integer DEFAULT 0,
    "total_responses" integer DEFAULT 0,
    "response_rate" numeric(5,4),
    "avg_response_time" interval,
    "avg_generation_time" interval,
    "avg_confidence_score" numeric(5,4),
    "avg_quality_score" numeric(5,4),
    "approval_rate" numeric(5,4),
    "rejection_rate" numeric(5,4),
    "total_generation_cost" numeric(10,6),
    "avg_generation_cost" numeric(10,6),
    "total_tokens" integer,
    "platform_metrics" jsonb DEFAULT '{}'::jsonb,
    "positive_reviews" integer DEFAULT 0,
    "neutral_reviews" integer DEFAULT 0,
    "negative_reviews" integer DEFAULT 0,
    "avg_sentiment_score" numeric(5,4),
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "response_analytics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "response_analytics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE,
    CONSTRAINT "response_analytics_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE
);

-- Billing usage tracking
CREATE TABLE IF NOT EXISTS "public"."billing_usage" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "billing_period_start" date NOT NULL,
    "billing_period_end" date NOT NULL,
    "reviews_processed" integer DEFAULT 0,
    "ai_generations" integer DEFAULT 0,
    "api_requests" integer DEFAULT 0,
    "storage_used_gb" numeric(10,3) DEFAULT 0,
    "ai_generation_cost" numeric(10,6) DEFAULT 0,
    "storage_cost" numeric(10,6) DEFAULT 0,
    "api_cost" numeric(10,6) DEFAULT 0,
    "total_cost" numeric(10,6),
    "plan_review_limit" integer,
    "plan_ai_generation_limit" integer,
    "plan_api_limit" integer,
    "plan_storage_limit_gb" numeric(10,3),
    "overage_reviews" integer DEFAULT 0,
    "overage_ai_generations" integer DEFAULT 0,
    "overage_api_requests" integer DEFAULT 0,
    "overage_storage_gb" numeric(10,3) DEFAULT 0,
    "overage_cost" numeric(10,6) DEFAULT 0,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "billing_usage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- Performance metrics
CREATE TABLE IF NOT EXISTS "public"."performance_metrics" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "metric_name" text NOT NULL,
    "metric_type" text NOT NULL,
    "value" numeric(15,6) NOT NULL,
    "unit" text,
    "service" text,
    "endpoint" text,
    "method" text,
    "status_code" integer,
    "tags" jsonb DEFAULT '{}'::jsonb,
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "sample_count" integer DEFAULT 1,
    "min_value" numeric(15,6),
    "max_value" numeric(15,6),
    "avg_value" numeric(15,6),
    "p50_value" numeric(15,6),
    "p95_value" numeric(15,6),
    "p99_value" numeric(15,6),
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "performance_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL
);

-- ============================================
-- TABLES - SYSTEM & OPERATIONS
-- ============================================

-- System configuration
CREATE TABLE IF NOT EXISTS "public"."system_config" (
    "id" serial PRIMARY KEY,
    "key_name" text NOT NULL UNIQUE,
    "key_value" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);

-- System health monitoring
CREATE TABLE IF NOT EXISTS "public"."system_health" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "component" text NOT NULL,
    "instance_id" text,
    "region" text,
    "status" text NOT NULL,
    "last_check_at" timestamp with time zone NOT NULL DEFAULT now(),
    "response_time_ms" integer,
    "cpu_usage_percent" numeric(5,2),
    "memory_usage_percent" numeric(5,2),
    "disk_usage_percent" numeric(5,2),
    "active_connections" integer,
    "queue_length" integer,
    "error_rate" numeric(5,4),
    "throughput" integer,
    "uptime_seconds" bigint,
    "last_restart_at" timestamp with time zone,
    "health_check_data" jsonb DEFAULT '{}'::jsonb,
    "error_message" text,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "system_health_pkey" PRIMARY KEY ("id")
);

-- System logs
CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "category" text NOT NULL,
    "log_level" text NOT NULL,
    "message" text NOT NULL,
    "details" jsonb DEFAULT '{}'::jsonb,
    "user_id" uuid,
    "session_id" text,
    "request_id" text,
    "correlation_id" uuid,
    "source" text,
    "environment" text DEFAULT 'production'::text,
    "version" text,
    "error_code" text,
    "stack_trace" text,
    "duration_ms" integer,
    "memory_usage_mb" integer,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "system_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL
);

-- Audit logs
CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "user_id" uuid,
    "action" text NOT NULL,
    "resource_type" text NOT NULL,
    "resource_id" uuid,
    "old_values" jsonb,
    "new_values" jsonb,
    "ip_address" inet,
    "user_agent" text,
    "session_id" text,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL
);

-- Cron job executions
CREATE TABLE IF NOT EXISTS "public"."cron_job_executions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "job_name" text NOT NULL,
    "started_at" timestamp with time zone DEFAULT now(),
    "completed_at" timestamp with time zone,
    "status" text,
    "error_details" jsonb,
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "cron_job_executions_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- TABLES - SUPPORTING FEATURES
-- ============================================

-- Tenant invitations
CREATE TABLE IF NOT EXISTS "public"."tenant_invitations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "email" text NOT NULL,
    "role" text NOT NULL,
    "invited_by" uuid NOT NULL,
    "invitation_token" text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'::text),
    "message" text,
    "assigned_locations" uuid[] DEFAULT '{}'::uuid[],
    "permissions" jsonb DEFAULT '{}'::jsonb,
    "status" text DEFAULT 'pending'::text,
    "accepted_at" timestamp with time zone,
    "accepted_by" uuid,
    "expires_at" timestamp with time zone NOT NULL DEFAULT (now() + '7 days'::interval),
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "tenant_invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "tenant_id" uuid NOT NULL,
    "email_new_reviews" boolean DEFAULT true,
    "email_response_approved" boolean DEFAULT true,
    "email_response_rejected" boolean DEFAULT true,
    "email_daily_summary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- Alert notifications
CREATE TABLE IF NOT EXISTS "public"."alert_notifications" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid,
    "alert_type" text NOT NULL,
    "severity" text NOT NULL,
    "title" text NOT NULL,
    "message" text NOT NULL,
    "metadata" jsonb,
    "status" text NOT NULL DEFAULT 'pending'::text,
    "sent_at" timestamp without time zone,
    "acknowledged_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT now(),
    CONSTRAINT "alert_notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "alert_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
);

-- Batch generation jobs
CREATE TABLE IF NOT EXISTS "public"."batch_generation_jobs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "filter_criteria" jsonb NOT NULL,
    "status" text DEFAULT 'pending'::text,
    "progress" integer DEFAULT 0,
    "total_reviews" integer DEFAULT 0,
    "processed_reviews" integer DEFAULT 0,
    "successful_generations" integer DEFAULT 0,
    "failed_generations" integer DEFAULT 0,
    "template_id" uuid,
    "generation_settings" jsonb DEFAULT '{}'::jsonb,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "estimated_completion_at" timestamp with time zone,
    "error_message" text,
    "error_details" jsonb,
    "created_by" uuid NOT NULL,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "batch_generation_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "batch_generation_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."response_templates"("id"),
    CONSTRAINT "batch_generation_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- Context caches for AI
CREATE TABLE IF NOT EXISTS "public"."context_caches" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "cache_id" text NOT NULL,
    "context_hash" text NOT NULL,
    "token_count" integer NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "last_used_at" timestamp with time zone DEFAULT now(),
    "usage_count" integer DEFAULT 0,
    "estimated_cost_savings" numeric(10,4) DEFAULT 0,
    CONSTRAINT "context_caches_pkey" PRIMARY KEY ("id")
);

-- Upsell items
CREATE TABLE IF NOT EXISTS "public"."upsell_items" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "name" text NOT NULL,
    "description" text,
    "category" text,
    "promotion_text" text NOT NULL,
    "call_to_action" text NOT NULL,
    "link_url" text,
    "offer_code" text,
    "target_rating_range" int4range,
    "target_keywords" text[],
    "target_sentiment" text[],
    "target_platforms" text[],
    "variant_name" text DEFAULT 'default'::text,
    "test_group" text,
    "conversion_goal" text,
    "impressions" integer DEFAULT 0,
    "clicks" integer DEFAULT 0,
    "conversions" integer DEFAULT 0,
    "conversion_rate" numeric(5,4),
    "active_from" timestamp with time zone DEFAULT now(),
    "active_until" timestamp with time zone,
    "status" text DEFAULT 'active'::text,
    "priority" integer DEFAULT 50,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamp with time zone NOT NULL DEFAULT now(),
    "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT "upsell_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "upsell_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE
);

-- Private cron secrets
CREATE TABLE IF NOT EXISTS "private"."cron_secrets" (
    "key" text NOT NULL,
    "value" text NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "cron_secrets_pkey" PRIMARY KEY ("key")
);

-- ============================================
-- INDEXES
-- ============================================

-- Core indexes
CREATE INDEX IF NOT EXISTS "idx_tenant_users_tenant_role" ON "public"."tenant_users" USING btree ("tenant_id", "role") WHERE ("status" = 'active'::text);
CREATE INDEX IF NOT EXISTS "idx_tenant_users_user_status" ON "public"."tenant_users" USING btree ("user_id", "status") WHERE ("status" = 'active'::text);

-- Location indexes
CREATE INDEX IF NOT EXISTS "idx_locations_tenant_id" ON "public"."locations" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_locations_oauth_token_id" ON "public"."locations" USING btree ("oauth_token_id") WHERE ("oauth_token_id" IS NOT NULL);

-- Review indexes
CREATE INDEX IF NOT EXISTS "idx_reviews_tenant_id" ON "public"."reviews" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_reviews_tenant_date" ON "public"."reviews" USING btree ("tenant_id", "review_date" DESC);
CREATE INDEX IF NOT EXISTS "idx_reviews_needs_response" ON "public"."reviews" USING btree ("tenant_id", "created_at") WHERE (("needs_response" = true) AND ("status" = 'new'::text) AND ("deleted_at" IS NULL));
CREATE INDEX IF NOT EXISTS "idx_reviews_has_owner_reply" ON "public"."reviews" USING btree ("tenant_id", "has_owner_reply", "needs_response", "status") WHERE ("deleted_at" IS NULL);

-- AI response indexes
CREATE INDEX IF NOT EXISTS "idx_ai_responses_review_id" ON "public"."ai_responses" USING btree ("review_id");
CREATE INDEX IF NOT EXISTS "idx_ai_responses_tenant_id" ON "public"."ai_responses" USING btree ("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_ai_responses_tenant_status" ON "public"."ai_responses" USING btree ("tenant_id", "status");

-- Response queue indexes
CREATE INDEX IF NOT EXISTS "idx_response_queue_processing" ON "public"."response_queue" USING btree ("status", "scheduled_for", "priority" DESC) WHERE ("status" = ANY (ARRAY['pending'::text, 'processing'::text]));
CREATE INDEX IF NOT EXISTS "idx_response_queue_response_id" ON "public"."response_queue" USING btree ("response_id");
CREATE INDEX IF NOT EXISTS "idx_response_queue_tenant_status" ON "public"."response_queue" USING btree ("tenant_id", "status");

-- OAuth token indexes
CREATE INDEX IF NOT EXISTS "idx_oauth_tokens_expires_at" ON "public"."oauth_tokens" USING btree ("expires_at", "status") WHERE ("status" = 'active'::text);
CREATE INDEX IF NOT EXISTS "idx_oauth_tokens_tenant_id" ON "public"."oauth_tokens" USING btree ("tenant_id");

-- Workflow indexes
CREATE INDEX IF NOT EXISTS "idx_workflows_pending" ON "public"."workflows" USING btree ("status", "priority" DESC, "created_at") WHERE ("status" = ANY (ARRAY['pending'::text, 'running'::text]));
CREATE INDEX IF NOT EXISTS "idx_workflows_tenant" ON "public"."workflows" USING btree ("tenant_id");

-- Context cache indexes
CREATE INDEX IF NOT EXISTS "idx_context_caches_tenant_hash" ON "public"."context_caches" USING btree ("tenant_id", "context_hash");
CREATE INDEX IF NOT EXISTS "idx_context_caches_expires" ON "public"."context_caches" USING btree ("expires_at");

-- System log indexes
CREATE INDEX IF NOT EXISTS "idx_system_logs_cron" ON "public"."system_logs" USING btree ("category", "created_at", "log_level") WHERE ("category" = 'cron_job'::text);
CREATE INDEX IF NOT EXISTS "idx_cron_job_executions_job_name_started" ON "public"."cron_job_executions" USING btree ("job_name", "started_at" DESC);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE "private"."cron_secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."oauth_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_model_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."response_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."response_queue" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."response_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."business_guidance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workflow_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workflow_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."workflow_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."response_analytics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."billing_usage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."performance_metrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_health" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cron_job_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tenant_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."alert_notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."batch_generation_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."context_caches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."upsell_items" ENABLE ROW LEVEL SECURITY;

-- Note: RLS policies should be added separately based on your specific requirements
-- The policies in the original schema reference functions that need to be created first