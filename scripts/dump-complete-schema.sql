-- Run this query in your EXISTING Supabase SQL Editor (dchddqxaelzokyjsebpx)
-- It will output the complete DDL for your database schema

WITH RECURSIVE table_ddl AS (
  SELECT 
    'CREATE TABLE IF NOT EXISTS "' || schemaname || '"."' || tablename || '" (' || E'\n' ||
    string_agg(
      '    "' || column_name || '" ' || 
      data_type || 
      CASE 
        WHEN character_maximum_length IS NOT NULL 
        THEN '(' || character_maximum_length || ')'
        WHEN numeric_precision IS NOT NULL 
        THEN '(' || numeric_precision || ',' || COALESCE(numeric_scale, 0) || ')'
        ELSE ''
      END ||
      CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
      CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
      E',\n' ORDER BY ordinal_position
    ) || E'\n);' as ddl,
    schemaname,
    tablename
  FROM information_schema.columns c
  JOIN pg_tables t ON t.tablename = c.table_name AND t.schemaname = c.table_schema
  WHERE schemaname IN ('public', 'private')
    AND tablename NOT IN ('schema_migrations', 'supabase_migrations')
  GROUP BY schemaname, tablename
)
SELECT ddl FROM table_ddl
ORDER BY schemaname, tablename;

-- Also get indexes
SELECT 
  'CREATE INDEX IF NOT EXISTS "' || indexname || '" ON "' || schemaname || '"."' || tablename || '" ' || 
  regexp_replace(indexdef, '.*USING', 'USING') || ';' as index_ddl
FROM pg_indexes
WHERE schemaname IN ('public', 'private')
  AND indexname NOT LIKE '%_pkey'
  AND indexname NOT LIKE '%_key'
ORDER BY schemaname, tablename, indexname;

-- Get foreign key constraints
SELECT 
  'ALTER TABLE "' || tc.table_schema || '"."' || tc.table_name || '" ADD CONSTRAINT "' || tc.constraint_name || 
  '" FOREIGN KEY (' || kcu.column_name || ') REFERENCES "' || 
  ccu.table_schema || '"."' || ccu.table_name || '"(' || ccu.column_name || ')' ||
  CASE 
    WHEN rc.delete_rule != 'NO ACTION' THEN ' ON DELETE ' || rc.delete_rule 
    ELSE '' 
  END ||
  CASE 
    WHEN rc.update_rule != 'NO ACTION' THEN ' ON UPDATE ' || rc.update_rule 
    ELSE '' 
  END || ';' as fk_ddl
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_schema IN ('public', 'private')
ORDER BY tc.table_schema, tc.table_name;

-- Get all functions
SELECT 
  'CREATE OR REPLACE FUNCTION "' || n.nspname || '"."' || p.proname || '"(' || 
  pg_catalog.pg_get_function_arguments(p.oid) || ') RETURNS ' ||
  pg_catalog.pg_get_function_result(p.oid) || E' AS\n$BODY$' ||
  p.prosrc || E'$BODY$\nLANGUAGE ' || l.lanname || 
  CASE WHEN p.provolatile = 'i' THEN ' IMMUTABLE' 
       WHEN p.provolatile = 's' THEN ' STABLE'
       ELSE '' END ||
  CASE WHEN p.prosecdef THEN ' SECURITY DEFINER' ELSE '' END || ';' as function_ddl
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
JOIN pg_language l ON p.prolang = l.oid
WHERE n.nspname IN ('public', 'private')
  AND p.prokind = 'f'
ORDER BY n.nspname, p.proname;

-- Get all triggers
SELECT 
  'CREATE TRIGGER "' || trigger_name || '" ' ||
  action_timing || ' ' || event_manipulation || ' ON "' ||
  event_object_schema || '"."' || event_object_table || '"' ||
  CASE WHEN action_orientation = 'ROW' THEN ' FOR EACH ROW' ELSE '' END ||
  ' EXECUTE FUNCTION ' || action_statement || ';' as trigger_ddl
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'private')
ORDER BY event_object_schema, event_object_table, trigger_name;

-- Get RLS policies
SELECT 
  'CREATE POLICY "' || pol.polname || '" ON "' || n.nspname || '"."' || c.relname || '"' ||
  CASE pol.polcmd 
    WHEN 'r' THEN ' FOR SELECT'
    WHEN 'a' THEN ' FOR INSERT'
    WHEN 'w' THEN ' FOR UPDATE'
    WHEN 'd' THEN ' FOR DELETE'
    ELSE ' FOR ALL'
  END ||
  CASE WHEN pol.polpermissive THEN ' AS PERMISSIVE' ELSE ' AS RESTRICTIVE' END ||
  CASE WHEN pol.polroles::text != '{0}' THEN ' TO ' || 
    array_to_string(ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(pol.polroles)), ', ')
  ELSE '' END ||
  CASE WHEN pol.polqual IS NOT NULL THEN ' USING (' || pg_get_expr(pol.polqual, pol.polrelid) || ')' ELSE '' END ||
  CASE WHEN pol.polwithcheck IS NOT NULL THEN ' WITH CHECK (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')' ELSE '' END ||
  ';' as policy_ddl
FROM pg_policy pol
JOIN pg_class c ON c.oid = pol.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname IN ('public', 'private')
ORDER BY n.nspname, c.relname, pol.polname;