import { createClient } from "@supabase/supabase-js"
import { browser } from "$app/environment"
import type { Database } from "../../DatabaseDefinitions"

let adminClient: ReturnType<typeof createClient<Database>> | null = null

export function createAdminClient() {
  if (browser) {
    throw new Error("createAdminClient should only be used on the server")
  }

  if (!adminClient) {
    const url = process.env.PUBLIC_SUPABASE_URL
    const serviceRole = process.env.PRIVATE_SUPABASE_SERVICE_ROLE

    if (!url) {
      throw new Error("PUBLIC_SUPABASE_URL is not set")
    }
    if (!serviceRole) {
      throw new Error("PRIVATE_SUPABASE_SERVICE_ROLE is not set")
    }

    adminClient = createClient<Database>(url, serviceRole, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  return adminClient
}
