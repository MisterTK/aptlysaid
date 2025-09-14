import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
  const invitationToken = url.searchParams.get("invitation")

  if (invitationToken) {
    try {
      const { data: invitation, error } = await supabase
        .from("tenant_invitations")
        .select(
          `
          email,
          role,
          tenant:tenants!inner(name)
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
          organizationName: invitation.tenant.name,
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
