-- Complete Schema for Multi-tenant Review Management SaaS
-- This migration adds all missing tables for full functionality

-- ============================================
-- SUBSCRIPTION & BILLING TABLES
-- ============================================

-- Subscription plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text UNIQUE NOT NULL,
    description text,
    price_monthly decimal(10,2),
    price_yearly decimal(10,2),
    stripe_price_id_monthly text,
    stripe_price_id_yearly text,
    features jsonb DEFAULT '{}',
    limits jsonb DEFAULT '{}',
    is_active boolean DEFAULT true,
    sort_order integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Organization subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id uuid REFERENCES public.subscription_plans(id),
    stripe_subscription_id text UNIQUE,
    stripe_customer_id text,
    status text CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete')),
    billing_cycle text CHECK (billing_cycle IN ('monthly', 'yearly')),
    current_period_start timestamptz,
    current_period_end timestamptz,
    cancel_at_period_end boolean DEFAULT false,
    canceled_at timestamptz,
    trial_start timestamptz,
    trial_end timestamptz,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Billing history
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES public.subscriptions(id),
    stripe_invoice_id text UNIQUE,
    invoice_number text,
    amount_paid decimal(10,2),
    amount_due decimal(10,2),
    currency text DEFAULT 'usd',
    status text,
    invoice_pdf text,
    paid_at timestamptz,
    due_date timestamptz,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- Usage tracking
CREATE TABLE IF NOT EXISTS public.usage_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    metric_type text NOT NULL,
    metric_value integer DEFAULT 0,
    period_start date NOT NULL,
    period_end date NOT NULL,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    UNIQUE(organization_id, metric_type, period_start)
);

-- ============================================
-- AI & RESPONSE GENERATION TABLES
-- ============================================

-- AI response templates
CREATE TABLE IF NOT EXISTS public.response_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    template_text text NOT NULL,
    category text,
    tone text CHECK (tone IN ('professional', 'friendly', 'casual', 'formal', 'empathetic')),
    variables jsonb DEFAULT '[]',
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- AI-generated responses
CREATE TABLE IF NOT EXISTS public.generated_responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    review_id uuid REFERENCES public.reviews(id) ON DELETE CASCADE,
    template_id uuid REFERENCES public.response_templates(id),
    generated_text text NOT NULL,
    ai_model text,
    confidence_score decimal(3,2),
    tokens_used integer,
    generation_time_ms integer,
    edited_text text,
    was_published boolean DEFAULT false,
    published_at timestamptz,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Response feedback for AI training
CREATE TABLE IF NOT EXISTS public.response_feedback (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    generated_response_id uuid REFERENCES public.generated_responses(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id),
    rating integer CHECK (rating >= 1 AND rating <= 5),
    feedback_type text CHECK (feedback_type IN ('helpful', 'not_helpful', 'edited', 'rejected')),
    feedback_text text,
    created_at timestamptz DEFAULT now()
);

-- ============================================
-- WORKFLOW & AUTOMATION TABLES
-- ============================================

-- Workflow definitions
CREATE TABLE IF NOT EXISTS public.workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    trigger_type text CHECK (trigger_type IN ('new_review', 'rating_threshold', 'keyword', 'schedule', 'manual')),
    trigger_config jsonb DEFAULT '{}',
    conditions jsonb DEFAULT '[]',
    actions jsonb DEFAULT '[]',
    is_active boolean DEFAULT true,
    last_triggered_at timestamptz,
    execution_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Workflow execution history
CREATE TABLE IF NOT EXISTS public.workflow_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid REFERENCES public.workflows(id) ON DELETE CASCADE,
    review_id uuid REFERENCES public.reviews(id),
    status text CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    error_message text,
    execution_data jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- Task queue for async processing
