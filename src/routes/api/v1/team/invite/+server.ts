import { json, error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { getTenantContext } from "$lib/server/organizations"
import {
  UserManagementService,
  type UserRole,
} from "$lib/server/user-management"

export const POST: RequestHandler = async ({
  request,
  locals,
  cookies,
  url,
}) => {
  try {
    const supabase = locals.supabase
    const tenantContext = await getTenantContext(locals, cookies, supabase)

    if (!tenantContext.userPermissions.canManageTeam) {
      throw error(403, "Insufficient permissions to invite users")
    }

    const { email, role } = await request.json()

    if (!email || !role) {
      throw error(400, "Email and role are required")
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw error(400, "Invalid email format")
    }

    const validRoles: UserRole[] = ["admin", "manager", "member"]
    if (!validRoles.includes(role)) {
      throw error(400, "Invalid role")
    }

    const userMgmt = new UserManagementService(supabase)
    if (!userMgmt.canManageRole(tenantContext.userRole, role)) {
      throw error(403, "You do not have permission to assign this role")
    }

    const baseUrl = `${url.protocol}//${url.host}`

    await userMgmt.inviteUser(
      tenantContext.tenantId,
      email.toLowerCase().trim(),
      role,
      tenantContext.userId,
      baseUrl,
    )

    return json({ success: true, message: "Invitation sent successfully" })
  } catch (err) {
    console.error("Error sending invitation:", err)
    if (err instanceof Error && "status" in err) {
      throw err
    }
    throw error(500, "Failed to send invitation")
  }
}
