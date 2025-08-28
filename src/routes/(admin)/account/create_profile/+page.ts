import { _hasFullProfile } from "../+layout.js"
import { redirect } from "@sveltejs/kit"

export async function load({ parent, url }) {
  const data = await parent()

  const isInvitedUser = url.searchParams.get("invited") === "true"

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

  if (_hasFullProfile(data?.profile, shouldSkipCompanyInfo)) {
    if (shouldSkipCompanyInfo) {

      redirect(303, "/account")
    } else {

      redirect(303, "/account/select_plan")
    }
  }

  return {
    ...data,
    isInvitedUser: shouldSkipCompanyInfo,
  }
}
