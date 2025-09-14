import { error } from "@sveltejs/kit"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../../DatabaseDefinitions"
import { generateInvitationToken } from "$lib/utils/tokens"
import { sendEmail } from "$lib/mailer"

export type UserRole = "owner" | "admin" | "manager" | "member"

export interface TeamMember {
  user_id: string
  email: string
  full_name: string | null
  role: UserRole
  joined_at: string
  avatar_url: string | null
}

export interface PendingInvitation {
  id: string
  email: string
  role: UserRole
  invited_by: string
  invited_by_name: string | null
  created_at: string
  expires_at: string
  status: string
}

export class UserManagementService {
  constructor(
    private supabase: SupabaseClient<Database>,
    private supabaseServiceRole?: SupabaseClient<Database>,
  ) {}

  async checkPermission(
    userId: string,
    tenantId: string,
    requiredRole: UserRole | UserRole[],
  ): Promise<boolean> {
    const { data: member } = await this.supabase
      .from("tenant_users")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single()

    if (!member) return false

    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
    return roles.includes(member.role as UserRole)
  }

  async getUserRole(
    userId: string,
    tenantId: string,
  ): Promise<UserRole | null> {
    console.log("getUserRole - Querying with:", { userId, tenantId })

    const { data: member, error: queryError } = await this.supabase
      .from("tenant_users")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single()

    console.log("getUserRole - Query result:", { member, error: queryError })

    if (queryError) {
      console.log("getUserRole - Database error:", queryError)
    }

    return (member?.role as UserRole) || null
  }

  canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
    if (managerRole === "owner") {
      return targetRole !== "owner"
    }

    if (managerRole === "admin") {
      return ["manager", "member"].includes(targetRole)
    }

