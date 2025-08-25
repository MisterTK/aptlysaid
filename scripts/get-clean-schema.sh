#!/bin/bash

echo "Getting clean schema from existing project..."

# Use Supabase CLI to connect to existing project
export SUPABASE_ACCESS_TOKEN="sbp_174d4b4d459cbdf791140c7f41e57780a8c22d66"

# Dump schema using supabase db dump
supabase db dump \
  --project-ref dchddqxaelzokyjsebpx \
  --schema public,private \
  --no-data \
  > complete_schema_from_existing.sql

echo "Schema dumped to complete_schema_from_existing.sql"

# Clean up the schema
echo "Cleaning up schema..."
sed -i '' '/pgmq/d' complete_schema_from_existing.sql
sed -i '' '/CREATE EXTENSION.*pg_cron/d' complete_schema_from_existing.sql
sed -i '' '/CREATE EXTENSION.*pg_net/d' complete_schema_from_existing.sql
sed -i '' '/CREATE EXTENSION.*pg_graphql/d' complete_schema_from_existing.sql
sed -i '' '/CREATE EXTENSION.*pgcrypto/d' complete_schema_from_existing.sql
sed -i '' '/CREATE EXTENSION.*uuid-ossp/d' complete_schema_from_existing.sql

echo "✅ Clean schema ready in complete_schema_from_existing.sql"