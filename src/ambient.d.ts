declare global {
  type FormAccountUpdateResult = {
    errorMessage?: string
    errorFields?: string[]
    fullName?: string
    companyName?: string
    website?: string
    email?: string
  }

  namespace NodeJS {
    interface ProcessEnv {
      PUBLIC_SUPABASE_URL: string
      PUBLIC_SUPABASE_ANON_KEY: string
      PRIVATE_SUPABASE_SERVICE_ROLE: string
      PRIVATE_STRIPE_API_KEY: string
      PRIVATE_STRIPE_WEBHOOK_SECRET?: string
      PRIVATE_RESEND_API_KEY?: string
      PRIVATE_ADMIN_EMAIL?: string
      PRIVATE_FROM_ADMIN_EMAIL?: string
      GOOGLE_CLOUD_PROJECT: string
      GOOGLE_CLOUD_LOCATION?: string
      GOOGLE_APPLICATION_CREDENTIALS?: string
      CRON_SECRET?: string
      TOKEN_ENCRYPTION_KEY?: string
    }
  }
}

export {}
