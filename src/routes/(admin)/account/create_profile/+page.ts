import { _hasFullProfile } from "../+layout.js"
import { redirect } from "@sveltejs/kit"

export async function load({ parent, url }) {
  const data = await parent()

  // Check if user came from invitation
  const isInvitedUser = url.searchParams.get("invited") === "true"

  // Check if user is already a member of an organization
  let isExistingMember = false
  if (data?.user && !isInvitedUser) {
    const { data: memberCheck } = await data.supabase
      .from("tenant_users")
      .select("user_id")
      .eq("user_id", data.user.id)
      .limit(1)

    isExistingMember = !!memberCheck && memberCheck.length > 0
  }

  const shouldSkipCompanyInfo = isInvitedUser || isExistingMember

  // They completed their profile! Redirect appropriately.
  if (_hasFullProfile(data?.profile, shouldSkipCompanyInfo)) {
    if (shouldSkipCompanyInfo) {
      // Invited/existing users go straight to account dashboard
      redirect(303, "/account")
    } else {
      // Regular users go to plan selection
      redirect(303, "/account/select_plan")
    }
  }

  return {
    ...data,
    isInvitedUser: shouldSkipCompanyInfo,
  }
}
