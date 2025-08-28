import { json, error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { getTenantContext } from "$lib/server/organizations"
import {
  UserManagementService,
  type UserRole,
} from "$lib/server/user-management"

export const PATCH: RequestHandler = async ({
  params,
  request,
  locals,
  cookies,
}) => {
  try {
    const supabase = locals.supabase
    const tenantContext = await getTenantContext(locals, cookies, supabase)

    if (!tenantContext.userPermissions.canManageTeam) {
      throw error(403, "Insufficient permissions to modify team members")
    }

    const { userId } = params
    const { role } = await request.json()

    if (!userId || !role) {
      throw error(400, "User ID and role are required")
    }

    const validRoles: UserRole[] = ["owner", "admin", "manager", "member"]
    if (!validRoles.includes(role)) {
      throw error(400, "Invalid role")
    }

    const userMgmt = new UserManagementService(supabase)

    await userMgmt.updateUserRole(
      userId,
      tenantContext.tenantId,
      role,
      tenantContext.userId,
    )

    return json({ success: true, message: "User role updated successfully" })
  } catch (err) {
    console.error("Error updating user role:", err)
    if (err instanceof Error && "status" in err) {
      throw err
    }
    throw error(500, "Failed to update user role")
  }
}

export const DELETE: RequestHandler = async ({ params, locals, cookies }) => {
  try {
    const supabase = locals.supabase
    const tenantContext = await getTenantContext(locals, cookies, supabase)

    if (!tenantContext.userPermissions.canManageTeam) {
      throw error(403, "Insufficient permissions to remove team members")
    }

    const { userId } = params

    if (!userId) {
      throw error(400, "User ID is required")
    }

    const userMgmt = new UserManagementService(supabase)

    await userMgmt.removeUser(
      userId,
      tenantContext.tenantId,
      tenantContext.userId,
    )

    return json({ success: true, message: "User removed successfully" })
  } catch (err) {
    console.error("Error removing user:", err)
    if (err instanceof Error && "status" in err) {
      throw err
    }
    throw error(500, "Failed to remove user")
  }
}
