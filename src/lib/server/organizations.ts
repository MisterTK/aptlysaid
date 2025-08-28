import { error } from "@sveltejs/kit"
import type { Cookies } from "@sveltejs/kit"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../../DatabaseDefinitions"
import { UserManagementService, type UserRole } from "./user-management"

export interface TenantContext {
  tenantId: string
  userId: string
  userRole: UserRole
  userPermissions: {
    canManageTeam: boolean
    canManageSettings: boolean
    canApproveResponses: boolean
    canPublishResponses: boolean
    canViewAnalytics: boolean
  }
}

export type OrganizationContext = TenantContext

export async function getTenantId(
  locals: App.Locals,
  cookies: Cookies,
): Promise<string> {
  const { user } = await locals.safeGetSession()
  if (!user) {
    throw error(401, "Unauthorized")
  }

  const tenantId = cookies.get("current_tenant_id")
  if (!tenantId) {
    throw error(400, "No tenant selected")
  }

  return tenantId
}

export const getOrganizationId = getTenantId

export async function getTenantContext(
  locals: App.Locals,
  cookies: Cookies,
  supabase: SupabaseClient<Database>,
): Promise<TenantContext> {
  const { user } = await locals.safeGetSession()
  console.log("getTenantContext - User from session:", user?.id, user?.email)

  if (!user) {
    console.log("getTenantContext - No user in session")
    throw error(401, "Unauthorized")
  }

  const tenantId = cookies.get("current_tenant_id")
  console.log("getTenantContext - Tenant ID from cookie:", tenantId)

  if (!tenantId) {
    console.log("getTenantContext - No tenant ID in cookies")
    throw error(400, "No tenant selected")
  }

  const userMgmt = new UserManagementService(supabase)
  const userRole = await userMgmt.getUserRole(user.id, tenantId)
  console.log("getTenantContext - User role from DB:", userRole)

  if (!userRole) {
    console.log("getTenantContext - User not found in tenant users")
    throw error(403, "You are not a member of this tenant")
  }

  const permissions = getUserPermissions(userRole)
  console.log("getTenantContext - User permissions:", permissions)

  return {
    tenantId: tenantId,
    userId: user.id,
    userRole,
    userPermissions: permissions,
  }
}

export const getOrganizationContext = getTenantContext

export function getUserPermissions(role: UserRole) {
  const permissions = {
    canManageTeam: false,
    canManageSettings: false,
    canApproveResponses: false,
    canPublishResponses: false,
    canViewAnalytics: false,
  }

  switch (role) {
    case "owner":
      permissions.canManageTeam = true
      permissions.canManageSettings = true
      permissions.canApproveResponses = true
      permissions.canPublishResponses = true
      permissions.canViewAnalytics = true
      break
    case "admin":
      permissions.canManageTeam = true
      permissions.canManageSettings = true
      permissions.canApproveResponses = true
      permissions.canPublishResponses = true
      permissions.canViewAnalytics = true
      break
    case "manager":
      permissions.canManageSettings = true
      permissions.canApproveResponses = true
      permissions.canPublishResponses = true
      permissions.canViewAnalytics = true
      break
    case "member":
      permissions.canViewAnalytics = true
      break
  }

  return permissions
}

export async function getUserTenants(
  userId: string,
  supabase: SupabaseClient<Database>,
) {
  const { data, error: queryError } = await supabase
    .from("tenant_users")
    .select(
      `
      role,
      created_at,
      tenant:tenants!inner(
        id,
        name,
        slug,
        subscription_status,
        created_at
      )
    `,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (queryError) {
    console.error("Error fetching user tenants:", queryError)
    throw error(500, "Failed to fetch tenants")
  }

  return data.map((membership) => ({
    id: membership.tenant.id,
    name: membership.tenant.name,
    slug: membership.tenant.slug,
    role: membership.role as UserRole,
    subscription_status: membership.tenant.subscription_status,
    joined_at: membership.created_at,
    created_at: membership.tenant.created_at,
  }))
}

export const getUserOrganizations = getUserTenants

export function setCurrentTenant(tenantId: string, cookies: Cookies): void {
  cookies.set("current_tenant_id", tenantId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  })
}

export const setCurrentOrganization = setCurrentTenant
