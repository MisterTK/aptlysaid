import { env } from "$env/dynamic/public"
import {
  createBrowserClient,
  createServerClient,
  isBrowser,
} from "@supabase/ssr"
import { redirect } from "@sveltejs/kit"
import type { Database } from "../../../DatabaseDefinitions.js"
import { CreateProfileStep } from "../../../config"
import { load_helper } from "$lib/load_helpers"

export const load = async ({ fetch, data, depends, url }) => {
  depends("supabase:auth")

  const supabase = isBrowser()
    ? createBrowserClient(
        env.PUBLIC_SUPABASE_URL,
        env.PUBLIC_SUPABASE_ANON_KEY,
        {
          global: {
            fetch,
          },
        },
      )
    : createServerClient(
        env.PUBLIC_SUPABASE_URL,
        env.PUBLIC_SUPABASE_ANON_KEY,
        {
          global: {
            fetch,
          },
          cookies: {
            getAll() {
              return data.cookies
            },
          },
        },
      )

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
  // Check if user came from invitation OR is already a member of an organization
  const isInvitedUser = url.searchParams.get("invited") === "true"

  // Check if user is already a member of a tenant (means they joined via invitation previously)
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
    // Pass context to create profile page
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

  // If user joined via invitation, they don't need company info
  if (isInvitedUser) {
    return true
  }

  // For regular users creating their own organization, require website
  if (!profile.website) {
    return false
  }

  return true
}
