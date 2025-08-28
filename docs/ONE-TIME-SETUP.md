# 🚀 One-Time Setup Guide

This guide walks you through the **complete one-time setup** to get your multi-tenant application running with full GitOps automation.

**Time Required**: ~30-45 minutes  
**Prerequisites**: GitHub account, Supabase account, Stripe account, Google Cloud account

---

## Step 1: Create Supabase Projects (5 min)

### Preview Environment

1. Go to https://supabase.com/dashboard
2. Click **New Project**
3. Configure:
   - **Name**: `aptlysaid-preview`
   - **Database Password**: Generate strong password → **SAVE THIS**
   - **Region**: Choose closest to you
4. Copy these values:
   ```
   Project ID: (shown in URL after creation)
   Anon Key: Settings → API → anon public
   Service Role Key: Settings → API → service_role
   ```

### Production Environment

1. Repeat above with name: `aptlysaid-production`
2. Save all credentials securely

---

## Step 2: Configure GitHub Repository (10 min)

### Fork/Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/aptlysaid.git
cd aptlysaid
```

### Add GitHub Secrets

Go to: **Settings → Secrets and variables → Actions → New repository secret**

Add these secrets (values from Step 1):

```yaml
# Core Supabase
SUPABASE_ACCESS_TOKEN: (create at https://supabase.com/dashboard/account/tokens)

# Preview Environment
SUPABASE_PREVIEW_PROJECT_ID: udkojnvmgqicrvzbaqts
SUPABASE_PREVIEW_DB_PASSWORD: (from step 1)
SUPABASE_PREVIEW_SERVICE_ROLE_KEY: (from step 1)

# Production Environment
SUPABASE_PROD_PROJECT_ID: efujvtdywpkajwbkmaoi
SUPABASE_PROD_DB_PASSWORD: (from step 1)
SUPABASE_PROD_SERVICE_ROLE_KEY: (from step 1)
```

---

## Step 3: Configure External Services (15 min)

### Google OAuth

1. Go to https://console.cloud.google.com
2. Create new project or select existing
3. Enable Google My Business API
4. Create OAuth 2.0 credentials:
   - **Application type**: Web application
   - **Authorized redirects**:
     ```
     https://udkojnvmgqicrvzbaqts.supabase.co/auth/v1/callback
     https://efujvtdywpkajwbkmaoi.supabase.co/auth/v1/callback
     ```
5. Add to GitHub Secrets:
   ```yaml
   GOOGLE_OAUTH_CLIENT_ID: (from Google)
   GOOGLE_OAUTH_CLIENT_SECRET: (from Google)
   ```

### OpenAI

1. Go to https://platform.openai.com/api-keys
2. Create new API key
3. Add to GitHub Secrets:
   ```yaml
   OPENAI_API_KEY: sk-...
   ```

### Vertex AI (Optional)

1. In Google Cloud Console, create service account
2. Download JSON key file
3. Add to GitHub Secrets:
   ```yaml
   VERTEX_AI_PROJECT_ID: your-gcp-project
   VERTEX_AI_CREDENTIALS: (paste entire JSON content)
   ```

### SendGrid

1. Sign up at https://sendgrid.com
2. Create API key with full access
3. Verify sender email address
4. Add to GitHub Secrets:
   ```yaml
   SENDGRID_API_KEY: SG....
   SENDGRID_FROM_EMAIL: noreply@yourdomain.com
   ```

### Stripe

1. Go to https://dashboard.stripe.com

#### For Preview (Test Mode):

2. Switch to **Test Mode**
3. Get API keys from Developers → API keys
4. Create products and prices
5. Create webhook endpoint:
   - URL: `https://udkojnvmgqicrvzbaqts.supabase.co/functions/v1/v2-api/stripe/webhook`
   - Events: Select all customer, subscription, and payment events

#### For Production (Live Mode):

6. Repeat in **Live Mode** with production URL

7. Add to GitHub Secrets:

   ```yaml
   # Preview/Test
   STRIPE_SECRET_KEY_PREVIEW: sk_test_...
   STRIPE_WEBHOOK_SECRET_PREVIEW: whsec_...

   # Production/Live
   STRIPE_SECRET_KEY_PROD: sk_live_...
   STRIPE_WEBHOOK_SECRET_PROD: whsec_...

   # Shared Price IDs
   STRIPE_PRICE_ID_STARTER: price_...
   STRIPE_PRICE_ID_PRO: price_...
   STRIPE_PRICE_ID_ENTERPRISE: price_...
   ```

### Security

Generate encryption key:

```bash
openssl rand -hex 16
```

Add to GitHub Secrets:

```yaml
ENCRYPTION_KEY: (32 character hex string)
```

---

## Step 4: Deploy to Preview (5 min)

### Trigger Deployment

```bash
git checkout develop
git push origin develop
```

### Monitor Deployment

1. Go to GitHub → Actions tab
2. Watch "Preview Full Deploy" workflow
3. Should see all green checkmarks

### Verify Deployment

Check the workflow logs for:

- ✅ Database migrations applied
- ✅ Edge functions deployed
- ✅ Secrets configured
- ✅ Cron jobs created

---

## Step 5: Configure Supabase Dashboard (5 min)

### Preview Environment

1. Go to https://supabase.com/dashboard/project/udkojnvmgqicrvzbaqts

2. **Enable Google Auth**:

   - Authentication → Providers → Google
   - Toggle ON
   - Add Client ID and Secret (same as GitHub Secrets)
   - Save

3. **Verify Cron Jobs**:
   - SQL Editor → New Query
   ```sql
   SELECT * FROM cron.job WHERE jobname LIKE 'v2-%';
   ```
   - Should see 6 active jobs

### Production Environment

Repeat above for production project

---

## Step 6: Deploy to Production (5 min)

### Create Production Deployment

```bash
git checkout main
git merge develop
git push origin main
```

### Monitor Deployment

- Watch "Production Full Deploy" workflow
- Verify all steps complete successfully

---

## Step 7: Configure Vercel (5 min)

1. Go to https://vercel.com
2. Import GitHub repository
3. Configure:

   - **Framework**: SvelteKit
   - **Root Directory**: ./
   - **Build Command**: `npm run build`

4. Add Environment Variables:

**Preview Environment**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://udkojnvmgqicrvzbaqts.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=(from Supabase)
SUPABASE_SERVICE_ROLE_KEY=(from Supabase)
```

**Production Environment**:

```env
NEXT_PUBLIC_SUPABASE_URL=https://efujvtdywpkajwbkmaoi.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=(from Supabase)
SUPABASE_SERVICE_ROLE_KEY=(from Supabase)
```

5. Configure Git branches:
   - Production: `main`
   - Preview: `develop`

---

## ✅ Setup Complete!

Your application is now fully deployed with:

- 🔄 Automated deployments on git push
- ⏰ Cron jobs running every 5-15 minutes
- 🔐 All secrets configured
- 📦 Storage buckets ready
- 🚀 Edge functions deployed

### Test Your Setup

1. **Test Edge Functions**:

```bash
curl https://udkojnvmgqicrvzbaqts.supabase.co/functions/v1/v2-api/health
```

2. **Test Frontend**:

- Visit your Vercel URL
- Try signing up with email
- Test Google OAuth login

3. **Monitor Cron Jobs**:

```sql
-- Run in Supabase SQL Editor
SELECT * FROM cron_job_health ORDER BY last_run DESC;
```

---

## 🔧 Troubleshooting

### If GitHub Actions Fail

1. Check Actions tab → Failed workflow → View logs
2. Common issues:
   - Missing secrets → Check GitHub Secrets spelling
   - Database connection → Verify DB password
   - First run errors → Re-run workflow

### If Auth Doesn't Work

1. Verify redirect URLs in Google Console match Supabase URLs
2. Check auth providers are enabled in Supabase Dashboard
3. Ensure frontend URLs are in Supabase auth settings

### If Cron Jobs Don't Run

1. Check they're active:

```sql
SELECT jobname, active FROM cron.job WHERE jobname LIKE 'v2-%';
```

2. Enable if needed:

```sql
SELECT toggle_cron_jobs(true);
```

---

## 📚 Next Steps

1. **Customize for your domain**:

   - Update auth redirect URLs
   - Configure custom domain in Vercel
   - Update email templates

2. **Monitor everything**:

   - Supabase Dashboard → Logs
   - Vercel Dashboard → Functions
   - GitHub Actions → Workflow runs

3. **Start developing**:
   ```bash
   git checkout develop
   git checkout -b feature/my-feature
   # Make changes
   git push origin feature/my-feature
   # Create PR to develop
   ```

---

## 🎉 Congratulations!

You now have a production-ready, multi-tenant SaaS application with:

- Automated CI/CD pipeline
- Scheduled background jobs
- Secure secrets management
- Full observability
- GitOps workflow

Every push to `develop` deploys to preview, every push to `main` deploys to production. No manual deployment needed!
