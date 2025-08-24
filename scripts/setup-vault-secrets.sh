#!/bin/bash

# Vault Secrets Setup Script
# This script sets up vault secrets in the database

set -e

echo "🔐 Setting up Vault Secrets in Database"
echo "========================================"

# Check if environment is provided
if [ -z "$1" ]; then
    echo "Usage: ./setup-vault-secrets.sh [preview|production]"
    exit 1
fi

ENVIRONMENT=$1

# Load environment variables
if [ "$ENVIRONMENT" = "preview" ]; then
    source ./environments/preview.env
elif [ "$ENVIRONMENT" = "production" ]; then
    source ./environments/production.env
else
    echo "Invalid environment. Use 'preview' or 'production'"
    exit 1
fi

PROJECT_ID=$SUPABASE_PROJECT_ID
echo "Setting vault secrets for $ENVIRONMENT environment (Project: $PROJECT_ID)"
echo ""

# Function to set a vault secret via SQL
set_vault_secret() {
    local SECRET_NAME=$1
    local SECRET_VALUE=$2
    local DESCRIPTION=$3
    
    echo "Setting $SECRET_NAME in vault..."
    
    SQL="SELECT vault.set_secret('$SECRET_NAME', '$SECRET_VALUE', '$DESCRIPTION');"
    
    echo "$SQL" | supabase db query --project-ref "$PROJECT_ID" > /dev/null 2>&1 || {
        echo "  ⚠️  Failed to set $SECRET_NAME"
        return 1
    }
    
    echo "  ✅ $SECRET_NAME set successfully"
}

# Google OAuth Secrets
echo "📌 Google OAuth Configuration"
read -p "Enter GOOGLE_OAUTH_CLIENT_ID: " GOOGLE_OAUTH_CLIENT_ID
set_vault_secret "google_oauth_client_id" "$GOOGLE_OAUTH_CLIENT_ID" "Google OAuth Client ID"

read -s -p "Enter GOOGLE_OAUTH_CLIENT_SECRET: " GOOGLE_OAUTH_CLIENT_SECRET
echo ""
set_vault_secret "google_oauth_client_secret" "$GOOGLE_OAUTH_CLIENT_SECRET" "Google OAuth Client Secret"

# Stripe Secrets
echo ""
echo "💳 Stripe Configuration"
read -s -p "Enter STRIPE_SECRET_KEY: " STRIPE_SECRET_KEY
echo ""
set_vault_secret "stripe_secret_key" "$STRIPE_SECRET_KEY" "Stripe Secret Key"

read -s -p "Enter STRIPE_WEBHOOK_SECRET: " STRIPE_WEBHOOK_SECRET
echo ""
set_vault_secret "stripe_webhook_secret" "$STRIPE_WEBHOOK_SECRET" "Stripe Webhook Secret"

# AI Configuration
echo ""
echo "🤖 AI Configuration"
read -s -p "Enter OPENAI_API_KEY: " OPENAI_API_KEY
echo ""
set_vault_secret "openai_api_key" "$OPENAI_API_KEY" "OpenAI API Key"

echo "Enter VERTEX_AI_CREDENTIALS JSON (paste and press Ctrl+D when done):"
VERTEX_AI_CREDENTIALS=$(cat)
# Escape single quotes in JSON
VERTEX_AI_CREDENTIALS="${VERTEX_AI_CREDENTIALS//\'/\'\'}"
set_vault_secret "vertex_ai_credentials" "$VERTEX_AI_CREDENTIALS" "Vertex AI Service Account Credentials"

# Email Configuration
echo ""
echo "📧 Email Configuration"
read -s -p "Enter SENDGRID_API_KEY: " SENDGRID_API_KEY
echo ""
set_vault_secret "sendgrid_api_key" "$SENDGRID_API_KEY" "SendGrid API Key"

# Encryption Key
echo ""
echo "🔒 Security Configuration"
read -s -p "Enter ENCRYPTION_KEY (32 characters): " ENCRYPTION_KEY
echo ""
set_vault_secret "encryption_key" "$ENCRYPTION_KEY" "Master encryption key"

# Verify secrets were set
echo ""
echo "Verifying vault secrets..."
VERIFY_SQL="SELECT name, description, created_at FROM vault.secrets ORDER BY created_at DESC LIMIT 10;"
echo "$VERIFY_SQL" | supabase db query --project-ref "$PROJECT_ID"

echo ""
echo "✅ Vault secrets setup complete for $ENVIRONMENT environment!"
echo ""
echo "To retrieve a secret from your application, use:"
echo "  SELECT vault.get_secret('secret_name');"