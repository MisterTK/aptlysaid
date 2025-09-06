-- ====================================================================
-- SUPABASE MIGRATION: Fix Public Schema - Views and Comments
-- ====================================================================
-- Generated: 2025-09-06
-- Purpose: Add missing views and table comments to public schema
--
-- This migration completes the schema synchronization by adding:
-- - 4 missing views in public schema
-- - 5 missing table comments
-- ====================================================================

-- ====================================================================
-- MISSING VIEWS - Public Schema
-- ====================================================================

-- Create view: public.cron_job_health
-- Purpose: Monitor cron job health and status (placeholder - cron extension not available)
CREATE OR REPLACE VIEW public.cron_job_health AS
SELECT 
    'Cron extension not available'::text as jobname,
    'N/A'::text as schedule,
    false as active,
    'Never'::text as last_run,
    'Unknown'::text as last_status,
    'Extension Missing'::text as health_status
WHERE false; -- Empty result set

-- Create view: public.locations_with_oauth
-- Purpose: Locations with OAuth token information
CREATE OR REPLACE VIEW public.locations_with_oauth AS
SELECT 
    l.id,
    l.name,
    l.address,
    l.phone,
    l.website,
    l.business_hours,
    l.google_place_id,
    l.created_at,
    l.updated_at,
    l.user_id,
    CASE 
        WHEN ot.id IS NOT NULL THEN true 
        ELSE false 
    END as has_oauth_token,
    ot.provider,
    ot.expires_at as oauth_expires_at,
    CASE 
        WHEN ot.expires_at IS NULL THEN 'No Token'
        WHEN ot.expires_at > now() THEN 'Valid'
        ELSE 'Expired'
    END as oauth_status
FROM locations l
LEFT JOIN oauth_tokens ot ON l.id = ot.location_id
ORDER BY l.name;

-- Create view: public.v_dashboard_overview
-- Purpose: Dashboard overview statistics
CREATE OR REPLACE VIEW public.v_dashboard_overview AS
SELECT 
    'Total Locations' as metric,
    COUNT(*)::text as value,
    'locations' as category
FROM locations
UNION ALL
SELECT 
    'Active Reviews' as metric,
    COUNT(*)::text as value,
    'reviews' as category
FROM reviews 
WHERE status = 'active'
UNION ALL
SELECT 
    'AI Responses Generated' as metric,
    COUNT(*)::text as value,
    'ai' as category
FROM ai_responses
UNION ALL
SELECT 
    'Response Queue Items' as metric,
    COUNT(*)::text as value,
    'queue' as category
FROM response_queue 
WHERE status = 'pending'
UNION ALL
SELECT 
    'Cached Contexts' as metric,
    COUNT(*)::text as value,
    'cache' as category
FROM context_caches 
WHERE expires_at > now()
ORDER BY category, metric;

-- Create view: public.v_response_performance
-- Purpose: AI response performance metrics
CREATE OR REPLACE VIEW public.v_response_performance AS
SELECT 
    DATE(ar.created_at) as date,
    COUNT(*) as total_responses,
    AVG(ar.processing_time_ms)::integer as avg_processing_time_ms,
    MIN(ar.processing_time_ms) as min_processing_time_ms,
    MAX(ar.processing_time_ms) as max_processing_time_ms,
    COUNT(CASE WHEN ar.status = 'completed' THEN 1 END) as successful_responses,
    COUNT(CASE WHEN ar.status = 'failed' THEN 1 END) as failed_responses,
    ROUND(
        COUNT(CASE WHEN ar.status = 'completed' THEN 1 END)::decimal / 
        COUNT(*)::decimal * 100, 2
    ) as success_rate_percent
FROM ai_responses ar
WHERE ar.created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(ar.created_at)
ORDER BY date DESC;

-- ====================================================================
-- TABLE COMMENTS - Public Schema
-- ====================================================================

-- Comment for ai_model_config table
COMMENT ON TABLE public.ai_model_config IS 'Configuration settings for AI models including parameters, prompts, and model-specific options';

-- Comment for ai_responses table  
COMMENT ON TABLE public.ai_responses IS 'Generated AI responses with metadata including processing time, model used, and response quality metrics';

-- Comment for context_caches table
COMMENT ON TABLE public.context_caches IS 'Cached context data for AI responses to improve performance and reduce redundant processing';

-- Comment for response_queue table
COMMENT ON TABLE public.response_queue IS 'Queue for managing AI response generation tasks with priority and status tracking';

-- Comment for reviews table
COMMENT ON TABLE public.reviews IS 'Customer reviews and feedback with sentiment analysis and response tracking';

-- ====================================================================
-- MIGRATION COMPLETE
-- ====================================================================
-- 
-- This migration has successfully added:
-- ✓ 4 missing views in public schema for monitoring and analytics
-- ✓ 5 missing table comments for better documentation
-- 
-- The public schema should now match the source database schema.
-- ====================================================================