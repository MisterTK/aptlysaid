# Supabase Branching Setup Guide

## Overview

This guide uses **Supabase Branching** - a single production Supabase project with automatic preview branches for each Git branch. This is more cost-effective and simpler than managing multiple projects.

## Architecture

```
GitHub Repo
    ├── main branch → Production Database (Supabase Main Project)
    │                 └── Vercel Production
    │
    ├── develop branch → Preview Database Branch (auto-created)
    │                    └── Vercel Preview
    │
    └── feature/* branches → Feature Database Branches (auto-created)
                             └── Vercel Preview Deployments
```

## Benefits of This Approach

✅ **Single Supabase Project** - Only pay for one production instance  
✅ **Automatic Branch Databases** - Each Git branch gets its own isolated database  
✅ **Zero Configuration** - Supabase handles branch creation/deletion automatically  
✅ **Data Isolation** - Each branch has its own data, perfect for testing  
✅ **Shared Edge Functions** - Functions deployed once, work with all branches

## One-Time Setup (15 minutes)

### Step 1: Create Production Supabase Project

1. Go to https://supabase.com/dashboard
2. Create **one** project (this will be your production)
3. Save these values:
   ```
   Project ID: efujvtdywpkajwbkmaoi (or your actual ID)
   Database Password: [your-password]
   Anon Key: [from API settings]
   Service Role Key: [from API settings]
   ```

### Step 2: Enable GitHub Integration

1. In Supabase Dashboard → Settings → Integrations
2. Click **Connect to GitHub**
3. Authorize Supabase
4. Select your repository
5. Enable **Branching**:
   - ✅ Create preview branches
   - ✅ Delete branches when PR is closed

### Step 3: Configure GitHub Secrets

Add these secrets to your GitHub repo (Settings → Secrets → Actions):

```yaml
# Core Supabase (only ONE project now!)
SUPABASE_ACCESS_TOKEN: sbp_xxx... # From account tokens
SUPABASE_PROJECT_ID: efujvtdywpkajwbkmaoi
SUPABASE_DB_PASSWORD: [your-password]
SUPABASE_SERVICE_ROLE_KEY: eyJ...

# External Services
GOOGLE_OAUTH_CLIENT_ID: xxx
GOOGLE_OAUTH_CLIENT_SECRET: xxx
STRIPE_SECRET_KEY: sk_live_xxx # Use test key for preview branches
STRIPE_WEBHOOK_SECRET: whsec_xxx
OPENAI_API_KEY: sk-xxx
SENDGRID_API_KEY: SG.xxx
ENCRYPTION_KEY: [32-char-hex]
```

### Step 4: Configure Vercel

1. Import your GitHub repo to Vercel
2. Add environment variables:
   ```env
   # These will be automatically set per branch by Vercel
   NEXT_PUBLIC_SUPABASE_URL=[auto-set-by-integration]
   NEXT_PUBLIC_SUPABASE_ANON_KEY=[auto-set-by-integration]
   ```
3. Install Supabase Integration:
   - Go to Vercel → Integrations → Browse Marketplace
   - Install Supabase
   - Connect to your project
   - Enable preview branches

### Step 5: Update Your Code

Update your Supabase client initialization to use environment variables:

```typescript
// src/lib/supabase.ts
import { createClient } from "@supabase/supabase-js"

// These are automatically set by Vercel for each branch
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

## How It Works

### When You Push to `main`:

1. GitHub Actions runs migrations on production database
2. Deploys edge functions to production
3. Vercel deploys to production domain

### When You Push to `develop`:

1. Supabase creates/updates a `develop` branch database
2. GitHub Actions runs migrations on branch database
3. Vercel deploys preview with branch database URL

### When You Create a Pull Request:

1. Supabase creates a new branch database for that PR
2. Migrations run on the PR's database
3. Vercel creates a preview URL with isolated data
4. When PR is merged/closed, branch database is deleted

## Simplified Environment Files

Since we're using one project with branching, you only need:

```bash
# .env.local (for local development)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-local-anon-key
```

Production and preview URLs are handled automatically by the integrations!

## Migration Strategy with Branching

### Development Workflow:

```bash
# 1. Create feature branch
git checkout -b feature/new-feature

# 2. Create migration
supabase migration new add_new_table

# 3. Test locally
supabase db reset

# 4. Push to GitHub
git push origin feature/new-feature

# 5. Supabase automatically creates a branch database
# 6. Migrations run on the branch database
# 7. Test in isolated preview environment
```

### Merging to Production:

```bash
# 1. Merge PR to main
# 2. Migrations automatically run on production
# 3. No manual intervention needed!
```

## Handling Edge Functions with Branching

Edge functions are **shared** across all branches but can detect which branch they're serving:

```typescript
// In your edge function
Deno.serve(async (req) => {
  // Get the Supabase client for the current branch
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

  // This automatically connects to the right branch database
  const supabase = createClient(supabaseUrl, supabaseKey)

  // Your function logic here
})
```

## Cron Jobs with Branching

Cron jobs only run on the **main production database**. Preview branches don't execute cron jobs, preventing duplicate processing.

If you need to test cron job logic in a branch:

1. Manually trigger the function endpoint
2. Or temporarily enable for testing (not recommended)

## Cost Comparison

### Old Approach (Multiple Projects):

- Production Project: $25/month
- Preview Project: $25/month
- **Total: $50/month**

### New Approach (Branching):

- Production Project: $25/month
- Preview Branches: FREE (included)
- **Total: $25/month**

**50% cost reduction!** 🎉

## Common Scenarios

### Testing with Production-like Data

```bash
# Create a branch from production data
supabase db dump --project-ref efujvtdywpkajwbkmaoi > prod-snapshot.sql

# Apply to your branch (manually if needed)
supabase db push --project-ref efujvtdywpkajwbkmaoi < prod-snapshot.sql
```

### Debugging Branch Issues

```bash
# List all branches
supabase branches list --project-ref efujvtdywpkajwbkmaoi

# Get branch connection string
supabase branches get develop --project-ref efujvtdywpkajwbkmaoi
```

### Resetting a Branch Database

```bash
# Delete and recreate branch
supabase branches delete develop --project-ref efujvtdywpkajwbkmaoi
# Push again to recreate
git push origin develop
```

## Limitations to Know

1. **Branch databases are ephemeral** - Data doesn't persist between branches
2. **No cron jobs in branches** - Only run in production
3. **Shared edge functions** - All branches use same function code
4. **Branch lifetime** - Deleted when PR is closed/merged

## Best Practices

1. **Keep branches short-lived** - Merge frequently
2. **Test migrations locally first** - Before pushing
3. **Use seed data for branches** - Consistent test data
4. **Monitor branch creation** - Check Supabase dashboard
5. **Clean up old branches** - They're deleted automatically with PRs

## Troubleshooting

### Branch Database Not Created

- Check GitHub Integration is enabled
- Verify Supabase has repo access
- Check branch naming (must match Git branch)

### Migrations Failing on Branch

- Check migration syntax
- Verify no production-specific data
- Test locally first

### Vercel Not Using Branch Database

- Reinstall Supabase Integration
- Check environment variables
- Verify branch detection

## Summary

With Supabase Branching:

- ✅ One project to manage
- ✅ Automatic preview environments
- ✅ Lower costs
- ✅ Simpler configuration
- ✅ Better developer experience

Every feature branch gets its own isolated database automatically. No manual setup, no extra costs, just push and develop!
