-- Cron Jobs Migration
-- This file sets up all pg_cron scheduled jobs for the application

-- Enable pg_cron extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Grant usage on cron schema to postgres
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Remove existing cron jobs if they exist (for idempotency)
SELECT cron.unschedule(jobname) 
FROM cron.job 
WHERE jobname IN (
    'v2-sync-unanswered-reviews',
    'v2-process-review-queue',
    'v2-refresh-oauth-tokens',
    'v2-cleanup-old-workflows',
    'v2-generate-daily-stats',
    'v2-health-check'
);

-- 1. Sync Unanswered Reviews (Every 15 minutes)
SELECT cron.schedule(
    'v2-sync-unanswered-reviews',
    '*/15 * * * *', -- Every 15 minutes
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/v2-workflow-orchestrator',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object(
            'action', 'sync_unanswered_reviews',
            'source', 'cron_job'
        )
    );
    $$
);

-- 2. Process Review Queue (Every 5 minutes)
SELECT cron.schedule(
    'v2-process-review-queue',
    '*/5 * * * *', -- Every 5 minutes
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/v2-workflow-orchestrator',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object(
            'action', 'process_review_queue',
            'source', 'cron_job'
        )
    );
    $$
);

-- 3. Refresh OAuth Tokens (Every hour)
SELECT cron.schedule(
    'v2-refresh-oauth-tokens',
    '0 * * * *', -- Every hour
    $$
    SELECT net.http_post(
        url := current_setting('app.settings.supabase_url') || '/functions/v1/v2-external-integrator',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object(
            'action', 'refresh_oauth_tokens',
            'source', 'cron_job'
        )
    );
    $$
);

-- 4. Cleanup Old Workflows (Daily at 2 AM)
SELECT cron.schedule(
    'v2-cleanup-old-workflows',
    '0 2 * * *', -- Daily at 2 AM
    $$
    DELETE FROM public.v2_workflows 
    WHERE status IN ('completed', 'failed') 
    AND updated_at < NOW() - INTERVAL '30 days';
    
    DELETE FROM public.v2_workflow_steps
    WHERE workflow_id NOT IN (SELECT id FROM public.v2_workflows);
    
    DELETE FROM public.system_logs
    WHERE created_at < NOW() - INTERVAL '90 days';
    $$
);

-- 5. Generate Daily Stats (Daily at 3 AM)
SELECT cron.schedule(
    'v2-generate-daily-stats',
    '0 3 * * *', -- Daily at 3 AM
    $$
    INSERT INTO public.daily_stats (date, tenant_id, metrics)
    SELECT 
        CURRENT_DATE - INTERVAL '1 day',
        tenant_id,
        jsonb_build_object(
            'reviews_synced', COUNT(*) FILTER (WHERE created_at::date = CURRENT_DATE - INTERVAL '1 day'),
            'responses_generated', COUNT(*) FILTER (WHERE response_content IS NOT NULL),
            'responses_published', COUNT(*) FILTER (WHERE published_at IS NOT NULL)
        )
    FROM public.reviews
    WHERE created_at::date = CURRENT_DATE - INTERVAL '1 day'
    GROUP BY tenant_id;
    $$
);

-- 6. Health Check (Every 5 minutes)
SELECT cron.schedule(
    'v2-health-check',
    '*/5 * * * *', -- Every 5 minutes
    $$
    INSERT INTO public.cron_job_health (job_name, status, last_run)
    VALUES 
        ('v2-health-check', 'healthy', NOW())
    ON CONFLICT (job_name) 
    DO UPDATE SET 
        status = 'healthy',
        last_run = NOW();
    $$
);

-- Create function to enable/disable cron jobs (useful for maintenance)
CREATE OR REPLACE FUNCTION toggle_cron_jobs(enable_jobs boolean)
RETURNS void AS $$
BEGIN
    IF enable_jobs THEN
        UPDATE cron.job 
        SET active = true 
        WHERE jobname LIKE 'v2-%';
    ELSE
        UPDATE cron.job 
        SET active = false 
        WHERE jobname LIKE 'v2-%';
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION toggle_cron_jobs(boolean) TO postgres;