import { json, error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { getOrganizationContext } from "$lib/server/organizations"
import { UserManagementService } from "$lib/server/user-management"

export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
  try {
    const supabase = locals.supabase
    const orgContext = await getOrganizationContext(locals, cookies, supabase)

    if (!orgContext.userPermissions.canManageTeam) {
      throw error(403, "Insufficient permissions to cancel invitations")
    }

    const { invitationId } = params

    if (!invitationId) {
      throw error(400, "Invitation ID is required")
    }

    const userMgmt = new UserManagementService(supabase)

    await userMgmt.cancelInvitation(invitationId)

    return json({ success: true, message: "Invitation cancelled successfully" })
  } catch (err) {
    console.error("Error cancelling invitation:", err)
    if (err instanceof Error && "status" in err) {
      throw err
    }
    throw error(500, "Failed to cancel invitation")
  }
}
