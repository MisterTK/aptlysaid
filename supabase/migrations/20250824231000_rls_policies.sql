-- Row Level Security Policies for all tables
-- This migration adds comprehensive RLS policies for multi-tenant isolation

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Check if user is organization member
CREATE OR REPLACE FUNCTION public.is_organization_member(org_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
        AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is organization admin or owner
CREATE OR REPLACE FUNCTION public.is_organization_admin(org_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'owner')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if user is organization owner
CREATE OR REPLACE FUNCTION public.is_organization_owner(org_id uuid)
RETURNS boolean AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = org_id
        AND user_id = auth.uid()
        AND role = 'owner'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get user's organizations
CREATE OR REPLACE FUNCTION public.get_user_organizations()
RETURNS SETOF uuid AS $$
BEGIN
    RETURN QUERY
    SELECT organization_id 
    FROM public.organization_members
    WHERE user_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SUBSCRIPTION & BILLING POLICIES
-- ============================================

-- Subscription plans (public read)
CREATE POLICY "Anyone can view active plans" ON public.subscription_plans
    FOR SELECT USING (is_active = true);

-- Subscriptions
CREATE POLICY "Members can view organization subscription" ON public.subscriptions
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Owners can manage subscription" ON public.subscriptions
    FOR ALL USING (public.is_organization_owner(organization_id));

-- Invoices
CREATE POLICY "Members can view organization invoices" ON public.invoices
    FOR SELECT USING (public.is_organization_member(organization_id));

-- Usage metrics
CREATE POLICY "Members can view usage metrics" ON public.usage_metrics
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "System can insert usage metrics" ON public.usage_metrics
    FOR INSERT WITH CHECK (true);

-- ============================================
-- LOCATIONS & REVIEWS POLICIES
-- ============================================

-- Locations
CREATE POLICY "Members can view organization locations" ON public.locations
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can manage locations" ON public.locations
    FOR ALL USING (public.is_organization_admin(organization_id));

-- Reviews
CREATE POLICY "Members can view organization reviews" ON public.reviews
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Members can update reviews" ON public.reviews
    FOR UPDATE USING (public.is_organization_member(organization_id));

CREATE POLICY "System can insert reviews" ON public.reviews
    FOR INSERT WITH CHECK (true);

-- ============================================
-- AI & RESPONSE POLICIES
-- ============================================

-- Response templates
CREATE POLICY "Members can view organization templates" ON public.response_templates
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can manage templates" ON public.response_templates
    FOR ALL USING (public.is_organization_admin(organization_id));

-- Generated responses
CREATE POLICY "Members can view generated responses" ON public.generated_responses
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Members can create generated responses" ON public.generated_responses
    FOR INSERT WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Members can update generated responses" ON public.generated_responses
    FOR UPDATE USING (public.is_organization_member(organization_id));

-- Response feedback
CREATE POLICY "Users can create feedback" ON public.response_feedback
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own feedback" ON public.response_feedback
    FOR SELECT USING (auth.uid() = user_id);

-- ============================================
-- WORKFLOW & AUTOMATION POLICIES
-- ============================================

-- Workflows
CREATE POLICY "Members can view workflows" ON public.workflows
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can manage workflows" ON public.workflows
    FOR ALL USING (public.is_organization_admin(organization_id));

-- Workflow executions
CREATE POLICY "Members can view workflow executions" ON public.workflow_executions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.workflows w
            WHERE w.id = workflow_executions.workflow_id
            AND public.is_organization_member(w.organization_id)
        )
    );

-- Task queue
CREATE POLICY "Members can view organization tasks" ON public.task_queue
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "System can manage tasks" ON public.task_queue
    FOR ALL USING (true);

-- ============================================
-- ANALYTICS & REPORTING POLICIES
-- ============================================

-- Analytics snapshots
CREATE POLICY "Members can view analytics" ON public.analytics_snapshots
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "System can insert analytics" ON public.analytics_snapshots
    FOR INSERT WITH CHECK (true);

-- Reports
CREATE POLICY "Members can view organization reports" ON public.reports
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Members can create reports" ON public.reports
    FOR INSERT WITH CHECK (public.is_organization_member(organization_id));

CREATE POLICY "Report creators can update" ON public.reports
    FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY "Admins can delete reports" ON public.reports
    FOR DELETE USING (public.is_organization_admin(organization_id));

-- Report exports
CREATE POLICY "Members can view report exports" ON public.report_exports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.reports r
            WHERE r.id = report_exports.report_id
            AND public.is_organization_member(r.organization_id)
        )
    );

-- ============================================
-- NOTIFICATION & COMMUNICATION POLICIES
-- ============================================

-- Notification preferences
CREATE POLICY "Users can manage own preferences" ON public.notification_preferences
    FOR ALL USING (auth.uid() = user_id);

-- Notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

-- Email templates
CREATE POLICY "Members can view organization templates" ON public.email_templates
    FOR SELECT USING (
        organization_id IS NULL OR 
        public.is_organization_member(organization_id)
    );

CREATE POLICY "Admins can manage organization templates" ON public.email_templates
    FOR ALL USING (
        organization_id IS NOT NULL AND 
        public.is_organization_admin(organization_id)
    );

