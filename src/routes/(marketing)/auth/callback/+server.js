
import { redirect } from "@sveltejs/kit"
import { isAuthApiError } from "@supabase/supabase-js"
import { UserManagementService } from "$lib/server/user-management"
import { setCurrentTenant } from "$lib/server/organizations"

export const GET = async ({ url, locals: { supabase }, cookies }) => {
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")
  const error_description = url.searchParams.get("error_description")
  const invitationToken = url.searchParams.get("invitation")

  if (error) {
    console.error("Auth error:", error, error_description)
    const redirectUrl = invitationToken
      ? `/login/sign_in?invitation=${invitationToken}&error=${encodeURIComponent(error_description || error)}`
      : `/login/sign_in?error=${encodeURIComponent(error_description || error)}`
    redirect(303, redirectUrl)
  }

  if (code) {
    try {
      const {
        data: { user },
      } = await supabase.auth.exchangeCodeForSession(code)

      if (invitationToken && user) {
        try {
          console.log(
            "Processing invitation for user:",
            user.id,
            "token:",
            invitationToken,
          )
          const userMgmt = new UserManagementService(supabase)

          const { data: invitation } = await supabase
            .from("tenant_invitations")
            .select("status, tenant_id")
            .eq("token", invitationToken)
            .single()

          if (invitation && invitation.status === "accepted") {
            console.log(
              "Invitation already accepted, setting tenant and redirecting",
            )
            setCurrentTenant(invitation.tenant_id, cookies)
            redirect(303, "/account?invited=true")
          } else {

            const tenantId = await userMgmt.acceptInvitation(
              invitationToken,
              user.id,
            )
            setCurrentTenant(tenantId, cookies)
            console.log(
              "Invitation accepted successfully, redirecting to account",
            )
            redirect(303, "/account?invited=true")
          }
        } catch (invitationError) {
          console.error("Error processing invitation:", invitationError)

          redirect(303, `/invitation/${invitationToken}?error=processing`)
        }
      }
    } catch (error) {

      if (isAuthApiError(error)) {
        const redirectUrl = invitationToken
          ? `/login/sign_in?invitation=${invitationToken}&verified=true`
          : "/login/sign_in?verified=true"
        redirect(303, redirectUrl)
      } else {
        throw error
      }
    }
  }

  const next = url.searchParams.get("next")
  if (next) {
    redirect(303, next)
  }

  redirect(303, "/account")
}