    return false
  }

  async getTeamMembers(tenantId: string): Promise<TeamMember[]> {
    console.log("getTeamMembers - Starting query for tenant:", tenantId)

    const { data, error: queryError } = await this.supabase
      .from("tenant_users")
      .select("user_id, role, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })

    console.log("getTeamMembers - Query result:", { data, error: queryError })

    if (queryError) {
      console.error("Error fetching team members:", queryError)
      throw error(500, "Failed to fetch team members")
    }

    const userIds = data.map((member) => member.user_id)
    console.log("getTeamMembers - Getting profiles for user IDs:", userIds)

    const { data: profilesData, error: profilesError } = await this.supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("id", userIds)

    console.log("getTeamMembers - Profiles result:", {
      count: profilesData?.length,
      error: profilesError,
    })

    const profilesMap = new Map()
    if (profilesData) {
      profilesData.forEach((profile) => {
        profilesMap.set(profile.id, profile)
      })
    }

    console.log("getTeamMembers - Getting emails for user IDs:", userIds)

    if (!this.supabaseServiceRole) {
      console.log(
        "getTeamMembers - No service role client, using placeholder emails",
      )
      return data.map((member) => {
        const profile = profilesMap.get(member.user_id)
        return {
          user_id: member.user_id,
          email: `user-${member.user_id.slice(0, 8)}@example.com`,
          full_name: profile?.full_name || null,
          role: member.role as UserRole,
          joined_at: member.created_at,
          avatar_url: profile?.avatar_url || null,
        }
      })
    }

    const { data: authUsers, error: authError } =
      await this.supabaseServiceRole.auth.admin.listUsers()

    console.log("getTeamMembers - Auth users result:", {
      count: authUsers?.users?.length,
      error: authError,
      hasServiceRole: !!this.supabaseServiceRole,
    })

    if (authError) {
      console.error("Error fetching user emails:", authError)

      console.log(
        "getTeamMembers - Falling back to placeholder emails due to auth error",
      )
      return data.map((member) => {
        const profile = profilesMap.get(member.user_id)
        return {
          user_id: member.user_id,
          email: `user-${member.user_id.slice(0, 8)}@example.com`,
          full_name: profile?.full_name || null,
          role: member.role as UserRole,
          joined_at: member.created_at,
          avatar_url: profile?.avatar_url || null,
        }
      })
    }

    const emailMap = new Map(
      authUsers.users
        .filter((user) => userIds.includes(user.id))
        .map((user) => [user.id, user.email]),
    )

    console.log("getTeamMembers - Email map created:", emailMap.size, "entries")

    const result = data.map((member) => {
      const profile = profilesMap.get(member.user_id)
      return {
        user_id: member.user_id,
        email:
          emailMap.get(member.user_id) ||
          `user-${member.user_id.slice(0, 8)}@example.com`,
        full_name: profile?.full_name || null,
        role: member.role as UserRole,
        joined_at: member.created_at,
        avatar_url: profile?.avatar_url || null,
      }
    })

    console.log("getTeamMembers - Final result:", result.length, "members")
    return result
  }

  async getPendingInvitations(tenantId: string): Promise<PendingInvitation[]> {
    const { data, error: queryError } = await this.supabase
      .from("tenant_invitations")
      .select(
        `
        id,
        email,
        role,
        invited_by,
        created_at,
        expires_at,
        status,
        inviter:profiles!tenant_invitations_invited_by_fkey(
          full_name
        )
      `,
      )
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })

    if (queryError) {
      console.error("Error fetching pending invitations:", queryError)
      throw error(500, "Failed to fetch pending invitations")
    }

    return data.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as UserRole,
      invited_by: invitation.invited_by,
      invited_by_name:
        invitation.inviter &&
        typeof invitation.inviter === "object" &&
        "full_name" in invitation.inviter
          ? (invitation.inviter as { full_name: string }).full_name
          : null,
      created_at: invitation.created_at,
      expires_at: invitation.expires_at,
      status: invitation.status || "pending",
    }))
  }

  async inviteUser(
    tenantId: string,
    email: string,
    role: UserRole,
    invitedBy: string,
    baseUrl: string,
  ): Promise<void> {
    const { data: existingMember } = await this.supabase.auth.admin.listUsers()
    const existingUser = existingMember.users.find(
      (user) => user.email === email,
    )

    if (existingUser) {
      const { data: memberCheck } = await this.supabase
        .from("tenant_users")
        .select("user_id")
        .eq("user_id", existingUser.id)
        .eq("tenant_id", tenantId)
        .single()

      if (memberCheck) {
        throw error(400, "User is already a member of this tenant")
      }
    }

    const { data: existingInvitation } = await this.supabase
      .from("tenant_invitations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .single()

    if (existingInvitation) {
      throw error(400, "User already has a pending invitation")
    }

    const token = generateInvitationToken()

    const { error: insertError } = await this.supabase
      .from("tenant_invitations")
      .insert({
        tenant_id: tenantId,
        email,
        role,
        invited_by: invitedBy,
        token,
      })

    if (insertError) {
      console.error("Error creating invitation:", insertError)
      throw error(500, "Failed to create invitation")
    }

    const { data: tenantData } = await this.supabase
      .from("tenants")
      .select("name")
      .eq("id", tenantId)
      .single()

    const { data: inviterData } = await this.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", invitedBy)
      .single()

    const invitationUrl = `${baseUrl}/invitation/${token}`

    const emailBody = `
    You've been invited to join ${tenantData?.name || "AptlySaid"} as a ${role}.
    
    Invited by: ${inviterData?.full_name || "A team member"}
    
    Click here to accept your invitation: ${invitationUrl}
    
    This invitation expires in 7 days.
    `

    await sendEmail(
      email,
      `You're invited to join ${tenantData?.name || "AptlySaid"}`,
      emailBody,
    )
  }

  async cancelInvitation(invitationId: string): Promise<void> {
    const { error: updateError } = await this.supabase
      .from("tenant_invitations")
      .update({ status: "cancelled" })
      .eq("id", invitationId)

    if (updateError) {
      console.error("Error cancelling invitation:", updateError)
      throw error(500, "Failed to cancel invitation")
    }
  }

  async acceptInvitation(token: string, userId: string): Promise<string> {
    const { data: invitation, error: invitationError } = await this.supabase
      .from("tenant_invitations")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .single()

    if (invitationError || !invitation) {
      throw error(400, "Invalid or expired invitation")
    }

    const { data: existingMember } = await this.supabase
      .from("tenant_users")
      .select("user_id")
      .eq("user_id", userId)
      .eq("tenant_id", invitation.tenant_id)
      .single()

    if (existingMember) {
      console.log("User already a member, returning tenant ID")
      return invitation.tenant_id
    }

    const { error: memberError } = await this.supabase
      .from("tenant_users")
      .insert({
        tenant_id: invitation.tenant_id,
        user_id: userId,
        role: invitation.role,
      })

    if (memberError) {
      console.error("Error adding member:", memberError)
      throw error(500, "Failed to join tenant")
    }

    const { error: updateError } = await this.supabase
      .from("tenant_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitation.id)

    if (updateError) {
      console.error("Error updating invitation status:", updateError)
    }

    return invitation.tenant_id
  }

  async updateUserRole(
    userId: string,
    tenantId: string,
    newRole: UserRole,
    updatedBy: string,
  ): Promise<void> {
    const { data: currentMember } = await this.supabase
      .from("tenant_users")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single()

    if (!currentMember) {
      throw error(404, "User is not a member of this tenant")
    }

    const updaterRole = await this.getUserRole(updatedBy, tenantId)
    if (!updaterRole) {
      throw error(403, "You are not a member of this tenant")
    }

    if (!this.canManageRole(updaterRole, currentMember.role as UserRole)) {
      throw error(403, "You do not have permission to modify this user")
    }

    if (!this.canManageRole(updaterRole, newRole)) {
      throw error(403, "You do not have permission to assign this role")
    }

    if (currentMember.role === "owner" && newRole !== "owner") {
      const { data: ownerCount } = await this.supabase
        .from("tenant_users")
        .select("user_id", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("role", "owner")

      if (ownerCount && ownerCount.length <= 1) {
        throw error(400, "Cannot change role of the last owner")
      }
    }

    const { error: updateError } = await this.supabase
      .from("tenant_users")
      .update({ role: newRole })
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)

    if (updateError) {
      console.error("Error updating user role:", updateError)
      throw error(500, "Failed to update user role")
    }
  }

  async removeUser(
    userId: string,
    tenantId: string,
    removedBy: string,
  ): Promise<void> {
    const { data: currentMember } = await this.supabase
      .from("tenant_users")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .single()

    if (!currentMember) {
      throw error(404, "User is not a member of this tenant")
    }

    const removerRole = await this.getUserRole(removedBy, tenantId)
    if (!removerRole) {
      throw error(403, "You are not a member of this tenant")
    }

    if (!this.canManageRole(removerRole, currentMember.role as UserRole)) {
      throw error(403, "You do not have permission to remove this user")
    }

    if (currentMember.role === "owner") {
      const { data: ownerCount } = await this.supabase
        .from("tenant_users")
        .select("user_id", { count: "exact" })
        .eq("tenant_id", tenantId)
        .eq("role", "owner")

      if (ownerCount && ownerCount.length <= 1) {
        throw error(400, "Cannot remove the last owner")
      }
    }

    const { error: deleteError } = await this.supabase
      .from("tenant_users")
      .delete()
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)

    if (deleteError) {
      console.error("Error removing user:", deleteError)
      throw error(500, "Failed to remove user")
    }
  }

  async transferOwnership(
    currentOwnerId: string,
    newOwnerId: string,
    tenantId: string,
  ): Promise<void> {
    const currentOwnerRole = await this.getUserRole(currentOwnerId, tenantId)
    if (currentOwnerRole !== "owner") {
      throw error(403, "Only the current owner can transfer ownership")
    }

    const newOwnerRole = await this.getUserRole(newOwnerId, tenantId)
    if (!newOwnerRole) {
      throw error(400, "New owner must be a member of the tenant")
    }

    const { error: currentOwnerError } = await this.supabase
      .from("tenant_users")
      .update({ role: "admin" })
      .eq("user_id", currentOwnerId)
      .eq("tenant_id", tenantId)

    if (currentOwnerError) {
      throw error(500, "Failed to transfer ownership")
    }

    const { error: newOwnerError } = await this.supabase
      .from("tenant_users")
      .update({ role: "owner" })
      .eq("user_id", newOwnerId)
      .eq("tenant_id", tenantId)

    if (newOwnerError) {
      await this.supabase
        .from("tenant_users")
        .update({ role: "owner" })
        .eq("user_id", currentOwnerId)
        .eq("tenant_id", tenantId)

      throw error(500, "Failed to transfer ownership")
    }
  }
}

export async function requirePermission(
  supabase: SupabaseClient<Database>,
  userId: string,
  tenantId: string,
  requiredRole: UserRole | UserRole[],
  supabaseServiceRole?: SupabaseClient<Database>,
): Promise<void> {
  const userMgmt = new UserManagementService(supabase, supabaseServiceRole)
  const hasPermission = await userMgmt.checkPermission(
    userId,
    tenantId,
    requiredRole,
  )

  if (!hasPermission) {
    throw error(403, "Insufficient permissions")
  }
}

export async function requireOwnerOrAdmin(
  supabase: SupabaseClient<Database>,
  userId: string,
  tenantId: string,
  supabaseServiceRole?: SupabaseClient<Database>,
): Promise<void> {
  await requirePermission(
    supabase,
    userId,
    tenantId,
    ["owner", "admin"],
    supabaseServiceRole,
  )
}

export async function requireOwner(
  supabase: SupabaseClient<Database>,
  userId: string,
  tenantId: string,
  supabaseServiceRole?: SupabaseClient<Database>,
): Promise<void> {
  await requirePermission(
    supabase,
    userId,
    tenantId,
    "owner",
    supabaseServiceRole,
  )
}
