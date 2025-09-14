# Complete Supabase Environment Setup Guide

## Overview

This guide covers the complete setup of Supabase environments including:

- Database migrations and schema
- pg_cron scheduled jobs
- Vault secrets for sensitive data
- Edge function secrets
- Auth configuration
- Storage buckets

## Architecture

```
┌─────────────────────────────────────────┐
│           GitHub Repository             │
├─────────────────────────────────────────┤
│ • /supabase/migrations/                 │
│   - Schema definitions                  │
│   - Cron jobs                          │
│   - Vault setup                        │
│ • /supabase/functions/                 │
│   - Edge function source code          │
│ • /scripts/                            │
│   - Setup automation scripts           │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│         Supabase Environment            │
├─────────────────────────────────────────┤
│ • Database (PostgreSQL 15)              │
│   - pg_cron for scheduled jobs         │
│   - Vault for secrets                  │
│ • Edge Functions                       │
│   - v2-api                            │
│   - v2-workflow-orchestrator          │
│   - v2-external-integrator            │
│ • Auth & Storage                       │
└─────────────────────────────────────────┘
```

## Quick Setup

### 1. Initial Setup for New Environment

```bash
# Export your Supabase access token
export SUPABASE_ACCESS_TOKEN=your_token_here

# Run the comprehensive setup script
./scripts/setup-supabase-environment.sh preview  # or production
```

This script will:

1. Link to your Supabase project
2. Run all database migrations
3. Deploy edge functions
4. Set up cron jobs
5. Configure storage buckets
6. Optionally set up secrets

### 2. Manual Secret Configuration

#### Edge Function Secrets

```bash
./scripts/setup-edge-function-secrets.sh preview  # or production
```

Required secrets:

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `OPENAI_API_KEY`
- `VERTEX_AI_CREDENTIALS`
- `SENDGRID_API_KEY`
- `ENCRYPTION_KEY`

#### Vault Secrets (Database)

```bash
./scripts/setup-vault-secrets.sh preview  # or production
```

These are stored encrypted in the database and accessed via:

```sql
SELECT vault.get_secret('secret_name');
```

## Cron Jobs

The following cron jobs are automatically configured:

| Job Name                   | Schedule        | Purpose                       |
| -------------------------- | --------------- | ----------------------------- |
| v2-sync-unanswered-reviews | _/15 _ \* \* \* | Sync reviews every 15 minutes |
| v2-process-review-queue    | _/5 _ \* \* \*  | Process queue every 5 minutes |
| v2-refresh-oauth-tokens    | 0 \* \* \* \*   | Refresh tokens hourly         |
| v2-cleanup-old-workflows   | 0 2 \* \* \*    | Clean up at 2 AM daily        |
| v2-generate-daily-stats    | 0 3 \* \* \*    | Generate stats at 3 AM daily  |
| v2-health-check            | _/5 _ \* \* \*  | Health check every 5 minutes  |

### Managing Cron Jobs

```sql
-- View all cron jobs
SELECT * FROM cron.job WHERE jobname LIKE 'v2-%';

-- Disable all cron jobs (for maintenance)
SELECT toggle_cron_jobs(false);

-- Enable all cron jobs
SELECT toggle_cron_jobs(true);

-- Check cron job health
SELECT * FROM public.cron_job_health;
```

## Auth Configuration

### Required in Supabase Dashboard

1. **Email Provider**
   - Enable email confirmations
   - Set OTP expiry to 24 hours
   - Configure SMTP settings

2. **Google OAuth**
   - Add authorized redirect URLs:
     - `https://YOUR_PROJECT.supabase.co/auth/v1/callback`
     - Your app URLs from `additional_redirect_urls`

3. **MFA Settings**
   - Enable TOTP enrollment and verification

## Storage Buckets

Automatically created buckets:

- `avatars` - Public, max 5MB, images only
- `documents` - Private, max 10MB, PDFs and docs

## Troubleshooting

### Cron Jobs Not Running

```bash
# Check if jobs are active
supabase db query "SELECT * FROM cron.job WHERE active = false" --project-ref PROJECT_ID

# Check recent executions
supabase db query "SELECT * FROM cron_job_executions ORDER BY created_at DESC LIMIT 10" --project-ref PROJECT_ID

# Enable jobs
supabase db query "SELECT toggle_cron_jobs(true)" --project-ref PROJECT_ID
```

### Edge Functions Not Working

```bash
# View function logs
supabase functions logs v2-api --project-ref PROJECT_ID

# Check secrets are set
supabase secrets list --project-ref PROJECT_ID

# Redeploy function
supabase functions deploy v2-api --project-ref PROJECT_ID
```

### Vault Secrets Issues

```sql
-- Check if vault is set up
SELECT * FROM vault.secrets;

-- Test secret retrieval
SELECT vault.get_secret('test_secret');

-- Re-run vault migration if needed
```

## Migration Management

### Adding New Migrations

```bash
# Create new migration
supabase migration new your_migration_name

# Edit the file in supabase/migrations/

# Apply to remote
supabase db push --project-ref PROJECT_ID
```

### Rolling Back

```bash
# List migrations
supabase migration list --project-ref PROJECT_ID

# Revert last migration
supabase db reset --project-ref PROJECT_ID
```

## Security Best Practices

1. **Never commit secrets to git**
   - Use environment variables
   - Use Supabase secrets management
   - Use vault for database secrets

2. **Rotate secrets regularly**
   - OAuth tokens
   - API keys
   - Encryption keys

3. **Use RLS policies**
   - All tables should have RLS enabled
   - Service role should be used sparingly

4. **Monitor access**
   - Check system_logs table
   - Review auth.users activity
   - Monitor edge function invocations

## Deployment Checklist

### For Each New Environment

- [ ] Run database migrations
- [ ] Deploy edge functions
- [ ] Set edge function secrets
- [ ] Configure vault secrets
- [ ] Enable auth providers
- [ ] Configure storage buckets
- [ ] Verify cron jobs are active
- [ ] Test health endpoints
- [ ] Configure custom domain (if needed)
- [ ] Set up monitoring/alerts

## Support Scripts

All scripts are in the `/scripts` directory:

- `setup-supabase-environment.sh` - Complete environment setup
- `setup-edge-function-secrets.sh` - Edge function secrets only
- `setup-vault-secrets.sh` - Database vault secrets only

## Environment Variables Reference

### Required in GitHub Secrets

```yaml
SUPABASE_ACCESS_TOKEN: sbp_xxx...
SUPABASE_PREVIEW_PROJECT_ID: udkojnvmgqicrvzbaqts
SUPABASE_PREVIEW_DB_PASSWORD: your_password
SUPABASE_PROD_PROJECT_ID: efujvtdywpkajwbkmaoi
SUPABASE_PROD_DB_PASSWORD: your_password
```

### Required in Vercel

```yaml
NEXT_PUBLIC_SUPABASE_URL: https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY: eyJ...
SUPABASE_SERVICE_ROLE_KEY: eyJ...
# Plus any other app-specific variables
```
