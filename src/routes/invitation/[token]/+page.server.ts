import { error, redirect } from "@sveltejs/kit"
import type { PageServerLoad, Actions } from "./$types"
import { UserManagementService } from "$lib/server/user-management"
import { setCurrentTenant } from "$lib/server/organizations"

export const load: PageServerLoad = async ({ params, locals }) => {
  const { token } = params

  if (!token) {
    throw error(400, "Invalid invitation link")
  }

  const { session } = await locals.safeGetSession()
  const supabase = locals.supabase

  // Get invitation details (public access allowed for this)
  const { data: invitation, error: invitationError } = await supabase
    .from("tenant_invitations")
    .select("id, email, role, expires_at, status, tenant_id")
    .eq("token", token)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .single()

  if (invitationError || !invitation) {
    throw error(404, "Invitation not found or has expired")
  }

  // Get tenant details separately
  const { data: tenant, error: orgError } = await supabase
    .from("tenants")
    .select("id, name, slug")
    .eq("id", invitation.tenant_id)
    .single()

  if (orgError || !tenant) {
    throw error(404, "Tenant not found")
  }

  return {
    session,
    invitation: {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expires_at: invitation.expires_at,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
      },
    },
    token,
  }
}

export const actions: Actions = {
  accept: async ({ params, locals, cookies, url }) => {
    const { token } = params

    if (!token) {
      throw error(400, "Invalid invitation link")
    }

    const { user } = await locals.safeGetSession()

    // If user is not logged in, redirect to login with invitation token
    if (!user) {
      const loginUrl = new URL("/login", url.origin)
      loginUrl.searchParams.set("invitation", token)
      loginUrl.searchParams.set("next", url.pathname)
      throw redirect(303, loginUrl.toString())
    }

    const supabase = locals.supabase
    const userMgmt = new UserManagementService(supabase)

    try {
      const tenantId = await userMgmt.acceptInvitation(token, user.id)

      // Set the new tenant as current
      setCurrentTenant(tenantId, cookies)

      throw redirect(303, "/account?invited=true")
    } catch (err) {
      console.error("Error accepting invitation:", err)
      if (err instanceof Error && "status" in err) {
        throw err
      }
      throw error(500, "Failed to accept invitation")
    }
  },

  decline: async ({ params, locals }) => {
    const { token } = params

    if (!token) {
      throw error(400, "Invalid invitation link")
    }

    const supabase = locals.supabase

    // Mark invitation as cancelled
    const { error: updateError } = await supabase
      .from("tenant_invitations")
      .update({ status: "cancelled" })
      .eq("token", token)
      .eq("status", "pending")

    if (updateError) {
      console.error("Error declining invitation:", updateError)
      throw error(500, "Failed to decline invitation")
    }

    throw redirect(303, "/?declined=true")
  },
}
