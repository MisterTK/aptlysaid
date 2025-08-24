-- Vault Secrets Configuration
-- Simplified version that works with standard Supabase permissions

-- The vault extension should already be enabled via dashboard
-- We'll use a simpler approach with a regular table for now

-- Create a secure secrets table in the private schema instead
CREATE TABLE IF NOT EXISTS private.app_secrets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    key text NOT NULL UNIQUE,
    value text NOT NULL,
    description text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_app_secrets_key ON private.app_secrets(key);

-- Function to set a secret
CREATE OR REPLACE FUNCTION private.set_secret(
    secret_key text,
    secret_value text,
    secret_description text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO private.app_secrets (key, value, description)
    VALUES (secret_key, secret_value, secret_description)
    ON CONFLICT (key) 
    DO UPDATE SET 
        value = EXCLUDED.value,
        description = COALESCE(EXCLUDED.description, private.app_secrets.description),
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get a secret
CREATE OR REPLACE FUNCTION private.get_secret(secret_key text)
RETURNS text AS $$
DECLARE
    secret_value text;
BEGIN
    SELECT value INTO secret_value
    FROM private.app_secrets
    WHERE key = secret_key;
    
    RETURN secret_value;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION private.set_secret(text, text, text) TO postgres;
GRANT EXECUTE ON FUNCTION private.get_secret(text) TO postgres, authenticated, service_role;

-- Update trigger for updated_at
CREATE TRIGGER update_app_secrets_updated_at 
    BEFORE UPDATE ON private.app_secrets
    FOR EACH ROW 
    EXECUTE FUNCTION public.update_updated_at();

-- NOTE: Actual secrets will be set via Edge Function environment variables
-- This table is for non-sensitive configuration that needs to be dynamic