CREATE TABLE IF NOT EXISTS public.task_queue (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    task_type text NOT NULL,
    priority integer DEFAULT 5,
    status text CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')) DEFAULT 'pending',
    payload jsonb DEFAULT '{}',
    result jsonb,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    scheduled_for timestamptz DEFAULT now(),
    started_at timestamptz,
    completed_at timestamptz,
    error_message text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ============================================
-- ANALYTICS & REPORTING TABLES
-- ============================================

-- Analytics snapshots
CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    location_id uuid REFERENCES public.locations(id),
    snapshot_date date NOT NULL,
    metrics jsonb NOT NULL DEFAULT '{}',
    period text CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
    created_at timestamptz DEFAULT now(),
    UNIQUE(organization_id, location_id, snapshot_date, period)
);

-- Custom reports
CREATE TABLE IF NOT EXISTS public.reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    report_type text CHECK (report_type IN ('performance', 'sentiment', 'comparison', 'custom')),
    config jsonb DEFAULT '{}',
    schedule_config jsonb,
    last_generated_at timestamptz,
    created_by uuid REFERENCES public.profiles(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Report exports
CREATE TABLE IF NOT EXISTS public.report_exports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE,
    format text CHECK (format IN ('pdf', 'csv', 'excel', 'json')),
    file_url text,
    file_size integer,
    generated_by uuid REFERENCES public.profiles(id),
    expires_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- ============================================
-- NOTIFICATION & COMMUNICATION TABLES
-- ============================================

-- Notification preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    channel text CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
    event_type text NOT NULL,
    is_enabled boolean DEFAULT true,
    config jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE(user_id, organization_id, channel, event_type)
);

-- Notification log
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id),
    type text NOT NULL,
    channel text CHECK (channel IN ('email', 'sms', 'push', 'in_app')),
    subject text,
    content text,
    status text CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
    sent_at timestamptz,
    delivered_at timestamptz,
    read_at timestamptz,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- Email templates
CREATE TABLE IF NOT EXISTS public.email_templates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id),
    name text NOT NULL,
    subject text NOT NULL,
    html_content text,
    text_content text,
    variables jsonb DEFAULT '[]',
    is_system boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ============================================
-- INTEGRATION & WEBHOOK TABLES
-- ============================================

-- Third-party integrations
CREATE TABLE IF NOT EXISTS public.integrations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    provider text NOT NULL,
    type text CHECK (type IN ('crm', 'helpdesk', 'analytics', 'marketing', 'custom')),
    config jsonb DEFAULT '{}',
    credentials jsonb DEFAULT '{}',
    is_active boolean DEFAULT true,
    last_sync_at timestamptz,
    sync_status text,
    error_message text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Webhook configurations
CREATE TABLE IF NOT EXISTS public.webhooks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    url text NOT NULL,
    events text[] NOT NULL,
    secret text,
    is_active boolean DEFAULT true,
    headers jsonb DEFAULT '{}',
    retry_config jsonb DEFAULT '{"max_attempts": 3, "backoff_seconds": [5, 30, 120]}',
    last_triggered_at timestamptz,
    failure_count integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Webhook delivery logs
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id uuid REFERENCES public.webhooks(id) ON DELETE CASCADE,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    response_status integer,
    response_body text,
    attempt_count integer DEFAULT 1,
    delivered_at timestamptz,
    next_retry_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- ============================================
-- TEAM & PERMISSION TABLES
-- ============================================

-- Teams within organizations
CREATE TABLE IF NOT EXISTS public.teams (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Team members
CREATE TABLE IF NOT EXISTS public.team_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    role text CHECK (role IN ('lead', 'member')),
    created_at timestamptz DEFAULT now(),
    UNIQUE(team_id, user_id)
);

-- Location assignments
CREATE TABLE IF NOT EXISTS public.location_assignments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id),
    team_id uuid REFERENCES public.teams(id),
    permission_level text CHECK (permission_level IN ('view', 'respond', 'manage')),
    created_at timestamptz DEFAULT now(),
    UNIQUE(location_id, user_id),
    UNIQUE(location_id, team_id)
);

-- Audit log
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id),
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamptz DEFAULT now()
);

-- ============================================
-- SETTINGS & CONFIGURATION TABLES
-- ============================================

