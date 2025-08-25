#!/bin/bash

echo "Resetting the new project database..."

# TODO: [SECURITY] Move database password to environment variable or secrets manager
# Currently exposed in plain text - critical security risk
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