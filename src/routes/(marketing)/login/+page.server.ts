import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
  const invitationToken = url.searchParams.get("invitation")

  if (invitationToken) {
    try {
      // Fetch invitation details including organization name and role
      const { data: invitation, error } = await supabase
        .from("organization_invitations")
        .select(
          `
          email,
          role,
          organization:organizations!inner(name)
        `,
        )
        .eq("token", invitationToken)
        .eq("status", "pending")
        .gt("expires_at", new Date().toISOString())
        .single()

      if (error) {
        console.error("Error fetching invitation:", error)
        return { invitationDetails: null }
      }

      return {
        invitationDetails: {
          organizationName: invitation.organization.name,
          role: invitation.role,
          email: invitation.email,
        },
      }
    } catch (error) {
      console.error("Error loading invitation details:", error)
      return { invitationDetails: null }
    }
  }

  return { invitationDetails: null }
}
