// src/routes/auth/callback/+server.js
import { redirect } from "@sveltejs/kit"
import { isAuthApiError } from "@supabase/supabase-js"
import { UserManagementService } from "$lib/server/user-management"
import { setCurrentTenant } from "$lib/server/organizations"

export const GET = async ({ url, locals: { supabase }, cookies }) => {
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")
  const error_description = url.searchParams.get("error_description")
  const invitationToken = url.searchParams.get("invitation")

  // Handle auth errors
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

      // If there's an invitation token, process it automatically
      if (invitationToken && user) {
        try {
          console.log(
            "Processing invitation for user:",
            user.id,
            "token:",
            invitationToken,
          )
          const userMgmt = new UserManagementService(supabase)

          // First check if invitation was already processed
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
            // Process new invitation
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
          // If invitation processing fails, redirect back to invitation page
          redirect(303, `/invitation/${invitationToken}?error=processing`)
        }
      }
    } catch (error) {
      // If you open in another browser, need to redirect to login.
      // Should not display error
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
