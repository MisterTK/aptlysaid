#!/bin/bash

# Repair migration history in remote database
echo "Repairing migration history..."

# Link to project
supabase link --project-ref efujvtdywpkajwbkmaoi --password RIvZLSY0OqmQxvui

# Mark old migrations as reverted
supabase migration repair --status reverted 20250824213835
supabase migration repair --status reverted 20250824220000  
supabase migration repair --status reverted 20250824220100
supabase migration repair --status reverted 20250824230000
supabase migration repair --status reverted 20250824231000

echo "Migration history repaired!"