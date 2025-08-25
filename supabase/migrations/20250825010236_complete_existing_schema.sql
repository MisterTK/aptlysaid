

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


-- pg_cron extension (likely already exists)
-- CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






COMMENT ON SCHEMA "public" IS 'Production-ready cron job system with: Distributed tenant processing, staggered execution, built-in monitoring, failure recovery, comprehensive logging, and priority-based workflow processing.';



-- pg_net extension (pre-installed)
-- CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "public";






CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE EXTENSION IF NOT EXISTS "btree_gin" WITH SCHEMA "public";






-- pg_graphql extension (pre-installed)
-- CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






-- pg_stat_statements extension (pre-installed)
-- CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "public";






-- pgcrypto extension (pre-installed)
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";












-- supabase_vault extension (pre-installed)
-- CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






-- uuid-ossp extension (pre-installed)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "wrappers" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "private"."get_user_active_tenants"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT tenant_id
  FROM public.tenant_users
  WHERE user_id = (SELECT auth.uid())
    AND status = 'active';
$$;


ALTER FUNCTION "private"."get_user_active_tenants"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_tenant_member"("check_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tenant_users
    WHERE tenant_id = check_tenant_id
      AND user_id = (SELECT auth.uid())
      AND status = 'active'
  );
$$;


ALTER FUNCTION "private"."is_tenant_member"("check_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."user_has_tenant_role"("allowed_roles" "text"[]) RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT tenant_id
  FROM public.tenant_users
  WHERE user_id = (SELECT auth.uid())
    AND status = 'active'
    AND role = ANY(allowed_roles);
$$;


ALTER FUNCTION "private"."user_has_tenant_role"("allowed_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."acknowledge_alert"("alert_id" "uuid", "acknowledged_by" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE system_alerts 
  SET acknowledged_at = NOW(),
      acknowledged_by = acknowledged_by
  WHERE id = alert_id 
    AND acknowledged_at IS NULL;
    
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."acknowledge_alert"("alert_id" "uuid", "acknowledged_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_approved_responses_to_queue"("tenant_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    queue_count integer := 0;
BEGIN
    -- Add approved responses to the response queue
    INSERT INTO response_queue (tenant_id, ai_response_id, review_id, scheduled_for, priority)
    SELECT 
        ar.tenant_id,
        ar.id,
        ar.review_id,
        CASE 
            WHEN rs.auto_publish_delay_hours IS NOT NULL 
            THEN NOW() + (rs.auto_publish_delay_hours || ' hours')::interval
            ELSE NOW() + interval '24 hours'
        END,
        0 -- default priority
    FROM ai_responses ar
    JOIN reviews r ON ar.review_id = r.id
    LEFT JOIN response_settings rs ON rs.tenant_id = ar.tenant_id
    WHERE ar.tenant_id = add_approved_responses_to_queue.tenant_id
        AND ar.status = 'approved'
        AND NOT EXISTS (
            SELECT 1 FROM response_queue rq 
            WHERE rq.ai_response_id = ar.id
        );
    
    GET DIAGNOSTICS queue_count = ROW_COUNT;
    RETURN queue_count;
END;
$$;


ALTER FUNCTION "public"."add_approved_responses_to_queue"("tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_selected_responses_to_queue"("tenant_id" "uuid", "response_ids" "uuid"[]) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    queue_count integer := 0;
BEGIN
    -- Add selected approved responses to the response queue
    INSERT INTO response_queue (tenant_id, ai_response_id, review_id, scheduled_for, priority)
    SELECT 
        ar.tenant_id,
        ar.id,
        ar.review_id,
        CASE 
            WHEN rs.auto_publish_delay_hours IS NOT NULL 
            THEN NOW() + (rs.auto_publish_delay_hours || ' hours')::interval
            ELSE NOW() + interval '24 hours'
        END,
        1 -- higher priority for manual selections
    FROM ai_responses ar
    JOIN reviews r ON ar.review_id = r.id
    LEFT JOIN response_settings rs ON rs.tenant_id = ar.tenant_id
    WHERE ar.tenant_id = add_selected_responses_to_queue.tenant_id
        AND ar.id = ANY(response_ids)
        AND ar.status = 'approved'
        AND NOT EXISTS (
            SELECT 1 FROM response_queue rq 
            WHERE rq.ai_response_id = ar.id
        );
    
    GET DIAGNOSTICS queue_count = ROW_COUNT;
    RETURN queue_count;
END;
$$;


ALTER FUNCTION "public"."add_selected_responses_to_queue"("tenant_id" "uuid", "response_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_onboarding_step"("p_organization_id" "uuid", "p_completed_step" "text", "p_event_data" "jsonb" DEFAULT '{}'::"jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_execution_id UUID;
  v_event_type TEXT;
BEGIN
  -- Get current onboarding execution
  SELECT id INTO v_execution_id
  FROM workflow_executions
  WHERE organization_id = p_organization_id
  AND workflow_type = 'customer_onboarding'
  AND status IN ('pending', 'processing')
  ORDER BY created_at DESC
  LIMIT 1;

  -- Map step to event type
  v_event_type := CASE p_completed_step
    WHEN 'welcome_user' THEN 'welcome_completed'
    WHEN 'setup_profile' THEN 'profile_setup_completed'
    WHEN 'connect_integrations' THEN 'integrations_connected'
    WHEN 'discover_locations' THEN 'locations_discovered'
    WHEN 'setup_ai_preferences' THEN 'ai_preferences_configured'
    WHEN 'complete_onboarding' THEN 'onboarding_completed'
    ELSE NULL
  END;

  IF v_event_type IS NOT NULL THEN
    -- Log the completion event
    INSERT INTO onboarding_events (
      organization_id,
      execution_id,
      event_type,
      event_data
    ) VALUES (
      p_organization_id,
      v_execution_id,
      v_event_type,
      p_event_data || jsonb_build_object('manual_completion', true)
    );

    RETURN true;
  END IF;

  RETURN false;
END;
$$;


ALTER FUNCTION "public"."advance_onboarding_step"("p_organization_id" "uuid", "p_completed_step" "text", "p_event_data" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_workflow"("p_execution_id" "uuid", "p_result_context" "jsonb" DEFAULT '{}'::"jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_workflow RECORD;
  v_next_step RECORD;
  v_updated_context JSONB;
BEGIN
  -- Get current workflow execution
  SELECT * INTO v_workflow
  FROM public.workflow_executions
  WHERE id = p_execution_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow execution not found: %', p_execution_id;
  END IF;
  
  -- Merge result context with existing context
  v_updated_context := v_workflow.context || p_result_context;
  
  -- Get next step
  SELECT ws.* INTO v_next_step
  FROM public.workflow_steps ws
  JOIN public.workflow_steps current_ws ON (
    current_ws.workflow_type = ws.workflow_type AND
    current_ws.step_name = v_workflow.current_step
  )
  WHERE ws.workflow_type = v_workflow.workflow_type
    AND ws.step_order = current_ws.step_order + 1;
  
  IF NOT FOUND THEN
    -- No more steps, mark workflow as completed
    UPDATE public.workflow_executions
    SET status = 'completed',
        context = v_updated_context,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_execution_id;
    
    RETURN FALSE; -- No more steps
  ELSE
    -- Update to next step
    UPDATE public.workflow_executions
    SET current_step = v_next_step.step_name,
        context = v_updated_context,
        updated_at = NOW()
    WHERE id = p_execution_id;
    
    -- Queue next step with proper PGMQ syntax
      v_next_step.queue_name,
      jsonb_build_object(
        'execution_id', p_execution_id,
        'organization_id', v_workflow.organization_id,
        'workflow_type', v_workflow.workflow_type,
        'workflow_id', v_workflow.workflow_id,
        'step', v_next_step.step_name,
        'context', v_updated_context,
        'priority', v_workflow.priority
      )
    );
    
    RETURN TRUE; -- More steps remaining
  END IF;
END;
$$;


ALTER FUNCTION "public"."advance_workflow"("p_execution_id" "uuid", "p_result_context" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."api_start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_context" "jsonb" DEFAULT '{}'::"jsonb", "p_priority" integer DEFAULT 0) RETURNS "json"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_execution_id UUID;
  v_workflow_id TEXT;
BEGIN
  -- Generate unique workflow ID
  v_workflow_id := p_workflow_type || '_' || extract(epoch from now()) || '_' || substr(md5(random()::text), 1, 8);
  
  -- Start the workflow
  SELECT public.start_workflow(
    p_organization_id,
    p_workflow_type,
    v_workflow_id,
    p_context,
    p_priority
  ) INTO v_execution_id;
  
  RETURN json_build_object(
    'success', true,
    'execution_id', v_execution_id,
    'workflow_id', v_workflow_id,
    'workflow_type', p_workflow_type,
    'status', 'pending'
  );
EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object(
    'success', false,
    'error', SQLERRM,
    'workflow_type', p_workflow_type
  );
END;
$$;


ALTER FUNCTION "public"."api_start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_context" "jsonb", "p_priority" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    tenant_id_val uuid;
    user_id_val uuid;
BEGIN
    -- Extract tenant_id and user_id from the record
    IF TG_OP = 'DELETE' THEN
        tenant_id_val := OLD.tenant_id;
        user_id_val := auth.uid();
    ELSE
        tenant_id_val := NEW.tenant_id;
        user_id_val := auth.uid();
    END IF;
    
    -- Insert audit record
    INSERT INTO public.audit_logs (
        tenant_id,
        user_id,
        action,
        resource_type,
        resource_id,
        old_values,
        new_values,
        ip_address,
        user_agent
    ) VALUES (
        tenant_id_val,
        user_id_val,
        lower(TG_OP),
        TG_TABLE_NAME,
        CASE 
            WHEN TG_OP = 'DELETE' THEN OLD.id
            ELSE NEW.id
        END,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        inet(current_setting('request.headers', true)::json->>'x-forwarded-for'),
        current_setting('request.headers', true)::json->>'user-agent'
    );
    
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
EXCEPTION
    WHEN OTHERS THEN
        -- Don't fail the main operation if audit logging fails
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


ALTER FUNCTION "public"."audit_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."build_gmb_path"("location_id" "text", "account_id" "text" DEFAULT NULL::"text", "resource_type" "text" DEFAULT 'reviews'::"text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  -- If location_id already contains full path, just append resource
  IF location_id LIKE 'accounts/%' THEN
    RETURN location_id || '/' || resource_type;
  END IF;
  
  -- If we have account ID (account-level access)
  IF account_id IS NOT NULL THEN
    RETURN 'accounts/' || account_id || '/locations/' || location_id || '/' || resource_type;
  END IF;
  
  -- Location-level access
  RETURN 'locations/' || location_id || '/' || resource_type;
END;
$$;


ALTER FUNCTION "public"."build_gmb_path"("location_id" "text", "account_id" "text", "resource_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."call_edge_function"("p_function_name" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb", "p_timeout_ms" integer DEFAULT 30000) RETURNS bigint
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_request_id BIGINT;
    v_supabase_url TEXT;
    v_service_key TEXT;
BEGIN
    -- Get secrets from Vault
    SELECT decrypted_secret INTO v_supabase_url 
    FROM vault.decrypted_secrets WHERE name = 'supabase_url';
    
    SELECT decrypted_secret INTO v_service_key 
    FROM vault.decrypted_secrets WHERE name = 'supabase_service_role_key';
    
    IF v_supabase_url IS NULL OR v_service_key IS NULL THEN
        RAISE EXCEPTION 'Missing Supabase URL or Service Role Key in Vault';
    END IF;
    
    -- Make HTTP request using pg_net
    SELECT net.http_post(
        url := v_supabase_url || '/functions/v1/' || p_function_name,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || v_service_key
        ),
        body := p_payload,
        timeout_milliseconds := p_timeout_ms
    ) INTO v_request_id;
    
    RETURN v_request_id;
END;
$$;


ALTER FUNCTION "public"."call_edge_function"("p_function_name" "text", "p_payload" "jsonb", "p_timeout_ms" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_auto_sync_circuit_breaker"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  failure_rate float;
  total_count integer;
  failed_count integer;
BEGIN
  -- Check failure rate in last hour
  SELECT 
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) as total
  INTO failed_count, total_count
  FROM workflow_executions 
  WHERE workflow_type = 'gmb_sync' 
    AND created_at > NOW() - INTERVAL '1 hour';
    
  IF total_count = 0 THEN
    RETURN 'NORMAL';
  END IF;
  
  failure_rate := failed_count::float / total_count;
  
  -- Record metric
  INSERT INTO auto_sync_metrics (metric_name, metric_value, metric_type, labels)
  VALUES ('auto_sync_failure_rate', failure_rate, 'gauge', 
          jsonb_build_object('window', '1h', 'failed_count', failed_count, 'total_count', total_count));
  
  -- Circuit breaker logic
  IF failure_rate > 0.5 AND total_count >= 5 THEN
    -- Create critical alert
    INSERT INTO system_alerts (alert_type, severity, title, description, metadata)
    VALUES ('circuit_breaker', 'critical', 'Auto-sync circuit breaker opened',
            'Auto-sync failure rate exceeded 50% in the last hour',
            jsonb_build_object('failure_rate', failure_rate, 'failed_count', failed_count, 'total_count', total_count));
    RETURN 'CIRCUIT_OPEN';
  ELSIF failure_rate > 0.3 AND total_count >= 3 THEN
    -- Create warning alert
    INSERT INTO system_alerts (alert_type, severity, title, description, metadata)
    VALUES ('high_failure_rate', 'warning', 'High auto-sync failure rate',
            'Auto-sync failure rate exceeded 30% in the last hour',
            jsonb_build_object('failure_rate', failure_rate, 'failed_count', failed_count, 'total_count', total_count));
    RETURN 'WARNING';
  END IF;
  
  RETURN 'NORMAL';
END;
$$;


ALTER FUNCTION "public"."check_auto_sync_circuit_breaker"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_auto_sync_health"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  stale_orgs integer;
  orphaned_tokens integer;
  stuck_workflows integer;
  circuit_status text;
BEGIN
  -- Check circuit breaker first
  SELECT check_auto_sync_circuit_breaker() INTO circuit_status;
  
  -- Skip health checks if circuit is open
  IF circuit_status = 'CIRCUIT_OPEN' THEN
    RETURN;
  END IF;
  
  -- Check for organizations with valid tokens but no recent sync
  SELECT COUNT(*) INTO stale_orgs
  FROM google_tokens gt
  JOIN organizations o ON gt.organization_id = o.id
  WHERE gt.expires_at > NOW()
    AND gt.created_at < NOW() - INTERVAL '2 hours'
    AND NOT EXISTS (
      SELECT 1 FROM workflow_executions we
      WHERE we.organization_id = gt.organization_id
        AND we.workflow_type = 'gmb_sync'
        AND we.created_at > NOW() - INTERVAL '25 hours'
    );
    
  -- Record metric
  INSERT INTO auto_sync_metrics (metric_name, metric_value, metric_type)
  VALUES ('stale_organizations_count', stale_orgs, 'gauge');
    
  IF stale_orgs > 0 THEN
    INSERT INTO system_alerts (alert_type, severity, title, description, metadata)
    VALUES ('stale_organizations', 'critical', 
            stale_orgs || ' organizations have not synced in 25+ hours',
            'Organizations with valid tokens but no recent GMB sync detected',
            jsonb_build_object('count', stale_orgs));
  END IF;
  
  -- Check for stuck workflows (processing > 1 hour)
  SELECT COUNT(*) INTO stuck_workflows
  FROM workflow_executions 
  WHERE workflow_type = 'gmb_sync'
    AND status IN ('processing', 'pending')
    AND created_at < NOW() - INTERVAL '1 hour';
    
  INSERT INTO auto_sync_metrics (metric_name, metric_value, metric_type)
  VALUES ('stuck_workflows_count', stuck_workflows, 'gauge');
    
  IF stuck_workflows > 0 THEN
    INSERT INTO system_alerts (alert_type, severity, title, description, metadata)
    VALUES ('stuck_workflows', 'warning',
            stuck_workflows || ' workflows stuck for over 1 hour',
            'GMB sync workflows appear to be stuck in processing state',
            jsonb_build_object('count', stuck_workflows));
  END IF;
  
  -- Check for orphaned tokens (tokens without any workflows)
  SELECT COUNT(*) INTO orphaned_tokens
  FROM google_tokens gt
  WHERE gt.expires_at > NOW()
    AND gt.created_at < NOW() - INTERVAL '2 hours'
    AND NOT EXISTS (
      SELECT 1 FROM workflow_executions we
      WHERE we.organization_id = gt.organization_id
        AND we.workflow_type = 'gmb_sync'
        AND we.created_at > gt.created_at
    );
    
  INSERT INTO auto_sync_metrics (metric_name, metric_value, metric_type)
  VALUES ('orphaned_tokens_count', orphaned_tokens, 'gauge');
    
  IF orphaned_tokens > 0 THEN
    INSERT INTO system_alerts (alert_type, severity, title, description, metadata)
    VALUES ('orphaned_tokens', 'warning',
            orphaned_tokens || ' tokens have never triggered a workflow',
            'Google tokens exist but no workflows have been created for them',
            jsonb_build_object('count', orphaned_tokens));
  END IF;
  
END;
$$;


ALTER FUNCTION "public"."check_auto_sync_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_cron_health"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_failed_job RECORD;
BEGIN
    FOR v_failed_job IN
        SELECT job_name, last_run, failed_24h
        FROM public.cron_job_health
        WHERE failed_24h > 3
           OR (job_name = 'process-pending-workflows' AND last_run < NOW() - INTERVAL '5 minutes')
           OR (job_name LIKE 'sync-reviews%' AND last_run < NOW() - INTERVAL '25 hours')
    LOOP
        INSERT INTO system_logs (category, log_level, message, metadata)
        VALUES ('cron_alert', 'critical', 'Cron job health check failed', jsonb_build_object('job_name', v_failed_job.job_name, 'last_run', v_failed_job.last_run, 'failures_24h', v_failed_job.failed_24h));
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."check_cron_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_queue_alerts"() RETURNS TABLE("alert_type" "text", "queue_name" "text", "severity" "text", "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  -- Critical queue depth alerts
  SELECT 
    'QUEUE_DEPTH'::TEXT as alert_type,
    q.queue_name,
    'CRITICAL'::TEXT as severity,
    format('Queue %s has %s messages, oldest is %s seconds old', 
           q.queue_name, q.queue_length, q.oldest_msg_age_sec) as message
  WHERE q.queue_length > 100 
    OR q.oldest_msg_age_sec > 3600
    AND q.queue_name NOT LIKE '%_dlq'
  
  UNION ALL
  
  -- High failure rate alerts
  SELECT 
    'HIGH_FAILURE_RATE'::TEXT as alert_type,
    qm.queue_name,
    'WARNING'::TEXT as severity,
    format('Queue %s has %s%% failure rate in last hour', 
           qm.queue_name, 
           ROUND((failed_last_hour::float / NULLIF(processed_last_hour + failed_last_hour, 0) * 100), 1)) as message
  FROM public.enhanced_queue_health qm
  WHERE qm.success_rate < 0.8 
    AND (qm.processed_last_hour + qm.failed_last_hour) > 5
  
  UNION ALL
  
  -- Workflow execution alerts
  SELECT 
    'WORKFLOW_STUCK'::TEXT as alert_type,
    we.workflow_type as queue_name,
    'WARNING'::TEXT as severity,
    format('Workflow %s (ID: %s) has been processing for %s minutes', 
           we.workflow_type, we.id, 
           ROUND(EXTRACT(EPOCH FROM (NOW() - we.started_at)) / 60, 1)) as message
  FROM public.workflow_executions we
  WHERE we.status = 'processing' 
    AND we.started_at < NOW() - INTERVAL '30 minutes';
END;
$$;


ALTER FUNCTION "public"."check_queue_alerts"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_queue_health"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    queue_stat RECORD;
    threshold_rec RECORD;
    alert_message TEXT;
    severity TEXT;
    should_alert BOOLEAN;
    org_rec RECORD;
    current_val INTEGER;
    threshold_val INTEGER;
BEGIN
    -- Check each organization and queue combination against thresholds
    FOR org_rec IN SELECT id as organization_id FROM organizations LOOP
        FOR queue_stat IN 
            SELECT 
                queue_name,
                queue_length,
                CASE WHEN oldest_msg_age_sec IS NOT NULL THEN (oldest_msg_age_sec / 60) ELSE 0 END as oldest_msg_age_minutes,
                CASE WHEN avg_processing_time_ms IS NOT NULL THEN (avg_processing_time_ms / 60000) ELSE 0 END as avg_processing_time_minutes
            FROM enhanced_queue_health
            WHERE queue_length > 0 OR oldest_msg_age_sec > 0
        LOOP
            -- Check against thresholds for this queue and organization
            FOR threshold_rec IN
                SELECT * FROM alert_thresholds
                WHERE organization_id = org_rec.organization_id
                AND queue_name = queue_stat.queue_name
                AND enabled = true
            LOOP
                should_alert := false;
                severity := 'warning';
                alert_message := '';
                current_val := 0;
                threshold_val := 0;
                
                CASE threshold_rec.alert_type
                    WHEN 'high_depth' THEN
                        current_val := queue_stat.queue_length::integer;
                        IF current_val >= threshold_rec.critical_threshold THEN
                            should_alert := true;
                            severity := 'critical';
                            threshold_val := threshold_rec.critical_threshold;
                            alert_message := format('Queue depth critically high: %s messages (threshold: %s)', 
                                                  current_val, threshold_val);
                        ELSIF current_val >= threshold_rec.warning_threshold THEN
                            should_alert := true;
                            severity := 'warning';
                            threshold_val := threshold_rec.warning_threshold;
                            alert_message := format('Queue depth high: %s messages (threshold: %s)', 
                                                  current_val, threshold_val);
                        END IF;
                        
                    WHEN 'stale_messages' THEN
                        current_val := queue_stat.oldest_msg_age_minutes::integer;
                        IF current_val >= threshold_rec.critical_threshold THEN
                            should_alert := true;
                            severity := 'critical';
                            threshold_val := threshold_rec.critical_threshold;
                            alert_message := format('Stale messages detected: oldest message %s minutes old (threshold: %s)', 
                                                  current_val, threshold_val);
                        ELSIF current_val >= threshold_rec.warning_threshold THEN
                            should_alert := true;
                            severity := 'warning';
                            threshold_val := threshold_rec.warning_threshold;
                            alert_message := format('Messages aging: oldest message %s minutes old (threshold: %s)', 
                                                  current_val, threshold_val);
                        END IF;
                        
                    WHEN 'processing_slow' THEN
                        current_val := queue_stat.avg_processing_time_minutes::integer;
                        IF current_val >= threshold_rec.critical_threshold THEN
                            should_alert := true;
                            severity := 'critical';
                            threshold_val := threshold_rec.critical_threshold;
                            alert_message := format('Processing very slow: %s minutes average (threshold: %s)', 
                                                  current_val, threshold_val);
                        ELSIF current_val >= threshold_rec.warning_threshold THEN
                            should_alert := true;
                            severity := 'warning';
                            threshold_val := threshold_rec.warning_threshold;
                            alert_message := format('Processing slow: %s minutes average (threshold: %s)', 
                                                  current_val, threshold_val);
                        END IF;
                    ELSE
                        -- Default case for unknown alert types
                        CONTINUE;
                END CASE;
                
                -- Insert alert if needed and not already active
                IF should_alert THEN
                    -- Check if similar alert already exists
                    IF NOT EXISTS (
                        SELECT 1 FROM queue_health_alerts qha
                        WHERE qha.organization_id = org_rec.organization_id
                        AND qha.queue_name = queue_stat.queue_name
                        AND qha.alert_type = threshold_rec.alert_type
                        AND qha.resolved = false
                        AND qha.created_at > NOW() - INTERVAL '1 hour'
                    ) THEN
                        INSERT INTO queue_health_alerts (
                            organization_id,
                            queue_name,
                            alert_type,
                            threshold_value,
                            current_value,
                            severity,
                            message
                        ) VALUES (
                            org_rec.organization_id,
                            queue_stat.queue_name,
                            threshold_rec.alert_type,
                            threshold_val,
                            current_val,
                            severity,
                            alert_message
                        );
                    END IF;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."check_queue_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_system_health"() RETURNS TABLE("check_name" "text", "status" "text", "details" "jsonb")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    -- Check for stuck workflows
    RETURN QUERY
    SELECT 
        'stuck_workflows'::TEXT,
        CASE 
            WHEN COUNT(*) > 0 THEN 'unhealthy'::TEXT
            ELSE 'healthy'::TEXT
        END,
        jsonb_build_object(
            'count', COUNT(*),
            'oldest', MIN(we.created_at),
            'workflow_ids', array_agg(we.id)
        )
    FROM workflow_executions we
    WHERE we.status = 'processing'
        AND we.updated_at < NOW() - INTERVAL '30 minutes';

    -- Check for pending queue items
    RETURN QUERY
    SELECT 
        'pending_queue_items'::TEXT,
        CASE 
            WHEN COUNT(*) > 50 THEN 'unhealthy'::TEXT
            WHEN COUNT(*) > 20 THEN 'warning'::TEXT
            ELSE 'healthy'::TEXT
        END,
        jsonb_build_object(
            'count', COUNT(*),
            'oldest', MIN(rq.created_at)
        )
    FROM response_queue rq
    WHERE rq.status = 'pending';

    -- Check for recent failures
    RETURN QUERY
    SELECT 
        'recent_failures'::TEXT,
        CASE 
            WHEN COUNT(*) > 20 THEN 'unhealthy'::TEXT
            WHEN COUNT(*) > 10 THEN 'warning'::TEXT
            ELSE 'healthy'::TEXT
        END,
        jsonb_build_object(
            'count', COUNT(*),
            'unique_errors', COUNT(DISTINCT rq.error_message),
            'error_types', array_agg(DISTINCT rq.error_message)
        )
    FROM response_queue rq
    WHERE rq.status = 'failed'
        AND rq.failed_at > NOW() - INTERVAL '1 hour';

    -- Check OAuth token validity
    RETURN QUERY
    SELECT 
        'oauth_tokens'::TEXT,
        CASE 
            WHEN COUNT(*) > 0 THEN 'unhealthy'::TEXT
            ELSE 'healthy'::TEXT
        END,
        jsonb_build_object(
            'expired_count', COUNT(*),
            'account_ids', array_agg(gt.account_id)
        )
    FROM google_tokens gt
    WHERE gt.expires_at < NOW();

    -- Check queue processing rate
    RETURN QUERY
    WITH processing_stats AS (
        SELECT 
            COUNT(*) FILTER (WHERE rq.updated_at > NOW() - INTERVAL '1 hour') as processed_last_hour,
            COUNT(*) FILTER (WHERE rq.created_at > NOW() - INTERVAL '1 hour' AND rq.status = 'pending') as created_last_hour
        FROM response_queue rq
    )
    SELECT 
        'processing_rate'::TEXT,
        CASE 
            WHEN ps.created_last_hour > ps.processed_last_hour * 2 THEN 'unhealthy'::TEXT
            WHEN ps.created_last_hour > ps.processed_last_hour THEN 'warning'::TEXT
            ELSE 'healthy'::TEXT
        END,
        jsonb_build_object(
            'processed_last_hour', ps.processed_last_hour,
            'created_last_hour', ps.created_last_hour,
            'backlog_growing', ps.created_last_hour > ps.processed_last_hour
        )
    FROM processing_stats ps;
END;
$$;


ALTER FUNCTION "public"."check_system_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_expired_context_caches"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM context_caches 
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RAISE NOTICE 'Cleaned up % expired context caches', deleted_count;
  RETURN deleted_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_expired_context_caches"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."cleanup_expired_context_caches"() IS 'Removes expired context cache entries to maintain database performance';



CREATE OR REPLACE FUNCTION "public"."cleanup_legacy_response_queue"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  cleanup_count integer := 0;
  queue_record record;
BEGIN
  -- Clean up already published responses
  UPDATE response_queue 
  SET status = 'completed', processed_at = now()
  WHERE status = 'pending' 
    AND ai_response_id IN (
      SELECT id FROM ai_review_responses 
      WHERE status = 'published' AND published_at IS NOT NULL
    );
  
  GET DIAGNOSTICS cleanup_count = ROW_COUNT;
  
  -- Migrate approved responses to PGMQ
  FOR queue_record IN
    SELECT rq.*, arr.review_id
    FROM response_queue rq
    JOIN ai_review_responses arr ON arr.id = rq.ai_response_id
    WHERE rq.status = 'pending' 
      AND arr.status = 'approved'
      AND arr.published_at IS NULL
  LOOP
    -- Add to PGMQ
      'response_publishing_queue',
      jsonb_build_object(
        'execution_id', gen_random_uuid()::text,
        'organization_id', queue_record.organization_id,
        'workflow_type', 'response_publishing',
        'workflow_id', gen_random_uuid()::text,
        'step', 'publish_response',
        'context', jsonb_build_object(
          'ai_response_id', queue_record.ai_response_id,
          'review_id', queue_record.review_id,
          'migrated_from_legacy', true
        )
      )
    );
    
    -- Mark legacy entry as migrated
    UPDATE response_queue 
    SET status = 'migrated', 
        processed_at = now(),
        last_error = 'Migrated to PGMQ'
    WHERE id = queue_record.id;
    
    cleanup_count := cleanup_count + 1;
  END LOOP;
  
  RETURN cleanup_count;
END;
$$;


ALTER FUNCTION "public"."cleanup_legacy_response_queue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_old_unread_messages"("p_queue_name" "text", "p_max_age_minutes" integer DEFAULT 60) RETURNS "json"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_cleared_count INTEGER := 0;
  v_moved_to_dlq INTEGER := 0;
  v_result JSON;
  v_message RECORD;
  v_dlq_name TEXT;
BEGIN
  -- Set dead letter queue name
  v_dlq_name := p_queue_name || '_dlq';
  
  -- Log the operation
  RAISE NOTICE 'Clearing old unread messages from % older than % minutes', p_queue_name, p_max_age_minutes;
  
  -- Find old unread messages
  FOR v_message IN 
    SELECT msg_id, read_ct, enqueued_at, message
    WHERE enqueued_at < NOW() - (p_max_age_minutes || ' minutes')::INTERVAL
  LOOP
    v_cleared_count := v_cleared_count + 1;
    
    -- Move to dead letter queue first
    BEGIN
        v_dlq_name, 
        jsonb_build_object(
          'original_message', v_message.message,
          'dead_letter_reason', 'old_unread_message',
          'original_queue', p_queue_name,
          'read_count', v_message.read_ct,
          'enqueued_at', v_message.enqueued_at,
          'moved_to_dlq_at', NOW()
        )
      );
      v_moved_to_dlq := v_moved_to_dlq + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to move message % to DLQ: %', v_message.msg_id, SQLERRM;
    END;
    
    -- Delete the message
    BEGIN
      RAISE NOTICE 'Deleted old message %', v_message.msg_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to delete message %: %', v_message.msg_id, SQLERRM;
    END;
  END LOOP;
  
  -- Return results
  v_result := json_build_object(
    'queue_name', p_queue_name,
    'cleared_count', v_cleared_count,
    'moved_to_dlq', v_moved_to_dlq,
    'max_age_minutes', p_max_age_minutes,
    'cleaned_at', NOW()
  );
  
  RAISE NOTICE 'Old message cleanup completed: %', v_result;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."clear_old_unread_messages"("p_queue_name" "text", "p_max_age_minutes" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_stuck_queue_messages"("p_queue_name" "text", "p_max_age_minutes" integer DEFAULT 30, "p_max_retries" integer DEFAULT 3) RETURNS "json"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_stuck_count INTEGER := 0;
  v_moved_to_dlq INTEGER := 0;
  v_deleted_count INTEGER := 0;
  v_result JSON;
  v_message RECORD;
  v_dlq_name TEXT;
BEGIN
  -- Set dead letter queue name
  v_dlq_name := p_queue_name || '_dlq';
  
  -- Log the operation
  RAISE NOTICE 'Clearing stuck messages from % older than % minutes', p_queue_name, p_max_age_minutes;
  
  -- Find stuck messages (old and high read count)
  FOR v_message IN 
    SELECT msg_id, read_ct, enqueued_at, message
    WHERE enqueued_at < NOW() - (p_max_age_minutes || ' minutes')::INTERVAL
    AND read_ct >= p_max_retries
  LOOP
    v_stuck_count := v_stuck_count + 1;
    
    -- Try to move to dead letter queue
    BEGIN
        v_dlq_name, 
        jsonb_build_object(
          'original_message', v_message.message,
          'dead_letter_reason', 'stuck_message_cleanup',
          'original_queue', p_queue_name,
          'read_count', v_message.read_ct,
          'enqueued_at', v_message.enqueued_at,
          'moved_to_dlq_at', NOW()
        )
      );
      v_moved_to_dlq := v_moved_to_dlq + 1;
      RAISE NOTICE 'Moved message % to DLQ', v_message.msg_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to move message % to DLQ: %', v_message.msg_id, SQLERRM;
    END;
    
    -- Delete the stuck message
    BEGIN
      v_deleted_count := v_deleted_count + 1;
      RAISE NOTICE 'Deleted stuck message %', v_message.msg_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to delete message %: %', v_message.msg_id, SQLERRM;
    END;
  END LOOP;
  
  -- Return results
  v_result := json_build_object(
    'queue_name', p_queue_name,
    'stuck_messages_found', v_stuck_count,
    'moved_to_dlq', v_moved_to_dlq,
    'deleted_count', v_deleted_count,
    'max_age_minutes', p_max_age_minutes,
    'max_retries', p_max_retries,
    'cleaned_at', NOW()
  );
  
  RAISE NOTICE 'Stuck queue cleanup completed: %', v_result;
  
  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."clear_stuck_queue_messages"("p_queue_name" "text", "p_max_age_minutes" integer, "p_max_retries" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."count_unqueued_approved_responses"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM ai_review_responses arr
    LEFT JOIN response_queue rq ON arr.id = rq.ai_response_id
    WHERE arr.status = 'approved'
      AND arr.published_at IS NULL
      AND rq.id IS NULL
  );
END;
$$;


ALTER FUNCTION "public"."count_unqueued_approved_responses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."detect_poison_message"("p_queue_name" "text", "p_message" "jsonb", "p_error" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_signature TEXT;
  v_poison_count INT;
BEGIN
  -- Create signature from message type and error pattern
  v_signature := encode(
    digest(
      p_queue_name || '|' || 
      COALESCE(p_message->>'workflow_type', '') || '|' ||
      COALESCE(p_message->>'step', '') || '|' ||
      substring(p_error from 1 for 100), -- First 100 chars of error
      'sha256'
    ), 
    'hex'
  );
  
  -- Check if we've seen this pattern recently
  SELECT COUNT(*) INTO v_poison_count
  FROM public.quarantined_messages
  WHERE poison_signature = v_signature
    AND quarantined_at > NOW() - INTERVAL '1 hour';
  
  -- If we've seen this pattern 3+ times in the last hour, it's poison
  IF v_poison_count >= 3 THEN
    RETURN v_signature;
  END IF;
  
  RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."detect_poison_message"("p_queue_name" "text", "p_message" "jsonb", "p_error" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."disable_v2_cron_jobs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE cron.job 
    SET active = false 
    WHERE jobname LIKE 'v2-%';
    
    INSERT INTO system_logs (category, log_level, message, metadata)
    VALUES (
        'cron_job', 'info', 'V2 cron jobs disabled',
        jsonb_build_object('disabled_count', (
            SELECT COUNT(*) FROM cron.job WHERE jobname LIKE 'v2-%' AND active = false
        ))
    );
END;
$$;


ALTER FUNCTION "public"."disable_v2_cron_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enable_v2_cron_jobs"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    UPDATE cron.job 
    SET active = true 
    WHERE jobname LIKE 'v2-%';
    
    INSERT INTO system_logs (category, log_level, message, metadata)
    VALUES (
        'cron_job', 'info', 'V2 cron jobs enabled',
        jsonb_build_object('enabled_count', (
            SELECT COUNT(*) FROM cron.job WHERE jobname LIKE 'v2-%' AND active = true
        ))
    );
END;
$$;


ALTER FUNCTION "public"."enable_v2_cron_jobs"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_alert_rules"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  rule_record alert_rules%ROWTYPE;
  execution_start timestamptz;
  execution_time_ms integer;
  condition_result boolean;
  alert_id uuid;
  channel_id uuid;
  last_alert_time timestamptz;
BEGIN
  FOR rule_record IN 
    SELECT * FROM alert_rules WHERE enabled = true
  LOOP
    execution_start := NOW();
    condition_result := false;
    alert_id := NULL;
    
    BEGIN
      -- Check if we're in cooldown period
      SELECT MAX(created_at) INTO last_alert_time
      FROM system_alerts 
      WHERE alert_type = rule_record.name
        AND created_at > NOW() - INTERVAL '1 minute' * rule_record.cooldown_minutes;
      
      IF last_alert_time IS NOT NULL THEN
        -- In cooldown, skip this rule
        CONTINUE;
      END IF;
      
      -- Execute the condition SQL
      EXECUTE 'SELECT EXISTS(' || rule_record.condition_sql || ')' INTO condition_result;
      
      -- If condition is true, create alert
      IF condition_result THEN
        INSERT INTO system_alerts (alert_type, severity, title, description, metadata)
        VALUES (
          rule_record.name,
          rule_record.severity,
          rule_record.name || ' alert triggered',
          rule_record.description,
          jsonb_build_object('rule_id', rule_record.id, 'triggered_at', NOW())
        )
        RETURNING id INTO alert_id;
        
        -- Send notifications to all configured channels
        FOREACH channel_id IN ARRAY rule_record.notification_channels
        LOOP
          PERFORM send_alert_notification(alert_id, channel_id);
        END LOOP;
      END IF;
      
      execution_time_ms := EXTRACT(EPOCH FROM (NOW() - execution_start)) * 1000;
      
      -- Log the execution
      INSERT INTO alert_executions (
        alert_rule_id, 
        executed_at, 
        condition_result, 
        execution_time_ms, 
        alert_created_id
      )
      VALUES (
        rule_record.id,
        execution_start,
        condition_result,
        execution_time_ms,
        alert_id
      );
      
    EXCEPTION WHEN OTHERS THEN
      execution_time_ms := EXTRACT(EPOCH FROM (NOW() - execution_start)) * 1000;
      
      -- Log the failed execution
      INSERT INTO alert_executions (
        alert_rule_id, 
        executed_at, 
        condition_result, 
        execution_time_ms, 
        error_message
      )
      VALUES (
        rule_record.id,
        execution_start,
        false,
        execution_time_ms,
        SQLERRM
      );
    END;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."execute_alert_rules"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."execute_synthetic_test"("p_test_name" "text") RETURNS TABLE("test_name" "text", "execution_id" "uuid", "status" "text", "error_message" "text", "execution_time_ms" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_test_id uuid;
  v_execution_id uuid;
  v_start_time timestamptz;
  v_end_time timestamptz;
  v_test_sql text;
  v_expected_result jsonb;
  v_actual_result jsonb;
  v_status text := 'passed';
  v_error_message text := null;
  v_execution_time_ms integer;
  v_raw_result text;
BEGIN
  v_start_time := clock_timestamp();
  v_execution_id := gen_random_uuid();
  
  -- Get test configuration
  SELECT st.id, st.test_sql, st.expected_result
  INTO v_test_id, v_test_sql, v_expected_result
  FROM synthetic_tests st
  WHERE st.name = p_test_name AND st.enabled = true;
  
  IF NOT FOUND THEN
    v_status := 'failed';
    v_error_message := 'Test not found or disabled: ' || p_test_name;
    v_actual_result := jsonb_build_object('error', v_error_message);
  ELSE
    BEGIN
      -- Execute the test SQL dynamically and convert result to text first
      EXECUTE 'SELECT (' || v_test_sql || ')::text' INTO v_raw_result;
      
      -- Convert the result to jsonb
      v_actual_result := to_jsonb(v_raw_result);
      
      -- Compare with expected result if provided
      IF v_expected_result IS NOT NULL THEN
        IF v_actual_result != v_expected_result THEN
          v_status := 'failed';
          v_error_message := 'Result mismatch. Expected: ' || v_expected_result::text || ', Got: ' || v_actual_result::text;
        END IF;
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      v_status := 'failed';
      v_error_message := SQLERRM;
      v_actual_result := jsonb_build_object('error', SQLERRM);
    END;
  END IF;
  
  v_end_time := clock_timestamp();
  v_execution_time_ms := EXTRACT(EPOCH FROM (v_end_time - v_start_time)) * 1000;
  
  -- Store the execution result
  INSERT INTO synthetic_test_executions (
    test_id, 
    started_at, 
    completed_at, 
    status, 
    execution_time_ms, 
    actual_result, 
    error_message
  ) VALUES (
    v_test_id,
    v_start_time,
    v_end_time,
    v_status,
    v_execution_time_ms,
    v_actual_result,
    v_error_message
  );
  
  -- Return the result
  RETURN QUERY SELECT 
    p_test_name, 
    v_execution_id, 
    v_status, 
    v_error_message, 
    v_execution_time_ms;
END;
$$;


ALTER FUNCTION "public"."execute_synthetic_test"("p_test_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."extract_location_id"("full_path" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
BEGIN
  -- If it's already just an ID, return as-is
  IF full_path NOT LIKE '%/%' THEN
    RETURN full_path;
  END IF;
  
  -- Extract the last segment after the final slash
  RETURN split_part(full_path, '/', -1);
END;
$$;


ALTER FUNCTION "public"."extract_location_id"("full_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fail_workflow_step"("p_execution_id" "uuid", "p_error_details" "jsonb", "p_should_retry" boolean DEFAULT true) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_workflow RECORD;
  v_step_config RECORD;
  v_retry_policy JSONB;
  v_max_retries INT;
  v_backoff_ms INT;
  v_delay_seconds INT;
BEGIN
  -- Get current workflow execution
  SELECT * INTO v_workflow
  FROM public.workflow_executions
  WHERE id = p_execution_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow execution not found: %', p_execution_id;
  END IF;
  
  -- Get step configuration
  SELECT * INTO v_step_config
  FROM public.workflow_steps
  WHERE workflow_type = v_workflow.workflow_type
    AND step_name = v_workflow.current_step;
  
  v_retry_policy := v_step_config.retry_policy;
  v_max_retries := COALESCE((v_retry_policy->>'max_retries')::INT, 3);
  
  -- Check if we should retry
  IF p_should_retry AND v_workflow.retry_count < v_max_retries THEN
    -- Calculate backoff delay
    v_backoff_ms := COALESCE((v_retry_policy->>'backoff_ms')::INT, 1000);
    v_backoff_ms := v_backoff_ms * POWER(
      COALESCE((v_retry_policy->>'backoff_multiplier')::DECIMAL, 2), 
      v_workflow.retry_count
    );
    
    v_delay_seconds := CEIL(v_backoff_ms / 1000.0);
    
    -- Update for retry
    UPDATE public.workflow_executions
    SET status = 'retrying',
        retry_count = retry_count + 1,
        error_details = p_error_details,
        scheduled_at = NOW() + (v_delay_seconds || ' seconds')::INTERVAL,
        updated_at = NOW()
    WHERE id = p_execution_id;
    
    -- Re-queue with delay using proper PGMQ syntax
      v_step_config.queue_name,
      jsonb_build_object(
        'execution_id', p_execution_id,
        'organization_id', v_workflow.organization_id,
        'workflow_type', v_workflow.workflow_type,
        'workflow_id', v_workflow.workflow_id,
        'step', v_workflow.current_step,
        'context', v_workflow.context,
        'priority', v_workflow.priority,
        'retry_attempt', v_workflow.retry_count + 1
      ),
      v_delay_seconds
    );
    
    RETURN TRUE; -- Will retry
  ELSE
    -- Mark as failed
    UPDATE public.workflow_executions
    SET status = 'failed',
        error_details = p_error_details,
        completed_at = NOW(),
        updated_at = NOW()
    WHERE id = p_execution_id;
    
    -- If there's a compensation queue, trigger rollback
    IF v_step_config.compensation_queue IS NOT NULL THEN
        v_step_config.compensation_queue,
        jsonb_build_object(
          'execution_id', p_execution_id,
          'organization_id', v_workflow.organization_id,
          'workflow_type', v_workflow.workflow_type,
          'workflow_id', v_workflow.workflow_id,
          'failed_step', v_workflow.current_step,
          'context', v_workflow.context,
          'error_details', p_error_details
        )
      );
    END IF;
    
    RETURN FALSE; -- Failed permanently
  END IF;
END;
$$;


ALTER FUNCTION "public"."fail_workflow_step"("p_execution_id" "uuid", "p_error_details" "jsonb", "p_should_retry" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_ai_response_direct"("p_workflow_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_review_id uuid;
    v_tenant_id uuid;
    v_review_text text;
    v_rating integer;
    v_reviewer_name text;
    v_business_guidance jsonb;
    v_response_text text;
BEGIN
    -- Get workflow data
    SELECT 
        (input_data->>'review_id')::uuid,
        (input_data->>'tenant_id')::uuid,
        input_data->>'review_content',
        (input_data->>'rating')::integer,
        context_data->>'reviewer_name'
    INTO v_review_id, v_tenant_id, v_review_text, v_rating, v_reviewer_name
    FROM workflows
    WHERE id = p_workflow_id;

    -- Get business guidance
    SELECT guidance_data
    INTO v_business_guidance
    FROM business_guidance
    WHERE tenant_id = v_tenant_id
    AND active = true
    LIMIT 1;

    -- Generate response based on rating
    IF v_rating <= 2 THEN
        -- Negative review response
        v_response_text := format(
            'Dear %s,

Thank you for taking the time to share your feedback. We sincerely apologize that your experience didn''t meet your expectations. %s

We take all feedback seriously and are already taking steps to address the concerns you''ve raised. Our management team would love to speak with you directly to make this right.

Please reach out to us so we can personally ensure your next visit exceeds your expectations. Your satisfaction is our top priority, and we''re committed to earning back your trust.

%s',
            COALESCE(v_reviewer_name, 'Valued Customer'),
            CASE 
                WHEN v_review_text LIKE '%wait%' THEN 'We understand how frustrating long wait times can be, and we''re reviewing our service procedures.'
                WHEN v_review_text LIKE '%cold%' OR v_review_text LIKE '%quality%' THEN 'Quality is at the heart of what we do, and we''re disappointed to hear we fell short.'
                ELSE 'We''re truly sorry to hear about your experience.'
            END,
            COALESCE(v_business_guidance->>'closing_signature', 'Thank you for giving us the opportunity to improve.')
        );
    ELSIF v_rating = 3 THEN
        -- Neutral review response
        v_response_text := format(
            'Hi %s,

Thank you for your honest feedback! We appreciate you taking the time to share your experience with us.

We''re always looking for ways to improve, and your insights help us understand where we can do better. We''d love to welcome you back soon and show you an even better experience.

%s',
            COALESCE(v_reviewer_name, 'there'),
            COALESCE(v_business_guidance->>'closing_signature', 'Thanks again for your feedback!')
        );
    ELSE
        -- Positive review response
        v_response_text := format(
            '%s! 

Your wonderful review made our day! We''re so happy to hear you enjoyed your experience with us. %s

We can''t wait to see you again soon!

%s',
            COALESCE(v_reviewer_name, 'Thank you so much'),
            CASE 
                WHEN v_review_text LIKE '%coffee%' THEN 'It''s our passion to serve the best coffee, and knowing you loved it means everything to us.'
                WHEN v_review_text LIKE '%service%' OR v_review_text LIKE '%staff%' THEN 'Our team works hard to provide exceptional service, and they''ll be thrilled to hear your kind words.'
                ELSE 'It''s customers like you who make what we do so rewarding.'
            END,
            COALESCE(v_business_guidance->>'closing_signature', 'Thank you!')
        );
    END IF;

    -- Insert AI response
    INSERT INTO ai_responses (
        review_id,
        tenant_id,
        response_text,
        response_language,
        version,
        ai_model,
        ai_model_version,
        confidence_score,
        quality_score,
        tone,
        status,
        metadata
    ) VALUES (
        v_review_id,
        v_tenant_id,
        v_response_text,
        'en',
        1,
        'database-generator-v1',
        '1.0',
        0.85,
        0.80,
        CASE 
            WHEN v_rating <= 2 THEN 'empathetic'
            WHEN v_rating = 3 THEN 'friendly'
            ELSE 'enthusiastic'
        END,
        'draft',
        jsonb_build_object(
            'workflow_id', p_workflow_id,
            'generated_by', 'database_function',
            'rating', v_rating
        )
    );

    -- Update workflow status
    UPDATE workflows
    SET 
        status = 'completed',
        updated_at = NOW(),
        context_data = context_data || jsonb_build_object(
            'ai_response_generated', true,
            'processed_by', 'database_function'
        )
    WHERE id = p_workflow_id;

EXCEPTION WHEN OTHERS THEN
    -- Update workflow with error
    UPDATE workflows
    SET 
        status = 'failed',
        error_message = SQLERRM,
        updated_at = NOW()
    WHERE id = p_workflow_id;
    RAISE;
END;
$$;


ALTER FUNCTION "public"."generate_ai_response_direct"("p_workflow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_active_oauth_token"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text" DEFAULT 'https://www.googleapis.com/auth/business.manage'::"text") RETURNS TABLE("id" "uuid", "encrypted_access_token" "text", "encrypted_refresh_token" "text", "expires_at" timestamp with time zone, "status" "text", "last_used_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ot.id,
    ot.encrypted_access_token,
    ot.encrypted_refresh_token,
    ot.expires_at,
    ot.status,
    ot.last_used_at
  FROM oauth_tokens ot
  WHERE ot.tenant_id = p_tenant_id
    AND ot.provider = p_provider
    AND ot.provider_scope = p_scope
    AND ot.status = 'active'
  ORDER BY ot.created_at DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_active_oauth_token"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_cron_secret"("secret_key" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    secret_value TEXT;
BEGIN
    -- Only allow specific keys to be retrieved
    IF secret_key NOT IN ('service_role_key', 'anon_key', 'supabase_url') THEN
        RAISE EXCEPTION 'Invalid secret key requested';
    END IF;
    
    SELECT value INTO secret_value
    FROM private.cron_secrets
    WHERE key = secret_key;
    
    IF secret_value IS NULL THEN
        RAISE EXCEPTION 'Secret not found: %', secret_key;
    END IF;
    
    RETURN secret_value;
END;
$$;


ALTER FUNCTION "public"."get_cron_secret"("secret_key" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_cron_secret"("secret_key" "text") IS 'Retrieves a secret value for cron jobs. Only allows specific keys.';



CREATE OR REPLACE FUNCTION "public"."get_effective_ai_config"("p_tenant_id" "uuid") RETURNS TABLE("id" "uuid", "tenant_id" "uuid", "primary_model" "text", "temperature" numeric, "max_tokens" integer, "auth_method" "text", "api_version" "text", "settings" "jsonb", "metadata" "jsonb", "created_at" timestamp with time zone, "updated_at" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    -- Try tenant-specific config first, then fall back to default (NULL tenant_id)
    SELECT 
        id,
        tenant_id,
        primary_model,
        temperature,
        max_tokens,
        auth_method,
        api_version,
        settings,
        metadata,
        created_at,
        updated_at
    FROM ai_model_config 
    WHERE tenant_id = p_tenant_id
       OR (tenant_id IS NULL AND NOT EXISTS (
           SELECT 1 FROM ai_model_config WHERE tenant_id = p_tenant_id
       ))
    ORDER BY tenant_id NULLS LAST
    LIMIT 1;
$$;


ALTER FUNCTION "public"."get_effective_ai_config"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_failed_workflows_for_recovery"() RETURNS TABLE("organization_id" "uuid", "last_failure" timestamp with time zone, "failure_count" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    we.organization_id,
    MAX(we.completed_at) as last_failure,
    COUNT(*) as failure_count
  FROM workflow_executions we
  JOIN google_tokens gt ON we.organization_id = gt.organization_id
  WHERE we.workflow_type = 'gmb_sync'
    AND we.status IN ('failed', 'failed_permanent')
    AND we.completed_at < NOW() - INTERVAL '2 hours'
    AND gt.expires_at > NOW() + INTERVAL '5 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM workflow_executions we2
      WHERE we2.organization_id = we.organization_id
        AND we2.workflow_type = 'gmb_sync'
        AND we2.status IN ('pending', 'processing', 'retrying', 'completed')
        AND we2.created_at > we.completed_at
    )
  GROUP BY we.organization_id
  HAVING COUNT(*) <= 3; -- Only retry if failed less than 3 times in recovery window
END;
$$;


ALTER FUNCTION "public"."get_failed_workflows_for_recovery"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_locations_for_oauth_token"("p_token_id" "uuid") RETURNS TABLE("location_id" "uuid", "location_name" "text", "google_place_id" "text", "status" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.id,
    l.name,
    l.google_place_id,
    l.status
  FROM locations l
  WHERE l.oauth_token_id = p_token_id
    AND l.status = 'active';
END;
$$;


ALTER FUNCTION "public"."get_locations_for_oauth_token"("p_token_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_message_fair"("p_queue_name" "text", "p_batch_size" integer DEFAULT 1) RETURNS TABLE("msg_id" bigint, "message" "jsonb", "enqueued_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_total_weight DECIMAL := 0;
  v_random_threshold DECIMAL;
BEGIN
  -- Calculate total weight of all tenants with messages
  SELECT COALESCE(SUM(tqa.priority_weight), 1) INTO v_total_weight
  FROM public.tenant_queue_allocations tqa
  WHERE EXISTS (
    WHERE m.message->>'organization_id' = tqa.organization_id::text
  );
  
  -- Get random threshold
  v_random_threshold := random() * v_total_weight;
  
  -- Return messages using weighted selection
  RETURN QUERY
  WITH tenant_weights AS (
    SELECT 
      tqa.organization_id,
      tqa.priority_weight,
      SUM(tqa.priority_weight) OVER (ORDER BY tqa.organization_id) as cumulative_weight
    FROM public.tenant_queue_allocations tqa
    WHERE EXISTS (
      WHERE m.message->>'organization_id' = tqa.organization_id::text
    )
  ),
  selected_tenant AS (
    SELECT organization_id
    FROM tenant_weights
    WHERE cumulative_weight >= v_random_threshold
    ORDER BY cumulative_weight
    LIMIT 1
  ),
  available_messages AS (
    SELECT 
      m.msg_id,
      m.message,
      m.enqueued_at,
      ROW_NUMBER() OVER (
        ORDER BY 
          COALESCE((m.message->>'priority')::INT, 0) DESC,
          m.enqueued_at ASC
      ) as rn
    JOIN selected_tenant st ON m.message->>'organization_id' = st.organization_id::text
  )
  SELECT 
    am.msg_id,
    am.message,
    am.enqueued_at
  FROM available_messages am
  WHERE am.rn <= p_batch_size
  ORDER BY COALESCE((am.message->>'priority')::INT, 0) DESC, am.enqueued_at ASC;
END;
$$;


ALTER FUNCTION "public"."get_next_message_fair"("p_queue_name" "text", "p_batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_queue_item"("p_tenant_id" "uuid") RETURNS TABLE("queue_id" "uuid", "ai_response_id" "uuid", "review_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
    UPDATE response_queue
    SET status = 'processing',
        last_attempt_at = now(),
        attempts = attempts + 1
    WHERE id = (
        SELECT id
        FROM response_queue
        WHERE tenant_id = p_tenant_id
        AND status = 'pending'
        AND scheduled_for <= now()
        ORDER BY priority DESC, scheduled_for ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING id, ai_response_id, review_id;
END;
$$;


ALTER FUNCTION "public"."get_next_queue_item"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_next_response_to_process"("tenant_id" "uuid") RETURNS TABLE("queue_id" "uuid", "ai_response_id" "uuid", "review_id" "uuid", "response_text" "text", "location_id" "uuid", "platform_review_id" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rq.id as queue_id,
        rq.ai_response_id,
        rq.review_id,
        ar.content as response_text,
        r.location_id,
        r.gmb_review_id as platform_review_id
    FROM response_queue rq
    JOIN ai_responses ar ON rq.ai_response_id = ar.id
    JOIN reviews r ON rq.review_id = r.id
    WHERE rq.tenant_id = get_next_response_to_process.tenant_id
        AND rq.status = 'pending'
        AND rq.scheduled_for <= NOW()
    ORDER BY rq.priority DESC, rq.scheduled_for ASC
    LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_next_response_to_process"("tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_oauth_token_for_refresh"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text" DEFAULT 'https://www.googleapis.com/auth/business.manage'::"text") RETURNS TABLE("id" "uuid", "encrypted_access_token" "text", "encrypted_refresh_token" "text", "expires_at" timestamp with time zone, "status" "text", "last_used_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ot.id,
    ot.encrypted_access_token,
    ot.encrypted_refresh_token,
    ot.expires_at,
    ot.status,
    ot.last_used_at
  FROM oauth_tokens ot
  WHERE ot.tenant_id = p_tenant_id
    AND ot.provider = p_provider
    AND ot.provider_scope = p_scope
    AND ot.status IN ('active', 'needs_refresh')  -- Include both active and needs_refresh
    AND ot.encrypted_refresh_token IS NOT NULL   -- Must have refresh token
    -- Note: NO expiration check - we want expired tokens for refresh
  ORDER BY ot.created_at DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_oauth_token_for_refresh"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_onboarding_progress"("p_tenant_id" "uuid") RETURNS TABLE("step" "text", "completed" boolean, "completed_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        event_type as step,
        true as completed,
        max(created_at) as completed_at
    FROM onboarding_events
    WHERE tenant_id = p_tenant_id
    GROUP BY event_type
    ORDER BY max(created_at);
END;
$$;


ALTER FUNCTION "public"."get_onboarding_progress"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_prioritized_sync_candidates"("max_candidates" integer DEFAULT 20) RETURNS TABLE("organization_id" "uuid", "organization_name" "text", "priority_score" numeric, "reason" "text", "last_sync_hours_ago" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  WITH candidate_orgs AS (
    SELECT 
      gt.organization_id,
      o.name as org_name,
      gt.expires_at,
      gt.created_at as token_created,
      MAX(we.created_at) as last_sync,
      COUNT(we.id) FILTER (WHERE we.created_at > NOW() - INTERVAL '24 hours') as recent_syncs,
      COUNT(we.id) FILTER (WHERE we.status = 'failed' AND we.created_at > NOW() - INTERVAL '24 hours') as recent_failures,
      osp.performance_tier,
      osp.sync_maturity
    FROM google_tokens gt
    JOIN organizations o ON gt.organization_id = o.id
    LEFT JOIN workflow_executions we ON gt.organization_id = we.organization_id 
      AND we.workflow_type = 'gmb_sync'
    LEFT JOIN organization_sync_patterns osp ON gt.organization_id = osp.organization_id
    WHERE gt.expires_at > NOW() + INTERVAL '5 minutes'
      AND NOT EXISTS (
        SELECT 1 FROM workflow_executions we2
        WHERE we2.organization_id = gt.organization_id
          AND we2.workflow_type = 'gmb_sync'
          AND we2.status IN ('pending', 'processing', 'retrying')
          AND we2.created_at > NOW() - INTERVAL '30 minutes'
      )
    GROUP BY gt.organization_id, o.name, gt.expires_at, gt.created_at, osp.performance_tier, osp.sync_maturity
  ),
  prioritized AS (
    SELECT 
      co.*,
      EXTRACT(EPOCH FROM (NOW() - COALESCE(co.last_sync, co.token_created)))/3600 as hours_since_last_sync,
      -- Priority scoring algorithm
      (
        -- Base priority: time since last sync (higher = more urgent)
        LEAST(EXTRACT(EPOCH FROM (NOW() - COALESCE(co.last_sync, co.token_created)))/3600 / 24, 5) * 10 +
        
        -- Performance tier bonus (better performers get slight priority)
        CASE co.performance_tier
          WHEN 'high_performance' THEN 2
          WHEN 'medium_performance' THEN 1
          ELSE 0
        END +
        
        -- Maturity bonus (established orgs get slight priority)
        CASE co.sync_maturity
          WHEN 'established' THEN 1
          WHEN 'developing' THEN 0.5
          ELSE 0
        END +
        
        -- Failure penalty (recent failures reduce priority)
        CASE WHEN co.recent_failures > 0 THEN -2 ELSE 0 END +
        
        -- New organization bonus (never synced gets high priority)
        CASE WHEN co.last_sync IS NULL THEN 10 ELSE 0 END
        
      ) as calculated_priority,
      
      -- Reason for prioritization
      CASE 
        WHEN co.last_sync IS NULL THEN 'new_organization'
        WHEN EXTRACT(EPOCH FROM (NOW() - co.last_sync))/3600 > 48 THEN 'very_stale'
        WHEN EXTRACT(EPOCH FROM (NOW() - co.last_sync))/3600 > 24 THEN 'stale'
        WHEN co.recent_failures > 0 THEN 'recent_failures'
        ELSE 'regular_sync'
      END as priority_reason
    FROM candidate_orgs co
  )
  SELECT 
    p.organization_id,
    p.org_name,
    ROUND(p.calculated_priority, 2),
    p.priority_reason,
    ROUND(p.hours_since_last_sync, 2)
  FROM prioritized p
  ORDER BY p.calculated_priority DESC, p.hours_since_last_sync DESC
  LIMIT max_candidates;
END;
$$;


ALTER FUNCTION "public"."get_prioritized_sync_candidates"("max_candidates" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_queue_processor_mapping"() RETURNS TABLE("queue_name" "text", "processor_name" "text", "edge_function_url" "text", "workflow_type" "text", "step_name" "text", "is_active" boolean)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ws.queue_name,
    CASE ws.queue_name
      WHEN 'oauth_validation_queue' THEN 'oauth-validation-processor'
      WHEN 'location_discovery_queue' THEN 'location-discovery-processor' 
      WHEN 'location_sync_queue' THEN 'location-sync-processor'
      WHEN 'review_sync_queue' THEN 'review-sync-processor'
      WHEN 'ai_generation_queue' THEN 'ai-generation-processor'
      WHEN 'response_approval_queue' THEN 'response-approval-processor'
      WHEN 'response_publishing_queue' THEN 'response-publishing-processor'
      WHEN 'customer_onboarding_queue' THEN 'customer-onboarding-processor'
      WHEN 'notification_queue' THEN 'notification-processor'
      ELSE 'unknown-processor'
    END as processor_name,
    'https://dchddqxaelzokyjsebpx.supabase.co/functions/v1/' || 
    CASE ws.queue_name
      WHEN 'oauth_validation_queue' THEN 'oauth-validation-processor'
      WHEN 'location_discovery_queue' THEN 'location-discovery-processor' 
      WHEN 'location_sync_queue' THEN 'location-sync-processor'
      WHEN 'review_sync_queue' THEN 'review-sync-processor'
      WHEN 'ai_generation_queue' THEN 'ai-generation-processor'
      WHEN 'response_approval_queue' THEN 'response-approval-processor'
      WHEN 'response_publishing_queue' THEN 'response-publishing-processor'
      WHEN 'customer_onboarding_queue' THEN 'customer-onboarding-processor'
      WHEN 'notification_queue' THEN 'notification-processor'
      ELSE 'unknown-processor'
    END as edge_function_url,
    ws.workflow_type,
    ws.step_name,
  FROM workflow_steps ws
  ORDER BY ws.workflow_type, ws.step_order;
END;
$$;


ALTER FUNCTION "public"."get_queue_processor_mapping"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_review_ui_status"("review_status" "text", "has_ai_response" boolean, "ai_response_status" "text", "queue_status" "text", "response_source" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Published (external owner response)
  IF response_source = 'owner_external' THEN
    RETURN 'Published';
  END IF;
  
  -- Published (AI response published via queue)
  IF queue_status = 'published' THEN
    RETURN 'Published';
  END IF;
  
  -- Published (AI response published directly)
  IF review_status = 'responded' AND ai_response_status = 'published' THEN
    RETURN 'Published';
  END IF;
  
  -- Queued for Publishing
  IF queue_status IN ('pending', 'processing') AND ai_response_status = 'approved' THEN
    RETURN 'Queued for Publishing';
  END IF;
  
  -- Approved
  IF ai_response_status = 'approved' AND (queue_status IS NULL OR queue_status = 'cancelled') THEN
    RETURN 'Approved';
  END IF;
  
  -- AI Draft
  IF has_ai_response AND ai_response_status IN ('draft', 'pending_review') THEN
    RETURN 'AI Draft';
  END IF;
  
  -- New Review
  IF review_status = 'new' AND NOT has_ai_response THEN
    RETURN 'New Review';
  END IF;
  
  -- Fallback
  RETURN 'Unknown';
END;
$$;


ALTER FUNCTION "public"."get_review_ui_status"("review_status" "text", "has_ai_response" boolean, "ai_response_status" "text", "queue_status" "text", "response_source" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_review_ui_status"("review_status" "text", "has_ai_response" boolean, "ai_response_status" "text", "queue_status" "text", "response_source" "text") IS 'Maps database status fields to UI workflow states: New Review, AI Draft, Approved, Queued for Publishing, Published. Updated to work with existing response_queue structure.';



CREATE OR REPLACE FUNCTION "public"."get_service_role_key"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_key TEXT;
BEGIN
  SELECT key_value INTO v_key
  FROM system_config
  WHERE key_name = 'supabase_service_role_key'
  LIMIT 1;
  
  RETURN v_key;
END;
$$;


ALTER FUNCTION "public"."get_service_role_key"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_synthetic_test_health"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  total_tests integer;
  passing_tests integer;
  failing_tests integer;
  recent_executions integer;
  avg_execution_time numeric;
BEGIN
  -- Get current test status
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE latest_status = 'passed'),
    COUNT(*) FILTER (WHERE latest_status = 'failed')
  INTO total_tests, passing_tests, failing_tests
  FROM (
    SELECT DISTINCT ON (st.id) 
      st.id,
      ste.status as latest_status
    FROM synthetic_tests st
    LEFT JOIN synthetic_test_executions ste ON st.id = ste.test_id
    WHERE st.enabled = true
    ORDER BY st.id, ste.started_at DESC
  ) latest_results;
  
  -- Get recent execution stats
  SELECT 
    COUNT(*),
    AVG(execution_time_ms)
  INTO recent_executions, avg_execution_time
  FROM synthetic_test_executions 
  WHERE started_at > NOW() - INTERVAL '24 hours'
    AND status IN ('passed', 'failed');
  
  RETURN jsonb_build_object(
    'total_tests', total_tests,
    'passing_tests', passing_tests,
    'failing_tests', failing_tests,
    'health_percentage', CASE WHEN total_tests = 0 THEN 100 ELSE ROUND((passing_tests::numeric / total_tests * 100), 2) END,
    'recent_executions_24h', recent_executions,
    'avg_execution_time_ms', ROUND(COALESCE(avg_execution_time, 0), 2),
    'last_updated', NOW()
  );
END;
$$;


ALTER FUNCTION "public"."get_synthetic_test_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_system_health"() RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT jsonb_build_object(
        'workflows', jsonb_build_object(
            'pending', (SELECT COUNT(*) FROM workflows WHERE status = 'pending'),
            'running', (SELECT COUNT(*) FROM workflows WHERE status = 'running'),
            'failed_24h', (
                SELECT COUNT(*) FROM workflows 
                WHERE status = 'failed' AND updated_at > NOW() - INTERVAL '24 hours'
            )
        ),
        'response_queue', jsonb_build_object(
            'pending', (SELECT COUNT(*) FROM response_queue WHERE status = 'pending'),
            'processing', (SELECT COUNT(*) FROM response_queue WHERE status = 'processing'),
            'failed', (SELECT COUNT(*) FROM response_queue WHERE status = 'failed'),
            'published_24h', (
                SELECT COUNT(*) FROM response_queue 
                WHERE status = 'published' AND updated_at > NOW() - INTERVAL '24 hours'
            )
        ),
        'reviews', jsonb_build_object(
            'needing_response', (
                SELECT COUNT(*) FROM reviews 
                WHERE needs_response = true 
                  AND status = 'new'
                  AND review_text IS NOT NULL 
                  AND LENGTH(TRIM(review_text)) > 0
            ),
            'rating_only', (
                SELECT COUNT(*) FROM reviews 
                WHERE (review_text IS NULL OR LENGTH(TRIM(review_text)) = 0)
                  AND created_at > NOW() - INTERVAL '7 days'
            )
        ),
        'oauth_tokens', jsonb_build_object(
            'active', (
                SELECT COUNT(*) FROM oauth_tokens 
                WHERE status = 'active' AND provider = 'google'
            ),
            'expired', (
                SELECT COUNT(*) FROM oauth_tokens 
                WHERE status = 'active' AND expires_at < NOW() AND provider = 'google'
            ),
            'expiring_soon', (
                SELECT COUNT(*) FROM oauth_tokens 
                WHERE status = 'active' AND expires_at < NOW() + INTERVAL '24 hours' 
                AND expires_at > NOW() AND provider = 'google'
            ),
            'needs_refresh', (
                SELECT COUNT(*) FROM oauth_tokens 
                WHERE status = 'needs_refresh' AND provider = 'google'
            )
        ),
        'cron_jobs', jsonb_build_object(
            'active_jobs', (
                SELECT COUNT(*) FROM cron.job WHERE jobname LIKE 'v2-%' AND active = true
            ),
            'recent_executions', (
                SELECT COUNT(*) FROM system_logs 
                WHERE category = 'cron_job' AND created_at > NOW() - INTERVAL '1 hour'
            )
        ),
        'timestamp', NOW()
    );
$$;


ALTER FUNCTION "public"."get_system_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_system_health_check"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  health_record record;
BEGIN
  SELECT * INTO health_record FROM system_health_summary;
  
  RETURN jsonb_build_object(
    'status', health_record.overall_health_status,
    'timestamp', health_record.health_check_time,
    'summary', jsonb_build_object(
      'workflow_success_rate', (health_record.workflow_health->>'success_rate_24h')::numeric,
      'active_alerts', (health_record.alert_status->>'total_active_alerts')::integer,
      'test_health', (health_record.synthetic_test_health->>'health_percentage')::numeric,
      'org_sync_coverage', (health_record.organization_health->>'sync_coverage_percentage')::numeric
    ),
    'details', jsonb_build_object(
      'workflow', health_record.workflow_health,
      'organizations', health_record.organization_health,
      'tokens', health_record.token_health,
      'queues', health_record.queue_health,
      'alerts', health_record.alert_status,
      'tests', health_record.synthetic_test_health,
      'infrastructure', health_record.infrastructure_health
    )
  );
END;
$$;


ALTER FUNCTION "public"."get_system_health_check"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenant_batch"("batch_size" integer DEFAULT 10, "batch_offset" integer DEFAULT 0) RETURNS TABLE("tenant_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
    SELECT t.id
    FROM tenants t
    WHERE t.status = 'active'
      AND t.deleted_at IS NULL
    ORDER BY t.id
    LIMIT batch_size
    OFFSET batch_offset;
END;
$$;


ALTER FUNCTION "public"."get_tenant_batch"("batch_size" integer, "batch_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_tenants_needing_token_refresh"() RETURNS TABLE("tenant_id" "uuid", "token_id" "uuid", "expires_at" timestamp with time zone, "refresh_attempts" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ot.tenant_id,
    ot.id as token_id,
    ot.expires_at,
    ot.refresh_attempts
  FROM oauth_tokens ot
  INNER JOIN tenants t ON t.id = ot.tenant_id
  WHERE ot.provider = 'google'
    AND ot.provider_scope = 'https://www.googleapis.com/auth/business.manage'
    AND ot.status = 'active'
    AND ot.encrypted_refresh_token IS NOT NULL
    AND ot.refresh_attempts < 3
    AND (
      -- Case 1: Explicitly marked for refresh (manual trigger)
      ot.needs_refresh = true
      OR 
      -- Case 2: Token is expiring soon AND hasn't been refreshed very recently
      (
        ot.expires_at <= NOW() + INTERVAL '10 minutes'
        AND (
          -- Never been refreshed
          ot.last_refresh_at IS NULL
          OR 
          -- Or was refreshed more than 15 minutes ago
          -- This prevents rapid refresh loops but allows timely refreshes
          ot.last_refresh_at < NOW() - INTERVAL '15 minutes'
        )
      )
    );
END;
$$;


ALTER FUNCTION "public"."get_tenants_needing_token_refresh"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_active_tenant_ids"() RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT tu.tenant_id 
  FROM public.tenant_users tu
  WHERE tu.user_id = auth.uid()
  AND tu.status = 'active';
$$;


ALTER FUNCTION "public"."get_user_active_tenant_ids"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_active_tenant_ids"() IS 'Optimized function to get active tenant IDs for the current user';



CREATE OR REPLACE FUNCTION "public"."get_user_tenant_ids"("user_id" "uuid") RETURNS "uuid"[]
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    tenant_ids uuid[];
BEGIN
    SELECT ARRAY_AGG(tenant_id) INTO tenant_ids
    FROM public.tenant_users
    WHERE tenant_users.user_id = get_user_tenant_ids.user_id
    AND status = 'active'
    AND deleted_at IS NULL;
    
    RETURN COALESCE(tenant_ids, ARRAY[]::uuid[]);
END;
$$;


ALTER FUNCTION "public"."get_user_tenant_ids"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_tenant_role"("user_id" "uuid", "tenant_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    user_role text;
BEGIN
    SELECT role INTO user_role
    FROM public.tenant_users
    WHERE tenant_users.user_id = get_user_tenant_role.user_id
    AND tenant_users.tenant_id = get_user_tenant_role.tenant_id
    AND status = 'active'
    AND deleted_at IS NULL;
    
    RETURN user_role;
END;
$$;


ALTER FUNCTION "public"."get_user_tenant_role"("user_id" "uuid", "tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_tenant_with_role"("allowed_roles" "text"[]) RETURNS SETOF "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT tu.tenant_id 
  FROM public.tenant_users tu
  WHERE tu.user_id = auth.uid()
  AND tu.status = 'active'
  AND tu.role = ANY(allowed_roles);
$$;


ALTER FUNCTION "public"."get_user_tenant_with_role"("allowed_roles" "text"[]) OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_user_tenant_with_role"("allowed_roles" "text"[]) IS 'Optimized function to get tenant IDs for current user with specific roles';



CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    new.id, 
    new.email,
    new.raw_user_meta_data->>'full_name', 
    new.raw_user_meta_data->>'avatar_url'
  );
  RETURN new;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_active_oauth_token"("p_tenant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 
    FROM oauth_tokens
    WHERE tenant_id = p_tenant_id
      AND provider = 'google'
      AND provider_scope = 'https://www.googleapis.com/auth/business.manage'
      AND status = 'active'
      AND expires_at > NOW()
  );
END;
$$;


ALTER FUNCTION "public"."has_active_oauth_token"("p_tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tenant_admin"("user_id" "uuid", "tenant_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN get_user_tenant_role(user_id, tenant_id) IN ('owner', 'admin');
END;
$$;


ALTER FUNCTION "public"."is_tenant_admin"("user_id" "uuid", "tenant_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."link_location_to_oauth_token"("p_location_id" "uuid", "p_token_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  location_tenant_id uuid;
  token_tenant_id uuid;
BEGIN
  -- Get tenant IDs to ensure they match
  SELECT tenant_id INTO location_tenant_id 
  FROM locations 
  WHERE id = p_location_id;
  
  SELECT tenant_id INTO token_tenant_id 
  FROM oauth_tokens 
  WHERE id = p_token_id;
  
  -- Ensure both exist and belong to same tenant
  IF location_tenant_id IS NULL OR token_tenant_id IS NULL THEN
    RETURN false;
  END IF;
  
  IF location_tenant_id != token_tenant_id THEN
    RAISE EXCEPTION 'Location and OAuth token must belong to the same tenant';
  END IF;
  
  -- Link the location to the token
  UPDATE locations 
  SET oauth_token_id = p_token_id,
      updated_at = now()
  WHERE id = p_location_id;
  
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."link_location_to_oauth_token"("p_location_id" "uuid", "p_token_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."location_has_oauth_token"("p_location_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_tenant_id uuid;
  v_has_token boolean;
BEGIN
  -- Get tenant_id from location
  SELECT tenant_id INTO v_tenant_id
  FROM locations
  WHERE id = p_location_id;

  IF v_tenant_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check if tenant has active OAuth token
  SELECT EXISTS (
    SELECT 1 
    FROM oauth_tokens
    WHERE tenant_id = v_tenant_id
      AND provider = 'google'
      AND provider_scope = 'https://www.googleapis.com/auth/business.manage'
      AND status = 'active'
      AND expires_at > NOW()
  ) INTO v_has_token;

  RETURN v_has_token;
END;
$$;


ALTER FUNCTION "public"."location_has_oauth_token"("p_location_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."location_has_oauth_token"("p_location_id" "uuid") IS 'Check if a location''s tenant has an active OAuth token';



CREATE OR REPLACE FUNCTION "public"."log_cron_execution"("p_job_name" "text", "p_status" "text", "p_error_details" "jsonb" DEFAULT NULL::"jsonb", "p_metadata" "jsonb" DEFAULT NULL::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_execution_id UUID;
BEGIN
    INSERT INTO public.cron_job_executions (job_name, status, error_details, metadata)
    VALUES (p_job_name, p_status, p_error_details, p_metadata)
    RETURNING id INTO v_execution_id;
    
    RETURN v_execution_id;
END;
$$;


ALTER FUNCTION "public"."log_cron_execution"("p_job_name" "text", "p_status" "text", "p_error_details" "jsonb", "p_metadata" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_oauth_token_used"("p_token_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE oauth_tokens
  SET last_used_at = now()
  WHERE id = p_token_id;
END;
$$;


ALTER FUNCTION "public"."mark_oauth_token_used"("p_token_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_all_google_tokens"() RETURNS TABLE("migrated_tenant_id" "uuid", "oauth_token_id" "uuid", "locations_count" integer, "success" boolean, "error_message" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  tenant_record RECORD;
BEGIN
  -- Process each tenant that has Google tokens
  FOR tenant_record IN 
    SELECT DISTINCT l.tenant_id as tid
    FROM locations l
    WHERE l.google_access_token IS NOT NULL
      AND l.google_token_expires_at IS NOT NULL
    ORDER BY l.tenant_id
  LOOP
    -- Migrate tokens for this tenant
    RETURN QUERY 
    SELECT * FROM migrate_tenant_google_tokens(tenant_record.tid);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."migrate_all_google_tokens"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."migrate_all_google_tokens"() IS 'Migrates Google OAuth tokens for all tenants from locations table to oauth_tokens table (COLUMN NAME CONFLICT FIXED)';



CREATE OR REPLACE FUNCTION "public"."migrate_tenant_google_tokens"("p_tenant_id" "uuid") RETURNS TABLE("migrated_tenant_id" "uuid", "oauth_token_id" "uuid", "locations_count" integer, "success" boolean, "error_message" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  v_token_record RECORD;
  v_oauth_token_id uuid;
  v_locations_updated integer := 0;
  v_error_msg text;
BEGIN
  -- Find the most recent valid Google token for this tenant
  SELECT 
    l.google_access_token,
    l.google_refresh_token,
    l.google_token_expires_at,
    COUNT(*) OVER () as location_count
  INTO v_token_record
  FROM locations l
  WHERE l.tenant_id = p_tenant_id
    AND l.google_access_token IS NOT NULL
    AND l.google_token_expires_at IS NOT NULL
    AND l.google_token_expires_at > now() -- Only migrate non-expired tokens
  ORDER BY l.google_token_expires_at DESC
  LIMIT 1;
  
  -- If no valid token found, return empty result
  IF v_token_record IS NULL THEN
    RETURN QUERY SELECT 
      p_tenant_id,
      NULL::uuid,
      0,
      false,
      'No valid Google tokens found for tenant'::text;
    RETURN;
  END IF;
  
  BEGIN
    -- Insert the token into oauth_tokens table
    INSERT INTO oauth_tokens (
      tenant_id,
      provider,
      provider_scope,
      encrypted_access_token,
      encrypted_refresh_token,
      expires_at,
      status,
      token_metadata,
      created_at,
      updated_at
    ) VALUES (
      p_tenant_id,
      'google',
      'https://www.googleapis.com/auth/business.manage',
      v_token_record.google_access_token, -- Already encrypted in V2
      v_token_record.google_refresh_token,
      v_token_record.google_token_expires_at,
      'active',
      jsonb_build_object(
        'migrated_from', 'locations_table',
        'migration_date', now(),
        'original_location_count', v_token_record.location_count
      ),
      now(),
      now()
    ) RETURNING id INTO v_oauth_token_id;
    
    -- Update all locations for this tenant to reference the new OAuth token
    UPDATE locations
    SET oauth_token_id = v_oauth_token_id,
        updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND google_access_token IS NOT NULL;
    
    GET DIAGNOSTICS v_locations_updated = ROW_COUNT;
    
    -- Return success result
    RETURN QUERY SELECT 
      p_tenant_id,
      v_oauth_token_id,
      v_locations_updated,
      true,
      NULL::text;
    
  EXCEPTION WHEN OTHERS THEN
    v_error_msg := SQLERRM;
    
    -- Return error result
    RETURN QUERY SELECT 
      p_tenant_id,
      NULL::uuid,
      0,
      false,
      v_error_msg;
  END;
END;
$$;


ALTER FUNCTION "public"."migrate_tenant_google_tokens"("p_tenant_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."migrate_tenant_google_tokens"("p_tenant_id" "uuid") IS 'Migrates Google OAuth tokens for a specific tenant from locations table to oauth_tokens table (COLUMN NAME CONFLICT FIXED)';



CREATE OR REPLACE FUNCTION "public"."move_to_dead_letter_queue"("p_execution_id" "uuid", "p_error_details" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    workflow_record RECORD;
    existing_dlq_record RECORD;
BEGIN
    -- Get the workflow execution details
    SELECT * INTO workflow_record
    FROM workflow_executions 
    WHERE id = p_execution_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Workflow execution not found: %', p_execution_id;
    END IF;
    
    -- Check if already in dead letter queue
    SELECT * INTO existing_dlq_record
    FROM dead_letter_queue
    WHERE execution_id = p_execution_id;
    
    IF FOUND THEN
        -- Update existing record
        UPDATE dead_letter_queue SET
            error_count = error_count + 1,
            last_error = p_error_details,
            last_failed_at = NOW()
        WHERE execution_id = p_execution_id;
    ELSE
        -- Insert new record
        INSERT INTO dead_letter_queue (
            execution_id,
            organization_id,
            workflow_type,
            original_message,
            error_count,
            last_error,
            first_failed_at,
            last_failed_at
        ) VALUES (
            p_execution_id,
            workflow_record.organization_id,
            workflow_record.workflow_type,
            jsonb_build_object(
                'workflow_id', workflow_record.workflow_id,
                'current_step', workflow_record.current_step,
                'context', workflow_record.context,
                'priority', workflow_record.priority
            ),
            1,
            p_error_details,
            NOW(),
            NOW()
        );
    END IF;
    
    -- Update workflow status to failed_permanent
    UPDATE workflow_executions SET
        status = 'failed_permanent',
        error_details = p_error_details,
        updated_at = NOW(),
        completed_at = NOW()
    WHERE id = p_execution_id;
END;
$$;


ALTER FUNCTION "public"."move_to_dead_letter_queue"("p_execution_id" "uuid", "p_error_details" "jsonb") OWNER TO "postgres";


    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
END;
$$;




    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
END;
$$;




    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
END;
$$;




    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
$$;




    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
$$;




    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
END;
$$;




    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
$$;




    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
END;
$$;




    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  RETURN QUERY
END;
$$;




    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_delay_seconds > 0 THEN
  ELSE
  END IF;
END;
$$;




    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
$$;




CREATE OR REPLACE FUNCTION "public"."process_ai_workflows_batch"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    v_workflow RECORD;
    v_count integer := 0;
BEGIN
    -- Process pending AI response workflows
    FOR v_workflow IN 
        SELECT id 
        FROM workflows 
        WHERE workflow_type = 'ai_response_generation'
        AND status = 'pending'
        ORDER BY priority DESC, created_at ASC
        LIMIT 10
    LOOP
        BEGIN
            PERFORM generate_ai_response_direct(v_workflow.id);
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error processing workflow %: %', v_workflow.id, SQLERRM;
        END;
    END LOOP;
    
    IF v_count > 0 THEN
        RAISE NOTICE 'Processed % AI response workflows', v_count;
    END IF;
END;
$$;


ALTER FUNCTION "public"."process_ai_workflows_batch"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pending_workflows"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_workflow RECORD;
  v_processed_count INT := 0;
  v_error_count INT := 0;
  v_total_pending INT;
  v_total_running INT;
  v_service_key TEXT;
  v_http_response net.http_response_result;
BEGIN
  -- Get the service role key from system_config
  v_service_key := get_service_role_key();
  
  -- If no service key is configured, log and return
  IF v_service_key IS NULL OR v_service_key = '' THEN
    INSERT INTO system_logs (
      category,
      log_level,
      message,
      metadata
    ) VALUES (
      'workflow',
      'error',
      'Service role key not configured. Please insert into system_config table.',
      jsonb_build_object(
        'source', 'cron_processor',
        'error', 'missing_service_role_key',
        'timestamp', NOW()
      )
    );
    RETURN 'Error: Service role key not configured in system_config';
  END IF;
  
  -- Get total pending count
  SELECT COUNT(*) INTO v_total_pending
  FROM workflows
  WHERE status = 'pending'
    AND workflow_type = 'ai_response_generation';
  
  -- Get running count to avoid overwhelming
  SELECT COUNT(*) INTO v_total_running
  FROM workflows
  WHERE status = 'running'
    AND workflow_type = 'ai_response_generation'
    AND updated_at > NOW() - INTERVAL '10 minutes';
  
  IF v_total_pending = 0 THEN
    INSERT INTO system_logs (
      category,
      log_level,
      message,
      metadata
    ) VALUES (
      'workflow',
      'info',
      format('No pending workflows to process. Running: %s', v_total_running),
      jsonb_build_object(
        'source', 'cron_processor',
        'total_pending', v_total_pending,
        'total_running', v_total_running,
        'timestamp', NOW()
      )
    );
    RETURN format('No pending workflows to process. %s currently running', v_total_running);
  END IF;
  
  -- Don't process if too many are already running
  IF v_total_running >= 5 THEN
    INSERT INTO system_logs (
      category,
      log_level,
      message,
      metadata
    ) VALUES (
      'workflow',
      'info',
      format('Too many workflows running (%s), skipping batch', v_total_running),
      jsonb_build_object(
        'source', 'cron_processor',
        'total_pending', v_total_pending,
        'total_running', v_total_running,
        'timestamp', NOW()
      )
    );
    RETURN format('Too many workflows running (%s), skipping batch', v_total_running);
  END IF;
  
  -- Log start
  INSERT INTO system_logs (
    category,
    log_level,
    message,
    metadata
  ) VALUES (
    'workflow',
    'info',
    format('Starting to process %s pending workflows (%s running)', v_total_pending, v_total_running),
    jsonb_build_object(
      'source', 'cron_processor',
      'total_pending', v_total_pending,
      'total_running', v_total_running,
      'timestamp', NOW()
    )
  );
  
  -- Process each pending workflow
  FOR v_workflow IN 
    SELECT 
      id,
      tenant_id,
      workflow_type,
      status,
      current_step,
      context_data,
      error_details,
      input_data
    FROM workflows
    WHERE status = 'pending'
      AND workflow_type = 'ai_response_generation'
    ORDER BY started_at ASC NULLS FIRST, created_at ASC
    LIMIT 3
  LOOP
    BEGIN
      -- Update workflow to running
      UPDATE workflows
      SET 
        status = 'running',
        started_at = COALESCE(started_at, NOW()),
        updated_at = NOW()
      WHERE id = v_workflow.id
        AND status = 'pending';
      
      -- Log individual workflow processing
      INSERT INTO system_logs (
        category,
        log_level,
        message,
        metadata
      ) VALUES (
        'workflow',
        'info',
        'Processing AI response generation workflow',
        jsonb_build_object(
          'workflow_id', v_workflow.id,
          'workflow_type', v_workflow.workflow_type,
          'tenant_id', v_workflow.tenant_id,
          'current_step', v_workflow.current_step,
          'review_id', COALESCE(v_workflow.input_data->>'review_id', 'unknown')
        )
      );
      
      -- Call the workflow orchestrator Edge Function with proper auth
      SELECT INTO v_http_response net.http_post(
        url := 'https://dchddqxaelzokyjsebpx.supabase.co/functions/v1/v2-workflow-orchestrator-flexible',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || v_service_key
        ),
        body := jsonb_build_object(
          'workflow_id', v_workflow.id,
          'source', 'cron_processor',
          'tenant_id', v_workflow.tenant_id
        ),
        timeout_milliseconds := 30000
      );
      
      -- Log the HTTP response for debugging
      INSERT INTO system_logs (
        category,
        log_level,
        message,
        metadata
      ) VALUES (
        'workflow',
        CASE 
          WHEN v_http_response.status_code >= 200 AND v_http_response.status_code < 300 THEN 'info'
          ELSE 'error'
        END,
        format('HTTP call to workflow orchestrator: %s', v_http_response.status_code),
        jsonb_build_object(
          'workflow_id', v_workflow.id,
          'status_code', v_http_response.status_code,
          'response_body', left(v_http_response.content::text, 500),
          'response_headers', v_http_response.headers
        )
      );
      
      v_processed_count := v_processed_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      
      -- Log error
      INSERT INTO system_logs (
        category,
        log_level,
        message,
        metadata
      ) VALUES (
        'workflow',
        'error',
        'Failed to process workflow',
        jsonb_build_object(
          'workflow_id', v_workflow.id,
          'error', SQLERRM,
          'sqlstate', SQLSTATE
        )
      );
      
      -- Update workflow with error
      UPDATE workflows
      SET 
        status = 'failed',
        error_details = jsonb_build_object(
          'error', SQLERRM,
          'timestamp', NOW(),
          'context', 'cron_processor'
        ),
        updated_at = NOW()
      WHERE id = v_workflow.id;
    END;
  END LOOP;
  
  -- Final log
  INSERT INTO system_logs (
    category,
    log_level,
    message,
    metadata
  ) VALUES (
    'workflow',
    'info',
    format('Workflow processing completed. Processed: %s, Errors: %s', v_processed_count, v_error_count),
    jsonb_build_object(
      'processed', v_processed_count,
      'errors', v_error_count,
      'total_pending', v_total_pending,
      'total_running', v_total_running
    )
  );
  
  RETURN format('Processed %s of %s workflows (%s errors), %s running', v_processed_count, v_total_pending, v_error_count, v_total_running);
END;
$$;


ALTER FUNCTION "public"."process_pending_workflows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_pending_workflows_simple"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    workflow_record RECORD;
    result_id bigint;
BEGIN
    -- Process pending workflows
    FOR workflow_record IN 
        SELECT id 
        FROM workflows 
        WHERE status = 'pending'
        ORDER BY priority DESC, created_at ASC
        LIMIT 5
    LOOP
        -- Call the workflow orchestrator
        SELECT net.http_post(
            url := 'https://dchddqxaelzokyjsebpx.supabase.co/functions/v1/v2-workflow-orchestrator',
            headers := jsonb_build_object(
                'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
                'Content-Type', 'application/json'
            ),
            body := jsonb_build_object('workflow_id', workflow_record.id)
        ) INTO result_id;
        
        RAISE NOTICE 'Triggered workflow %', workflow_record.id;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."process_pending_workflows_simple"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_stuck_workflows"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    workflow_record RECORD;
    result jsonb = '[]'::jsonb;
BEGIN
    -- Find stuck workflows
    FOR workflow_record IN 
        SELECT w.*, r.review_text, r.rating, r.reviewer_name
        FROM workflows w
        JOIN reviews r ON r.id::text = w.input_data->>'review_id'
        WHERE w.workflow_type = 'ai_response_generation'
        AND w.status IN ('running', 'pending')
        AND w.created_at > NOW() - INTERVAL '7 days'
        LIMIT 5
    LOOP
        -- Create a simple AI response based on rating
        DECLARE
            response_text text;
        BEGIN
            IF workflow_record.rating >= 4 THEN
                response_text := format(
                    'Thank you so much for your wonderful review%s! We''re absolutely thrilled you enjoyed %s. Your feedback means the world to us, and we''d love to have you visit our coffee farm in Puerto Rico to see where the magic begins! Gracias! Gracias! Gracias!',
                    CASE WHEN workflow_record.reviewer_name IS NOT NULL THEN ', ' || workflow_record.reviewer_name ELSE '' END,
                    CASE 
                        WHEN workflow_record.review_text ILIKE '%coffee%' THEN 'our coffee'
                        WHEN workflow_record.review_text ILIKE '%quesito%' THEN 'our quesitos'
                        WHEN workflow_record.review_text ILIKE '%latte%' THEN 'our lattes'
                        ELSE 'your experience with us'
                    END
                );
            ELSIF workflow_record.rating = 3 THEN
                response_text := 'Thank you for taking the time to share your feedback. We appreciate your honest review and are always looking for ways to improve. We''d love to hear more about your experience and how we can make your next visit even better. Gracias! Gracias! Gracias!';
            ELSE
                response_text := 'Thank you for your feedback. We''re sorry to hear that your experience didn''t meet your expectations. Your opinion matters greatly to us, and we''d appreciate the opportunity to make things right. Please reach out to us directly so we can address your concerns and ensure a better experience next time. Gracias! Gracias! Gracias!';
            END IF;
            
            -- Insert AI response
            INSERT INTO ai_responses (
                review_id,
                tenant_id,
                response_text,
                status,
                confidence_score,
                model_used,
                generation_metadata
            ) VALUES (
                (workflow_record.input_data->>'review_id')::uuid,
                workflow_record.tenant_id,
                response_text,
                'draft',
                0.85,
                'manual-fallback',
                jsonb_build_object(
                    'timestamp', NOW(),
                    'model_version', 'manual-fallback',
                    'workflow_id', workflow_record.id,
                    'reason', 'Manual processing of stuck workflow'
                )
            );
            
            -- Update workflow status
            UPDATE workflows
            SET status = 'completed',
                current_step = 'completed',
                completed_at = NOW(),
                updated_at = NOW(),
                output_data = jsonb_build_object(
                    'ai_response', response_text,
                    'manual_processing', true
                )
            WHERE id = workflow_record.id;
            
            -- Add to result
            result := result || jsonb_build_object(
                'workflow_id', workflow_record.id,
                'review_id', workflow_record.input_data->>'review_id',
                'status', 'processed',
                'response_preview', LEFT(response_text, 100)
            );
        EXCEPTION WHEN OTHERS THEN
            -- Log error
            result := result || jsonb_build_object(
                'workflow_id', workflow_record.id,
                'status', 'error',
                'error', SQLERRM
            );
        END;
    END LOOP;
    
    RETURN result;
END;
$$;


ALTER FUNCTION "public"."process_stuck_workflows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_workflows_flexible"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_workflow RECORD;
  v_response TEXT;
  v_status_code INT;
  v_headers JSONB;
  v_cron_secret TEXT;
  v_processed INT := 0;
BEGIN
  -- Get service role key for Edge Function calls
  -- In Supabase, cron jobs run with service role permissions
  v_cron_secret := current_setting('supabase.service_role_key')::text;
  
  -- Log start
  RAISE NOTICE 'Starting workflow processing at %', NOW();
  
  -- Process up to 5 pending workflows
  FOR v_workflow IN 
    SELECT id, workflow_type, input_data
    FROM workflows
    WHERE status = 'pending'
      AND workflow_type IN ('ai_response_generation', 'review_processing')
    ORDER BY created_at ASC
    LIMIT 5
  LOOP
    BEGIN
      v_processed := v_processed + 1;
      RAISE NOTICE 'Processing workflow % of type %', v_workflow.id, v_workflow.workflow_type;
      
      -- Call the flexible workflow orchestrator
      SELECT 
        status,
        content::text,
        headers::jsonb
      INTO 
        v_status_code,
        v_response,
        v_headers
      FROM http_post(
        'https://dchddqxaelzokyjsebpx.supabase.co/functions/v1/v2-workflow-orchestrator-flexible',
        json_build_object('workflow_id', v_workflow.id::text)::text,
        'application/json',
        json_build_object(
          'Authorization', 'Bearer ' || v_cron_secret,
          'Content-Type', 'application/json'
        )::text
      );
      
      RAISE NOTICE 'Workflow % response: status=%', v_workflow.id, v_status_code;
      
      -- Log response details for debugging
      IF v_status_code != 200 THEN
        RAISE WARNING 'Workflow % failed with status % and response: %', 
          v_workflow.id, v_status_code, LEFT(v_response, 500);
      END IF;
      
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error processing workflow %: %', v_workflow.id, SQLERRM;
      
      -- Mark workflow as failed
      UPDATE workflows
      SET 
        status = 'failed',
        error_message = SQLERRM,
        failed_at = NOW(),
        updated_at = NOW()
      WHERE id = v_workflow.id;
    END;
  END LOOP;
  
  IF v_processed = 0 THEN
    RAISE NOTICE 'No pending workflows found';
  ELSE
    RAISE NOTICE 'Processed % workflows', v_processed;
  END IF;
END;
$$;


ALTER FUNCTION "public"."process_workflows_flexible"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_workflows_with_logging"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_result TEXT;
  v_pending_count INT;
  v_processed_count INT;
BEGIN
  -- Count pending workflows before processing
  SELECT COUNT(*) INTO v_pending_count
  FROM workflows
  WHERE status = 'pending'
    AND workflow_type IN ('ai_response_generation', 'review_processing');
  
  -- Process workflows
  SELECT process_ai_workflows_batch() INTO v_result;
  
  -- Count how many were processed
  SELECT COUNT(*) INTO v_processed_count
  FROM workflows
  WHERE status = 'completed'
    AND updated_at > NOW() - INTERVAL '1 minute';
  
  -- Log to system_logs table (using correct column names)
  INSERT INTO system_logs (
    category,
    log_level,
    message,
    metadata,
    created_at
  ) VALUES (
    'workflow',
    'info',
    format('Processed workflows: %s pending, %s completed', v_pending_count, v_processed_count),
    jsonb_build_object(
      'source', 'workflow_cron',
      'pending_before', v_pending_count,
      'processed', v_processed_count,
      'result', v_result
    ),
    NOW()
  );
  
  RETURN format('Processed %s of %s pending workflows', v_processed_count, v_pending_count);
END;
$$;


ALTER FUNCTION "public"."process_workflows_with_logging"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."quarantine_message"("p_queue_name" "text", "p_message_id" bigint, "p_message" "jsonb", "p_error_details" "jsonb", "p_poison_signature" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.quarantined_messages (
    queue_name, message_id, payload, error_details,
    organization_id, poison_signature
  ) VALUES (
    p_queue_name, p_message_id, p_message, p_error_details,
    (p_message->>'organization_id')::UUID, p_poison_signature
  );
  
  -- Archive the original message
END;
$$;


ALTER FUNCTION "public"."quarantine_message"("p_queue_name" "text", "p_message_id" bigint, "p_message" "jsonb", "p_error_details" "jsonb", "p_poison_signature" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_missing_approved_responses"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  queued_count INTEGER;
BEGIN
  -- Insert approved responses that are missing from the response queue
  INSERT INTO response_queue (
    organization_id,
    ai_response_id,
    review_id,
    status,
    priority,
    scheduled_at,
    attempts
  )
  SELECT 
    arr.organization_id,
    arr.id,
    arr.review_id,
    'pending' as status,
    0 as priority,
    NOW() as scheduled_at,
    0 as attempts
  FROM ai_review_responses arr
  LEFT JOIN response_queue rq ON arr.id = rq.ai_response_id
  WHERE arr.status = 'approved'
    AND arr.published_at IS NULL
    AND rq.id IS NULL;
    
  GET DIAGNOSTICS queued_count = ROW_COUNT;
  
  RETURN queued_count;
END;
$$;


ALTER FUNCTION "public"."queue_missing_approved_responses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_performance_metric"("p_metric_type" "text", "p_organization_id" "uuid", "p_measurement_name" "text", "p_measurement_value" numeric, "p_measurement_unit" "text", "p_labels" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO performance_metrics (
    metric_type, 
    organization_id, 
    measurement_name, 
    measurement_value, 
    measurement_unit, 
    labels
  )
  VALUES (
    p_metric_type,
    p_organization_id,
    p_measurement_name,
    p_measurement_value,
    p_measurement_unit,
    p_labels
  );
END;
$$;


ALTER FUNCTION "public"."record_performance_metric"("p_metric_type" "text", "p_organization_id" "uuid", "p_measurement_name" "text", "p_measurement_value" numeric, "p_measurement_unit" "text", "p_labels" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- This is a placeholder for queue metrics
  -- In a production system, you might want to store these in a separate metrics table
  -- For now, we'll just log and return success
  RAISE NOTICE 'Queue metric: org=%, queue=%, type=%, time=%ms', 
    p_organization_id, p_queue_name, p_metric_type, p_processing_time_ms;
  
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" bigint DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  INSERT INTO public.queue_metrics (
    organization_id, queue_name, metric_type, 
    count, total_processing_time_ms, hour
  ) VALUES (
    p_organization_id, p_queue_name, p_metric_type,
    1, p_processing_time_ms, date_trunc('hour', NOW())
  )
  ON CONFLICT (organization_id, queue_name, metric_type, hour) 
  DO UPDATE SET
    count = queue_metrics.count + 1,
    total_processing_time_ms = queue_metrics.total_processing_time_ms + p_processing_time_ms,
    recorded_at = NOW();
END;
$$;


ALTER FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_oauth_tokens_manually"() RETURNS TABLE("tenant_id" "uuid", "status" "text", "message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  location_record RECORD;
  token_count INT := 0;
  error_count INT := 0;
BEGIN
  -- Get all locations with tokens that need refresh
  FOR location_record IN 
    SELECT DISTINCT ON (l.tenant_id)
      l.tenant_id,
      l.id as location_id,
      l.google_refresh_token,
      l.google_token_expires_at
    FROM locations l
    WHERE l.google_refresh_token IS NOT NULL
      AND l.google_token_expires_at < NOW() + INTERVAL '30 minutes'
    ORDER BY l.tenant_id, l.updated_at DESC
  LOOP
    BEGIN
      -- Log the refresh attempt
      INSERT INTO system_logs (tenant_id, category, log_level, message, metadata)
      VALUES (
        location_record.tenant_id,
        'integration',
        'info',
        'Manual OAuth token refresh attempted',
        jsonb_build_object(
          'location_id', location_record.location_id,
          'expires_at', location_record.google_token_expires_at
        )
      );

      -- Since we can't call external APIs from a DB function,
      -- we'll mark these for manual refresh
      RETURN QUERY
      SELECT 
        location_record.tenant_id,
        'needs_refresh'::TEXT,
        format('Token expires at %s', location_record.google_token_expires_at)::TEXT;
      
      token_count := token_count + 1;

    EXCEPTION WHEN OTHERS THEN
      error_count := error_count + 1;
      
      RETURN QUERY
      SELECT 
        location_record.tenant_id,
        'error'::TEXT,
        SQLERRM::TEXT;
    END;
  END LOOP;

  -- Summary
  RETURN QUERY
  SELECT 
    NULL::UUID,
    'summary'::TEXT,
    format('Processed %s tokens, %s errors', token_count, error_count)::TEXT;
END;
$$;


ALTER FUNCTION "public"."refresh_oauth_tokens_manually"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_workflow_dashboard"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.workflow_dashboard;
END;
$$;


ALTER FUNCTION "public"."refresh_workflow_dashboard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_google_token_columns_safely"() RETURNS TABLE("action" "text", "status" "text", "details" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
  token_count integer;
  oauth_count integer;
BEGIN
  -- Check if there are still locations with Google tokens
  SELECT COUNT(*) INTO token_count 
  FROM locations 
  WHERE google_access_token IS NOT NULL 
     OR google_refresh_token IS NOT NULL
     OR google_token_expires_at IS NOT NULL;

  -- Check if OAuth tokens exist
  SELECT COUNT(*) INTO oauth_count 
  FROM oauth_tokens 
  WHERE provider = 'google';

  -- Safety check
  IF token_count > 0 AND oauth_count = 0 THEN
    RETURN QUERY SELECT 
      'SAFETY_CHECK'::text,
      'FAILED'::text,
      format('Found %s locations with Google tokens but no OAuth tokens. Migration appears incomplete.', token_count)::text;
    RETURN;
  END IF;

  -- If there are still tokens but also OAuth tokens, warn but don't block
  IF token_count > 0 THEN
    RETURN QUERY SELECT 
      'WARNING'::text,
      'TOKENS_STILL_EXIST'::text,
      format('Found %s locations with Google tokens. Proceeding with column removal but consider backing up data.', token_count)::text;
  END IF;

  -- Drop the indexes first
  BEGIN
    DROP INDEX IF EXISTS idx_locations_token_expiry;
    RETURN QUERY SELECT 
      'DROP_INDEX'::text,
      'SUCCESS'::text,
      'Dropped idx_locations_token_expiry index'::text;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 
      'DROP_INDEX'::text,
      'ERROR'::text,
      format('Failed to drop index: %s', SQLERRM)::text;
  END;

  -- Remove the columns
  BEGIN
    ALTER TABLE locations DROP COLUMN IF EXISTS google_access_token;
    RETURN QUERY SELECT 
      'DROP_COLUMN'::text,
      'SUCCESS'::text,
      'Dropped google_access_token column'::text;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 
      'DROP_COLUMN'::text,
      'ERROR'::text,
      format('Failed to drop google_access_token: %s', SQLERRM)::text;
  END;

  BEGIN
    ALTER TABLE locations DROP COLUMN IF EXISTS google_refresh_token;
    RETURN QUERY SELECT 
      'DROP_COLUMN'::text,
      'SUCCESS'::text,
      'Dropped google_refresh_token column'::text;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 
      'DROP_COLUMN'::text,
      'ERROR'::text,
      format('Failed to drop google_refresh_token: %s', SQLERRM)::text;
  END;

  BEGIN
    ALTER TABLE locations DROP COLUMN IF EXISTS google_token_expires_at;
    RETURN QUERY SELECT 
      'DROP_COLUMN'::text,
      'SUCCESS'::text,
      'Dropped google_token_expires_at column'::text;
  EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT 
      'DROP_COLUMN'::text,
      'ERROR'::text,
      format('Failed to drop google_token_expires_at: %s', SQLERRM)::text;
  END;

  RETURN QUERY SELECT 
    'MIGRATION_COMPLETE'::text,
    'SUCCESS'::text,
    'Google token columns successfully removed from locations table'::text;
END;
$$;


ALTER FUNCTION "public"."remove_google_token_columns_safely"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."requeue_from_dead_letter"("p_execution_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    dlq_record RECORD;
    workflow_record RECORD;
    first_step RECORD;
    result JSONB;
BEGIN
    -- Get dead letter queue record
    SELECT * INTO dlq_record
    FROM dead_letter_queue
    WHERE execution_id = p_execution_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Record not found in dead letter queue');
    END IF;
    
    -- Get workflow record
    SELECT * INTO workflow_record
    FROM workflow_executions
    WHERE id = p_execution_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Workflow execution not found');
    END IF;
    
    -- Get first step for this workflow type
    SELECT step_name, queue_name INTO first_step
    FROM workflow_steps
    WHERE workflow_type = dlq_record.workflow_type
    ORDER BY step_order
    LIMIT 1;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'No workflow steps found');
    END IF;
    
    -- Reset workflow to pending state
    UPDATE workflow_executions SET
        status = 'pending',
        current_step = first_step.step_name,
        retry_count = 0,
        error_details = NULL,
        updated_at = NOW(),
        scheduled_at = NOW()
    WHERE id = p_execution_id;
    
    -- Add back to queue
        first_step.queue_name,
        jsonb_build_object(
            'execution_id', p_execution_id,
            'organization_id', dlq_record.organization_id,
            'workflow_type', dlq_record.workflow_type,
            'step', first_step.step_name,
            'context', dlq_record.original_message->'context',
            'priority', COALESCE((dlq_record.original_message->>'priority')::integer, 0)
        )
    );
    
    -- Remove from dead letter queue
    DELETE FROM dead_letter_queue WHERE execution_id = p_execution_id;
    
    RETURN jsonb_build_object('success', true, 'message', 'Workflow requeued successfully');
END;
$$;


ALTER FUNCTION "public"."requeue_from_dead_letter"("p_execution_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_stuck_workflows"() RETURNS TABLE("workflow_id" "uuid", "previous_status" "text", "new_status" "text", "error_message" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    RETURN QUERY
    UPDATE workflow_executions
    SET 
        status = 'failed',
        error_details = jsonb_build_object(
            'error', 'Automatically reset due to being stuck in ' || status || ' state',
            'recovery_time', NOW()::text,
            'previous_status', status
        ),
        updated_at = NOW()
    WHERE 
        status IN ('processing', 'pending')
        AND updated_at < NOW() - INTERVAL '1 hour'
    RETURNING 
        id as workflow_id,
        status as previous_status,
        'failed' as new_status,
        error_details->>'error' as error_message;
END;
$$;


ALTER FUNCTION "public"."reset_stuck_workflows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_alert"("alert_id" "uuid", "resolved_by" "uuid" DEFAULT NULL::"uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  UPDATE system_alerts 
  SET resolved_at = NOW(),
      acknowledged_by = resolved_by
  WHERE id = alert_id 
    AND resolved_at IS NULL;
    
  RETURN FOUND;
END;
$$;


ALTER FUNCTION "public"."resolve_alert"("alert_id" "uuid", "resolved_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_all_synthetic_tests"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  test_record RECORD;
  result_array jsonb := '[]'::jsonb;
  test_result jsonb;
BEGIN
  -- Execute all enabled tests
  FOR test_record IN 
    SELECT name FROM synthetic_tests WHERE enabled = true ORDER BY name
  LOOP
    SELECT jsonb_build_object(
      'test_name', t.test_name,
      'execution_id', t.execution_id,
      'status', t.status,
      'error_message', t.error_message,
      'execution_time_ms', t.execution_time_ms
    ) INTO test_result
    FROM execute_synthetic_test(test_record.name) t;
    
    result_array := result_array || test_result;
  END LOOP;
  
  RETURN result_array;
END;
$$;


ALTER FUNCTION "public"."run_all_synthetic_tests"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_auto_generate_ai_responses"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_review RECORD;
    v_execution_id UUID;
    v_count INT := 0;
BEGIN
    v_execution_id := public.log_cron_execution('auto-generate-ai-responses', 'running');
    
    FOR v_review IN SELECT r.id, r.tenant_id FROM reviews r INNER JOIN response_settings rs ON rs.tenant_id = r.tenant_id WHERE r.needs_response = true AND r.status = 'new' AND r.deleted_at IS NULL AND rs.auto_generate_enabled = true AND NOT EXISTS (SELECT 1 FROM ai_responses ar WHERE ar.review_id = r.id) AND ((r.rating >= 4 AND rs.auto_generate_positive = true) OR (r.rating = 3 AND rs.auto_generate_neutral = true) OR (r.rating <= 2 AND rs.auto_generate_negative = true)) ORDER BY r.created_at LIMIT 10 LOOP
        BEGIN
            INSERT INTO workflows (tenant_id, workflow_type, workflow_name, status, current_step, context_data, priority, metadata)
            VALUES (v_review.tenant_id, 'review_processing', 'review_processing_' || extract(epoch from now())::text, 'pending', 'generate_ai_response', jsonb_build_object('reviewId', v_review.id, 'tenantId', v_review.tenant_id), 50, jsonb_build_object('source', 'cron_job', 'auto_generated', true));
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN CONTINUE;
        END;
    END LOOP;
    
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'completed', metadata = jsonb_build_object('reviews_processed', v_count) WHERE id = v_execution_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM) WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_auto_generate_ai_responses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_cleanup_and_monitoring"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_execution_id UUID;
BEGIN
    v_execution_id := public.log_cron_execution('cleanup-and-monitoring', 'running');
    
    DELETE FROM workflows WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '30 days';
    DELETE FROM cron_job_executions WHERE created_at < NOW() - INTERVAL '7 days';
    UPDATE workflows SET status = 'failed', error_details = jsonb_build_object('error', 'Workflow stuck for over 24 hours', 'marked_failed_at', NOW()) WHERE status = 'running' AND updated_at < NOW() - INTERVAL '24 hours';
    INSERT INTO system_logs (tenant_id, category, log_level, message, metadata)
    SELECT l.tenant_id, 'token_alert', 'warning', 'OAuth token expired and no refresh token available', jsonb_build_object('location_id', l.id, 'expired_at', l.google_token_expires_at)
    FROM locations l WHERE l.google_token_expires_at < NOW() AND l.google_refresh_token IS NULL AND l.status = 'active';
    
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'completed' WHERE id = v_execution_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM) WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_cleanup_and_monitoring"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_process_pending_workflows"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_execution_id UUID;
    v_result JSONB;
BEGIN
    v_execution_id := public.log_cron_execution('process-pending-workflows', 'running');
    
    SELECT content::JSONB INTO v_result
    FROM http_post(
        current_setting('app.settings.supabase_url') || '/functions/v1/v2-workflow-orchestrator',
        json_build_object(
            'action', 'process_pending_workflows',
            'max_workflows', 50
        )::text,
        'application/json',
        json_build_object(
            'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_role_key')
        )::text
    );
    
    UPDATE public.cron_job_executions
    SET completed_at = NOW(), status = 'completed', metadata = v_result
    WHERE id = v_execution_id;
    
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions
    SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM)
    WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_process_pending_workflows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_process_response_queue"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_queue_item RECORD;
    v_execution_id UUID;
    v_count INT := 0;
BEGIN
    v_execution_id := public.log_cron_execution('process-response-queue', 'running');
    
    FOR v_queue_item IN SELECT rq.*, ar.review_id FROM response_queue rq INNER JOIN ai_responses ar ON ar.id = rq.response_id WHERE rq.status = 'pending' AND rq.scheduled_for <= NOW() AND rq.attempts < rq.max_attempts ORDER BY rq.priority DESC, rq.scheduled_for LIMIT 5 LOOP
        BEGIN
            UPDATE response_queue SET status = 'processing', attempts = attempts + 1, last_attempt_at = NOW() WHERE id = v_queue_item.id;
            INSERT INTO workflows (tenant_id, workflow_type, workflow_name, status, current_step, context_data, priority, metadata)
            VALUES (v_queue_item.tenant_id, 'review_processing', 'publish_response_' || extract(epoch from now())::text, 'pending', 'publish_response', jsonb_build_object('reviewId', v_queue_item.review_id, 'createdResponseId', v_queue_item.response_id, 'tenantId', v_queue_item.tenant_id), 90, jsonb_build_object('source', 'response_queue', 'queue_item_id', v_queue_item.id));
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            UPDATE response_queue SET status = 'failed', error_details = jsonb_build_object('error', SQLERRM) WHERE id = v_queue_item.id;
        END;
    END LOOP;
    
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'completed', metadata = jsonb_build_object('responses_published', v_count) WHERE id = v_execution_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM) WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_process_response_queue"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_refresh_oauth_tokens"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_tenant RECORD;
    v_execution_id UUID;
    v_success_count INT := 0;
    v_error_count INT := 0;
BEGIN
    v_execution_id := public.log_cron_execution('refresh-oauth-tokens', 'running');
    
    FOR v_tenant IN 
        SELECT DISTINCT l.tenant_id
        FROM locations l
        WHERE l.google_refresh_token IS NOT NULL
          AND l.google_token_expires_at < NOW() + INTERVAL '2 hours'
          AND l.status = 'active'
          AND l.deleted_at IS NULL
        LIMIT 20
    LOOP
        BEGIN
            INSERT INTO workflows (tenant_id, workflow_type, workflow_name, status, current_step, context_data, priority, metadata)
            VALUES (v_tenant.tenant_id, 'token_refresh', 'token_refresh_' || extract(epoch from now())::text, 'pending', 'refresh_token', jsonb_build_object('tenantId', v_tenant.tenant_id), 100, jsonb_build_object('source', 'cron_job'));
            v_success_count := v_success_count + 1;
        EXCEPTION WHEN OTHERS THEN
            v_error_count := v_error_count + 1;
            INSERT INTO system_logs (tenant_id, category, log_level, message, metadata)
            VALUES (v_tenant.tenant_id, 'cron_error', 'error', 'Failed to create token refresh workflow', jsonb_build_object('error', SQLERRM));
        END;
    END LOOP;
    
    UPDATE public.cron_job_executions
    SET completed_at = NOW(), status = 'completed', metadata = jsonb_build_object('success_count', v_success_count, 'error_count', v_error_count)
    WHERE id = v_execution_id;
    
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions
    SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM)
    WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_refresh_oauth_tokens"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_sync_locations_batch_1"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_tenant RECORD;
    v_execution_id UUID;
BEGIN
    v_execution_id := public.log_cron_execution('sync-locations-batch-1', 'running');
    
    FOR v_tenant IN SELECT tenant_id FROM public.get_tenant_batch(15, 0) LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM locations WHERE tenant_id = v_tenant.tenant_id AND (google_place_id IS NULL OR google_place_id LIKE 'pending_%') AND google_access_token IS NOT NULL LIMIT 1) THEN
                INSERT INTO workflows (tenant_id, workflow_type, workflow_name, status, current_step, context_data, priority, metadata)
                VALUES (v_tenant.tenant_id, 'location_discovery', 'location_discovery_' || extract(epoch from now())::text, 'pending', 'fetch_account_info', jsonb_build_object('tenantId', v_tenant.tenant_id), 70, jsonb_build_object('source', 'cron_job', 'batch', 1));
            END IF;
        EXCEPTION WHEN OTHERS THEN CONTINUE;
        END;
    END LOOP;
    
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'completed' WHERE id = v_execution_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM) WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_sync_locations_batch_1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_sync_locations_batch_2"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_tenant RECORD;
    v_execution_id UUID;
BEGIN
    v_execution_id := public.log_cron_execution('sync-locations-batch-2', 'running');
    
    FOR v_tenant IN SELECT tenant_id FROM public.get_tenant_batch(15, 15) LOOP
        BEGIN
            IF EXISTS (SELECT 1 FROM locations WHERE tenant_id = v_tenant.tenant_id AND (google_place_id IS NULL OR google_place_id LIKE 'pending_%') AND google_access_token IS NOT NULL LIMIT 1) THEN
                INSERT INTO workflows (tenant_id, workflow_type, workflow_name, status, current_step, context_data, priority, metadata)
                VALUES (v_tenant.tenant_id, 'location_discovery', 'location_discovery_' || extract(epoch from now())::text, 'pending', 'fetch_account_info', jsonb_build_object('tenantId', v_tenant.tenant_id), 70, jsonb_build_object('source', 'cron_job', 'batch', 2));
            END IF;
        EXCEPTION WHEN OTHERS THEN CONTINUE;
        END;
    END LOOP;
    
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'completed' WHERE id = v_execution_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM) WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_sync_locations_batch_2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_sync_reviews_afternoon"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_location RECORD;
    v_execution_id UUID;
    v_count INT := 0;
BEGIN
    v_execution_id := public.log_cron_execution('sync-reviews-afternoon', 'running');
    
    FOR v_location IN SELECT l.id, l.tenant_id FROM locations l WHERE l.status = 'active' AND l.google_access_token IS NOT NULL AND l.google_place_id IS NOT NULL AND NOT l.google_place_id LIKE 'pending_%' AND (l.last_sync_at IS NULL OR l.last_sync_at < NOW() - INTERVAL '12 hours') ORDER BY l.last_sync_at NULLS FIRST LIMIT 30 LOOP
        BEGIN
            INSERT INTO workflows (tenant_id, workflow_type, workflow_name, status, current_step, context_data, priority, metadata)
            VALUES (v_location.tenant_id, 'review_sync', 'review_sync_' || extract(epoch from now())::text, 'pending', 'sync_reviews', jsonb_build_object('locationId', v_location.id, 'tenantId', v_location.tenant_id), 60, jsonb_build_object('source', 'cron_job', 'schedule', 'afternoon'));
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN CONTINUE;
        END;
    END LOOP;
    
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'completed', metadata = jsonb_build_object('locations_synced', v_count) WHERE id = v_execution_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM) WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_sync_reviews_afternoon"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_sync_reviews_evening"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_location RECORD;
    v_execution_id UUID;
    v_count INT := 0;
BEGIN
    v_execution_id := public.log_cron_execution('sync-reviews-evening', 'running');
    
    FOR v_location IN SELECT l.id, l.tenant_id FROM locations l WHERE l.status = 'active' AND l.google_access_token IS NOT NULL AND l.google_place_id IS NOT NULL AND NOT l.google_place_id LIKE 'pending_%' AND (l.last_sync_at IS NULL OR l.last_sync_at < NOW() - INTERVAL '12 hours') ORDER BY l.last_sync_at NULLS FIRST LIMIT 30 LOOP
        BEGIN
            INSERT INTO workflows (tenant_id, workflow_type, workflow_name, status, current_step, context_data, priority, metadata)
            VALUES (v_location.tenant_id, 'review_sync', 'review_sync_' || extract(epoch from now())::text, 'pending', 'sync_reviews', jsonb_build_object('locationId', v_location.id, 'tenantId', v_location.tenant_id), 60, jsonb_build_object('source', 'cron_job', 'schedule', 'evening'));
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN CONTINUE;
        END;
    END LOOP;
    
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'completed', metadata = jsonb_build_object('locations_synced', v_count) WHERE id = v_execution_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM) WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_sync_reviews_evening"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."run_sync_reviews_morning"() RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    v_location RECORD;
    v_execution_id UUID;
    v_count INT := 0;
BEGIN
    v_execution_id := public.log_cron_execution('sync-reviews-morning', 'running');
    
    FOR v_location IN SELECT l.id, l.tenant_id FROM locations l WHERE l.status = 'active' AND l.google_access_token IS NOT NULL AND l.google_place_id IS NOT NULL AND NOT l.google_place_id LIKE 'pending_%' AND (l.last_sync_at IS NULL OR l.last_sync_at < NOW() - INTERVAL '12 hours') ORDER BY l.last_sync_at NULLS FIRST LIMIT 30 LOOP
        BEGIN
            INSERT INTO workflows (tenant_id, workflow_type, workflow_name, status, current_step, context_data, priority, metadata)
            VALUES (v_location.tenant_id, 'review_sync', 'review_sync_' || extract(epoch from now())::text, 'pending', 'sync_reviews', jsonb_build_object('locationId', v_location.id, 'tenantId', v_location.tenant_id), 60, jsonb_build_object('source', 'cron_job', 'schedule', 'morning'));
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN CONTINUE;
        END;
    END LOOP;
    
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'completed', metadata = jsonb_build_object('locations_synced', v_count) WHERE id = v_execution_id;
EXCEPTION WHEN OTHERS THEN
    UPDATE public.cron_job_executions SET completed_at = NOW(), status = 'failed', error_details = jsonb_build_object('error', SQLERRM) WHERE id = v_execution_id;
END;
$$;


ALTER FUNCTION "public"."run_sync_reviews_morning"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."send_alert_notification"("alert_id" "uuid", "channel_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  alert_record system_alerts%ROWTYPE;
  channel_record notification_channels%ROWTYPE;
  notification_payload jsonb;
BEGIN
  -- Get alert details
  SELECT * INTO alert_record FROM system_alerts WHERE id = alert_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Get channel details
  SELECT * INTO channel_record FROM notification_channels WHERE id = channel_id AND enabled = true;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  -- Build notification payload
  notification_payload := jsonb_build_object(
    'alert_id', alert_record.id,
    'alert_type', alert_record.alert_type,
    'severity', alert_record.severity,
    'title', alert_record.title,
    'description', alert_record.description,
    'created_at', alert_record.created_at,
    'metadata', alert_record.metadata,
    'channel_type', channel_record.type,
    'channel_config', channel_record.config
  );
  
  -- Send notification based on channel type
  CASE channel_record.type
    WHEN 'database' THEN
      -- Already in database, just log the notification
      INSERT INTO cron_execution_log (job_name, started_at, completed_at, status, metadata)
      VALUES ('notification_sent', NOW(), NOW(), 'completed', 
              jsonb_build_object('alert_id', alert_id, 'channel_id', channel_id, 'type', 'database'));
              
    WHEN 'webhook' THEN
      -- For webhook notifications, we'll use pg_notify to trigger external processing
      PERFORM pg_notify('webhook_notification', notification_payload::text);
      
    WHEN 'email' THEN
      -- For email notifications, we'll use pg_notify to trigger external processing
      PERFORM pg_notify('email_notification', notification_payload::text);
      
    WHEN 'slack' THEN
      -- For Slack notifications, we'll use pg_notify to trigger external processing
      PERFORM pg_notify('slack_notification', notification_payload::text);
      
    ELSE
      RETURN false;
  END CASE;
  
  RETURN true;
END;
$$;


ALTER FUNCTION "public"."send_alert_notification"("alert_id" "uuid", "channel_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_cron_secret"("secret_key" "text", "secret_value" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
    INSERT INTO private.cron_secrets (key, value)
    VALUES (secret_key, secret_value)
    ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = NOW();
END;
$$;


ALTER FUNCTION "public"."set_cron_secret"("secret_key" "text", "secret_value" "text") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."set_cron_secret"("secret_key" "text", "secret_value" "text") IS 'Sets a secret value for cron jobs. Admin use only.';



CREATE OR REPLACE FUNCTION "public"."start_prioritized_workflows"("max_workflows" integer DEFAULT 10) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  workflows_created integer := 0;
  circuit_status text;
  candidate_record record;
  workflow_id text;
  execution_id uuid;
  results jsonb := '[]'::jsonb;
BEGIN
  -- Check circuit breaker
  SELECT check_auto_sync_circuit_breaker() INTO circuit_status;
  
  IF circuit_status = 'CIRCUIT_OPEN' THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'circuit_breaker_open',
      'workflows_created', 0
    );
  END IF;
  
  -- Process prioritized candidates
  FOR candidate_record IN 
    SELECT * FROM get_prioritized_sync_candidates(max_workflows * 2) -- Get more candidates than needed
  LOOP
    EXIT WHEN workflows_created >= max_workflows;
    
    workflow_id := 'gmb_sync_prioritized_' || extract(epoch from now()) || '_' || substr(md5(random()::text), 1, 8);
    
    -- Create workflow execution
    INSERT INTO workflow_executions (
      organization_id,
      workflow_type,
      workflow_id,
      current_step,
      status,
      context,
      priority,
      trace_id
    )
    VALUES (
      candidate_record.organization_id,
      'gmb_sync',
      workflow_id,
      'validate_oauth',
      'pending',
      jsonb_build_object(
        'trigger', 'prioritized_sync',
        'priority_score', candidate_record.priority_score,
        'priority_reason', candidate_record.reason,
        'hours_since_last_sync', candidate_record.last_sync_hours_ago
      ),
      CASE candidate_record.reason
        WHEN 'new_organization' THEN 3
        WHEN 'very_stale' THEN 2
        ELSE 1
      END,
      gen_random_uuid()::text
    )
    RETURNING id INTO execution_id;
    
    -- Queue the workflow
      'oauth_validation_queue',
      jsonb_build_object(
        'execution_id', execution_id,
        'organization_id', candidate_record.organization_id,
        'workflow_type', 'gmb_sync',
        'workflow_id', workflow_id,
        'step', 'validate_oauth',
        'context', jsonb_build_object(
          'trigger', 'prioritized_sync',
          'priority_score', candidate_record.priority_score,
          'priority_reason', candidate_record.reason
        ),
        'priority', CASE candidate_record.reason
          WHEN 'new_organization' THEN 3
          WHEN 'very_stale' THEN 2
          ELSE 1
        END
      )
    );
    
    workflows_created := workflows_created + 1;
    
    -- Add to results
    results := results || jsonb_build_object(
      'organization_id', candidate_record.organization_id,
      'organization_name', candidate_record.organization_name,
      'priority_score', candidate_record.priority_score,
      'reason', candidate_record.reason,
      'execution_id', execution_id
    );
    
    -- Record performance metric
    PERFORM record_performance_metric(
      'workflow_prioritization',
      candidate_record.organization_id,
      'priority_score',
      candidate_record.priority_score,
      'score',
      jsonb_build_object('reason', candidate_record.reason)
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'status', 'completed',
    'workflows_created', workflows_created,
    'circuit_status', circuit_status,
    'workflows', results
  );
END;
$$;


ALTER FUNCTION "public"."start_prioritized_workflows"("max_workflows" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_workflow_id" "text", "p_context" "jsonb" DEFAULT '{}'::"jsonb", "p_priority" integer DEFAULT 0, "p_scheduled_at" timestamp with time zone DEFAULT "now"()) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_execution_id UUID;
  v_first_step TEXT;
  v_first_queue TEXT;
  v_delay_seconds INT;
BEGIN
  -- Get the first step for this workflow type
  SELECT step_name, queue_name INTO v_first_step, v_first_queue
  FROM public.workflow_steps
  WHERE workflow_type = p_workflow_type
  ORDER BY step_order
  LIMIT 1;
  
  IF v_first_step IS NULL THEN
    RAISE EXCEPTION 'No steps defined for workflow type: %', p_workflow_type;
  END IF;
  
  -- Create workflow execution record
  INSERT INTO public.workflow_executions (
    organization_id, workflow_type, workflow_id, current_step,
    status, context, priority, scheduled_at
  ) VALUES (
    p_organization_id, p_workflow_type, p_workflow_id, v_first_step,
    'pending', p_context, p_priority, p_scheduled_at
  ) RETURNING id INTO v_execution_id;
  
  -- Calculate delay in seconds if scheduled for future
  v_delay_seconds := GREATEST(0, EXTRACT(EPOCH FROM (p_scheduled_at - NOW()))::INT);
  
  -- Queue the first step with proper PGMQ syntax
    v_first_queue,
    jsonb_build_object(
      'execution_id', v_execution_id,
      'organization_id', p_organization_id,
      'workflow_type', p_workflow_type,
      'workflow_id', p_workflow_id,
      'step', v_first_step,
      'context', p_context,
      'priority', p_priority,
      'scheduled_at', p_scheduled_at
    ),
    v_delay_seconds
  );
  
  RETURN v_execution_id;
END;
$$;


ALTER FUNCTION "public"."start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_workflow_id" "text", "p_context" "jsonb", "p_priority" integer, "p_scheduled_at" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_edge_function_auth"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
DECLARE
    result_id bigint;
    test_url text;
    test_headers jsonb;
BEGIN
    test_url := get_cron_secret('supabase_url') || '/functions/v1/hello-world';
    test_headers := jsonb_build_object(
        'Authorization', 'Bearer ' || get_cron_secret('service_role_key'),
        'Content-Type', 'application/json'
    );
    
    -- Try to call a simple endpoint
    SELECT net.http_post(
        url := test_url,
        headers := test_headers,
        body := jsonb_build_object('test', true)
    ) INTO result_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'request_id', result_id,
        'url', test_url,
        'headers_keys', jsonb_object_keys(test_headers)
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;


ALTER FUNCTION "public"."test_edge_function_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_flexible_orchestrator"("p_workflow_id" "uuid" DEFAULT NULL::"uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_response TEXT;
  v_status_code INT;
  v_cron_secret TEXT;
  v_workflow_id UUID;
BEGIN
  -- Get service role key for Edge Function calls
  -- In Supabase, cron jobs run with service role permissions
  v_cron_secret := current_setting('supabase.service_role_key')::text;
  
  -- Use provided workflow ID or get a pending one
  IF p_workflow_id IS NULL THEN
    SELECT id INTO v_workflow_id
    FROM workflows
    WHERE status = 'pending'
      AND workflow_type IN ('ai_response_generation', 'review_processing')
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_workflow_id IS NULL THEN
      RETURN 'No pending workflows found';
    END IF;
  ELSE
    v_workflow_id := p_workflow_id;
  END IF;
  
  RAISE NOTICE 'Testing flexible orchestrator with workflow_id: %', v_workflow_id;
  
  -- Call the orchestrator
  SELECT 
    status,
    content::text
  INTO 
    v_status_code,
    v_response
  FROM http_post(
    'https://dchddqxaelzokyjsebpx.supabase.co/functions/v1/v2-workflow-orchestrator-flexible',
    json_build_object('workflow_id', v_workflow_id::text)::text,
    'application/json',
    json_build_object(
      'Authorization', 'Bearer ' || v_cron_secret,
      'Content-Type', 'application/json'
    )::text
  );
  
  RETURN format('Status: %s, Response: %s', v_status_code, LEFT(v_response, 1000));
EXCEPTION WHEN OTHERS THEN
  RETURN format('Error: %s', SQLERRM);
END;
$$;


ALTER FUNCTION "public"."test_flexible_orchestrator"("p_workflow_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_gmb_sync"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_result jsonb;
  v_service_key text;
BEGIN
  -- Get service role key from environment
  SELECT current_setting('app.supabase_service_role_key', true) INTO v_service_key;
  
  IF v_service_key IS NULL THEN
    -- Try to get from vault
    SELECT decrypted_secret INTO v_service_key
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_key'
    LIMIT 1;
  END IF;
  
  IF v_service_key IS NULL THEN
    RETURN jsonb_build_object('error', 'No service role key found');
  END IF;

  -- Call the external integrator
  SELECT content::jsonb INTO v_result
  FROM http_post(
    'https://dchddqxaelzokyjsebpx.supabase.co/functions/v1/v2-external-integrator/sync-gmb-reviews',
    jsonb_build_object(
      'locationId', '544ed625-01ab-4aa1-b900-07c4a2ed7616',
      'tenantId', '7c828eff-fddf-498a-8d23-1812e4548090'
    )::text,
    'application/json',
    jsonb_build_object(
      'Authorization', 'Bearer ' || v_service_key
    )::text
  );
  
  RETURN v_result;
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'error', SQLERRM,
      'detail', SQLSTATE
    );
END;
$$;


ALTER FUNCTION "public"."test_gmb_sync"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_review_sync_workflow"("workflow_id_param" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  result jsonb;
  http_request_id bigint;
  response_body text;
  response_status integer;
BEGIN
  -- This is a test function that simulates calling the workflow orchestrator
  -- Since we can't make HTTP calls from SQL, we'll just return the workflow info
  SELECT jsonb_build_object(
    'message', 'Test function created - would call orchestrator',
    'workflow_id', workflow_id_param,
    'next_step', 'Call orchestrator via HTTP'
  ) INTO result;
  
  RETURN result;
END;
$$;


ALTER FUNCTION "public"."test_review_sync_workflow"("workflow_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."test_workflow_with_auth"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_workflow RECORD;
  v_http_response net.http_response_result;
  v_service_key TEXT := 'PLACEHOLDER_FOR_SERVICE_KEY'; -- You need to replace this
BEGIN
  -- Get one pending workflow to test
  SELECT 
    id,
    tenant_id,
    input_data
  INTO v_workflow
  FROM workflows
  WHERE status = 'pending'
    AND workflow_type = 'ai_response_generation'
  ORDER BY created_at ASC
  LIMIT 1;
  
  IF v_workflow.id IS NULL THEN
    RETURN 'No pending workflows found for testing';
  END IF;
  
  -- Make a test call to see what happens
  SELECT INTO v_http_response net.http_post(
    url := 'https://dchddqxaelzokyjsebpx.supabase.co/functions/v1/v2-workflow-orchestrator-flexible',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'workflow_id', v_workflow.id,
      'source', 'test_call',
      'tenant_id', v_workflow.tenant_id
    ),
    timeout_milliseconds := 30000
  );
  
  -- Log the result
  INSERT INTO system_logs (
    category,
    log_level,
    message,
    metadata
  ) VALUES (
    'workflow',
    'info',
    'Test HTTP call result',
    jsonb_build_object(
      'workflow_id', v_workflow.id,
      'status_code', v_http_response.status_code,
      'response_body', v_http_response.content,
      'headers', v_http_response.headers
    )
  );
  
  RETURN format('Test call made. Status: %s, Response: %s', 
    v_http_response.status_code, 
    left(v_http_response.content::text, 200)
  );
END;
$$;


ALTER FUNCTION "public"."test_workflow_with_auth"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_onboarding"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Only trigger onboarding for new organization members (not existing ones)
  -- Check if this organization already has an onboarding workflow
  IF NOT EXISTS (
    SELECT 1 FROM workflow_executions 
    WHERE organization_id = NEW.organization_id 
    AND workflow_type = 'customer_onboarding'
  ) THEN
    -- Create new onboarding workflow execution
    INSERT INTO workflow_executions (
      organization_id, 
      workflow_type, 
      workflow_id, 
      current_step, 
      status, 
      context, 
      priority,
      created_at,
      updated_at
    )
    VALUES (
      NEW.organization_id,
      'customer_onboarding',
      'onboard_' || NEW.organization_id || '_' || extract(epoch from now()),
      'welcome_user',
      'pending',
      jsonb_build_object(
        'user_id', NEW.user_id,
        'organization_id', NEW.organization_id,
        'trigger', 'signup',
        'created_by', 'auto_trigger'
      ),
      0,
      NOW(),
      NOW()
    );

    -- Queue the first step immediately
    VALUES (
      jsonb_build_object(
        'execution_id', (
          SELECT id FROM workflow_executions 
          WHERE organization_id = NEW.organization_id 
          AND workflow_type = 'customer_onboarding'
          ORDER BY created_at DESC 
          LIMIT 1
        ),
        'organization_id', NEW.organization_id,
        'workflow_type', 'customer_onboarding',
        'step', 'welcome_user',
        'context', jsonb_build_object(
          'user_id', NEW.user_id,
          'trigger', 'signup',
          'created_by', 'auto_trigger'
        ),
        'priority', 0
      )
    );

    RAISE NOTICE 'Customer onboarding workflow started for organization: %', NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_onboarding"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."trigger_onboarding"() IS 'Automatically starts customer onboarding workflow when a new user joins an organization';



CREATE OR REPLACE FUNCTION "public"."trigger_workflow_execution"("workflow_id_param" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  request_id bigint;
  result jsonb;
BEGIN
  -- Make HTTP request to workflow orchestrator
  SELECT net.http_post(
    url := 'https://dchddqxaelzokyjsebpx.supabase.co/functions/v1/v2-workflow-orchestrator',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaGRkcXhhZWx6b2t5anNlYnB4Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNzUzNzEyMCwiZXhwIjoyMDUzMTEzMTIwfQ.YvC8ZcGXJEGSRHyKxT77WF9k5ZJtPTR2DeDCo-_y8ZI'
    ),
    body := jsonb_build_object('workflow_id', workflow_id_param)
  ) INTO request_id;
  
  -- Return the request ID for tracking
  RETURN jsonb_build_object(
    'message', 'Workflow execution triggered',
    'request_id', request_id,
    'workflow_id', workflow_id_param
  );
END;
$$;


ALTER FUNCTION "public"."trigger_workflow_execution"("workflow_id_param" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_oauth_tokens_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_oauth_tokens_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_reviews_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_reviews_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_assign_role"("role_to_assign" "text", "target_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  manager_role TEXT;
BEGIN
  -- Get manager's role
  SELECT role INTO manager_role
  FROM organization_members
  WHERE user_id = auth.uid() AND organization_id = target_org_id;
  
  -- Owners can assign any role except owner
  IF manager_role = 'owner' THEN
    RETURN role_to_assign IN ('admin', 'manager', 'member');
  END IF;
  
  -- Admins can assign manager and member roles
  IF manager_role = 'admin' THEN
    RETURN role_to_assign IN ('manager', 'member');
  END IF;
  
  -- Others cannot assign roles
  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."user_can_assign_role"("role_to_assign" "text", "target_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_can_manage_member"("target_user_id" "uuid", "target_org_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  manager_role TEXT;
  target_role TEXT;
BEGIN
  -- Get manager's role
  SELECT role INTO manager_role
  FROM organization_members
  WHERE user_id = auth.uid() AND organization_id = target_org_id;
  
  -- Get target user's role
  SELECT role INTO target_role
  FROM organization_members
  WHERE user_id = target_user_id AND organization_id = target_org_id;
  
  -- Owners can manage everyone except other owners
  IF manager_role = 'owner' THEN
    RETURN target_role != 'owner';
  END IF;
  
  -- Admins can manage managers and members
  IF manager_role = 'admin' THEN
    RETURN target_role IN ('manager', 'member');
  END IF;
  
  -- Managers and members cannot manage anyone
  RETURN FALSE;
END;
$$;


ALTER FUNCTION "public"."user_can_manage_member"("target_user_id" "uuid", "target_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_token_migration"() RETURNS TABLE("summary_type" "text", "count" integer, "details" "jsonb")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Count of locations with old token fields
  RETURN QUERY
  SELECT 
    'locations_with_old_tokens'::text,
    COUNT(*)::integer,
    jsonb_build_object(
      'description', 'Locations still having Google token fields populated',
      'action_needed', 'These should be cleaned up after successful migration'
    )
  FROM locations
  WHERE google_access_token IS NOT NULL;
  
  -- Count of OAuth tokens created
  RETURN QUERY
  SELECT 
    'oauth_tokens_created'::text,
    COUNT(*)::integer,
    jsonb_build_object(
      'description', 'OAuth tokens created during migration',
      'providers', jsonb_agg(DISTINCT provider),
      'active_tokens', COUNT(*) FILTER (WHERE status = 'active')
    )
  FROM oauth_tokens
  WHERE token_metadata->>'migrated_from' = 'locations_table';
  
  -- Count of locations linked to OAuth tokens
  RETURN QUERY
  SELECT 
    'locations_linked_to_oauth'::text,
    COUNT(*)::integer,
    jsonb_build_object(
      'description', 'Locations successfully linked to OAuth tokens',
      'percentage', ROUND(
        (COUNT(*) * 100.0) / NULLIF(
          (SELECT COUNT(*) FROM locations WHERE google_access_token IS NOT NULL), 
          0
        ), 2
      )
    )
  FROM locations
  WHERE oauth_token_id IS NOT NULL;
  
  -- Tenant summary
  RETURN QUERY
  SELECT 
    'tenant_summary'::text,
    COUNT(DISTINCT tenant_id)::integer,
    jsonb_build_object(
      'description', 'Tenants with OAuth tokens',
      'avg_locations_per_tenant', ROUND(
        AVG(location_count), 2
      )
    )
  FROM (
    SELECT 
      ot.tenant_id,
      COUNT(l.id) as location_count
    FROM oauth_tokens ot
    LEFT JOIN locations l ON l.oauth_token_id = ot.id
    WHERE ot.token_metadata->>'migrated_from' = 'locations_table'
    GROUP BY ot.tenant_id
  ) tenant_stats;
END;
$$;


ALTER FUNCTION "public"."verify_token_migration"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."verify_token_migration"() IS 'Verifies the success of the token migration process';



CREATE OR REPLACE FUNCTION "public"."verify_token_migration_complete"() RETURNS TABLE("check_name" "text", "status" "text", "count" integer, "description" "text")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
BEGIN
  -- Check 1: How many locations still have Google tokens
  RETURN QUERY
  SELECT 
    'locations_with_google_tokens'::text,
    CASE 
      WHEN COUNT(*) = 0 THEN 'SAFE_TO_PROCEED'
      ELSE 'MIGRATION_INCOMPLETE'
    END::text,
    COUNT(*)::integer,
    'Locations that still have Google token fields populated'::text
  FROM locations
  WHERE google_access_token IS NOT NULL 
     OR google_refresh_token IS NOT NULL
     OR google_token_expires_at IS NOT NULL;

  -- Check 2: How many oauth tokens exist
  RETURN QUERY
  SELECT 
    'oauth_tokens_exist'::text,
    CASE 
      WHEN COUNT(*) > 0 THEN 'OAUTH_TOKENS_FOUND'
      ELSE 'NO_OAUTH_TOKENS'
    END::text,
    COUNT(*)::integer,
    'OAuth tokens that have been created'::text
  FROM oauth_tokens
  WHERE provider = 'google';

  -- Check 3: How many locations are linked to oauth tokens
  RETURN QUERY
  SELECT 
    'locations_linked_to_oauth'::text,
    CASE 
      WHEN COUNT(*) > 0 THEN 'LOCATIONS_LINKED'
      ELSE 'NO_LOCATIONS_LINKED'
    END::text,
    COUNT(*)::integer,
    'Locations that are linked to OAuth tokens'::text
  FROM locations
  WHERE oauth_token_id IS NOT NULL;
END;
$$;


ALTER FUNCTION "public"."verify_token_migration_complete"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "private"."cron_secrets" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "private"."cron_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_model_config" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "primary_model" "text" DEFAULT 'gemini-2.5-flash-lite'::"text" NOT NULL,
    "temperature" numeric(3,2) DEFAULT 1.0,
    "max_tokens" integer DEFAULT 65535,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "api_version" "text" DEFAULT 'v1beta'::"text",
    "auth_method" "text" DEFAULT 'service_account'::"text",
    CONSTRAINT "ai_model_config_auth_method_check" CHECK (("auth_method" = ANY (ARRAY['api_key'::"text", 'service_account'::"text", 'default'::"text"]))),
    CONSTRAINT "ai_model_config_temperature_check" CHECK ((("temperature" >= (0)::numeric) AND ("temperature" <= (2)::numeric)))
);


ALTER TABLE "public"."ai_model_config" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_model_config" IS 'Simplified AI model configuration. All tenants use the default config unless overridden.';



COMMENT ON COLUMN "public"."ai_model_config"."tenant_id" IS 'NULL for default config, or specific tenant UUID for overrides';



COMMENT ON COLUMN "public"."ai_model_config"."primary_model" IS 'The AI model to use (e.g., gemini-2.5-flash-lite)';



COMMENT ON COLUMN "public"."ai_model_config"."temperature" IS 'Model temperature 0.0-2.0 (higher = more creative)';



COMMENT ON COLUMN "public"."ai_model_config"."max_tokens" IS 'Maximum tokens in response';



COMMENT ON COLUMN "public"."ai_model_config"."settings" IS 'All other configuration including project, location, safety settings';



COMMENT ON COLUMN "public"."ai_model_config"."metadata" IS 'Additional metadata for tracking';



COMMENT ON COLUMN "public"."ai_model_config"."api_version" IS 'API version: v1, v1beta, or v1alpha';



COMMENT ON COLUMN "public"."ai_model_config"."auth_method" IS 'Authentication: api_key or service_account';



CREATE TABLE IF NOT EXISTS "public"."ai_responses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "review_id" "uuid" NOT NULL,
    "response_text" "text" NOT NULL,
    "response_language" "text" DEFAULT 'en'::"text",
    "version" integer DEFAULT 1,
    "ai_model" "text" NOT NULL,
    "ai_model_version" "text",
    "generation_prompt" "text",
    "generation_cost" numeric(10,6),
    "generation_tokens" integer,
    "generation_time_ms" integer,
    "confidence_score" numeric(5,4),
    "quality_score" numeric(5,4),
    "tone" "text",
    "status" "text" DEFAULT 'draft'::"text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejected_by" "uuid",
    "rejected_at" timestamp with time zone,
    "rejection_reason" "text",
    "rejection_feedback" "text",
    "published_at" timestamp with time zone,
    "published_by" "uuid",
    "platform_response_id" "text",
    "template_id" "uuid",
    "business_context" "jsonb" DEFAULT '{}'::"jsonb",
    "personalization_data" "jsonb" DEFAULT '{}'::"jsonb",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "ai_responses_confidence_score_check" CHECK ((("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (1)::numeric))),
    CONSTRAINT "ai_responses_quality_score_check" CHECK ((("quality_score" >= (0)::numeric) AND ("quality_score" <= (1)::numeric))),
    CONSTRAINT "ai_responses_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_review'::"text", 'approved'::"text", 'rejected'::"text", 'published'::"text"]))),
    CONSTRAINT "ai_responses_tone_check" CHECK (("tone" = ANY (ARRAY['professional'::"text", 'friendly'::"text", 'empathetic'::"text", 'apologetic'::"text", 'grateful'::"text"]))),
    CONSTRAINT "valid_approval" CHECK (((("status" <> 'approved'::"text") OR (("approved_by" IS NOT NULL) AND ("approved_at" IS NOT NULL))) AND (("status" <> 'rejected'::"text") OR (("rejected_by" IS NOT NULL) AND ("rejected_at" IS NOT NULL))))),
    CONSTRAINT "valid_publishing" CHECK ((("status" <> 'published'::"text") OR (("published_by" IS NOT NULL) AND ("published_at" IS NOT NULL)))),
    CONSTRAINT "valid_rejection" CHECK (((("rejected_at" IS NULL) AND ("rejection_reason" IS NULL)) OR (("rejected_at" IS NOT NULL) AND ("rejection_reason" IS NOT NULL))))
);


ALTER TABLE "public"."ai_responses" OWNER TO "postgres";


COMMENT ON TABLE "public"."ai_responses" IS 'AI-generated responses with strict tenant isolation via RLS policies';



CREATE TABLE IF NOT EXISTS "public"."alert_notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "alert_type" "text" NOT NULL,
    "severity" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "metadata" "jsonb",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "sent_at" timestamp without time zone,
    "acknowledged_at" timestamp without time zone,
    "created_at" timestamp without time zone DEFAULT "now"(),
    CONSTRAINT "alert_notifications_severity_check" CHECK (("severity" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text", 'critical'::"text"]))),
    CONSTRAINT "alert_notifications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'acknowledged'::"text"])))
);


ALTER TABLE "public"."alert_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "resource_type" "text" NOT NULL,
    "resource_id" "uuid",
    "old_values" "jsonb",
    "new_values" "jsonb",
    "ip_address" "inet",
    "user_agent" "text",
    "session_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."batch_generation_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "filter_criteria" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "progress" integer DEFAULT 0,
    "total_reviews" integer DEFAULT 0,
    "processed_reviews" integer DEFAULT 0,
    "successful_generations" integer DEFAULT 0,
    "failed_generations" integer DEFAULT 0,
    "template_id" "uuid",
    "generation_settings" "jsonb" DEFAULT '{}'::"jsonb",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "estimated_completion_at" timestamp with time zone,
    "error_message" "text",
    "error_details" "jsonb",
    "created_by" "uuid" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "batch_generation_jobs_progress_check" CHECK ((("progress" >= 0) AND ("progress" <= 100))),
    CONSTRAINT "batch_generation_jobs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'completed'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."batch_generation_jobs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."billing_usage" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "billing_period_start" "date" NOT NULL,
    "billing_period_end" "date" NOT NULL,
    "reviews_processed" integer DEFAULT 0,
    "ai_generations" integer DEFAULT 0,
    "api_requests" integer DEFAULT 0,
    "storage_used_gb" numeric(10,3) DEFAULT 0,
    "ai_generation_cost" numeric(10,6) DEFAULT 0,
    "storage_cost" numeric(10,6) DEFAULT 0,
    "api_cost" numeric(10,6) DEFAULT 0,
    "total_cost" numeric(10,6) GENERATED ALWAYS AS ((("ai_generation_cost" + "storage_cost") + "api_cost")) STORED,
    "plan_review_limit" integer,
    "plan_ai_generation_limit" integer,
    "plan_api_limit" integer,
    "plan_storage_limit_gb" numeric(10,3),
    "overage_reviews" integer DEFAULT 0,
    "overage_ai_generations" integer DEFAULT 0,
    "overage_api_requests" integer DEFAULT 0,
    "overage_storage_gb" numeric(10,3) DEFAULT 0,
    "overage_cost" numeric(10,6) DEFAULT 0,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_billing_period" CHECK (("billing_period_end" >= "billing_period_start"))
);


ALTER TABLE "public"."billing_usage" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."business_guidance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "brand_voice" "text",
    "response_tone" "jsonb" DEFAULT '{"neutral": "professional", "negative": "empathetic", "positive": "grateful"}'::"jsonb",
    "writing_style" "text",
    "key_messaging" "text"[],
    "max_response_length" integer DEFAULT 500,
    "min_response_length" integer DEFAULT 50,
    "include_business_name" boolean DEFAULT true,
    "include_call_to_action" boolean DEFAULT true,
    "default_call_to_action" "text",
    "primary_language" "text" DEFAULT 'en'::"text",
    "supported_languages" "text"[] DEFAULT '{en}'::"text"[],
    "auto_translate" boolean DEFAULT false,
    "prohibited_words" "text"[],
    "required_phrases" "text"[],
    "compliance_requirements" "text"[],
    "auto_respond_positive" boolean DEFAULT true,
    "auto_respond_neutral" boolean DEFAULT false,
    "auto_respond_negative" boolean DEFAULT false,
    "review_threshold_for_auto_response" integer DEFAULT 4,
    "business_hours" "jsonb",
    "contact_information" "jsonb" DEFAULT '{}'::"jsonb",
    "services_offered" "text"[],
    "unique_selling_points" "text"[],
    "industry_guidelines" "jsonb" DEFAULT '{}'::"jsonb",
    "regulatory_compliance" "jsonb" DEFAULT '{}'::"jsonb",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_response_length" CHECK (("min_response_length" < "max_response_length")),
    CONSTRAINT "valid_threshold" CHECK ((("review_threshold_for_auto_response" >= 1) AND ("review_threshold_for_auto_response" <= 5)))
);


ALTER TABLE "public"."business_guidance" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."context_caches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "cache_id" "text" NOT NULL,
    "context_hash" "text" NOT NULL,
    "token_count" integer NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "last_used_at" timestamp with time zone DEFAULT "now"(),
    "usage_count" integer DEFAULT 0,
    "estimated_cost_savings" numeric(10,4) DEFAULT 0
);


ALTER TABLE "public"."context_caches" OWNER TO "postgres";


COMMENT ON TABLE "public"."context_caches" IS 'Stores context cache metadata for AI generation cost optimization';



CREATE TABLE IF NOT EXISTS "public"."cron_job_executions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_name" "text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"(),
    "completed_at" timestamp with time zone,
    "status" "text",
    "error_details" "jsonb",
    "metadata" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "cron_job_executions_status_check" CHECK (("status" = ANY (ARRAY['running'::"text", 'completed'::"text", 'failed'::"text"])))
);


ALTER TABLE "public"."cron_job_executions" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."cron_job_health" WITH ("security_invoker"='true') AS
 SELECT "cron_job_executions"."job_name",
    "cron_job_executions"."started_at",
    "cron_job_executions"."completed_at",
    "cron_job_executions"."status",
    "cron_job_executions"."error_details",
    (EXTRACT(epoch FROM ("cron_job_executions"."completed_at" - "cron_job_executions"."started_at")) * (1000)::numeric) AS "execution_duration_ms"
   FROM "public"."cron_job_executions"
  WHERE ("cron_job_executions"."created_at" >= ("now"() - '7 days'::interval))
  ORDER BY "cron_job_executions"."started_at" DESC;


ALTER TABLE "public"."cron_job_health" OWNER TO "postgres";


COMMENT ON VIEW "public"."cron_job_health" IS 'Cron job execution history - respects user RLS policies';



CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "website" "text",
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "timezone" "text" DEFAULT 'UTC'::"text",
    "google_place_id" "text",
    "facebook_page_id" "text",
    "yelp_business_id" "text",
    "tripadvisor_location_id" "text",
    "trustpilot_business_id" "text",
    "platform_tokens" "jsonb" DEFAULT '{}'::"jsonb",
    "business_type" "text",
    "industry" "text",
    "price_level" integer,
    "rating" numeric(3,2),
    "review_count" integer DEFAULT 0,
    "status" "text" DEFAULT 'active'::"text",
    "sync_enabled" boolean DEFAULT true,
    "auto_sync_frequency" interval DEFAULT '01:00:00'::interval,
    "last_sync_at" timestamp with time zone,
    "next_sync_at" timestamp with time zone,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "platform_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "oauth_token_id" "uuid",
    CONSTRAINT "has_platform_id" CHECK ((("google_place_id" IS NOT NULL) OR ("facebook_page_id" IS NOT NULL) OR ("yelp_business_id" IS NOT NULL) OR ("tripadvisor_location_id" IS NOT NULL) OR ("trustpilot_business_id" IS NOT NULL))),
    CONSTRAINT "locations_price_level_check" CHECK ((("price_level" >= 1) AND ("price_level" <= 4))),
    CONSTRAINT "locations_rating_check" CHECK ((("rating" >= (0)::numeric) AND ("rating" <= (5)::numeric))),
    CONSTRAINT "locations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'error'::"text", 'syncing'::"text"]))),
    CONSTRAINT "valid_coordinates" CHECK (((("latitude" IS NULL) AND ("longitude" IS NULL)) OR (("latitude" IS NOT NULL) AND ("longitude" IS NOT NULL) AND (("latitude" >= ('-90'::integer)::numeric) AND ("latitude" <= (90)::numeric)) AND (("longitude" >= ('-180'::integer)::numeric) AND ("longitude" <= (180)::numeric)))))
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."oauth_tokens" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "provider" "text" NOT NULL,
    "provider_scope" "text" NOT NULL,
    "encrypted_access_token" "text" NOT NULL,
    "encrypted_refresh_token" "text",
    "expires_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "refresh_attempts" integer DEFAULT 0 NOT NULL,
    "last_refresh_at" timestamp with time zone,
    "last_refresh_error" "text",
    "last_used_at" timestamp with time zone,
    "token_metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "provider_user_id" "text",
    "provider_user_email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "needs_refresh" boolean DEFAULT false,
    CONSTRAINT "oauth_tokens_provider_check" CHECK (("provider" = ANY (ARRAY['google'::"text", 'facebook'::"text", 'yelp'::"text", 'tripadvisor'::"text", 'trustpilot'::"text"]))),
    CONSTRAINT "oauth_tokens_refresh_attempts_check" CHECK ((("refresh_attempts" >= 0) AND ("refresh_attempts" <= 10))),
    CONSTRAINT "oauth_tokens_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'revoked'::"text", 'refresh_failed'::"text", 'pending'::"text"])))
);


ALTER TABLE "public"."oauth_tokens" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."locations_with_oauth" WITH ("security_invoker"='true') AS
 SELECT "l"."id",
    "l"."tenant_id",
    "l"."name",
    "l"."google_place_id",
    "l"."address",
    "l"."status",
    "l"."created_at",
    "l"."updated_at",
        CASE
            WHEN ("o"."id" IS NOT NULL) THEN true
            ELSE false
        END AS "has_oauth",
        CASE
            WHEN ("o"."expires_at" > "now"()) THEN true
            ELSE false
        END AS "oauth_valid"
   FROM ("public"."locations" "l"
     LEFT JOIN "public"."oauth_tokens" "o" ON (("l"."tenant_id" = "o"."tenant_id")))
  WHERE ("l"."status" = 'active'::"text");


ALTER TABLE "public"."locations_with_oauth" OWNER TO "postgres";


COMMENT ON VIEW "public"."locations_with_oauth" IS 'Locations with OAuth status - respects user RLS policies';



CREATE TABLE IF NOT EXISTS "public"."notification_preferences" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "email_new_reviews" boolean DEFAULT true,
    "email_response_approved" boolean DEFAULT true,
    "email_response_rejected" boolean DEFAULT true,
    "email_daily_summary" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."notification_preferences" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."performance_metrics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "metric_name" "text" NOT NULL,
    "metric_type" "text" NOT NULL,
    "value" numeric(15,6) NOT NULL,
    "unit" "text",
    "service" "text",
    "endpoint" "text",
    "method" "text",
    "status_code" integer,
    "tags" "jsonb" DEFAULT '{}'::"jsonb",
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "sample_count" integer DEFAULT 1,
    "min_value" numeric(15,6),
    "max_value" numeric(15,6),
    "avg_value" numeric(15,6),
    "p50_value" numeric(15,6),
    "p95_value" numeric(15,6),
    "p99_value" numeric(15,6),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "performance_metrics_metric_type_check" CHECK (("metric_type" = ANY (ARRAY['counter'::"text", 'gauge'::"text", 'histogram'::"text", 'timer'::"text"]))),
    CONSTRAINT "valid_period" CHECK (("period_end" >= "period_start"))
);


ALTER TABLE "public"."performance_metrics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "full_name" "text",
    "avatar_url" "text",
    "phone" "text",
    "preferred_language" "text" DEFAULT 'en'::"text",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "notification_preferences" "jsonb" DEFAULT '{"sms": {"system": false, "reviews": false, "responses": false}, "push": {"system": true, "reviews": true, "responses": true}, "email": {"system": true, "reviews": true, "responses": true}}'::"jsonb" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_active_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "valid_email" CHECK (("email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'::"text"))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."response_analytics" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "period_start" timestamp with time zone NOT NULL,
    "period_end" timestamp with time zone NOT NULL,
    "period_type" "text" NOT NULL,
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
    "platform_metrics" "jsonb" DEFAULT '{}'::"jsonb",
    "positive_reviews" integer DEFAULT 0,
    "neutral_reviews" integer DEFAULT 0,
    "negative_reviews" integer DEFAULT 0,
    "avg_sentiment_score" numeric(5,4),
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "response_analytics_period_type_check" CHECK (("period_type" = ANY (ARRAY['hourly'::"text", 'daily'::"text", 'weekly'::"text", 'monthly'::"text"]))),
    CONSTRAINT "valid_period" CHECK (("period_end" > "period_start")),
    CONSTRAINT "valid_rates" CHECK ((("response_rate" IS NULL) OR (("response_rate" >= (0)::numeric) AND ("response_rate" <= (1)::numeric) AND ("approval_rate" IS NULL)) OR (("approval_rate" >= (0)::numeric) AND ("approval_rate" <= (1)::numeric) AND ("rejection_rate" IS NULL)) OR (("rejection_rate" >= (0)::numeric) AND ("rejection_rate" <= (1)::numeric))))
);


ALTER TABLE "public"."response_analytics" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."response_queue" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "response_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "priority" integer DEFAULT 50,
    "scheduled_for" timestamp with time zone DEFAULT "now"(),
    "platform" "text" NOT NULL,
    "platform_rate_limit" integer,
    "last_platform_request_at" timestamp with time zone,
    "attempt_count" integer DEFAULT 0,
    "max_attempts" integer DEFAULT 3,
    "last_attempt_at" timestamp with time zone,
    "next_retry_at" timestamp with time zone,
    "error_message" "text",
    "error_code" "text",
    "error_details" "jsonb",
    "processing_started_at" timestamp with time zone,
    "processing_completed_at" timestamp with time zone,
    "processed_by" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "response_queue_priority_check" CHECK ((("priority" >= 0) AND ("priority" <= 100))),
    CONSTRAINT "response_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'processing'::"text", 'published'::"text", 'failed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "valid_retry" CHECK ((("status" <> 'failed'::"text") OR ("next_retry_at" IS NOT NULL) OR ("attempt_count" >= "max_attempts")))
);


ALTER TABLE "public"."response_queue" OWNER TO "postgres";


COMMENT ON TABLE "public"."response_queue" IS 'Publishing queue for AI responses with strict tenant isolation via RLS policies';



CREATE TABLE IF NOT EXISTS "public"."response_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "location_id" "uuid",
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
    "platform_settings" "jsonb" DEFAULT '{}'::"jsonb",
    "rate_limits" "jsonb" DEFAULT '{}'::"jsonb",
    "notify_on_auto_publish" boolean DEFAULT true,
    "notify_on_review_threshold" boolean DEFAULT true,
    "notification_recipients" "text"[],
    "working_hours_only" boolean DEFAULT false,
    "working_hours" "jsonb",
    "excluded_keywords" "text"[],
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_confidence_score" CHECK ((("min_confidence_score" >= (0)::numeric) AND ("min_confidence_score" <= (1)::numeric))),
    CONSTRAINT "valid_quality_score" CHECK ((("min_quality_score" >= (0)::numeric) AND ("min_quality_score" <= (1)::numeric)))
);


ALTER TABLE "public"."response_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."response_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "template_text" "text" NOT NULL,
    "template_language" "text" DEFAULT 'en'::"text",
    "variables" "jsonb" DEFAULT '[]'::"jsonb",
    "rating_range" "int4range",
    "keywords" "text"[],
    "sentiment_range" "numrange",
    "platforms" "text"[],
    "usage_count" integer DEFAULT 0,
    "success_rate" numeric(5,4),
    "avg_response_time" interval,
    "status" "text" DEFAULT 'active'::"text",
    "is_default" boolean DEFAULT false,
    "priority" integer DEFAULT 50,
    "created_by" "uuid" NOT NULL,
    "last_modified_by" "uuid",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "response_templates_priority_check" CHECK ((("priority" >= 0) AND ("priority" <= 100))),
    CONSTRAINT "response_templates_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'draft'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."response_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "platform" "text" NOT NULL,
    "platform_review_id" "text" NOT NULL,
    "platform_reviewer_id" "text",
    "reviewer_name" "text",
    "reviewer_avatar_url" "text",
    "rating" integer NOT NULL,
    "review_text" "text",
    "review_language" "text" DEFAULT 'en'::"text",
    "sentiment_score" numeric(5,4),
    "sentiment_label" "text",
    "keywords" "text"[],
    "topics" "text"[],
    "confidence_score" numeric(5,4),
    "review_date" timestamp with time zone NOT NULL,
    "response_deadline" timestamp with time zone,
    "priority_score" integer DEFAULT 50,
    "is_verified" boolean DEFAULT false,
    "is_local_guide" boolean DEFAULT false,
    "reviewer_review_count" integer,
    "status" "text" DEFAULT 'new'::"text",
    "needs_response" boolean DEFAULT true,
    "is_flagged" boolean DEFAULT false,
    "flagged_reason" "text",
    "platform_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "reviewer_is_anonymous" boolean DEFAULT false,
    "review_updated_at" timestamp with time zone,
    "is_review_edited" boolean DEFAULT false,
    "review_url" "text",
    "response_source" "text",
    "external_response_date" timestamp with time zone,
    "has_owner_reply" boolean DEFAULT false,
    "owner_reply_text" "text",
    "owner_reply_date" timestamp with time zone,
    CONSTRAINT "reviews_confidence_score_check" CHECK ((("confidence_score" >= (0)::numeric) AND ("confidence_score" <= (1)::numeric))),
    CONSTRAINT "reviews_platform_check" CHECK (("platform" = ANY (ARRAY['google'::"text", 'facebook'::"text", 'yelp'::"text", 'tripadvisor'::"text", 'trustpilot'::"text", 'manual'::"text"]))),
    CONSTRAINT "reviews_priority_score_check" CHECK ((("priority_score" >= 0) AND ("priority_score" <= 100))),
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_response_source_check" CHECK ((("response_source" IS NULL) OR ("response_source" = ANY (ARRAY['ai'::"text", 'owner_external'::"text", 'manual'::"text"])))),
    CONSTRAINT "reviews_sentiment_label_check" CHECK (("sentiment_label" = ANY (ARRAY['positive'::"text", 'neutral'::"text", 'negative'::"text"]))),
    CONSTRAINT "reviews_sentiment_score_check" CHECK ((("sentiment_score" >= ('-1'::integer)::numeric) AND ("sentiment_score" <= (1)::numeric))),
    CONSTRAINT "reviews_status_check" CHECK (("status" = ANY (ARRAY['new'::"text", 'processing'::"text", 'responded'::"text", 'ignored'::"text", 'flagged'::"text"]))),
    CONSTRAINT "valid_flagged" CHECK (((("is_flagged" = false) AND ("flagged_reason" IS NULL)) OR (("is_flagged" = true) AND ("flagged_reason" IS NOT NULL))))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


COMMENT ON TABLE "public"."reviews" IS 'Customer reviews with strict tenant isolation via RLS policies';



CREATE TABLE IF NOT EXISTS "public"."system_config" (
    "id" integer NOT NULL,
    "key_name" "text" NOT NULL,
    "key_value" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."system_config" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."system_config_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE "public"."system_config_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."system_config_id_seq" OWNED BY "public"."system_config"."id";



CREATE TABLE IF NOT EXISTS "public"."system_health" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "component" "text" NOT NULL,
    "instance_id" "text",
    "region" "text",
    "status" "text" NOT NULL,
    "last_check_at" timestamp with time zone DEFAULT "now"() NOT NULL,
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
    "health_check_data" "jsonb" DEFAULT '{}'::"jsonb",
    "error_message" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_health_status_check" CHECK (("status" = ANY (ARRAY['healthy'::"text", 'degraded'::"text", 'unhealthy'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."system_health" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "category" "text" NOT NULL,
    "log_level" "text" NOT NULL,
    "message" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "user_id" "uuid",
    "session_id" "text",
    "request_id" "text",
    "correlation_id" "uuid",
    "source" "text",
    "environment" "text" DEFAULT 'production'::"text",
    "version" "text",
    "error_code" "text",
    "stack_trace" "text",
    "duration_ms" integer,
    "memory_usage_mb" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "system_logs_log_level_check" CHECK (("log_level" = ANY (ARRAY['debug'::"text", 'info'::"text", 'warn'::"text", 'error'::"text", 'fatal'::"text"])))
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "role" "text" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "invitation_token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    "message" "text",
    "assigned_locations" "uuid"[] DEFAULT '{}'::"uuid"[],
    "permissions" "jsonb" DEFAULT '{}'::"jsonb",
    "status" "text" DEFAULT 'pending'::"text",
    "accepted_at" timestamp with time zone,
    "accepted_by" "uuid",
    "expires_at" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_invitations_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'member'::"text", 'viewer'::"text"]))),
    CONSTRAINT "tenant_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text", 'revoked'::"text"]))),
    CONSTRAINT "valid_expiration" CHECK (("expires_at" > "created_at"))
);


ALTER TABLE "public"."tenant_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text",
    "permissions" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "invited_by" "uuid",
    "invited_at" timestamp with time zone,
    "joined_at" timestamp with time zone DEFAULT "now"(),
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "tenant_users_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'manager'::"text", 'member'::"text", 'viewer'::"text"]))),
    CONSTRAINT "tenant_users_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'suspended'::"text", 'pending'::"text"]))),
    CONSTRAINT "valid_invitation" CHECK ((("invited_by" IS NULL) OR ("invited_at" IS NOT NULL)))
);


ALTER TABLE "public"."tenant_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "subscription_plan" "text" DEFAULT 'trial'::"text" NOT NULL,
    "subscription_status" "text" DEFAULT 'active'::"text" NOT NULL,
    "trial_ends_at" timestamp with time zone,
    "subscription_ends_at" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "business_type" "text",
    "industry" "text",
    "employee_count" "int4range",
    "annual_revenue" "numrange",
    "timezone" "text" DEFAULT 'UTC'::"text",
    "country_code" "text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "features" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "onboarding_completed" boolean DEFAULT false,
    "onboarding_step" "text",
    "onboarding_data" "jsonb" DEFAULT '{}'::"jsonb",
    "monthly_review_limit" integer,
    "monthly_ai_generation_limit" integer,
    "locations_limit" integer DEFAULT 1,
    "team_members_limit" integer DEFAULT 5,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "tenants_subscription_plan_check" CHECK (("subscription_plan" = ANY (ARRAY['trial'::"text", 'starter'::"text", 'professional'::"text", 'enterprise'::"text", 'custom'::"text"]))),
    CONSTRAINT "tenants_subscription_status_check" CHECK (("subscription_status" = ANY (ARRAY['active'::"text", 'past_due'::"text", 'canceled'::"text", 'paused'::"text", 'trial'::"text"]))),
    CONSTRAINT "valid_slug" CHECK (("slug" ~ '^[a-z0-9-]+$'::"text")),
    CONSTRAINT "valid_trial" CHECK ((("subscription_plan" <> 'trial'::"text") OR ("trial_ends_at" IS NOT NULL)))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."upsell_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "promotion_text" "text" NOT NULL,
    "call_to_action" "text" NOT NULL,
    "link_url" "text",
    "offer_code" "text",
    "target_rating_range" "int4range",
    "target_keywords" "text"[],
    "target_sentiment" "text"[],
    "target_platforms" "text"[],
    "variant_name" "text" DEFAULT 'default'::"text",
    "test_group" "text",
    "conversion_goal" "text",
    "impressions" integer DEFAULT 0,
    "clicks" integer DEFAULT 0,
    "conversions" integer DEFAULT 0,
    "conversion_rate" numeric(5,4) GENERATED ALWAYS AS (
CASE
    WHEN ("impressions" = 0) THEN (0)::numeric
    ELSE "round"((("conversions")::numeric / ("impressions")::numeric), 4)
END) STORED,
    "active_from" timestamp with time zone DEFAULT "now"(),
    "active_until" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text",
    "priority" integer DEFAULT 50,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "upsell_items_priority_check" CHECK ((("priority" >= 0) AND ("priority" <= 100))),
    CONSTRAINT "upsell_items_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'draft'::"text", 'expired'::"text"]))),
    CONSTRAINT "valid_active_period" CHECK ((("active_until" IS NULL) OR ("active_until" > "active_from"))),
    CONSTRAINT "valid_test_variant" CHECK (((("test_group" IS NULL) AND ("variant_name" = 'default'::"text")) OR (("test_group" IS NOT NULL) AND ("variant_name" IS NOT NULL))))
);


ALTER TABLE "public"."upsell_items" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_dashboard_overview" WITH ("security_invoker"='true') AS
 SELECT "t"."id" AS "tenant_id",
    "t"."name" AS "tenant_name",
    "count"(DISTINCT "r"."id") AS "total_reviews",
    "count"(DISTINCT
        CASE
            WHEN ("r"."created_at" >= ("now"() - '30 days'::interval)) THEN "r"."id"
            ELSE NULL::"uuid"
        END) AS "recent_reviews",
    "count"(DISTINCT "ai"."id") AS "total_responses",
    "count"(DISTINCT
        CASE
            WHEN ("ai"."status" = 'published'::"text") THEN "ai"."id"
            ELSE NULL::"uuid"
        END) AS "published_responses",
    "avg"("r"."rating") AS "avg_rating"
   FROM (("public"."tenants" "t"
     LEFT JOIN "public"."reviews" "r" ON (("t"."id" = "r"."tenant_id")))
     LEFT JOIN "public"."ai_responses" "ai" ON (("r"."id" = "ai"."review_id")))
  GROUP BY "t"."id", "t"."name";


ALTER TABLE "public"."v_dashboard_overview" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_dashboard_overview" IS 'Dashboard overview metrics - respects user RLS policies';



CREATE OR REPLACE VIEW "public"."v_response_performance" WITH ("security_invoker"='true') AS
 SELECT "t"."id" AS "tenant_id",
    "date_trunc"('day'::"text", "ai"."created_at") AS "date",
    "count"(*) AS "responses_generated",
    "count"(
        CASE
            WHEN ("ai"."status" = 'published'::"text") THEN 1
            ELSE NULL::integer
        END) AS "responses_published",
    "avg"((EXTRACT(epoch FROM ("ai"."published_at" - "ai"."created_at")) / (3600)::numeric)) AS "avg_hours_to_publish",
    "avg"("ai"."confidence_score") AS "avg_confidence_score"
   FROM (("public"."ai_responses" "ai"
     JOIN "public"."reviews" "r" ON (("ai"."review_id" = "r"."id")))
     JOIN "public"."tenants" "t" ON (("r"."tenant_id" = "t"."id")))
  WHERE ("ai"."created_at" >= ("now"() - '90 days'::interval))
  GROUP BY "t"."id", ("date_trunc"('day'::"text", "ai"."created_at"));


ALTER TABLE "public"."v_response_performance" OWNER TO "postgres";


COMMENT ON VIEW "public"."v_response_performance" IS 'Response performance metrics - respects user RLS policies';



CREATE TABLE IF NOT EXISTS "public"."workflow_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "event_source" "text" NOT NULL,
    "event_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "processed" boolean DEFAULT false,
    "processed_at" timestamp with time zone,
    "processing_error" "text",
    "correlation_id" "uuid",
    "causation_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "event_timestamp" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workflow_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "step_name" "text" NOT NULL,
    "step_type" "text" NOT NULL,
    "step_index" integer NOT NULL,
    "status" "text" DEFAULT 'pending'::"text",
    "attempts" integer DEFAULT 0,
    "max_attempts" integer DEFAULT 3,
    "input_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "duration_ms" integer,
    "error_message" "text",
    "error_details" "jsonb",
    "retry_count" integer DEFAULT 0,
    "next_retry_at" timestamp with time zone,
    "compensation_action" "text",
    "compensation_data" "jsonb" DEFAULT '{}'::"jsonb",
    "compensated_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "valid_execution" CHECK (((("started_at" IS NULL) AND ("completed_at" IS NULL)) OR (("started_at" IS NOT NULL) AND (("completed_at" IS NULL) OR ("completed_at" >= "started_at"))))),
    CONSTRAINT "workflow_steps_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'skipped'::"text", 'compensated'::"text"])))
);


ALTER TABLE "public"."workflow_steps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid",
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "version" "text" DEFAULT '1.0.0'::"text",
    "workflow_type" "text" NOT NULL,
    "step_definitions" "jsonb" NOT NULL,
    "default_input" "jsonb" DEFAULT '{}'::"jsonb",
    "timeout_minutes" integer DEFAULT 60,
    "retry_policy" "jsonb" DEFAULT '{"backoff": "exponential", "max_attempts": 3}'::"jsonb",
    "status" "text" DEFAULT 'active'::"text",
    "is_system_template" boolean DEFAULT false,
    "usage_count" integer DEFAULT 0,
    "success_rate" numeric(5,4),
    "avg_duration" interval,
    "created_by" "uuid",
    "last_modified_by" "uuid",
    "tags" "text"[],
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workflow_templates_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'inactive'::"text", 'draft'::"text", 'deprecated'::"text"])))
);


ALTER TABLE "public"."workflow_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "workflow_type" "text" NOT NULL,
    "workflow_name" "text" NOT NULL,
    "correlation_id" "uuid",
    "parent_workflow_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text",
    "current_step" "text",
    "step_index" integer DEFAULT 0,
    "total_steps" integer DEFAULT 0,
    "completed_steps" integer DEFAULT 0,
    "progress_percentage" integer GENERATED ALWAYS AS (
CASE
    WHEN ("total_steps" = 0) THEN 0
    ELSE LEAST(100, (("completed_steps" * 100) / "total_steps"))
END) STORED,
    "input_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "context_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "estimated_completion_at" timestamp with time zone,
    "error_message" "text",
    "error_details" "jsonb",
    "compensation_data" "jsonb" DEFAULT '{}'::"jsonb",
    "depends_on" "uuid"[],
    "blocks" "uuid"[],
    "priority" integer DEFAULT 50,
    "tags" "text"[],
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "retry_count" integer DEFAULT 0,
    CONSTRAINT "valid_execution_times" CHECK (((("started_at" IS NULL) AND ("completed_at" IS NULL)) OR (("started_at" IS NOT NULL) AND (("completed_at" IS NULL) OR ("completed_at" >= "started_at"))))),
    CONSTRAINT "valid_steps" CHECK (("completed_steps" <= "total_steps")),
    CONSTRAINT "workflows_priority_check" CHECK ((("priority" >= 0) AND ("priority" <= 100))),
    CONSTRAINT "workflows_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'compensating'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


ALTER TABLE ONLY "public"."system_config" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."system_config_id_seq"'::"regclass");



ALTER TABLE ONLY "private"."cron_secrets"
    ADD CONSTRAINT "cron_secrets_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."ai_model_config"
    ADD CONSTRAINT "ai_model_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_responses"
    ADD CONSTRAINT "ai_responses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."alert_notifications"
    ADD CONSTRAINT "alert_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."batch_generation_jobs"
    ADD CONSTRAINT "batch_generation_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_usage"
    ADD CONSTRAINT "billing_usage_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."billing_usage"
    ADD CONSTRAINT "billing_usage_tenant_id_billing_period_start_key" UNIQUE ("tenant_id", "billing_period_start");



ALTER TABLE ONLY "public"."business_guidance"
    ADD CONSTRAINT "business_guidance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."context_caches"
    ADD CONSTRAINT "context_caches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cron_job_executions"
    ADD CONSTRAINT "cron_job_executions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_google_place_id_key" UNIQUE ("google_place_id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_tenant_id_key" UNIQUE ("user_id", "tenant_id");



ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_tenant_provider_scope_unique" UNIQUE ("tenant_id", "provider", "provider_scope");



ALTER TABLE ONLY "public"."performance_metrics"
    ADD CONSTRAINT "performance_metrics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_analytics"
    ADD CONSTRAINT "response_analytics_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_analytics"
    ADD CONSTRAINT "response_analytics_tenant_id_location_id_period_start_perio_key" UNIQUE ("tenant_id", "location_id", "period_start", "period_type");



ALTER TABLE ONLY "public"."response_queue"
    ADD CONSTRAINT "response_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_settings"
    ADD CONSTRAINT "response_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_settings"
    ADD CONSTRAINT "response_settings_tenant_id_location_id_key" UNIQUE ("tenant_id", "location_id");



ALTER TABLE ONLY "public"."response_templates"
    ADD CONSTRAINT "response_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."response_templates"
    ADD CONSTRAINT "response_templates_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_platform_platform_review_id_location_id_key" UNIQUE ("platform", "platform_review_id", "location_id");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_key_name_key" UNIQUE ("key_name");



ALTER TABLE ONLY "public"."system_config"
    ADD CONSTRAINT "system_config_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_health"
    ADD CONSTRAINT "system_health_component_instance_id_key" UNIQUE ("component", "instance_id");



ALTER TABLE ONLY "public"."system_health"
    ADD CONSTRAINT "system_health_component_unique" UNIQUE ("component");



ALTER TABLE ONLY "public"."system_health"
    ADD CONSTRAINT "system_health_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_invitations"
    ADD CONSTRAINT "tenant_invitations_invitation_token_key" UNIQUE ("invitation_token");



ALTER TABLE ONLY "public"."tenant_invitations"
    ADD CONSTRAINT "tenant_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_invitations"
    ADD CONSTRAINT "tenant_invitations_tenant_id_email_key" UNIQUE ("tenant_id", "email");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_tenant_id_user_id_key" UNIQUE ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."workflow_templates"
    ADD CONSTRAINT "unique_template_name" UNIQUE ("tenant_id", "name", "version");



ALTER TABLE ONLY "public"."upsell_items"
    ADD CONSTRAINT "upsell_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_events"
    ADD CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_workflow_id_step_index_key" UNIQUE ("workflow_id", "step_index");



ALTER TABLE ONLY "public"."workflow_templates"
    ADD CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "ai_responses_unique_active_per_review" ON "public"."ai_responses" USING "btree" ("review_id", "tenant_id") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_ai_model_config_tenant" ON "public"."ai_model_config" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_responses_review_id" ON "public"."ai_responses" USING "btree" ("review_id");



CREATE INDEX "idx_ai_responses_review_status_active" ON "public"."ai_responses" USING "btree" ("review_id", "status", "created_at") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_ai_responses_tenant" ON "public"."ai_responses" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_responses_tenant_id" ON "public"."ai_responses" USING "btree" ("tenant_id");



CREATE INDEX "idx_ai_responses_tenant_status" ON "public"."ai_responses" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_alert_notifications_tenant" ON "public"."alert_notifications" USING "btree" ("tenant_id");



CREATE INDEX "idx_context_caches_expires" ON "public"."context_caches" USING "btree" ("expires_at");



CREATE INDEX "idx_context_caches_tenant_hash" ON "public"."context_caches" USING "btree" ("tenant_id", "context_hash");



CREATE INDEX "idx_context_caches_usage" ON "public"."context_caches" USING "btree" ("usage_count" DESC);



CREATE INDEX "idx_cron_job_executions_job_name_started" ON "public"."cron_job_executions" USING "btree" ("job_name", "started_at" DESC);



CREATE INDEX "idx_locations_oauth_token_id" ON "public"."locations" USING "btree" ("oauth_token_id") WHERE ("oauth_token_id" IS NOT NULL);



CREATE INDEX "idx_locations_provider_tokens" ON "public"."locations" USING "btree" ("tenant_id", "oauth_token_id") WHERE (("oauth_token_id" IS NOT NULL) AND ("status" = 'active'::"text"));



CREATE INDEX "idx_locations_tenant" ON "public"."locations" USING "btree" ("tenant_id");



CREATE INDEX "idx_locations_tenant_id" ON "public"."locations" USING "btree" ("tenant_id");



CREATE INDEX "idx_notification_preferences_user" ON "public"."notification_preferences" USING "btree" ("user_id");



CREATE INDEX "idx_oauth_tokens_expires_at" ON "public"."oauth_tokens" USING "btree" ("expires_at", "status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_oauth_tokens_provider" ON "public"."oauth_tokens" USING "btree" ("provider", "status");



CREATE INDEX "idx_oauth_tokens_refresh_check" ON "public"."oauth_tokens" USING "btree" ("provider", "provider_scope", "status", "expires_at", "last_refresh_at") WHERE (("provider" = 'google'::"text") AND ("status" = 'active'::"text"));



CREATE INDEX "idx_oauth_tokens_refresh_needed" ON "public"."oauth_tokens" USING "btree" ("expires_at", "refresh_attempts") WHERE (("status" = 'active'::"text") AND ("encrypted_refresh_token" IS NOT NULL));



CREATE INDEX "idx_oauth_tokens_tenant_id" ON "public"."oauth_tokens" USING "btree" ("tenant_id");



CREATE INDEX "idx_oauth_tokens_user_id" ON "public"."oauth_tokens" USING "btree" ("user_id") WHERE ("user_id" IS NOT NULL);



CREATE INDEX "idx_response_queue_failed_cleanup" ON "public"."response_queue" USING "btree" ("status", "updated_at") WHERE ("status" = 'failed'::"text");



CREATE INDEX "idx_response_queue_processing" ON "public"."response_queue" USING "btree" ("status", "scheduled_for", "priority" DESC) WHERE ("status" = ANY (ARRAY['pending'::"text", 'processing'::"text"]));



CREATE INDEX "idx_response_queue_response_id" ON "public"."response_queue" USING "btree" ("response_id");



CREATE INDEX "idx_response_queue_retry_logic" ON "public"."response_queue" USING "btree" ("status", "attempt_count", "max_attempts", "last_platform_request_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_response_queue_tenant_status" ON "public"."response_queue" USING "btree" ("tenant_id", "status");



CREATE INDEX "idx_reviews_edited" ON "public"."reviews" USING "btree" ("tenant_id", "is_review_edited", "review_updated_at") WHERE (("deleted_at" IS NULL) AND ("is_review_edited" = true));



CREATE INDEX "idx_reviews_has_owner_reply" ON "public"."reviews" USING "btree" ("tenant_id", "has_owner_reply", "needs_response", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_reviews_needs_response" ON "public"."reviews" USING "btree" ("tenant_id", "created_at") WHERE (("needs_response" = true) AND ("status" = 'new'::"text") AND ("deleted_at" IS NULL));



CREATE INDEX "idx_reviews_response_source" ON "public"."reviews" USING "btree" ("tenant_id", "response_source", "status") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_reviews_reviewer_anonymous" ON "public"."reviews" USING "btree" ("tenant_id", "reviewer_is_anonymous", "rating") WHERE ("deleted_at" IS NULL);



CREATE INDEX "idx_reviews_tenant" ON "public"."reviews" USING "btree" ("tenant_id");



CREATE INDEX "idx_reviews_tenant_date" ON "public"."reviews" USING "btree" ("tenant_id", "review_date" DESC);



CREATE INDEX "idx_reviews_tenant_id" ON "public"."reviews" USING "btree" ("tenant_id");



CREATE INDEX "idx_system_logs_cron" ON "public"."system_logs" USING "btree" ("category", "created_at", "log_level") WHERE ("category" = 'cron_job'::"text");



CREATE INDEX "idx_tenant_users_tenant_role" ON "public"."tenant_users" USING "btree" ("tenant_id", "role") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_tenant_users_user_status" ON "public"."tenant_users" USING "btree" ("user_id", "status") WHERE ("status" = 'active'::"text");



CREATE INDEX "idx_workflows_pending" ON "public"."workflows" USING "btree" ("status", "priority" DESC, "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'running'::"text"]));



CREATE INDEX "idx_workflows_retry_count" ON "public"."workflows" USING "btree" ("retry_count");



CREATE INDEX "idx_workflows_review_processing_active" ON "public"."workflows" USING "btree" ((("context_data" ->> 'reviewId'::"text")), "workflow_type", "status") WHERE (("workflow_type" = 'review_processing'::"text") AND ("status" = ANY (ARRAY['pending'::"text", 'running'::"text"])));



CREATE INDEX "idx_workflows_status_priority" ON "public"."workflows" USING "btree" ("status", "priority" DESC, "created_at") WHERE ("status" = ANY (ARRAY['pending'::"text", 'running'::"text"]));



CREATE INDEX "idx_workflows_tenant" ON "public"."workflows" USING "btree" ("tenant_id");



CREATE OR REPLACE TRIGGER "oauth_tokens_updated_at_trigger" BEFORE UPDATE ON "public"."oauth_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."update_oauth_tokens_updated_at"();



ALTER TABLE ONLY "public"."ai_model_config"
    ADD CONSTRAINT "ai_model_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_responses"
    ADD CONSTRAINT "ai_responses_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_responses"
    ADD CONSTRAINT "ai_responses_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_responses"
    ADD CONSTRAINT "ai_responses_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."ai_responses"
    ADD CONSTRAINT "ai_responses_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_responses"
    ADD CONSTRAINT "ai_responses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."alert_notifications"
    ADD CONSTRAINT "alert_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."batch_generation_jobs"
    ADD CONSTRAINT "batch_generation_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."batch_generation_jobs"
    ADD CONSTRAINT "batch_generation_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."response_templates"("id");



ALTER TABLE ONLY "public"."batch_generation_jobs"
    ADD CONSTRAINT "batch_generation_jobs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."billing_usage"
    ADD CONSTRAINT "billing_usage_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."business_guidance"
    ADD CONSTRAINT "business_guidance_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_responses"
    ADD CONSTRAINT "fk_ai_responses_template_id" FOREIGN KEY ("template_id") REFERENCES "public"."response_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_oauth_token_id_fkey" FOREIGN KEY ("oauth_token_id") REFERENCES "public"."oauth_tokens"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notification_preferences"
    ADD CONSTRAINT "notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."oauth_tokens"
    ADD CONSTRAINT "oauth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."performance_metrics"
    ADD CONSTRAINT "performance_metrics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_analytics"
    ADD CONSTRAINT "response_analytics_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_analytics"
    ADD CONSTRAINT "response_analytics_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_queue"
    ADD CONSTRAINT "response_queue_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_queue"
    ADD CONSTRAINT "response_queue_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "public"."ai_responses"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_queue"
    ADD CONSTRAINT "response_queue_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_settings"
    ADD CONSTRAINT "response_settings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_settings"
    ADD CONSTRAINT "response_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."response_templates"
    ADD CONSTRAINT "response_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."response_templates"
    ADD CONSTRAINT "response_templates_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."response_templates"
    ADD CONSTRAINT "response_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tenant_invitations"
    ADD CONSTRAINT "tenant_invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tenant_invitations"
    ADD CONSTRAINT "tenant_invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tenant_invitations"
    ADD CONSTRAINT "tenant_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_users"
    ADD CONSTRAINT "tenant_users_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."upsell_items"
    ADD CONSTRAINT "upsell_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_events"
    ADD CONSTRAINT "workflow_events_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_templates"
    ADD CONSTRAINT "workflow_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workflow_templates"
    ADD CONSTRAINT "workflow_templates_last_modified_by_fkey" FOREIGN KEY ("last_modified_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workflow_templates"
    ADD CONSTRAINT "workflow_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_parent_workflow_id_fkey" FOREIGN KEY ("parent_workflow_id") REFERENCES "public"."workflows"("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE "private"."cron_secrets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admins_delete_locations" ON "public"."locations" FOR DELETE TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "admins_manage_business_guidance" ON "public"."business_guidance" TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "admins_manage_invitations" ON "public"."tenant_invitations" TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "admins_manage_members" ON "public"."tenant_users" TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "admins_manage_notifications" ON "public"."alert_notifications" TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "admins_manage_response_settings" ON "public"."response_settings" TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "admins_manage_upsell_items" ON "public"."upsell_items" TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "admins_manage_workflow_templates" ON "public"."workflow_templates" TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "admins_view_audit_logs" ON "public"."audit_logs" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role")));



ALTER TABLE "public"."ai_model_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_responses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."alert_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."batch_generation_jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."billing_usage" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."business_guidance" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."context_caches" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cron_job_executions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cron_jobs_service_only" ON "public"."cron_job_executions" AS RESTRICTIVE TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "members_manage_batch_jobs" ON "public"."batch_generation_jobs" TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "members_manage_locations" ON "public"."locations" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "members_manage_templates" ON "public"."response_templates" TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "members_manage_workflows" ON "public"."workflows" FOR INSERT TO "authenticated" WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "members_update_locations" ON "public"."locations" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "members_update_workflows" ON "public"."workflows" FOR UPDATE TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text", 'member'::"text"]) AS "user_has_tenant_role")));



ALTER TABLE "public"."notification_preferences" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."oauth_tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "owners_only_billing" ON "public"."billing_usage" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text"]) AS "user_has_tenant_role")));



CREATE POLICY "owners_update_tenants" ON "public"."tenants" FOR UPDATE TO "authenticated" USING (("id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text"]) AS "user_has_tenant_role"))) WITH CHECK (("id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text"]) AS "user_has_tenant_role")));



ALTER TABLE "public"."performance_metrics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."response_analytics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."response_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."response_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."response_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_role_analytics_all" ON "public"."response_analytics" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_audit_all" ON "public"."audit_logs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_batch_jobs_all" ON "public"."batch_generation_jobs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_billing_all" ON "public"."billing_usage" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_business_guidance_all" ON "public"."business_guidance" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_context_caches_all" ON "public"."context_caches" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_invitations_all" ON "public"."tenant_invitations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_locations_all" ON "public"."locations" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_metrics_all" ON "public"."performance_metrics" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_notification_prefs_all" ON "public"."notification_preferences" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_notifications_all" ON "public"."alert_notifications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_profiles_all" ON "public"."profiles" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_response_settings_all" ON "public"."response_settings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_response_templates_all" ON "public"."response_templates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_templates_all" ON "public"."workflow_templates" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_tenant_users_all" ON "public"."tenant_users" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_tenants_all" ON "public"."tenants" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_upsell_all" ON "public"."upsell_items" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_workflow_events_all" ON "public"."workflow_events" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_workflow_steps_all" ON "public"."workflow_steps" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_workflows_all" ON "public"."workflows" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."system_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_health" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_health_service_only" ON "public"."system_health" AS RESTRICTIVE TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "system_logs_service_only" ON "public"."system_logs" AS RESTRICTIVE TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."tenant_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_view_analytics" ON "public"."response_analytics" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_batch_jobs" ON "public"."batch_generation_jobs" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_business_guidance" ON "public"."business_guidance" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_context_caches" ON "public"."context_caches" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_locations" ON "public"."locations" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_metrics" ON "public"."performance_metrics" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_notifications" ON "public"."alert_notifications" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_response_settings" ON "public"."response_settings" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_templates" ON "public"."response_templates" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_upsell_items" ON "public"."upsell_items" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "tenants_view_workflow_events" ON "public"."workflow_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workflows" "w"
  WHERE (("w"."id" = "workflow_events"."workflow_id") AND ("w"."tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants"))))));



