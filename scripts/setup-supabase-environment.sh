#!/bin/bash

# Comprehensive Supabase Environment Setup Script
# This script sets up a complete Supabase environment (preview or production)

set -e

echo "🚀 Supabase Environment Setup"
echo "=============================="

# Check if environment is provided
if [ -z "$1" ]; then
    echo "Usage: ./setup-supabase-environment.sh [preview|production]"
    exit 1
fi

ENVIRONMENT=$1

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables
if [ "$ENVIRONMENT" = "preview" ]; then
    source ./environments/preview.env
elif [ "$ENVIRONMENT" = "production" ]; then
    source ./environments/production.env
else
    echo -e "${RED}Invalid environment. Use 'preview' or 'production'${NC}"
    exit 1
fi

# Check required environment variables
check_env_var() {
    if [ -z "${!1}" ]; then
        echo -e "${RED}Error: $1 is not set in environments/$ENVIRONMENT.env${NC}"
        exit 1
    fi
}

echo -e "${YELLOW}Checking environment variables...${NC}"
check_env_var "SUPABASE_PROJECT_ID"
check_env_var "NEXT_PUBLIC_SUPABASE_URL"
check_env_var "SUPABASE_SERVICE_ROLE_KEY"

# Check if SUPABASE_ACCESS_TOKEN is set
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
    echo -e "${RED}Error: SUPABASE_ACCESS_TOKEN environment variable is not set${NC}"
    echo "Please run: export SUPABASE_ACCESS_TOKEN=your_token"
    exit 1
fi

PROJECT_ID=$SUPABASE_PROJECT_ID
echo -e "${GREEN}Setting up $ENVIRONMENT environment (Project: $PROJECT_ID)${NC}"
echo ""

# Step 1: Link the project
echo -e "${YELLOW}Step 1: Linking to Supabase project...${NC}"
if [ "$ENVIRONMENT" = "preview" ]; then
    DB_PASSWORD="${SUPABASE_PREVIEW_DB_PASSWORD:-}"
elif [ "$ENVIRONMENT" = "production" ]; then
    DB_PASSWORD="${SUPABASE_PROD_DB_PASSWORD:-}"
fi

if [ -z "$DB_PASSWORD" ]; then
    read -s -p "Enter database password for $ENVIRONMENT: " DB_PASSWORD
    echo ""
fi

supabase link --project-ref "$PROJECT_ID" --password "$DB_PASSWORD" 2>/dev/null || true

# Step 2: Run database migrations
echo -e "${YELLOW}Step 2: Running database migrations...${NC}"
supabase db push --project-ref "$PROJECT_ID"

# Step 3: Deploy Edge Functions
echo -e "${YELLOW}Step 3: Deploying Edge Functions...${NC}"
for function in v2-api v2-workflow-orchestrator v2-external-integrator; do
    echo "  Deploying $function..."
    supabase functions deploy "$function" --project-ref "$PROJECT_ID"
done

# Step 4: Set up Edge Function Secrets
echo -e "${YELLOW}Step 4: Setting up Edge Function secrets...${NC}"
echo "Would you like to set up edge function secrets now? (y/n)"
read -r SETUP_SECRETS

if [ "$SETUP_SECRETS" = "y" ]; then
    ./scripts/setup-edge-function-secrets.sh "$ENVIRONMENT"
else
    echo -e "${YELLOW}  Skipping secrets setup. Run ./scripts/setup-edge-function-secrets.sh $ENVIRONMENT later.${NC}"
fi

# Step 5: Set up Vault Secrets (database)
echo -e "${YELLOW}Step 5: Setting up Vault secrets in database...${NC}"
echo "Would you like to set up vault secrets now? (y/n)"
read -r SETUP_VAULT

if [ "$SETUP_VAULT" = "y" ]; then
    ./scripts/setup-vault-secrets.sh "$ENVIRONMENT"
else
    echo -e "${YELLOW}  Skipping vault setup. Run ./scripts/setup-vault-secrets.sh $ENVIRONMENT later.${NC}"
fi

