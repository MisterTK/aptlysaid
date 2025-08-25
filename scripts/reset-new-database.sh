#!/bin/bash

echo "Resetting the new project database..."

# Export password
export PGPASSWORD="RIvZLSY0OqmQxvui"

# First, let's drop all tables in public and private schemas
psql -h aws-1-us-east-2.pooler.supabase.com \
     -U postgres.efujvtdywpkajwbkmaoi \
     -d postgres \
     -c "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" \
     -c "DROP SCHEMA IF EXISTS private CASCADE; CREATE SCHEMA private;" \
     -c "GRANT ALL ON SCHEMA public TO postgres, anon, authenticated, service_role;" \
     -c "GRANT ALL ON SCHEMA private TO postgres;"

echo "✅ Database reset complete"