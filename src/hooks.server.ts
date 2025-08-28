// src/hooks.server.ts
// Runtime environment variable access
// Get environment variables at runtime to avoid build dependencies
import { createServerClient } from "@supabase/ssr"
import { createClient } from "@supabase/supabase-js"
import type { Handle } from "@sveltejs/kit"
import { sequence } from "@sveltejs/kit/hooks"

// Use Node.js environment variables with fallbacks to prevent crashes
const PUBLIC_SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const PUBLIC_SUPABASE_ANON_KEY = process.env.PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
const PRIVATE_SUPABASE_SERVICE_ROLE = process.env.PRIVATE_SUPABASE_SERVICE_ROLE || process.env.SUPABASE_SERVICE_ROLE_KEY || ""

// Validate required environment variables
if (!PUBLIC_SUPABASE_URL || !PUBLIC_SUPABASE_ANON_KEY) {
  console.error("Missing required Supabase environment variables:", {
    url: !!PUBLIC_SUPABASE_URL,
    key: !!PUBLIC_SUPABASE_ANON_KEY,
    serviceRole: !!PRIVATE_SUPABASE_SERVICE_ROLE
  })
}

export const supabase: Handle = async ({ event, resolve }) => {
  // Only create Supabase clients if environment variables are available
  if (PUBLIC_SUPABASE_URL && PUBLIC_SUPABASE_ANON_KEY) {
    event.locals.supabase = createServerClient(
      PUBLIC_SUPABASE_URL,
      PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll: () => event.cookies.getAll(),
          /**
           * SvelteKit's cookies API requires `path` to be explicitly set in
           * the cookie options. Setting `path` to `/` replicates previous/
           * standard behavior.
           */
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) => {
              event.cookies.set(name, value, { ...options, path: "/" })
            })
          },
        },
      },
    )

    if (PRIVATE_SUPABASE_SERVICE_ROLE) {
      event.locals.supabaseServiceRole = createClient(
        PUBLIC_SUPABASE_URL,
        PRIVATE_SUPABASE_SERVICE_ROLE,
        { auth: { persistSession: false } },
      )
    }
  } else {
    // Create mock clients to prevent crashes in development/misconfigured environments
    console.warn("Supabase not configured - using mock client")
    event.locals.supabase = null as any
    event.locals.supabaseServiceRole = null as any
  }

  // https://github.com/supabase/auth-js/issues/888#issuecomment-2189298518
  // Type-safe access to suppressGetSessionWarning (only if supabase is configured)
  if (event.locals.supabase) {
    const authClient = event.locals.supabase.auth as unknown as Record<
      string,
      unknown
    >
    if ("suppressGetSessionWarning" in authClient) {
      authClient.suppressGetSessionWarning = true
    } else {
      console.warn(
        "SupabaseAuthClient#suppressGetSessionWarning was removed. See https://github.com/supabase/auth-js/issues/888.",
      )
    }
  }

  /**
   * Unlike `supabase.auth.getSession()`, which returns the session _without_
   * validating the JWT, this function also calls `getUser()` to validate the
   * JWT before returning the session.
   */
  event.locals.safeGetSession = async () => {
    // Return null session if Supabase is not configured
    if (!event.locals.supabase) {
      return { session: null, user: null, amr: null }
    }

    const {
      data: { session },
    } = await event.locals.supabase.auth.getSession()
    if (!session) {
      return { session: null, user: null, amr: null }
    }

    const {
      data: { user },
      error,
    } = await event.locals.supabase.auth.getUser()
    if (error) {
      // JWT validation has failed
      return { session: null, user: null, amr: null }
    }

    // Get AMR (Authentication Methods Reference) from session
    // Note: amr may not be directly available on the Session type
    // It's typically part of the JWT claims
    const amr = null // AMR not available in current session structure

    return { session, user, amr }
  }

  return resolve(event, {
    filterSerializedResponseHeaders(name) {
      return name === "content-range" || name === "x-supabase-api-version"
    },
  })
}

export const authGuard: Handle = async ({ event, resolve }) => {
  const { session, user } = await event.locals.safeGetSession()
  event.locals.session = session
  event.locals.user = user

  return resolve(event)
}

export const cacheControl: Handle = async ({ event, resolve }) => {
  const response = await resolve(event)

  // Add no-cache headers for admin pages and API routes
  if (
    event.url.pathname.startsWith("/account") ||
    event.url.pathname.startsWith("/api")
  ) {
    response.headers.set("Cache-Control", "no-cache, no-store, must-revalidate")
    response.headers.set("Pragma", "no-cache")
    response.headers.set("Expires", "0")
  }

  return response
}

export const handle = sequence(supabase, authGuard, cacheControl)
