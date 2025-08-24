import type { PageServerLoad } from "./$types"
import { getTenantContext } from "$lib/server/organizations"
import { error } from "@sveltejs/kit"

export const load: PageServerLoad = async ({ locals, cookies }) => {
  try {
    const supabase = locals.supabase

    // Debug: Check session
    const { user } = await locals.safeGetSession()
    console.log("Team page - User ID:", user?.id)
    console.log(
      "Team page - Current tenant cookie:",
      cookies.get("current_tenant_id"),
    )

    const tenantContext = await getTenantContext(locals, cookies, supabase)

    console.log("Team page - Tenant context:", {
      tenantId: tenantContext.tenantId,
      userId: tenantContext.userId,
      userRole: tenantContext.userRole,
      canManageTeam: tenantContext.userPermissions.canManageTeam,
    })

    if (!tenantContext.userPermissions.canManageTeam) {
      console.log(
        "Team page - Permission denied for role:",
        tenantContext.userRole,
      )
      throw error(
        403,
        `You do not have permission to view team management. Current role: ${tenantContext.userRole}`,
      )
    }

    return {
      tenantContext: {
        tenantId: tenantContext.tenantId,
        userRole: tenantContext.userRole,
        userPermissions: tenantContext.userPermissions,
      },
    }
  } catch (err) {
    console.error("Team page load error:", err)
    throw err
  }
}
