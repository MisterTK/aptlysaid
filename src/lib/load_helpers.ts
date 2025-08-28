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

  let session = server_session
  if (isBrowser()) {

    const getSessionResponse = await supabase.auth.getSession()
    session = getSessionResponse.data.session
  }
  if (!session) {
    return {
      session: null,
      user: null,
    }
  }

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