-- Organization settings
CREATE TABLE IF NOT EXISTS public.organization_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE UNIQUE,
    auto_respond_enabled boolean DEFAULT false,
    auto_respond_min_rating integer DEFAULT 4,
    response_delay_hours integer DEFAULT 24,
    business_hours jsonb DEFAULT '{}',
    timezone text DEFAULT 'UTC',
    language text DEFAULT 'en',
    branding jsonb DEFAULT '{}',
    features jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Feature flags
CREATE TABLE IF NOT EXISTS public.feature_flags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    flag_name text UNIQUE NOT NULL,
    description text,
    is_enabled boolean DEFAULT false,
    rollout_percentage integer DEFAULT 0,
    organization_ids uuid[] DEFAULT '{}',
    user_ids uuid[] DEFAULT '{}',
    config jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- ============================================
-- CONTENT & MEDIA TABLES
-- ============================================

-- Media library
CREATE TABLE IF NOT EXISTS public.media (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    uploaded_by uuid REFERENCES public.profiles(id),
    file_name text NOT NULL,
    file_type text,
    file_size integer,
    file_url text NOT NULL,
    thumbnail_url text,
    alt_text text,
    metadata jsonb DEFAULT '{}',
    created_at timestamptz DEFAULT now()
);

-- Tags for categorization
CREATE TABLE IF NOT EXISTS public.tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text,
    description text,
    created_at timestamptz DEFAULT now(),
    UNIQUE(organization_id, name)
);

-- Review tags
CREATE TABLE IF NOT EXISTS public.review_tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id uuid REFERENCES public.reviews(id) ON DELETE CASCADE,
    tag_id uuid REFERENCES public.tags(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(review_id, tag_id)
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================

-- Subscription indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_organization_id ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);

-- Usage metrics indexes
CREATE INDEX IF NOT EXISTS idx_usage_metrics_organization_period ON public.usage_metrics(organization_id, period_start);

-- Generated responses indexes
CREATE INDEX IF NOT EXISTS idx_generated_responses_review_id ON public.generated_responses(review_id);
CREATE INDEX IF NOT EXISTS idx_generated_responses_was_published ON public.generated_responses(was_published);

-- Workflow indexes
CREATE INDEX IF NOT EXISTS idx_workflows_organization_id ON public.workflows(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflows_trigger_type ON public.workflows(trigger_type);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON public.workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON public.workflow_executions(status);

-- Task queue indexes
CREATE INDEX IF NOT EXISTS idx_task_queue_status_scheduled ON public.task_queue(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_task_queue_organization_id ON public.task_queue(organization_id);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_date ON public.analytics_snapshots(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_org_location ON public.analytics_snapshots(organization_id, location_id);

-- Notification indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

-- Integration indexes
CREATE INDEX IF NOT EXISTS idx_integrations_organization_id ON public.integrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_organization_id ON public.webhooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON public.webhook_deliveries(webhook_id);

-- Audit log indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_organization_id ON public.audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.response_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_tags ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ADD UPDATE TRIGGERS
-- ============================================

CREATE TRIGGER update_subscription_plans_updated_at BEFORE UPDATE ON public.subscription_plans
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_response_templates_updated_at BEFORE UPDATE ON public.response_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_generated_responses_updated_at BEFORE UPDATE ON public.generated_responses
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_workflows_updated_at BEFORE UPDATE ON public.workflows
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_task_queue_updated_at BEFORE UPDATE ON public.task_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_reports_updated_at BEFORE UPDATE ON public.reports
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_email_templates_updated_at BEFORE UPDATE ON public.email_templates
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_webhooks_updated_at BEFORE UPDATE ON public.webhooks
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON public.teams
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_organization_settings_updated_at BEFORE UPDATE ON public.organization_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_feature_flags_updated_at BEFORE UPDATE ON public.feature_flags
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_oauth_tokens_updated_at BEFORE UPDATE ON public.oauth_tokens
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();