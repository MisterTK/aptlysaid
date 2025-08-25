# Database Schema Documentation

## Overview
Complete multi-tenant SaaS database schema for review management platform with AI capabilities, automation workflows, and comprehensive analytics.

## Core Tables

### User & Organization Management
- **profiles** - User profiles linked to auth.users
- **organizations** - Multi-tenant organizations
- **organization_members** - Organization membership with roles (owner, admin, member)
- **teams** - Teams within organizations
- **team_members** - Team membership

### Location & Review Management
- **locations** - Business locations linked to Google My Business
- **reviews** - Customer reviews from various sources
- **review_tags** - Categorization tags for reviews
- **tags** - Tag definitions for organization

### Subscription & Billing
- **subscription_plans** - Available subscription tiers
- **subscriptions** - Organization subscriptions with Stripe integration
- **invoices** - Billing history
- **usage_metrics** - Usage tracking for billing and limits

### AI & Response Generation
- **response_templates** - Response templates with variables
- **generated_responses** - AI-generated review responses
- **response_feedback** - Feedback on AI responses for training

### Workflow & Automation
- **workflows** - Automated workflow definitions
- **workflow_executions** - Workflow execution history
- **task_queue** - Async task processing queue

### Analytics & Reporting
- **analytics_snapshots** - Time-series analytics data
- **reports** - Custom report configurations
- **report_exports** - Generated report files

### Notifications & Communication
- **notification_preferences** - User notification settings
- **notifications** - Notification history
- **email_templates** - Email template definitions

### Integrations & Webhooks
- **integrations** - Third-party service integrations
- **webhooks** - Webhook configurations
- **webhook_deliveries** - Webhook delivery logs
- **oauth_tokens** - OAuth tokens for external services

### Settings & Configuration
- **organization_settings** - Organization-specific settings
- **feature_flags** - Feature flag configuration
- **app_config** - Global application configuration
- **location_assignments** - User/team location permissions

### System & Monitoring
- **audit_logs** - Audit trail for all actions
- **system_logs** - System-level logging
- **cron_job_health** - Cron job monitoring

### Content & Media
- **media** - Uploaded media files
- **private.app_secrets** - Secure configuration storage

## Key Features

### Multi-Tenant Isolation
- Row Level Security (RLS) on all tables
- Organization-based data isolation
- Role-based access control (RBAC)

### Performance Optimization
- Comprehensive indexes on foreign keys and commonly queried fields
- Materialized views for analytics
- Partitioning ready for time-series data

### Security
- RLS policies for all tables
- Encrypted secrets storage
- Audit logging for compliance

### Automation
- pg_cron for scheduled tasks
- Webhook system for real-time events
- Task queue for async processing

## Helper Functions

### Permission Checking
- `is_organization_member(org_id)` - Check membership
- `is_organization_admin(org_id)` - Check admin/owner status
- `is_organization_owner(org_id)` - Check owner status
- `get_user_organizations()` - Get user's organizations

### Utility Functions
- `update_updated_at()` - Auto-update timestamps
- `handle_new_user()` - Create profile on signup
- `private.set_secret()` - Store secrets
- `private.get_secret()` - Retrieve secrets

## Indexes

### Primary Indexes
All tables have primary key indexes on `id` columns.

### Foreign Key Indexes
- All foreign key columns have indexes for JOIN performance
- Composite indexes for multi-column lookups

### Query Optimization Indexes
- Time-based queries: `created_at`, `updated_at`
- Status fields: `status`, `is_active`
- Search fields: `name`, `email`, `slug`

## Row Level Security

### Policy Types
1. **Public Read** - subscription_plans
2. **Member Access** - Most tables require organization membership
3. **Admin Only** - Settings, integrations, tokens
4. **Owner Only** - Billing, organization deletion
5. **System Only** - Audit logs, system logs

### Policy Patterns
- View policies: `is_organization_member()`
- Edit policies: `is_organization_admin()`
- Delete policies: `is_organization_owner()`
- Insert policies: Role-based with checks

## Triggers

### Updated At Triggers
All tables with `updated_at` columns have automatic update triggers.

### Audit Triggers
Key tables have audit triggers for compliance tracking.

### Cascade Triggers
- User deletion cascades to profiles
- Organization deletion cascades to all related data

## Migration History
1. `20250824213835_initial_schema.sql` - Base tables and structure
2. `20250824220000_cron_jobs.sql` - Scheduled job configuration
3. `20250824220100_vault_secrets.sql` - Secret storage setup
4. `20250824230000_complete_schema.sql` - Full schema with all tables
5. `20250824231000_rls_policies.sql` - Comprehensive RLS policies

## Next Steps
1. Create views for common queries
2. Add stored procedures for complex operations
3. Set up database backups and replication
4. Configure monitoring and alerting
5. Implement data retention policies