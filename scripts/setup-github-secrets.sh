#!/bin/bash

# GitHub Secrets Setup Script
# This script helps you set up all required GitHub secrets

echo "🔐 Setting up GitHub Secrets for aptlysaid"
echo "=========================================="
echo ""
echo "This script will guide you through setting up the required secrets."
echo "You'll need to have the following information ready:"
echo ""
echo "1. Supabase Access Token (from https://supabase.com/dashboard/account/tokens)"
echo "2. Your production Supabase project details"
echo "3. API keys for external services (Google, Stripe, OpenAI, etc.)"
echo ""
echo "Press Enter to continue..."
read

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed."
    echo "Please install it from: https://cli.github.com/"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo "❌ Not authenticated with GitHub CLI."
    echo "Please run: gh auth login"
    exit 1
fi

echo "✅ GitHub CLI is authenticated"
echo ""

# Function to set a secret
set_secret() {
    local name=$1
    local prompt=$2
    local is_password=$3
    
    echo ""
    echo "Setting: $name"
    echo "Description: $prompt"
    
    if [ "$is_password" = "true" ]; then
        read -s -p "Enter value: " value
        echo ""
    else
        read -p "Enter value: " value
    fi
    
    if [ ! -z "$value" ]; then
        echo "$value" | gh secret set "$name" -R MisterTK/aptlysaid
        echo "✅ $name set successfully"
    else
        echo "⚠️  Skipped $name (no value provided)"
    fi
}

echo "📌 Core Supabase Configuration"
echo "=============================="

set_secret "SUPABASE_ACCESS_TOKEN" "Supabase Access Token (sbp_...)" "true"
set_secret "SUPABASE_PROJECT_ID" "Production Project ID (e.g., efujvtdywpkajwbkmaoi)" "false"
set_secret "SUPABASE_DB_PASSWORD" "Database Password" "true"
set_secret "SUPABASE_SERVICE_ROLE_KEY" "Service Role Key (eyJ...)" "true"

echo ""
echo "🔑 External Services"
echo "===================="

echo ""
echo "Google OAuth (for Google My Business API)"
set_secret "GOOGLE_OAUTH_CLIENT_ID" "Google OAuth Client ID" "false"
set_secret "GOOGLE_OAUTH_CLIENT_SECRET" "Google OAuth Client Secret" "true"

echo ""
echo "OpenAI"
set_secret "OPENAI_API_KEY" "OpenAI API Key (sk-...)" "true"

echo ""
echo "Stripe"
set_secret "STRIPE_SECRET_KEY" "Stripe Secret Key (sk_live_... or sk_test_...)" "true"
set_secret "STRIPE_WEBHOOK_SECRET" "Stripe Webhook Secret (whsec_...)" "true"

echo ""
echo "SendGrid (Email)"
set_secret "SENDGRID_API_KEY" "SendGrid API Key (SG...)" "true"

echo ""
echo "Security"
echo "Generate with: openssl rand -hex 16"
set_secret "ENCRYPTION_KEY" "32-character encryption key" "true"

echo ""
echo "======================================"
echo "✅ GitHub Secrets setup complete!"
echo "======================================"
echo ""
echo "You can verify the secrets at:"
echo "https://github.com/MisterTK/aptlysaid/settings/secrets/actions"
echo ""
echo "Next steps:"
echo "1. Enable Supabase GitHub Integration"
echo "2. Configure Vercel deployment"
echo "3. Push code to trigger deployments"