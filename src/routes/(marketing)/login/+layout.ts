import {
  createBrowserClient,
  createServerClient,
  isBrowser,
} from "@supabase/ssr"
import { redirect } from "@sveltejs/kit"
import { load_helper } from "$lib/load_helpers.js"
import type { LoadEvent } from "@sveltejs/kit"

export const load = async ({ fetch, data, depends }: LoadEvent) => {
  depends("supabase:auth")

  const supabase = isBrowser()
    ? createBrowserClient(
        process.env.PUBLIC_SUPABASE_URL!,
        process.env.PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            fetch,
          },
        },
      )
    : createServerClient(
        process.env.PUBLIC_SUPABASE_URL!,
        process.env.PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            fetch,
          },
          cookies: {
            getAll() {
              return data?.cookies || []
            },
          },
        },
      )

  const { session, user } = await load_helper(data?.session, supabase)
  if (session && user) {
    redirect(303, "/account")
  }

  const url = data?.url

  return { supabase, url }
}
