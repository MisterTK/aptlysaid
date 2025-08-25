-- ========================================================
-- RUN THIS IN YOUR EXISTING SUPABASE SQL EDITOR
-- Project: dchddqxaelzokyjsebpx
-- ========================================================

-- This will output your complete schema as text
-- Copy the results and save as a .sql file

SELECT string_agg(ddl, E'\n\n' ORDER BY priority, schema_name, object_name)
FROM (
  -- 1. Schemas
  SELECT 1 as priority, 
         n.nspname as schema_name,
         n.nspname as object_name,
         'CREATE SCHEMA IF NOT EXISTS "' || n.nspname || '";' as ddl
  FROM pg_namespace n
  WHERE n.nspname IN ('public', 'private')
  
  UNION ALL
  
  -- 2. Tables with columns
  SELECT 2 as priority,
         schemaname as schema_name,
         tablename as object_name,
         'CREATE TABLE IF NOT EXISTS "' || schemaname || '"."' || tablename || '" (' || E'\n' ||
         string_agg(
           '    "' || column_name || '" ' || 
           CASE 
             WHEN data_type = 'character varying' THEN 'varchar' || COALESCE('(' || character_maximum_length || ')', '')
             WHEN data_type = 'character' THEN 'char(' || character_maximum_length || ')'
             WHEN data_type = 'numeric' AND numeric_precision IS NOT NULL THEN 'numeric(' || numeric_precision || ',' || COALESCE(numeric_scale, 0) || ')'
             ELSE data_type
           END ||
           CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
           CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
           E',\n' ORDER BY ordinal_position
         ) || E'\n);' as ddl
  FROM information_schema.columns c
  JOIN pg_tables t ON t.tablename = c.table_name AND t.schemaname = c.table_schema
  WHERE schemaname IN ('public', 'private')
    AND tablename NOT IN ('schema_migrations', 'supabase_migrations', 'supabase_functions', 'schema_version')
    AND tablename NOT LIKE 'pg_%'
    AND tablename NOT LIKE '_prisma%'
  GROUP BY schemaname, tablename
  
  UNION ALL
  
  -- 3. Primary Keys
  SELECT 3 as priority,
         tc.table_schema as schema_name,
         tc.table_name as object_name,
         'ALTER TABLE "' || tc.table_schema || '"."' || tc.table_name || 
         '" ADD CONSTRAINT "' || tc.constraint_name || '" PRIMARY KEY (' ||
         string_agg('"' || kcu.column_name || '"', ', ' ORDER BY kcu.ordinal_position) || ');' as ddl
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name 
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema IN ('public', 'private')
  GROUP BY tc.table_schema, tc.table_name, tc.constraint_name
  
  UNION ALL
  
  -- 4. Foreign Keys
  SELECT 4 as priority,
         tc.table_schema as schema_name,
         tc.table_name as object_name,
         'ALTER TABLE "' || tc.table_schema || '"."' || tc.table_name || 
         '" ADD CONSTRAINT "' || tc.constraint_name || '" FOREIGN KEY ("' || 
         kcu.column_name || '") REFERENCES "' || 
         ccu.table_schema || '"."' || ccu.table_name || '"("' || ccu.column_name || '")' ||
         CASE 
           WHEN rc.delete_rule != 'NO ACTION' THEN ' ON DELETE ' || rc.delete_rule 
           ELSE '' 
         END ||
         CASE 
           WHEN rc.update_rule != 'NO ACTION' THEN ' ON UPDATE ' || rc.update_rule 
           ELSE '' 
         END || ';' as ddl
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name
  JOIN information_schema.referential_constraints rc 
    ON rc.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_schema IN ('public', 'private')
  
  UNION ALL
  
  -- 5. Indexes
  SELECT 5 as priority,
         schemaname as schema_name,
         tablename as object_name,
         'CREATE INDEX IF NOT EXISTS "' || indexname || '" ON "' || 
         schemaname || '"."' || tablename || '" ' || 
         regexp_replace(indexdef, '.*USING', 'USING') || ';' as ddl
  FROM pg_indexes
  WHERE schemaname IN ('public', 'private')
    AND indexname NOT LIKE '%_pkey'
    AND indexname NOT LIKE '%_key'
    AND indexname NOT LIKE '%_unique'
  
  UNION ALL
  
  -- 6. Enable RLS
  SELECT 6 as priority,
         schemaname as schema_name,
         tablename as object_name,
         'ALTER TABLE "' || schemaname || '"."' || tablename || '" ENABLE ROW LEVEL SECURITY;' as ddl
  FROM pg_tables
  WHERE schemaname IN ('public', 'private')
    AND rowsecurity = true
  
  UNION ALL
  
  -- 7. RLS Policies (simplified)
  SELECT 7 as priority,
         n.nspname as schema_name,
         c.relname as object_name,
         'CREATE POLICY "' || pol.polname || '" ON "' || n.nspname || '"."' || c.relname || '"' ||
         CASE pol.polcmd 
           WHEN 'r' THEN ' FOR SELECT'
           WHEN 'a' THEN ' FOR INSERT'
           WHEN 'w' THEN ' FOR UPDATE'
           WHEN 'd' THEN ' FOR DELETE'
           ELSE ' FOR ALL'
         END ||
         ' TO ' || 
         CASE 
           WHEN pol.polroles::text = '{0}' THEN 'public'
           ELSE array_to_string(ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(pol.polroles)), ', ')
         END ||
         CASE 
           WHEN pol.polqual IS NOT NULL 
           THEN ' USING (' || pg_get_expr(pol.polqual, pol.polrelid) || ')'
           ELSE ''
         END ||
         CASE 
           WHEN pol.polwithcheck IS NOT NULL 
           THEN ' WITH CHECK (' || pg_get_expr(pol.polwithcheck, pol.polrelid) || ')'
           ELSE ''
         END || ';' as ddl
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public', 'private')
  
) AS all_ddl;