-- ============================================
-- INTEGRATION & WEBHOOK POLICIES
-- ============================================

-- Integrations
CREATE POLICY "Members can view integrations" ON public.integrations
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can manage integrations" ON public.integrations
    FOR ALL USING (public.is_organization_admin(organization_id));

-- Webhooks
CREATE POLICY "Members can view webhooks" ON public.webhooks
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can manage webhooks" ON public.webhooks
    FOR ALL USING (public.is_organization_admin(organization_id));

-- Webhook deliveries
CREATE POLICY "Members can view webhook deliveries" ON public.webhook_deliveries
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.webhooks w
            WHERE w.id = webhook_deliveries.webhook_id
            AND public.is_organization_member(w.organization_id)
        )
    );

-- ============================================
-- TEAM & PERMISSION POLICIES
-- ============================================

-- Teams
CREATE POLICY "Members can view organization teams" ON public.teams
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can manage teams" ON public.teams
    FOR ALL USING (public.is_organization_admin(organization_id));

-- Team members
CREATE POLICY "Members can view team members" ON public.team_members
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_members.team_id
            AND public.is_organization_member(t.organization_id)
        )
    );

CREATE POLICY "Admins can manage team members" ON public.team_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.teams t
            WHERE t.id = team_members.team_id
            AND public.is_organization_admin(t.organization_id)
        )
    );

-- Location assignments
CREATE POLICY "Members can view location assignments" ON public.location_assignments
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.locations l
            WHERE l.id = location_assignments.location_id
            AND public.is_organization_member(l.organization_id)
        )
    );

CREATE POLICY "Admins can manage location assignments" ON public.location_assignments
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.locations l
            WHERE l.id = location_assignments.location_id
            AND public.is_organization_admin(l.organization_id)
        )
    );

-- Audit logs
CREATE POLICY "Members can view organization audit logs" ON public.audit_logs
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "System can insert audit logs" ON public.audit_logs
    FOR INSERT WITH CHECK (true);

-- ============================================
-- SETTINGS & CONFIGURATION POLICIES
-- ============================================

-- Organization settings
CREATE POLICY "Members can view organization settings" ON public.organization_settings
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Admins can manage organization settings" ON public.organization_settings
    FOR ALL USING (public.is_organization_admin(organization_id));

-- OAuth tokens
CREATE POLICY "Admins can view organization tokens" ON public.oauth_tokens
    FOR SELECT USING (public.is_organization_admin(organization_id));

CREATE POLICY "Admins can manage organization tokens" ON public.oauth_tokens
    FOR ALL USING (public.is_organization_admin(organization_id));

-- System logs
CREATE POLICY "Admins can view system logs" ON public.system_logs
    FOR SELECT USING (
        organization_id IS NULL OR 
        public.is_organization_admin(organization_id)
    );

-- ============================================
-- CONTENT & MEDIA POLICIES
-- ============================================

-- Media
CREATE POLICY "Members can view organization media" ON public.media
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Members can upload media" ON public.media
    FOR INSERT WITH CHECK (
        public.is_organization_member(organization_id) AND 
        auth.uid() = uploaded_by
    );

CREATE POLICY "Uploaders can delete own media" ON public.media
    FOR DELETE USING (auth.uid() = uploaded_by);

-- Tags
CREATE POLICY "Members can view organization tags" ON public.tags
    FOR SELECT USING (public.is_organization_member(organization_id));

CREATE POLICY "Members can manage tags" ON public.tags
    FOR ALL USING (public.is_organization_member(organization_id));

-- Review tags
CREATE POLICY "Members can view review tags" ON public.review_tags
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.reviews r
            WHERE r.id = review_tags.review_id
            AND public.is_organization_member(r.organization_id)
        )
    );

CREATE POLICY "Members can manage review tags" ON public.review_tags
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.reviews r
            WHERE r.id = review_tags.review_id
            AND public.is_organization_member(r.organization_id)
        )
    );

-- ============================================
-- ORGANIZATIONS & MEMBERS POLICIES (UPDATE)
-- ============================================

-- Organizations (additional policies)
CREATE POLICY "Owners can update organization" ON public.organizations
    FOR UPDATE USING (public.is_organization_owner(id));

CREATE POLICY "Owners can delete organization" ON public.organizations
    FOR DELETE USING (public.is_organization_owner(id));

-- Organization members (additional policies)
CREATE POLICY "Admins can add members" ON public.organization_members
    FOR INSERT WITH CHECK (public.is_organization_admin(organization_id));

CREATE POLICY "Admins can update members" ON public.organization_members
    FOR UPDATE USING (public.is_organization_admin(organization_id));

CREATE POLICY "Admins can remove members" ON public.organization_members
    FOR DELETE USING (public.is_organization_admin(organization_id));

-- Feature flags (system level)
CREATE POLICY "Anyone can view enabled flags" ON public.feature_flags
    FOR SELECT USING (
        is_enabled = true OR
        auth.uid() = ANY(user_ids) OR
        EXISTS (
            SELECT 1 FROM public.organization_members om
            WHERE om.user_id = auth.uid()
            AND om.organization_id = ANY(feature_flags.organization_ids)
        )
    );