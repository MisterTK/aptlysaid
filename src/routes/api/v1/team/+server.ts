import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { V2ApiClient } from "$lib/services/v2-api-client"

export const GET: RequestHandler = async ({
  locals: { safeGetSession, supabase },
  cookies,
}) => {
  const { user } = await safeGetSession()
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = cookies.get("current_tenant_id")
  if (!orgId) {
    return json({ error: "No organization selected" }, { status: 400 })
  }

  try {
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    const { members } = await v2Client.getTeamMembers()

    const { invitations } = await v2Client.getInvitations()

    const currentUserMember = members.find(
      (member) => member.user_id === user.id,
    )

    if (!currentUserMember) {
      return json(
        { error: "You are not a member of this organization" },
        { status: 403 },
      )
    }

    const canManageTeam = ["owner", "admin"].includes(currentUserMember.role)
    if (!canManageTeam) {
      return json(
        { error: "Insufficient permissions to view team" },
        { status: 403 },
      )
    }

    const teamMembers = members.map((member) => ({
      user_id: member.user_id,
      email:
        member.user?.email || `user-${member.user_id.slice(0, 8)}@example.com`,
      full_name: member.user?.full_name || null,
      role: member.role,
      joined_at: member.created_at,
      avatar_url: member.user?.avatar_url || null,
    }))

    const pendingInvitations = invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      invited_by: invitation.invited_by,
      invited_by_name: null,
      created_at: invitation.created_at,
      expires_at: invitation.expires_at,
      status: "pending",
    }))

    return json({
      teamMembers,
      pendingInvitations,
      currentUser: {
        userId: user.id,
        role: currentUserMember.role,
        permissions: {
          canManageTeam: true,
          canManageSettings: ["owner", "admin"].includes(
            currentUserMember.role,
          ),
          canApproveResponses: ["owner", "admin", "member"].includes(
            currentUserMember.role,
          ),
          canPublishResponses: ["owner", "admin", "member"].includes(
            currentUserMember.role,
          ),
          canViewAnalytics: true,
        },
      },
    })
  } catch (error) {
    console.error("Team API - Error:", error)
    return json({ error: "Failed to fetch team data" }, { status: 500 })
  }
}

export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, supabase },
  cookies,
}) => {
  const { user } = await safeGetSession()
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = cookies.get("current_tenant_id")
  if (!orgId) {
    return json({ error: "No organization selected" }, { status: 400 })
  }

  try {
    const { email, role } = await request.json()

    if (!email || !role) {
      return json({ error: "Email and role are required" }, { status: 400 })
    }

    if (!["owner", "admin", "member", "viewer"].includes(role)) {
      return json({ error: "Invalid role" }, { status: 400 })
    }

    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    const { invitation } = await v2Client.inviteMember(email, role)

    return json({ invitation })
  } catch (error) {
    console.error("Team invite error:", error)
    return json({ error: "Failed to send invitation" }, { status: 500 })
  }
}
