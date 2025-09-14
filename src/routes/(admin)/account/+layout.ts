// Import removed - using process.env directly
import {
  createBrowserClient,
  createServerClient,
  isBrowser,
} from "@supabase/ssr"
import { redirect } from "@sveltejs/kit"
import type { Database } from "../../../DatabaseDefinitions.js"
import type { Session } from "@supabase/supabase-js"
import { CreateProfileStep } from "../../../config"
import { load_helper } from "$lib/load_helpers"

export const load = async ({
  fetch,
  data,
  depends,
  url,
}: {
  fetch: typeof globalThis.fetch
  data: {
    session: Session | null
    cookies: Array<{ name: string; value: string }>
  }
  depends: (dependency: string) => void
  url: URL
}) => {
  depends("supabase:auth")

  const supabaseUrl =
    process.env.PUBLIC_SUPABASE_URL || "https://your-project.supabase.co"
  const supabaseKey = process.env.PUBLIC_SUPABASE_ANON_KEY || ""

  const supabase = isBrowser()
    ? createBrowserClient(supabaseUrl, supabaseKey, {
        global: {
          fetch,
        },
      })
    : createServerClient(supabaseUrl, supabaseKey, {
        global: {
          fetch,
        },
        cookies: {
          getAll() {
            return data.cookies
          },
        },
      })

  const { session, user } = await load_helper(data.session, supabase)
  if (!session || !user) {
    redirect(303, "/login")
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select(`*`)
    .eq("id", user.id)
    .limit(1)

  const profile = profileData && profileData.length > 0 ? profileData[0] : null

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  const createProfilePath = "/account/create_profile"
  const signOutPath = "/account/sign_out"

  const isInvitedUser = url.searchParams.get("invited") === "true"

  let isExistingMember = false
  if (user && !isInvitedUser) {
    const { data: memberCheck } = await supabase
      .from("tenant_users")
      .select("user_id")
      .eq("user_id", user.id)
      .limit(1)

    isExistingMember = !!memberCheck && memberCheck.length > 0
  }

  const shouldSkipCompanyInfo = isInvitedUser || isExistingMember

  if (
    profile &&
    !_hasFullProfile(profile, shouldSkipCompanyInfo) &&
    url.pathname !== createProfilePath &&
    url.pathname !== signOutPath &&
    CreateProfileStep
  ) {
    const profileUrl = new URL(createProfilePath, url.origin)
    if (shouldSkipCompanyInfo) {
      profileUrl.searchParams.set("invited", "true")
    }
    redirect(303, profileUrl.toString())
  }

  return {
    supabase,
    session,
    profile,
    user,
    amr: aal?.currentAuthenticationMethods,
  }
}

export const _hasFullProfile = (
  profile: Database["public"]["Tables"]["profiles"]["Row"] | null,
  isInvitedUser: boolean = false,
) => {
  if (!profile) {
    return false
  }
  if (!profile.full_name) {
    return false
  }

  if (isInvitedUser) {
    return true
  }

  if (
    !(
      profile as Database["public"]["Tables"]["profiles"]["Row"] & {
        website?: string
      }
    ).website
  ) {
    return false
  }

  return true
}