CREATE POLICY "tenants_view_workflow_steps" ON "public"."workflow_steps" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workflows" "w"
  WHERE (("w"."id" = "workflow_steps"."workflow_id") AND ("w"."tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants"))))));



CREATE POLICY "tenants_view_workflows" ON "public"."workflows" FOR SELECT TO "authenticated" USING (("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



ALTER TABLE "public"."upsell_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_insert_own_profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users_manage_own_notification_prefs" ON "public"."notification_preferences" TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users_update_own_profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users_view_own_invitations" ON "public"."tenant_invitations" FOR SELECT TO "authenticated" USING ((("email" = (( SELECT "users"."email"
   FROM "auth"."users"
  WHERE ("users"."id" = "auth"."uid"())))::"text") OR ("tenant_id" IN ( SELECT "private"."user_has_tenant_role"(ARRAY['owner'::"text", 'admin'::"text"]) AS "user_has_tenant_role"))));



CREATE POLICY "users_view_own_profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "users_view_own_tenants" ON "public"."tenants" FOR SELECT TO "authenticated" USING (("id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")));



CREATE POLICY "users_view_tenant_members" ON "public"."tenant_users" FOR SELECT TO "authenticated" USING ("private"."is_tenant_member"("tenant_id"));



CREATE POLICY "users_view_workflow_templates" ON "public"."workflow_templates" FOR SELECT TO "authenticated" USING ((("tenant_id" IN ( SELECT "private"."get_user_active_tenants"() AS "get_user_active_tenants")) OR ("tenant_id" IS NULL)));



