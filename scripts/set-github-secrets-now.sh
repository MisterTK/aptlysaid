#!/bin/bash

# GitHub Secrets Setup Script with your values
# This script sets up your GitHub secrets using gh CLI

echo "🔐 Setting up GitHub Secrets for aptlysaid"
echo "=========================================="

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Installing GitHub CLI..."
    brew install gh
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "📝 Need to authenticate with GitHub"
    gh auth login
fi

echo "✅ Setting up secrets..."

# Core Supabase Secrets
gh secret set SUPABASE_ACCESS_TOKEN --body="sbp_174d4b4d459cbdf791140c7f41e57780a8c22d66" -R MisterTK/aptlysaid
echo "✅ Set SUPABASE_ACCESS_TOKEN"

gh secret set SUPABASE_PROJECT_ID --body="efujvtdywpkajwbkmaoi" -R MisterTK/aptlysaid
echo "✅ Set SUPABASE_PROJECT_ID"

gh secret set SUPABASE_DB_PASSWORD --body="RIvZLSY0OqmQxvui" -R MisterTK/aptlysaid
echo "✅ Set SUPABASE_DB_PASSWORD"

gh secret set SUPABASE_SERVICE_ROLE_KEY --body="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmdWp2dGR5d3BrYWp3YmttYW9pIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NjA3MDA1NCwiZXhwIjoyMDcxNjQ2MDU0fQ.dJ300l5ojP3ObYW12YORcEIiG3jojfljMKgqmtHLDFM" -R MisterTK/aptlysaid
echo "✅ Set SUPABASE_SERVICE_ROLE_KEY"

# Security
gh secret set ENCRYPTION_KEY --body="b35b56be06602c44eee2da9bb5102293" -R MisterTK/aptlysaid
echo "✅ Set ENCRYPTION_KEY"

# Placeholder secrets for services to be configured later
gh secret set GOOGLE_OAUTH_CLIENT_ID --body="TO_BE_CONFIGURED" -R MisterTK/aptlysaid
echo "✅ Set GOOGLE_OAUTH_CLIENT_ID (placeholder)"

gh secret set GOOGLE_OAUTH_CLIENT_SECRET --body="TO_BE_CONFIGURED" -R MisterTK/aptlysaid
echo "✅ Set GOOGLE_OAUTH_CLIENT_SECRET (placeholder)"

gh secret set OPENAI_API_KEY --body="TO_BE_CONFIGURED" -R MisterTK/aptlysaid
echo "✅ Set OPENAI_API_KEY (placeholder)"

gh secret set STRIPE_SECRET_KEY --body="TO_BE_CONFIGURED" -R MisterTK/aptlysaid
echo "✅ Set STRIPE_SECRET_KEY (placeholder)"

gh secret set STRIPE_WEBHOOK_SECRET --body="TO_BE_CONFIGURED" -R MisterTK/aptlysaid
echo "✅ Set STRIPE_WEBHOOK_SECRET (placeholder)"

gh secret set SENDGRID_API_KEY --body="TO_BE_CONFIGURED" -R MisterTK/aptlysaid
echo "✅ Set SENDGRID_API_KEY (placeholder)"

echo ""
echo "======================================"
echo "✅ GitHub Secrets setup complete!"
echo "======================================"
echo ""
echo "Secrets configured:"
echo "  ✅ SUPABASE_ACCESS_TOKEN"
echo "  ✅ SUPABASE_PROJECT_ID (efujvtdywpkajwbkmaoi)"
echo "  ✅ SUPABASE_DB_PASSWORD"
echo "  ✅ SUPABASE_SERVICE_ROLE_KEY"
echo "  ✅ ENCRYPTION_KEY (generated)"
echo "  ⚠️  Google OAuth (placeholder - configure later)"
echo "  ⚠️  OpenAI (placeholder - configure later)"
echo "  ⚠️  Stripe (placeholder - configure later)"
echo "  ⚠️  SendGrid (placeholder - configure later)"
echo ""
echo "View secrets at: https://github.com/MisterTK/aptlysaid/settings/secrets/actions"
echo ""
echo "Next steps:"
echo "1. Run this script: ./scripts/set-github-secrets-now.sh"
echo "2. Enable Supabase GitHub Integration at: https://supabase.com/dashboard/project/efujvtdywpkajwbkmaoi/settings/integrations"
echo "3. The GitHub Actions will now work with your Supabase project!"