# Step 6: Enable Auth Providers
echo -e "${YELLOW}Step 6: Configuring Auth providers...${NC}"
echo "Auth providers must be configured in the Supabase dashboard:"
echo "  1. Go to: $NEXT_PUBLIC_SUPABASE_URL"
echo "  2. Navigate to Authentication > Providers"
echo "  3. Enable and configure:"
echo "     - Email (already enabled)"
echo "     - Google OAuth"
echo "     - Any other providers you need"

# Step 7: Configure Storage Buckets
echo -e "${YELLOW}Step 7: Setting up Storage buckets...${NC}"
echo "Creating storage buckets..."

# Create storage buckets via SQL
cat << EOF | supabase db push --project-ref "$PROJECT_ID"
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('documents', 'documents', false, 10485760, ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies
CREATE POLICY "Avatar images are publicly accessible" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" ON storage.objects
    FOR INSERT TO authenticated 
    WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar" ON storage.objects
    FOR UPDATE TO authenticated 
    USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar" ON storage.objects
    FOR DELETE TO authenticated 
    USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
EOF

# Step 8: Verify Cron Jobs
echo -e "${YELLOW}Step 8: Verifying Cron Jobs...${NC}"
echo "Checking cron jobs status..."

CRON_CHECK=$(cat << EOF | supabase db query --project-ref "$PROJECT_ID"
SELECT jobname, schedule, active 
FROM cron.job 
WHERE jobname LIKE 'v2-%'
ORDER BY jobname;
EOF
)

echo "$CRON_CHECK"

# Step 9: Set Application Configuration
echo -e "${YELLOW}Step 9: Setting application configuration...${NC}"
cat << EOF | supabase db push --project-ref "$PROJECT_ID"
-- Set application configuration
DO \$\$
BEGIN
    -- Set application settings for cron jobs
    ALTER DATABASE postgres SET "app.settings.supabase_url" = '$NEXT_PUBLIC_SUPABASE_URL';
    ALTER DATABASE postgres SET "app.settings.service_role_key" = '$SUPABASE_SERVICE_ROLE_KEY';
    
    -- Create configuration table if not exists
    CREATE TABLE IF NOT EXISTS public.app_config (
        key text PRIMARY KEY,
        value jsonb NOT NULL,
        updated_at timestamptz DEFAULT now()
    );
    
    -- Insert default configuration
    INSERT INTO public.app_config (key, value) VALUES
        ('environment', '"$ENVIRONMENT"'::jsonb),
        ('features', '{"review_sync": true, "ai_generation": true, "auto_publish": false}'::jsonb),
        ('limits', '{"max_reviews_per_sync": 100, "max_responses_per_day": 500}'::jsonb)
    ON CONFLICT (key) DO UPDATE SET 
        value = EXCLUDED.value,
        updated_at = now();
END\$\$;
EOF

# Step 10: Run initial seed data (if exists)
echo -e "${YELLOW}Step 10: Running seed data...${NC}"
if [ -f "./supabase/seed.sql" ]; then
    supabase db seed --project-ref "$PROJECT_ID"
else
    echo "  No seed file found, skipping..."
fi

# Summary
echo ""
echo -e "${GREEN}✅ Supabase environment setup complete for $ENVIRONMENT!${NC}"
echo ""
echo "Summary:"
echo "  ✓ Database migrations applied"
echo "  ✓ Edge functions deployed"
echo "  ✓ Storage buckets configured"
echo "  ✓ Cron jobs set up"
echo "  ✓ Application configuration set"
echo ""
echo "Next steps:"
echo "  1. Configure auth providers in Supabase dashboard"
echo "  2. Set up edge function secrets (if not done)"
echo "  3. Set up vault secrets (if not done)"
echo "  4. Configure custom domain (if needed)"
echo "  5. Test the deployment"
echo ""
echo "Useful commands:"
echo "  View logs: supabase functions logs --project-ref $PROJECT_ID"
echo "  View cron jobs: supabase db query 'SELECT * FROM cron.job' --project-ref $PROJECT_ID"
echo "  Test function: curl $NEXT_PUBLIC_SUPABASE_URL/functions/v1/v2-api"