ALTER TABLE "public"."workflow_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_steps" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_out"("public"."gtrgm") TO "service_role";























































































































































































































































































































































































GRANT ALL ON FUNCTION "private"."get_user_active_tenants"() TO "authenticated";



GRANT ALL ON FUNCTION "private"."is_tenant_member"("check_tenant_id" "uuid") TO "authenticated";



GRANT ALL ON FUNCTION "private"."user_has_tenant_role"("allowed_roles" "text"[]) TO "authenticated";



GRANT ALL ON FUNCTION "public"."acknowledge_alert"("alert_id" "uuid", "acknowledged_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."acknowledge_alert"("alert_id" "uuid", "acknowledged_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."acknowledge_alert"("alert_id" "uuid", "acknowledged_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_approved_responses_to_queue"("tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_approved_responses_to_queue"("tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_approved_responses_to_queue"("tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_selected_responses_to_queue"("tenant_id" "uuid", "response_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."add_selected_responses_to_queue"("tenant_id" "uuid", "response_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_selected_responses_to_queue"("tenant_id" "uuid", "response_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_onboarding_step"("p_organization_id" "uuid", "p_completed_step" "text", "p_event_data" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."advance_onboarding_step"("p_organization_id" "uuid", "p_completed_step" "text", "p_event_data" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_onboarding_step"("p_organization_id" "uuid", "p_completed_step" "text", "p_event_data" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_workflow"("p_execution_id" "uuid", "p_result_context" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."advance_workflow"("p_execution_id" "uuid", "p_result_context" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_workflow"("p_execution_id" "uuid", "p_result_context" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."api_start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_context" "jsonb", "p_priority" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."api_start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_context" "jsonb", "p_priority" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."api_start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_context" "jsonb", "p_priority" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_trigger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."build_gmb_path"("location_id" "text", "account_id" "text", "resource_type" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."build_gmb_path"("location_id" "text", "account_id" "text", "resource_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."build_gmb_path"("location_id" "text", "account_id" "text", "resource_type" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."call_edge_function"("p_function_name" "text", "p_payload" "jsonb", "p_timeout_ms" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."call_edge_function"("p_function_name" "text", "p_payload" "jsonb", "p_timeout_ms" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."call_edge_function"("p_function_name" "text", "p_payload" "jsonb", "p_timeout_ms" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_auto_sync_circuit_breaker"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_auto_sync_circuit_breaker"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_auto_sync_circuit_breaker"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_auto_sync_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_auto_sync_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_auto_sync_health"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_cron_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_cron_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_cron_health"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_queue_alerts"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_queue_alerts"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_queue_alerts"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_queue_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_queue_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_queue_health"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_system_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_system_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_system_health"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_expired_context_caches"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_expired_context_caches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_expired_context_caches"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_legacy_response_queue"() TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_legacy_response_queue"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_legacy_response_queue"() TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_old_unread_messages"("p_queue_name" "text", "p_max_age_minutes" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."clear_old_unread_messages"("p_queue_name" "text", "p_max_age_minutes" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_old_unread_messages"("p_queue_name" "text", "p_max_age_minutes" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."clear_stuck_queue_messages"("p_queue_name" "text", "p_max_age_minutes" integer, "p_max_retries" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."clear_stuck_queue_messages"("p_queue_name" "text", "p_max_age_minutes" integer, "p_max_retries" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_stuck_queue_messages"("p_queue_name" "text", "p_max_age_minutes" integer, "p_max_retries" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."count_unqueued_approved_responses"() TO "anon";
GRANT ALL ON FUNCTION "public"."count_unqueued_approved_responses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."count_unqueued_approved_responses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."detect_poison_message"("p_queue_name" "text", "p_message" "jsonb", "p_error" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."detect_poison_message"("p_queue_name" "text", "p_message" "jsonb", "p_error" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."detect_poison_message"("p_queue_name" "text", "p_message" "jsonb", "p_error" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."disable_v2_cron_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."disable_v2_cron_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."disable_v2_cron_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enable_v2_cron_jobs"() TO "anon";
GRANT ALL ON FUNCTION "public"."enable_v2_cron_jobs"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enable_v2_cron_jobs"() TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_alert_rules"() TO "anon";
GRANT ALL ON FUNCTION "public"."execute_alert_rules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_alert_rules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."execute_synthetic_test"("p_test_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."execute_synthetic_test"("p_test_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."execute_synthetic_test"("p_test_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."extract_location_id"("full_path" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."extract_location_id"("full_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."extract_location_id"("full_path" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."fail_workflow_step"("p_execution_id" "uuid", "p_error_details" "jsonb", "p_should_retry" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."fail_workflow_step"("p_execution_id" "uuid", "p_error_details" "jsonb", "p_should_retry" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fail_workflow_step"("p_execution_id" "uuid", "p_error_details" "jsonb", "p_should_retry" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_ai_response_direct"("p_workflow_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_ai_response_direct"("p_workflow_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_ai_response_direct"("p_workflow_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_active_oauth_token"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_active_oauth_token"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_active_oauth_token"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_cron_secret"("secret_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_cron_secret"("secret_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_cron_secret"("secret_key" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_effective_ai_config"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_effective_ai_config"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_effective_ai_config"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_failed_workflows_for_recovery"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_failed_workflows_for_recovery"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_failed_workflows_for_recovery"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_locations_for_oauth_token"("p_token_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_locations_for_oauth_token"("p_token_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_locations_for_oauth_token"("p_token_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_message_fair"("p_queue_name" "text", "p_batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_message_fair"("p_queue_name" "text", "p_batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_message_fair"("p_queue_name" "text", "p_batch_size" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_queue_item"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_queue_item"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_queue_item"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_next_response_to_process"("tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_next_response_to_process"("tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_next_response_to_process"("tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_oauth_token_for_refresh"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_oauth_token_for_refresh"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_oauth_token_for_refresh"("p_tenant_id" "uuid", "p_provider" "text", "p_scope" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_onboarding_progress"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_onboarding_progress"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_onboarding_progress"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_prioritized_sync_candidates"("max_candidates" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_prioritized_sync_candidates"("max_candidates" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_prioritized_sync_candidates"("max_candidates" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_queue_processor_mapping"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_queue_processor_mapping"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_queue_processor_mapping"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_review_ui_status"("review_status" "text", "has_ai_response" boolean, "ai_response_status" "text", "queue_status" "text", "response_source" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_review_ui_status"("review_status" "text", "has_ai_response" boolean, "ai_response_status" "text", "queue_status" "text", "response_source" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_review_ui_status"("review_status" "text", "has_ai_response" boolean, "ai_response_status" "text", "queue_status" "text", "response_source" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_service_role_key"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_service_role_key"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_service_role_key"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_synthetic_test_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_synthetic_test_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_synthetic_test_health"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_system_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_system_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_health"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_system_health_check"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_system_health_check"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_system_health_check"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenant_batch"("batch_size" integer, "batch_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenant_batch"("batch_size" integer, "batch_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenant_batch"("batch_size" integer, "batch_offset" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."get_tenants_needing_token_refresh"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_tenants_needing_token_refresh"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_tenants_needing_token_refresh"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_active_tenant_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_active_tenant_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_active_tenant_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_tenant_ids"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tenant_ids"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tenant_ids"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_tenant_role"("user_id" "uuid", "tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tenant_role"("user_id" "uuid", "tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tenant_role"("user_id" "uuid", "tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_tenant_with_role"("allowed_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_tenant_with_role"("allowed_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_tenant_with_role"("allowed_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_btree_consistent"("internal", smallint, "anyelement", integer, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_btree_consistent"("internal", smallint, "anyelement", integer, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_btree_consistent"("internal", smallint, "anyelement", integer, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_btree_consistent"("internal", smallint, "anyelement", integer, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_anyenum"("anyenum", "anyenum", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_anyenum"("anyenum", "anyenum", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_anyenum"("anyenum", "anyenum", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_anyenum"("anyenum", "anyenum", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bit"(bit, bit, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bit"(bit, bit, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bit"(bit, bit, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bit"(bit, bit, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bool"(boolean, boolean, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bool"(boolean, boolean, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bool"(boolean, boolean, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bool"(boolean, boolean, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bpchar"(character, character, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bpchar"(character, character, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bpchar"(character, character, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bpchar"(character, character, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bytea"("bytea", "bytea", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bytea"("bytea", "bytea", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bytea"("bytea", "bytea", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_bytea"("bytea", "bytea", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_char"("char", "char", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_char"("char", "char", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_char"("char", "char", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_char"("char", "char", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_cidr"("cidr", "cidr", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_cidr"("cidr", "cidr", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_cidr"("cidr", "cidr", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_cidr"("cidr", "cidr", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_date"("date", "date", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_date"("date", "date", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_date"("date", "date", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_date"("date", "date", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_float4"(real, real, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_float4"(real, real, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_float4"(real, real, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_float4"(real, real, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_float8"(double precision, double precision, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_float8"(double precision, double precision, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_float8"(double precision, double precision, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_float8"(double precision, double precision, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_inet"("inet", "inet", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_inet"("inet", "inet", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_inet"("inet", "inet", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_inet"("inet", "inet", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int2"(smallint, smallint, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int2"(smallint, smallint, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int2"(smallint, smallint, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int2"(smallint, smallint, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int4"(integer, integer, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int4"(integer, integer, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int4"(integer, integer, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int4"(integer, integer, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int8"(bigint, bigint, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int8"(bigint, bigint, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int8"(bigint, bigint, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_int8"(bigint, bigint, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_interval"(interval, interval, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_interval"(interval, interval, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_interval"(interval, interval, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_interval"(interval, interval, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_macaddr"("macaddr", "macaddr", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_macaddr"("macaddr", "macaddr", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_macaddr"("macaddr", "macaddr", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_macaddr"("macaddr", "macaddr", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_macaddr8"("macaddr8", "macaddr8", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_macaddr8"("macaddr8", "macaddr8", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_macaddr8"("macaddr8", "macaddr8", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_macaddr8"("macaddr8", "macaddr8", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_money"("money", "money", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_money"("money", "money", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_money"("money", "money", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_money"("money", "money", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_name"("name", "name", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_name"("name", "name", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_name"("name", "name", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_name"("name", "name", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_numeric"(numeric, numeric, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_numeric"(numeric, numeric, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_numeric"(numeric, numeric, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_numeric"(numeric, numeric, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_oid"("oid", "oid", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_oid"("oid", "oid", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_oid"("oid", "oid", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_oid"("oid", "oid", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_text"("text", "text", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_text"("text", "text", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_text"("text", "text", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_text"("text", "text", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_time"(time without time zone, time without time zone, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_time"(time without time zone, time without time zone, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_time"(time without time zone, time without time zone, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_time"(time without time zone, time without time zone, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timestamp"(timestamp without time zone, timestamp without time zone, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timestamp"(timestamp without time zone, timestamp without time zone, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timestamp"(timestamp without time zone, timestamp without time zone, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timestamp"(timestamp without time zone, timestamp without time zone, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timestamptz"(timestamp with time zone, timestamp with time zone, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timestamptz"(timestamp with time zone, timestamp with time zone, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timestamptz"(timestamp with time zone, timestamp with time zone, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timestamptz"(timestamp with time zone, timestamp with time zone, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timetz"(time with time zone, time with time zone, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timetz"(time with time zone, time with time zone, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timetz"(time with time zone, time with time zone, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_timetz"(time with time zone, time with time zone, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_uuid"("uuid", "uuid", smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_uuid"("uuid", "uuid", smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_uuid"("uuid", "uuid", smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_uuid"("uuid", "uuid", smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_compare_prefix_varbit"(bit varying, bit varying, smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_varbit"(bit varying, bit varying, smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_varbit"(bit varying, bit varying, smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_compare_prefix_varbit"(bit varying, bit varying, smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_enum_cmp"("anyenum", "anyenum") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_enum_cmp"("anyenum", "anyenum") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_enum_cmp"("anyenum", "anyenum") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_enum_cmp"("anyenum", "anyenum") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_anyenum"("anyenum", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_anyenum"("anyenum", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_anyenum"("anyenum", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_anyenum"("anyenum", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_bit"(bit, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bit"(bit, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bit"(bit, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bit"(bit, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_bool"(boolean, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bool"(boolean, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bool"(boolean, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bool"(boolean, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_bpchar"(character, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bpchar"(character, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bpchar"(character, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bpchar"(character, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_bytea"("bytea", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bytea"("bytea", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bytea"("bytea", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_bytea"("bytea", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_char"("char", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_char"("char", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_char"("char", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_char"("char", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_cidr"("cidr", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_cidr"("cidr", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_cidr"("cidr", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_cidr"("cidr", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_date"("date", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_date"("date", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_date"("date", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_date"("date", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_float4"(real, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_float4"(real, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_float4"(real, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_float4"(real, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_float8"(double precision, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_float8"(double precision, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_float8"(double precision, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_float8"(double precision, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_inet"("inet", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_inet"("inet", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_inet"("inet", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_inet"("inet", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_int2"(smallint, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_int2"(smallint, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_int2"(smallint, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_int2"(smallint, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_int4"(integer, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_int4"(integer, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_int4"(integer, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_int4"(integer, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_int8"(bigint, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_int8"(bigint, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_int8"(bigint, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_int8"(bigint, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_interval"(interval, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_interval"(interval, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_interval"(interval, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_interval"(interval, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_macaddr"("macaddr", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_macaddr"("macaddr", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_macaddr"("macaddr", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_macaddr"("macaddr", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_macaddr8"("macaddr8", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_macaddr8"("macaddr8", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_macaddr8"("macaddr8", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_macaddr8"("macaddr8", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_money"("money", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_money"("money", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_money"("money", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_money"("money", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_name"("name", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_name"("name", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_name"("name", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_name"("name", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_numeric"(numeric, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_numeric"(numeric, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_numeric"(numeric, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_numeric"(numeric, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_oid"("oid", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_oid"("oid", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_oid"("oid", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_oid"("oid", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_text"("text", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_text"("text", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_text"("text", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_text"("text", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_time"(time without time zone, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_time"(time without time zone, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_time"(time without time zone, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_time"(time without time zone, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_timestamp"(timestamp without time zone, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_timestamp"(timestamp without time zone, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_timestamp"(timestamp without time zone, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_timestamp"(timestamp without time zone, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_timestamptz"(timestamp with time zone, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_timestamptz"(timestamp with time zone, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_timestamptz"(timestamp with time zone, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_timestamptz"(timestamp with time zone, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_timetz"(time with time zone, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_timetz"(time with time zone, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_timetz"(time with time zone, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_timetz"(time with time zone, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_trgm"("text", "internal", smallint, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_uuid"("uuid", "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_uuid"("uuid", "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_uuid"("uuid", "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_uuid"("uuid", "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_query_varbit"(bit varying, "internal", smallint, "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_query_varbit"(bit varying, "internal", smallint, "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_query_varbit"(bit varying, "internal", smallint, "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_query_varbit"(bit varying, "internal", smallint, "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_anyenum"("anyenum", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_anyenum"("anyenum", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_anyenum"("anyenum", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_anyenum"("anyenum", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_bit"(bit, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bit"(bit, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bit"(bit, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bit"(bit, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_bool"(boolean, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bool"(boolean, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bool"(boolean, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bool"(boolean, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_bpchar"(character, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bpchar"(character, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bpchar"(character, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bpchar"(character, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_bytea"("bytea", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bytea"("bytea", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bytea"("bytea", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_bytea"("bytea", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_char"("char", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_char"("char", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_char"("char", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_char"("char", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_cidr"("cidr", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_cidr"("cidr", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_cidr"("cidr", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_cidr"("cidr", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_date"("date", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_date"("date", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_date"("date", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_date"("date", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_float4"(real, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_float4"(real, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_float4"(real, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_float4"(real, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_float8"(double precision, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_float8"(double precision, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_float8"(double precision, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_float8"(double precision, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_inet"("inet", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_inet"("inet", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_inet"("inet", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_inet"("inet", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_int2"(smallint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_int2"(smallint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_int2"(smallint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_int2"(smallint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_int4"(integer, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_int4"(integer, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_int4"(integer, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_int4"(integer, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_int8"(bigint, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_int8"(bigint, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_int8"(bigint, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_int8"(bigint, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_interval"(interval, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_interval"(interval, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_interval"(interval, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_interval"(interval, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_macaddr"("macaddr", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_macaddr"("macaddr", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_macaddr"("macaddr", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_macaddr"("macaddr", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_macaddr8"("macaddr8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_macaddr8"("macaddr8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_macaddr8"("macaddr8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_macaddr8"("macaddr8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_money"("money", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_money"("money", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_money"("money", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_money"("money", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_name"("name", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_name"("name", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_name"("name", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_name"("name", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_numeric"(numeric, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_numeric"(numeric, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_numeric"(numeric, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_numeric"(numeric, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_oid"("oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_oid"("oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_oid"("oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_oid"("oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_text"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_text"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_text"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_text"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_time"(time without time zone, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_time"(time without time zone, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_time"(time without time zone, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_time"(time without time zone, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_timestamp"(timestamp without time zone, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_timestamp"(timestamp without time zone, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_timestamp"(timestamp without time zone, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_timestamp"(timestamp without time zone, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_timestamptz"(timestamp with time zone, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_timestamptz"(timestamp with time zone, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_timestamptz"(timestamp with time zone, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_timestamptz"(timestamp with time zone, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_timetz"(time with time zone, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_timetz"(time with time zone, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_timetz"(time with time zone, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_timetz"(time with time zone, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_trgm"("text", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_uuid"("uuid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_uuid"("uuid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_uuid"("uuid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_uuid"("uuid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_extract_value_varbit"(bit varying, "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_extract_value_varbit"(bit varying, "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_extract_value_varbit"(bit varying, "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_extract_value_varbit"(bit varying, "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_numeric_cmp"(numeric, numeric) TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_numeric_cmp"(numeric, numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."gin_numeric_cmp"(numeric, numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_numeric_cmp"(numeric, numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_consistent"("internal", smallint, "text", integer, "internal", "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gin_trgm_triconsistent"("internal", smallint, "text", integer, "internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_distance"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_options"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_same"("public"."gtrgm", "public"."gtrgm", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gtrgm_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_active_oauth_token"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."has_active_oauth_token"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_active_oauth_token"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_tenant_admin"("user_id" "uuid", "tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tenant_admin"("user_id" "uuid", "tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tenant_admin"("user_id" "uuid", "tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."link_location_to_oauth_token"("p_location_id" "uuid", "p_token_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."link_location_to_oauth_token"("p_location_id" "uuid", "p_token_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."link_location_to_oauth_token"("p_location_id" "uuid", "p_token_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."location_has_oauth_token"("p_location_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."location_has_oauth_token"("p_location_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."location_has_oauth_token"("p_location_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_cron_execution"("p_job_name" "text", "p_status" "text", "p_error_details" "jsonb", "p_metadata" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_cron_execution"("p_job_name" "text", "p_status" "text", "p_error_details" "jsonb", "p_metadata" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_cron_execution"("p_job_name" "text", "p_status" "text", "p_error_details" "jsonb", "p_metadata" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."mark_oauth_token_used"("p_token_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."mark_oauth_token_used"("p_token_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."mark_oauth_token_used"("p_token_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_all_google_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_all_google_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_all_google_tokens"() TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_tenant_google_tokens"("p_tenant_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_tenant_google_tokens"("p_tenant_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_tenant_google_tokens"("p_tenant_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."move_to_dead_letter_queue"("p_execution_id" "uuid", "p_error_details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."move_to_dead_letter_queue"("p_execution_id" "uuid", "p_error_details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."move_to_dead_letter_queue"("p_execution_id" "uuid", "p_error_details" "jsonb") TO "service_role";




































GRANT ALL ON FUNCTION "public"."process_ai_workflows_batch"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_ai_workflows_batch"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_ai_workflows_batch"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_pending_workflows"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_pending_workflows"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_pending_workflows"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_pending_workflows_simple"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_pending_workflows_simple"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_pending_workflows_simple"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_stuck_workflows"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_stuck_workflows"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_stuck_workflows"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_workflows_flexible"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_workflows_flexible"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_workflows_flexible"() TO "service_role";



GRANT ALL ON FUNCTION "public"."process_workflows_with_logging"() TO "anon";
GRANT ALL ON FUNCTION "public"."process_workflows_with_logging"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_workflows_with_logging"() TO "service_role";



GRANT ALL ON FUNCTION "public"."quarantine_message"("p_queue_name" "text", "p_message_id" bigint, "p_message" "jsonb", "p_error_details" "jsonb", "p_poison_signature" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."quarantine_message"("p_queue_name" "text", "p_message_id" bigint, "p_message" "jsonb", "p_error_details" "jsonb", "p_poison_signature" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."quarantine_message"("p_queue_name" "text", "p_message_id" bigint, "p_message" "jsonb", "p_error_details" "jsonb", "p_poison_signature" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."queue_missing_approved_responses"() TO "anon";
GRANT ALL ON FUNCTION "public"."queue_missing_approved_responses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."queue_missing_approved_responses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_performance_metric"("p_metric_type" "text", "p_organization_id" "uuid", "p_measurement_name" "text", "p_measurement_value" numeric, "p_measurement_unit" "text", "p_labels" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."record_performance_metric"("p_metric_type" "text", "p_organization_id" "uuid", "p_measurement_name" "text", "p_measurement_value" numeric, "p_measurement_unit" "text", "p_labels" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_performance_metric"("p_metric_type" "text", "p_organization_id" "uuid", "p_measurement_name" "text", "p_measurement_value" numeric, "p_measurement_unit" "text", "p_labels" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_queue_metric"("p_organization_id" "uuid", "p_queue_name" "text", "p_metric_type" "text", "p_processing_time_ms" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_oauth_tokens_manually"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_oauth_tokens_manually"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_oauth_tokens_manually"() TO "service_role";



GRANT ALL ON FUNCTION "public"."refresh_workflow_dashboard"() TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_workflow_dashboard"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_workflow_dashboard"() TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_google_token_columns_safely"() TO "anon";
GRANT ALL ON FUNCTION "public"."remove_google_token_columns_safely"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_google_token_columns_safely"() TO "service_role";



GRANT ALL ON FUNCTION "public"."requeue_from_dead_letter"("p_execution_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."requeue_from_dead_letter"("p_execution_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."requeue_from_dead_letter"("p_execution_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_stuck_workflows"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_stuck_workflows"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_stuck_workflows"() TO "service_role";



GRANT ALL ON FUNCTION "public"."resolve_alert"("alert_id" "uuid", "resolved_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_alert"("alert_id" "uuid", "resolved_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_alert"("alert_id" "uuid", "resolved_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."run_all_synthetic_tests"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_all_synthetic_tests"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_all_synthetic_tests"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_auto_generate_ai_responses"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_auto_generate_ai_responses"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_auto_generate_ai_responses"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_cleanup_and_monitoring"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_cleanup_and_monitoring"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_cleanup_and_monitoring"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_process_pending_workflows"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_process_pending_workflows"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_process_pending_workflows"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_process_response_queue"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_process_response_queue"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_process_response_queue"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_refresh_oauth_tokens"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_refresh_oauth_tokens"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_refresh_oauth_tokens"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_sync_locations_batch_1"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_sync_locations_batch_1"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_sync_locations_batch_1"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_sync_locations_batch_2"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_sync_locations_batch_2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_sync_locations_batch_2"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_sync_reviews_afternoon"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_sync_reviews_afternoon"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_sync_reviews_afternoon"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_sync_reviews_evening"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_sync_reviews_evening"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_sync_reviews_evening"() TO "service_role";



GRANT ALL ON FUNCTION "public"."run_sync_reviews_morning"() TO "anon";
GRANT ALL ON FUNCTION "public"."run_sync_reviews_morning"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."run_sync_reviews_morning"() TO "service_role";



GRANT ALL ON FUNCTION "public"."send_alert_notification"("alert_id" "uuid", "channel_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."send_alert_notification"("alert_id" "uuid", "channel_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."send_alert_notification"("alert_id" "uuid", "channel_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_cron_secret"("secret_key" "text", "secret_value" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_cron_secret"("secret_key" "text", "secret_value" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_cron_secret"("secret_key" "text", "secret_value" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "postgres";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "anon";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_limit"(real) TO "service_role";



GRANT ALL ON FUNCTION "public"."show_limit"() TO "postgres";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "postgres";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "anon";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."show_trgm"("text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_dist"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."start_prioritized_workflows"("max_workflows" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."start_prioritized_workflows"("max_workflows" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_prioritized_workflows"("max_workflows" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_workflow_id" "text", "p_context" "jsonb", "p_priority" integer, "p_scheduled_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_workflow_id" "text", "p_context" "jsonb", "p_priority" integer, "p_scheduled_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."start_workflow"("p_organization_id" "uuid", "p_workflow_type" "text", "p_workflow_id" "text", "p_context" "jsonb", "p_priority" integer, "p_scheduled_at" timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."strict_word_similarity_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."test_edge_function_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_edge_function_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_edge_function_auth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."test_flexible_orchestrator"("p_workflow_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."test_flexible_orchestrator"("p_workflow_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_flexible_orchestrator"("p_workflow_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."test_gmb_sync"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_gmb_sync"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_gmb_sync"() TO "service_role";



GRANT ALL ON FUNCTION "public"."test_review_sync_workflow"("workflow_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."test_review_sync_workflow"("workflow_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_review_sync_workflow"("workflow_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."test_workflow_with_auth"() TO "anon";
GRANT ALL ON FUNCTION "public"."test_workflow_with_auth"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."test_workflow_with_auth"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_onboarding"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_onboarding"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_onboarding"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_workflow_execution"("workflow_id_param" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_workflow_execution"("workflow_id_param" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_workflow_execution"("workflow_id_param" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."update_oauth_tokens_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_oauth_tokens_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_oauth_tokens_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_reviews_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_reviews_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_reviews_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_assign_role"("role_to_assign" "text", "target_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_assign_role"("role_to_assign" "text", "target_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_assign_role"("role_to_assign" "text", "target_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."user_can_manage_member"("target_user_id" "uuid", "target_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_can_manage_member"("target_user_id" "uuid", "target_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_can_manage_member"("target_user_id" "uuid", "target_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_token_migration"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_token_migration"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_token_migration"() TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_token_migration_complete"() TO "anon";
GRANT ALL ON FUNCTION "public"."verify_token_migration_complete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_token_migration_complete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_commutator_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_dist_op"("text", "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "postgres";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "anon";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."word_similarity_op"("text", "text") TO "service_role";












SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;



SET SESSION AUTHORIZATION "postgres";
RESET SESSION AUTHORIZATION;















GRANT ALL ON TABLE "public"."ai_model_config" TO "anon";
GRANT ALL ON TABLE "public"."ai_model_config" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_model_config" TO "service_role";



GRANT ALL ON TABLE "public"."ai_responses" TO "anon";
GRANT ALL ON TABLE "public"."ai_responses" TO "authenticated";
GRANT ALL ON TABLE "public"."ai_responses" TO "service_role";



GRANT ALL ON TABLE "public"."alert_notifications" TO "anon";
GRANT ALL ON TABLE "public"."alert_notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."alert_notifications" TO "service_role";



GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."batch_generation_jobs" TO "anon";
GRANT ALL ON TABLE "public"."batch_generation_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."batch_generation_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."billing_usage" TO "anon";
GRANT ALL ON TABLE "public"."billing_usage" TO "authenticated";
GRANT ALL ON TABLE "public"."billing_usage" TO "service_role";



GRANT ALL ON TABLE "public"."business_guidance" TO "anon";
GRANT ALL ON TABLE "public"."business_guidance" TO "authenticated";
GRANT ALL ON TABLE "public"."business_guidance" TO "service_role";



GRANT ALL ON TABLE "public"."context_caches" TO "anon";
GRANT ALL ON TABLE "public"."context_caches" TO "authenticated";
GRANT ALL ON TABLE "public"."context_caches" TO "service_role";



GRANT ALL ON TABLE "public"."cron_job_executions" TO "anon";
GRANT ALL ON TABLE "public"."cron_job_executions" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_job_executions" TO "service_role";



GRANT ALL ON TABLE "public"."cron_job_health" TO "anon";
GRANT ALL ON TABLE "public"."cron_job_health" TO "authenticated";
GRANT ALL ON TABLE "public"."cron_job_health" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."oauth_tokens" TO "anon";
GRANT ALL ON TABLE "public"."oauth_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."oauth_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."locations_with_oauth" TO "anon";
GRANT ALL ON TABLE "public"."locations_with_oauth" TO "authenticated";
GRANT ALL ON TABLE "public"."locations_with_oauth" TO "service_role";



GRANT ALL ON TABLE "public"."notification_preferences" TO "anon";
GRANT ALL ON TABLE "public"."notification_preferences" TO "authenticated";
GRANT ALL ON TABLE "public"."notification_preferences" TO "service_role";



GRANT ALL ON TABLE "public"."performance_metrics" TO "anon";
GRANT ALL ON TABLE "public"."performance_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."performance_metrics" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."response_analytics" TO "anon";
GRANT ALL ON TABLE "public"."response_analytics" TO "authenticated";
GRANT ALL ON TABLE "public"."response_analytics" TO "service_role";



GRANT ALL ON TABLE "public"."response_queue" TO "anon";
GRANT ALL ON TABLE "public"."response_queue" TO "authenticated";
GRANT ALL ON TABLE "public"."response_queue" TO "service_role";



GRANT ALL ON TABLE "public"."response_settings" TO "anon";
GRANT ALL ON TABLE "public"."response_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."response_settings" TO "service_role";



GRANT ALL ON TABLE "public"."response_templates" TO "anon";
GRANT ALL ON TABLE "public"."response_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."response_templates" TO "service_role";



GRANT ALL ON TABLE "public"."reviews" TO "anon";
GRANT ALL ON TABLE "public"."reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."system_config" TO "anon";
GRANT ALL ON TABLE "public"."system_config" TO "authenticated";
GRANT ALL ON TABLE "public"."system_config" TO "service_role";



GRANT ALL ON SEQUENCE "public"."system_config_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."system_config_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."system_config_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."system_health" TO "anon";
GRANT ALL ON TABLE "public"."system_health" TO "authenticated";
GRANT ALL ON TABLE "public"."system_health" TO "service_role";



GRANT ALL ON TABLE "public"."system_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_invitations" TO "anon";
GRANT ALL ON TABLE "public"."tenant_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_users" TO "anon";
GRANT ALL ON TABLE "public"."tenant_users" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_users" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."upsell_items" TO "anon";
GRANT ALL ON TABLE "public"."upsell_items" TO "authenticated";
GRANT ALL ON TABLE "public"."upsell_items" TO "service_role";



GRANT ALL ON TABLE "public"."v_dashboard_overview" TO "anon";
GRANT ALL ON TABLE "public"."v_dashboard_overview" TO "authenticated";
GRANT ALL ON TABLE "public"."v_dashboard_overview" TO "service_role";



GRANT ALL ON TABLE "public"."v_response_performance" TO "anon";
GRANT ALL ON TABLE "public"."v_response_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."v_response_performance" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_events" TO "anon";
GRANT ALL ON TABLE "public"."workflow_events" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_events" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_steps" TO "anon";
GRANT ALL ON TABLE "public"."workflow_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_steps" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_templates" TO "anon";
GRANT ALL ON TABLE "public"."workflow_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_templates" TO "service_role";



GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS  TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES  TO "service_role";






























RESET ALL;
