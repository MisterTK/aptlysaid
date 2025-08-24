import { json, error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { getTenantContext } from "$lib/server/organizations"
import { UserManagementService } from "$lib/server/user-management"

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    const supabase = locals.supabase
    const tenantContext = await getTenantContext(locals, cookies, supabase)

    // Only owners can transfer ownership
    if (tenantContext.userRole !== "owner") {
      throw error(403, "Only the current owner can transfer ownership")
    }

    const { newOwnerId } = await request.json()

    if (!newOwnerId) {
      throw error(400, "New owner ID is required")
    }

    if (newOwnerId === tenantContext.userId) {
      throw error(400, "You are already the owner")
    }

    const userMgmt = new UserManagementService(supabase)

    await userMgmt.transferOwnership(
      tenantContext.userId,
      newOwnerId,
      tenantContext.tenantId,
    )

    return json({
      success: true,
      message: "Ownership transferred successfully",
    })
  } catch (err) {
    console.error("Error transferring ownership:", err)
    if (err instanceof Error && "status" in err) {
      throw err
    }
    throw error(500, "Failed to transfer ownership")
  }
}
