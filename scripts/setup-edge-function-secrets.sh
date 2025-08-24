#!/bin/bash

# Edge Function Secrets Setup Script
# This script sets up secrets for edge functions in both preview and production environments

set -e

echo "🔐 Setting up Edge Function Secrets"
echo "=================================="

# Check if environment is provided
if [ -z "$1" ]; then
    echo "Usage: ./setup-edge-function-secrets.sh [preview|production]"
    exit 1
fi

ENVIRONMENT=$1

# Load environment variables based on the environment
if [ "$ENVIRONMENT" = "preview" ]; then
    source ./environments/preview.env
    PROJECT_ID=$SUPABASE_PROJECT_ID
elif [ "$ENVIRONMENT" = "production" ]; then
    source ./environments/production.env
    PROJECT_ID=$SUPABASE_PROJECT_ID
else
    echo "Invalid environment. Use 'preview' or 'production'"
    exit 1
fi

# Check if SUPABASE_ACCESS_TOKEN is set
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo "Error: SUPABASE_ACCESS_TOKEN environment variable is not set"
    echo "Please export SUPABASE_ACCESS_TOKEN=your_token"
    exit 1
fi

echo "Setting secrets for $ENVIRONMENT environment (Project: $PROJECT_ID)"
echo ""

# Function to set a secret
set_secret() {
    local SECRET_NAME=$1
    local SECRET_VALUE=$2
    local DESCRIPTION=$3
    
    echo "Setting $SECRET_NAME..."
    
    supabase secrets set "$SECRET_NAME=$SECRET_VALUE" \
        --project-ref "$PROJECT_ID" \
        2>/dev/null || echo "  ⚠️  Failed to set $SECRET_NAME"
}

# Google OAuth Secrets
echo "📌 Google OAuth Configuration"
read -p "Enter GOOGLE_OAUTH_CLIENT_ID: " GOOGLE_OAUTH_CLIENT_ID
set_secret "GOOGLE_OAUTH_CLIENT_ID" "$GOOGLE_OAUTH_CLIENT_ID" "Google OAuth Client ID"

read -s -p "Enter GOOGLE_OAUTH_CLIENT_SECRET: " GOOGLE_OAUTH_CLIENT_SECRET
echo ""
set_secret "GOOGLE_OAUTH_CLIENT_SECRET" "$GOOGLE_OAUTH_CLIENT_SECRET" "Google OAuth Client Secret"

# Stripe Secrets
echo ""
echo "💳 Stripe Configuration"
read -s -p "Enter STRIPE_SECRET_KEY: " STRIPE_SECRET_KEY
echo ""
set_secret "STRIPE_SECRET_KEY" "$STRIPE_SECRET_KEY" "Stripe Secret Key"

read -s -p "Enter STRIPE_WEBHOOK_SECRET: " STRIPE_WEBHOOK_SECRET
echo ""
set_secret "STRIPE_WEBHOOK_SECRET" "$STRIPE_WEBHOOK_SECRET" "Stripe Webhook Secret"

read -p "Enter STRIPE_PRICE_ID_STARTER: " STRIPE_PRICE_ID_STARTER
set_secret "STRIPE_PRICE_ID_STARTER" "$STRIPE_PRICE_ID_STARTER" "Stripe Starter Plan Price ID"

read -p "Enter STRIPE_PRICE_ID_PRO: " STRIPE_PRICE_ID_PRO
set_secret "STRIPE_PRICE_ID_PRO" "$STRIPE_PRICE_ID_PRO" "Stripe Pro Plan Price ID"

read -p "Enter STRIPE_PRICE_ID_ENTERPRISE: " STRIPE_PRICE_ID_ENTERPRISE
set_secret "STRIPE_PRICE_ID_ENTERPRISE" "$STRIPE_PRICE_ID_ENTERPRISE" "Stripe Enterprise Plan Price ID"

# AI Configuration
echo ""
echo "🤖 AI Configuration"
read -s -p "Enter OPENAI_API_KEY: " OPENAI_API_KEY
echo ""
set_secret "OPENAI_API_KEY" "$OPENAI_API_KEY" "OpenAI API Key"

read -p "Enter VERTEX_AI_PROJECT_ID: " VERTEX_AI_PROJECT_ID
set_secret "VERTEX_AI_PROJECT_ID" "$VERTEX_AI_PROJECT_ID" "Vertex AI Project ID"

echo "Enter VERTEX_AI_CREDENTIALS (paste JSON, then press Ctrl+D when done):"
VERTEX_AI_CREDENTIALS=$(cat)
set_secret "VERTEX_AI_CREDENTIALS" "$VERTEX_AI_CREDENTIALS" "Vertex AI Service Account Credentials"

# Email Configuration
echo ""
echo "📧 Email Configuration"
read -s -p "Enter SENDGRID_API_KEY: " SENDGRID_API_KEY
echo ""
set_secret "SENDGRID_API_KEY" "$SENDGRID_API_KEY" "SendGrid API Key"

read -p "Enter SENDGRID_FROM_EMAIL: " SENDGRID_FROM_EMAIL
set_secret "SENDGRID_FROM_EMAIL" "$SENDGRID_FROM_EMAIL" "SendGrid From Email"

# Encryption Key
echo ""
echo "🔒 Security Configuration"
read -s -p "Enter ENCRYPTION_KEY (32 characters): " ENCRYPTION_KEY
echo ""
set_secret "ENCRYPTION_KEY" "$ENCRYPTION_KEY" "Master encryption key"

# Internal Service URLs (for edge functions to communicate)
echo ""
echo "🔗 Internal Service Configuration"
set_secret "SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_URL" "Supabase URL"
set_secret "SUPABASE_SERVICE_ROLE_KEY" "$SUPABASE_SERVICE_ROLE_KEY" "Supabase Service Role Key"

# Function-specific configuration
echo ""
echo "⚡ Edge Function Configuration"
set_secret "WORKFLOW_ORCHESTRATOR_URL" "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/v2-workflow-orchestrator" "Workflow Orchestrator URL"
set_secret "EXTERNAL_INTEGRATOR_URL" "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/v2-external-integrator" "External Integrator URL"
set_secret "API_URL" "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/v2-api" "API URL"

echo ""
echo "✅ Edge function secrets setup complete for $ENVIRONMENT environment!"
echo ""
echo "To verify secrets were set correctly, run:"
echo "  supabase secrets list --project-ref $PROJECT_ID"
echo ""
echo "Note: Some secrets may need to be manually configured in the Supabase dashboard:"
echo "  - Database connection strings"
echo "  - Custom domain configurations"
echo "  - Advanced security settings"