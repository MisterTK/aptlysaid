import { isBrowser } from "@supabase/ssr"
import type { Session, SupabaseClient, User } from "@supabase/supabase-js"
import type { Database } from "../DatabaseDefinitions.js"

interface LoadHelperResult {
  session: Session | null
  user: User | null
}

export const load_helper = async (
  server_session: Session | null,
  supabase: SupabaseClient<Database>,
): Promise<LoadHelperResult> => {
  // on server populated on server by LayoutData, using authGuard hook
  let session = server_session
  if (isBrowser()) {
    // Only call getSession in browser where it's safe.
    const getSessionResponse = await supabase.auth.getSession()
    session = getSessionResponse.data.session
  }
  if (!session) {
    return {
      session: null,
      user: null,
    }
  }

  // https://github.com/supabase/auth-js/issues/888#issuecomment-2189298518
  // Type-safe check for suppressGetSessionWarning property
  const authClient = supabase.auth as unknown as Record<string, unknown>
  if ("suppressGetSessionWarning" in authClient) {
    authClient.suppressGetSessionWarning = true
  } else {
    console.warn(
      "SupabaseAuthClient#suppressGetSessionWarning was removed. See https://github.com/supabase/auth-js/issues/888.",
    )
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return {
      session: null,
      user: null,
    }
  }

  return {
    session,
    user,
  }
}
