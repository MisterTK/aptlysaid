-- Vault Secrets Configuration
-- This migration sets up the vault for storing sensitive configuration

-- Enable pgsodium extension for vault functionality
CREATE EXTENSION IF NOT EXISTS pgsodium;

-- Create secrets table if not exists
CREATE TABLE IF NOT EXISTS vault.secrets (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text,
    secret text NOT NULL,
    key_id uuid REFERENCES pgsodium.key(id) DEFAULT (pgsodium.create_key()).id,
    nonce bytea DEFAULT pgsodium.crypto_aead_det_noncegen(),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS on vault.secrets
ALTER TABLE vault.secrets ENABLE ROW LEVEL SECURITY;

-- Create policy for service role only
CREATE POLICY "Service role can manage secrets" ON vault.secrets
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Function to safely insert or update secrets
CREATE OR REPLACE FUNCTION vault.set_secret(
    secret_name text,
    secret_value text,
    secret_description text DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    INSERT INTO vault.secrets (name, secret, description)
    VALUES (secret_name, secret_value, secret_description)
    ON CONFLICT (name) 
    DO UPDATE SET 
        secret = EXCLUDED.secret,
        description = COALESCE(EXCLUDED.description, vault.secrets.description),
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to retrieve decrypted secrets
CREATE OR REPLACE FUNCTION vault.get_secret(secret_name text)
RETURNS text AS $$
DECLARE
    secret_value text;
BEGIN
    SELECT 
        convert_from(
            pgsodium.crypto_aead_det_decrypt(
                base64::bytea,
                convert_to(secret_name, 'utf8'),
                key_id,
                nonce
            ),
            'utf8'
        )::text INTO secret_value
    FROM vault.secrets
    WHERE name = secret_name;
    
    RETURN secret_value;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION vault.set_secret(text, text, text) TO postgres;
GRANT EXECUTE ON FUNCTION vault.get_secret(text) TO postgres, authenticated;

-- NOTE: These secrets should be set manually after deployment
-- They are included here as comments for documentation purposes
/*
-- Example of setting secrets (RUN THESE MANUALLY AFTER DEPLOYMENT):

SELECT vault.set_secret('google_oauth_client_id', 'YOUR_GOOGLE_CLIENT_ID', 'Google OAuth Client ID');
SELECT vault.set_secret('google_oauth_client_secret', 'YOUR_GOOGLE_CLIENT_SECRET', 'Google OAuth Client Secret');
SELECT vault.set_secret('stripe_secret_key', 'YOUR_STRIPE_SECRET_KEY', 'Stripe Secret Key');
SELECT vault.set_secret('stripe_webhook_secret', 'YOUR_STRIPE_WEBHOOK_SECRET', 'Stripe Webhook Secret');
SELECT vault.set_secret('sendgrid_api_key', 'YOUR_SENDGRID_API_KEY', 'SendGrid API Key');
SELECT vault.set_secret('openai_api_key', 'YOUR_OPENAI_API_KEY', 'OpenAI API Key');
SELECT vault.set_secret('vertex_ai_credentials', 'YOUR_VERTEX_AI_CREDENTIALS_JSON', 'Vertex AI Service Account Credentials');
SELECT vault.set_secret('encryption_key', 'YOUR_ENCRYPTION_KEY', 'Master encryption key for sensitive data');

*/