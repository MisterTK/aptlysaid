#!/bin/bash

# Script to dump complete schema from existing Supabase database
# This will create a clean SQL file with all your database objects

echo "Dumping complete schema from existing Supabase project..."

# Your existing project details
EXISTING_PROJECT_REF="dchddqxaelzokyjsebpx"
DB_PASSWORD="RIvZLSY0OqmQxvui"
DB_HOST="aws-0-us-east-2.pooler.supabase.com"
DB_PORT="5432"
DB_NAME="postgres"
DB_USER="postgres.${EXISTING_PROJECT_REF}"

# Output file
OUTPUT_FILE="complete_schema_dump.sql"

# Using pg_dump to get complete schema
# This includes all tables, indexes, functions, triggers, policies, etc.
PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --schema=public \
  --schema=private \
  --no-owner \
  --no-privileges \
  --no-comments \
  --no-publications \
  --no-subscriptions \
  --no-tablespaces \
  --schema-only \
  --no-security-labels \
  --if-exists \
  --clean \
  > "${OUTPUT_FILE}"

if [ $? -eq 0 ]; then
  echo "✅ Schema dumped successfully to ${OUTPUT_FILE}"
  echo ""
  echo "File size: $(wc -l ${OUTPUT_FILE} | awk '{print $1}') lines"
  echo ""
  echo "Next steps:"
  echo "1. Review the ${OUTPUT_FILE} file"
  echo "2. Remove any pgmq references"
  echo "3. Copy to: supabase/migrations/$(date +%Y%m%d%H%M%S)_complete_schema.sql"
  echo "4. Commit and push to deploy"
else
  echo "❌ Failed to dump schema. Please check your connection details."
fi