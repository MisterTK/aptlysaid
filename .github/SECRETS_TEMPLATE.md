# GitHub Secrets Configuration

This file lists all required GitHub secrets for the GitOps workflow. Copy these to your GitHub repository's Settings → Secrets and variables → Actions.

## Required Secrets

### Vercel Integration

```bash
VERCEL_ORG_ID=
# Get from: https://vercel.com/account → Settings → General → Your ID

VERCEL_PROJECT_ID=
# Get from: https://vercel.com/[your-org]/[project] → Settings → General → Project ID

VERCEL_TOKEN=
# Create at: https://vercel.com/account/tokens
# Scopes needed: Full access
```

### Supabase Integration

```bash
SUPABASE_ACCESS_TOKEN=
# Create at: https://app.supabase.com/account/tokens
# Name: GitHub Actions

SUPABASE_PROJECT_ID=
# Get from: https://app.supabase.com/project/[project] → Settings → General → Reference ID

SUPABASE_DB_PASSWORD=
# Get from: https://app.supabase.com/project/[project] → Settings → Database → Connection string

SUPABASE_URL=
# Get from: https://app.supabase.com/project/[project] → Settings → API → Project URL

SUPABASE_ANON_KEY=
# Get from: https://app.supabase.com/project/[project] → Settings → API → Project API keys → anon public

SUPABASE_SERVICE_ROLE_KEY=
# Get from: https://app.supabase.com/project/[project] → Settings → API → Project API keys → service_role
```

### Third-party Services

```bash
# Stripe (Production)
STRIPE_SECRET_KEY_PROD=
# Get from: https://dashboard.stripe.com/apikeys → Secret key (Production)

# Stripe (Test)
STRIPE_SECRET_KEY_TEST=
# Get from: https://dashboard.stripe.com/test/apikeys → Secret key (Test mode)

# Resend (Production)
RESEND_API_KEY_PROD=
# Get from: https://resend.com/api-keys → Create API key (Production)

# Resend (Test)
RESEND_API_KEY_TEST=
# Get from: https://resend.com/api-keys → Create API key (Development)

# Google APIs (if using Google My Business integration)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Get from: https://console.cloud.google.com/apis/credentials

# Vertex AI (if using AI features)
VERTEX_PROJECT_ID=
VERTEX_LOCATION=
# Get from: Google Cloud Console → Your project
```

### Optional Security Scanning

```bash
SNYK_TOKEN=
# Get from: https://app.snyk.io/account → General → Auth Token
# Used for security vulnerability scanning in CI/CD
```

## Environment Variables (Vercel Dashboard)

These should be set in Vercel's dashboard for each environment:

### All Environments

```bash
PUBLIC_SUPABASE_URL=$SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
```

### Production Only

```bash
NODE_ENV=production
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY_PROD
RESEND_API_KEY=$RESEND_API_KEY_PROD
```

### Preview/Staging

```bash
NODE_ENV=development
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY_TEST
RESEND_API_KEY=$RESEND_API_KEY_TEST
```

## Setup Instructions

1. **GitHub Secrets**:
   - Go to your repository → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Add each secret from the list above

2. **Vercel Environment Variables**:
   - Go to your Vercel project → Settings → Environment Variables
   - Add variables for each environment (Production, Preview, Development)
   - Use the same values as your GitHub secrets where applicable

3. **Verify Setup**:
   - Run the Environment Management workflow with "health-check" action
   - Check that all deployments complete successfully
   - Verify preview deployments create Supabase branches

## Security Notes

- **Never commit secrets to Git**
- **Rotate keys regularly** (recommended: every 90 days)
- **Use least privilege principle** - only grant necessary permissions
- **Enable 2FA** on all service accounts
- **Audit access logs** regularly
- **Use separate keys** for production and development

## Troubleshooting

If deployments fail, check:

1. All required secrets are set
2. Secret values don't have extra spaces or quotes
3. Tokens have correct permissions/scopes
4. API keys are active and not expired
5. Service accounts have necessary access

## Key Rotation Schedule

Set calendar reminders to rotate these keys:

- [ ] Vercel Token - Every 90 days
- [ ] Supabase Access Token - Every 90 days
- [ ] API Keys (Stripe, Resend) - Every 180 days
- [ ] Google OAuth Credentials - Every 365 days
