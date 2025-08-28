# Deployment Process

## Quick Reference

- Feature development: Always branch from `develop`
- Staging deployment: Merge PR to `develop`
- Production deployment: Merge PR to `main`

## Environments

### Temporary (Current Production)

- **Supabase Project**: dchddqxaelzokyjsebpx
- **URL**: https://dchddqxaelzokyjsebpx.supabase.co
- **Purpose**: Current production environment to be migrated

### Preview/Staging

- **Supabase Project**: udkojnvmgqicrvzbaqts
- **URL**: https://udkojnvmgqicrvzbaqts.supabase.co
- **Branch**: `develop`
- **Auto-deploys**: On push to `develop`

### Production

- **Supabase Project**: efujvtdywpkajwbkmaoi
- **URL**: https://efujvtdywpkajwbkmaoi.supabase.co
- **Branch**: `main`
- **Auto-deploys**: On push to `main`

## Workflow

### 1. Feature Development

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
# Make changes
git add .
git commit -m "feat: your feature description"
git push origin feature/your-feature-name
```

### 2. Create Pull Request

- Target branch: `develop`
- Wait for CI checks to pass
- Request review from team lead

### 3. Staging Deployment

- Merge PR to `develop`
- GitHub Actions automatically:
  - Runs tests
  - Deploys Supabase functions
  - Runs database migrations
  - Vercel deploys frontend

### 4. Production Deployment

- Create PR from `develop` to `main`
- Requires approval
- Merge triggers production deployment

## Database Migrations

### Creating a Migration

```bash
supabase migration new your_migration_name
# Edit the migration file in supabase/migrations/
```

### Testing Locally

```bash
supabase db reset  # Resets and applies all migrations
supabase db start  # Starts local database
```

## Edge Functions

### Local Development

```bash
supabase functions serve v2-api
# Test at http://localhost:54321/functions/v1/v2-api
```

### Deployment

Functions are automatically deployed via GitHub Actions

## Emergency Procedures

### Rollback

```bash
# Revert commit on main branch
git checkout main
git revert HEAD
git push origin main
```

### Hotfix

```bash
git checkout main
git checkout -b hotfix/issue-description
# Fix the issue
git push origin hotfix/issue-description
# Create PR to main
# After merge, also merge to develop
```

## Required GitHub Secrets

Configure these in your repository settings:

- `SUPABASE_ACCESS_TOKEN`: Your Supabase access token
- `SUPABASE_PREVIEW_PROJECT_ID`: udkojnvmgqicrvzbaqts
- `SUPABASE_PREVIEW_DB_PASSWORD`: Database password for preview
- `SUPABASE_PROD_PROJECT_ID`: efujvtdywpkajwbkmaoi
- `SUPABASE_PROD_DB_PASSWORD`: Database password for production

## Monitoring

- Health checks run every 15 minutes
- Check logs in GitHub Actions
- Monitor Supabase dashboard for database metrics
- Vercel dashboard for frontend analytics
