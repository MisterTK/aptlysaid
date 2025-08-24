<script lang="ts">
  import { onMount, getContext } from "svelte"
  import type { Writable } from "svelte/store"
  import {
    Users,
    UserPlus,
    Mail,
    Crown,
    Shield,
    Eye,
    Settings,
    MoreVertical,
    Trash2,
    UserMinus,
    Clock,
    Check,
    X,
    Copy,
  } from "lucide-svelte"
  import type { PageData } from "./$types"

  export let data: PageData

  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("team")

  interface TeamMember {
    user_id: string
    email: string
    full_name: string | null
    role: "owner" | "admin" | "manager" | "member"
    joined_at: string
    avatar_url: string | null
  }

  interface PendingInvitation {
    id: string
    email: string
    role: "admin" | "manager" | "member"
    invited_by: string
    invited_by_name: string | null
    created_at: string
    expires_at: string
    status: string
  }

  let teamMembers: TeamMember[] = []
  let pendingInvitations: PendingInvitation[] = []
  let loading = true
  let error = ""

  // Invitation form
  let showInviteModal = false
  let inviteForm = {
    email: "",
    role: "member" as "admin" | "manager" | "member",
  }
  let inviteLoading = false

  // Role change
  let editingMember: TeamMember | null = null
  let newRole = ""
  let roleChangeLoading = false

  // Transfer ownership
  let showTransferModal = false
  let transferTargetId = ""
  let transferLoading = false

  const roleLabels = {
    owner: "Owner",
    admin: "Admin",
    manager: "Manager",
    member: "Member",
  }

  const roleDescriptions = {
    owner: "Full access to everything including billing and team management",
    admin: "Can manage team, settings, and all review operations",
    manager: "Can manage reviews, AI responses, and basic settings",
    member: "Can view reviews and basic analytics",
  }

  const roleIcons = {
    owner: Crown,
    admin: Shield,
    manager: Settings,
    member: Eye,
  }

  const roleColors = {
    owner: "bg-yellow-100 text-yellow-800 border-yellow-200",
    admin: "bg-purple-100 text-purple-800 border-purple-200",
    manager: "bg-blue-100 text-blue-800 border-blue-200",
    member: "bg-gray-100 text-gray-800 border-gray-200",
  }

  async function loadTeamData() {
    try {
      loading = true
      const response = await fetch("/account/api/team")

      if (!response.ok) {
        throw new Error("Failed to load team data")
      }

      const data = await response.json()
      teamMembers = data.teamMembers
      pendingInvitations = data.pendingInvitations
      error = ""
    } catch (err) {
      console.error("Error loading team data:", err)
      error = "Failed to load team data"
    } finally {
      loading = false
    }
  }

  async function sendInvitation() {
    if (!inviteForm.email || !inviteForm.role) return

    try {
      inviteLoading = true
      const response = await fetch("/account/api/team/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(inviteForm),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to send invitation")
      }

      // Reset form and reload data
      inviteForm = { email: "", role: "member" }
      showInviteModal = false
      await loadTeamData()
    } catch (err) {
      console.error("Error sending invitation:", err)
      error = err instanceof Error ? err.message : "Failed to send invitation"
    } finally {
      inviteLoading = false
    }
  }

  async function updateMemberRole(member: TeamMember, newRole: string) {
    try {
      roleChangeLoading = true
      const response = await fetch(
        `/account/api/team/members/${member.user_id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ role: newRole }),
        },
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to update role")
      }

      editingMember = null
      await loadTeamData()
    } catch (err) {
      console.error("Error updating role:", err)
      error = err instanceof Error ? err.message : "Failed to update role"
    } finally {
      roleChangeLoading = false
    }
  }

  async function removeMember(member: TeamMember) {
    if (
      !confirm(
        `Are you sure you want to remove ${member.full_name || member.email} from the team?`,
      )
    ) {
      return
    }

    try {
      const response = await fetch(
        `/account/api/team/members/${member.user_id}`,
        {
          method: "DELETE",
        },
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to remove member")
      }

      await loadTeamData()
    } catch (err) {
      console.error("Error removing member:", err)
      error = err instanceof Error ? err.message : "Failed to remove member"
    }
  }

  async function cancelInvitation(invitation: PendingInvitation) {
    try {
      const response = await fetch(
        `/account/api/team/invitations/${invitation.id}`,
        {
          method: "DELETE",
        },
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to cancel invitation")
      }

      await loadTeamData()
    } catch (err) {
      console.error("Error cancelling invitation:", err)
      error = err instanceof Error ? err.message : "Failed to cancel invitation"
    }
  }

  async function transferOwnership() {
    if (!transferTargetId) return

    const targetMember = teamMembers.find((m) => m.user_id === transferTargetId)
    if (!targetMember) return

    if (
      !confirm(
        `Are you sure you want to transfer ownership to ${targetMember.full_name || targetMember.email}? This action cannot be undone.`,
      )
    ) {
      return
    }

    try {
      transferLoading = true
      const response = await fetch("/account/api/team/transfer-ownership", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ newOwnerId: transferTargetId }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || "Failed to transfer ownership")
      }

      showTransferModal = false
      transferTargetId = ""
      await loadTeamData()

      // Reload page to update permissions
      window.location.reload()
    } catch (err) {
      console.error("Error transferring ownership:", err)
      error =
        err instanceof Error ? err.message : "Failed to transfer ownership"
    } finally {
      transferLoading = false
    }
  }

  function canManageRole(targetRole: string): boolean {
    if (data.tenantContext.userRole === "owner") {
      return targetRole !== "owner"
    }

    if (data.tenantContext.userRole === "admin") {
      return ["manager", "member"].includes(targetRole)
    }

    return false
  }

  function copyInvitationLink(invitation: PendingInvitation) {
    // This would need the actual invitation token to generate the full URL
    // For now, just copy the email
    navigator.clipboard.writeText(invitation.email)
  }

  function formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  function formatDateTime(dateString: string): string {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }

  onMount(() => {
    loadTeamData()
  })
</script>

<svelte:head>
  <title>Team Management - AptlySaid</title>
</svelte:head>

<div class="max-w-6xl mx-auto p-6">
  <!-- Header -->
  <div class="flex items-center justify-between mb-8">
    <div>
      <h1 class="text-3xl font-bold text-gray-900 flex items-center gap-3">
        <Users class="w-8 h-8 text-indigo-600" />
        Team Management
      </h1>
      <p class="text-gray-600 mt-2">
        Manage your team members and their permissions
      </p>
    </div>

    <div class="flex gap-3">
      {#if data.tenantContext.userRole === "owner"}
        <button
          on:click={() => (showTransferModal = true)}
          class="btn btn-outline flex items-center gap-2"
        >
          <Crown class="w-4 h-4" />
          Transfer Ownership
        </button>
      {/if}

      <button
        on:click={() => (showInviteModal = true)}
        class="btn btn-primary flex items-center gap-2"
      >
        <UserPlus class="w-4 h-4" />
        Invite Member
      </button>
    </div>
  </div>

  {#if error}
    <div class="alert alert-error mb-6">
      <X class="w-4 h-4" />
      <span>{error}</span>
      <button on:click={() => (error = "")} class="btn btn-sm btn-ghost">
        <X class="w-4 h-4" />
      </button>
    </div>
  {/if}

  {#if loading}
    <div class="flex items-center justify-center py-12">
      <div class="loading loading-spinner loading-lg"></div>
    </div>
  {:else}
    <!-- Team Members -->
    <div class="card bg-base-100 shadow-xl mb-8">
      <div class="card-body">
        <h2 class="card-title text-xl mb-4">
          Team Members ({teamMembers.length})
        </h2>

        <div class="overflow-x-auto">
          <table class="table table-zebra">
            <thead>
              <tr>
                <th>Member</th>
                <th>Role</th>
                <th>Joined</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each teamMembers as member (member.user_id)}
                <tr>
                  <td>
                    <div class="flex items-center gap-3">
                      <div class="avatar">
                        <div
                          class="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center"
                        >
                          {#if member.avatar_url}
                            <img
                              src={member.avatar_url}
                              alt={member.full_name || member.email}
                              class="w-10 h-10 rounded-full"
                            />
                          {:else}
                            <span class="text-indigo-600 font-semibold">
                              {(member.full_name || member.email)
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          {/if}
                        </div>
                      </div>
                      <div>
                        <div class="font-semibold">
                          {member.full_name || "Unnamed User"}
                        </div>
                        <div class="text-sm text-gray-500">{member.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {#if editingMember?.user_id === member.user_id}
                      <div class="flex items-center gap-2">
                        <select
                          bind:value={newRole}
                          class="select select-sm select-bordered"
                          disabled={roleChangeLoading}
                        >
                          {#each Object.entries(roleLabels) as [roleKey, roleLabel]}
                            {#if canManageRole(roleKey) || roleKey === member.role}
                              <option value={roleKey}>{roleLabel}</option>
                            {/if}
                          {/each}
                        </select>
                        <button
                          on:click={() => updateMemberRole(member, newRole)}
                          disabled={roleChangeLoading ||
                            newRole === member.role}
                          class="btn btn-sm btn-success"
                        >
                          <Check class="w-3 h-3" />
                        </button>
                        <button
                          on:click={() => (editingMember = null)}
                          disabled={roleChangeLoading}
                          class="btn btn-sm btn-ghost"
                        >
                          <X class="w-3 h-3" />
                        </button>
                      </div>
                    {:else}
                      <div class="flex items-center gap-2">
                        <span
                          class="badge {roleColors[
                            member.role
                          ]} border flex items-center gap-1"
                        >
                          <svelte:component
                            this={roleIcons[member.role]}
                            class="w-3 h-3"
                          />
                          {roleLabels[member.role]}
                        </span>
                      </div>
                    {/if}
                  </td>
                  <td>
                    <time
                      class="text-sm text-gray-500"
                      title={formatDateTime(member.joined_at)}
                    >
                      {formatDate(member.joined_at)}
                    </time>
                  </td>
                  <td class="text-right">
                    <div class="dropdown dropdown-end">
                      <label tabindex="0" class="btn btn-sm btn-ghost">
                        <MoreVertical class="w-4 h-4" />
                      </label>
                      <ul
                        tabindex="0"
                        class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52"
                      >
                        {#if canManageRole(member.role) && editingMember?.user_id !== member.user_id}
                          <li>
                            <button
                              on:click={() => {
                                editingMember = member
                                newRole = member.role
                              }}
                            >
                              <Settings class="w-4 h-4" />
                              Change Role
                            </button>
                          </li>
                        {/if}
                        {#if canManageRole(member.role)}
                          <li>
                            <button
                              on:click={() => removeMember(member)}
                              class="text-error"
                            >
                              <UserMinus class="w-4 h-4" />
                              Remove from Team
                            </button>
                          </li>
                        {/if}
                      </ul>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Pending Invitations -->
    {#if pendingInvitations.length > 0}
      <div class="card bg-base-100 shadow-xl">
        <div class="card-body">
          <h2 class="card-title text-xl mb-4">
            Pending Invitations ({pendingInvitations.length})
          </h2>

          <div class="overflow-x-auto">
            <table class="table table-zebra">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Invited By</th>
                  <th>Expires</th>
                  <th class="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {#each pendingInvitations as invitation (invitation.id)}
                  <tr>
                    <td>
                      <div class="flex items-center gap-3">
                        <div
                          class="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center"
                        >
                          <Mail class="w-4 h-4 text-orange-600" />
                        </div>
                        <div>
                          <div class="font-semibold">{invitation.email}</div>
                          <div class="text-sm text-gray-500">
                            Invitation pending
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span
                        class="badge {roleColors[
                          invitation.role
                        ]} border flex items-center gap-1"
                      >
                        <svelte:component
                          this={roleIcons[invitation.role]}
                          class="w-3 h-3"
                        />
                        {roleLabels[invitation.role]}
                      </span>
                    </td>
                    <td>
                      <span class="text-sm text-gray-600">
                        {invitation.invited_by_name || "Unknown"}
                      </span>
                    </td>
                    <td>
                      <div
                        class="flex items-center gap-1 text-sm text-orange-600"
                      >
                        <Clock class="w-3 h-3" />
                        {formatDateTime(invitation.expires_at)}
                      </div>
                    </td>
                    <td class="text-right">
                      <div class="flex items-center gap-2 justify-end">
                        <button
                          on:click={() => copyInvitationLink(invitation)}
                          class="btn btn-sm btn-ghost"
                          title="Copy email"
                        >
                          <Copy class="w-3 h-3" />
                        </button>
                        <button
                          on:click={() => cancelInvitation(invitation)}
                          class="btn btn-sm btn-error btn-outline"
                          title="Cancel invitation"
                        >
                          <Trash2 class="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<!-- Invite Modal -->
{#if showInviteModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg mb-4">Invite Team Member</h3>

      <form on:submit|preventDefault={sendInvitation}>
        <div class="form-control mb-4">
          <label class="label">
            <span class="label-text">Email Address</span>
          </label>
          <input
            type="email"
            bind:value={inviteForm.email}
            placeholder="colleague@company.com"
            class="input input-bordered"
            required
            disabled={inviteLoading}
          />
        </div>

        <div class="form-control mb-6">
          <label class="label">
            <span class="label-text">Role</span>
          </label>
          <select
            bind:value={inviteForm.role}
            class="select select-bordered"
            disabled={inviteLoading}
          >
            {#each Object.entries(roleLabels) as [roleKey, roleLabel]}
              {#if roleKey !== "owner" && canManageRole(roleKey)}
                <option value={roleKey}>{roleLabel}</option>
              {/if}
            {/each}
          </select>
          <label class="label">
            <span class="label-text-alt text-gray-500">
              {roleDescriptions[inviteForm.role]}
            </span>
          </label>
        </div>

        <div class="modal-action">
          <button
            type="button"
            on:click={() => (showInviteModal = false)}
            class="btn btn-ghost"
            disabled={inviteLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            disabled={inviteLoading || !inviteForm.email}
          >
            {#if inviteLoading}
              <span class="loading loading-spinner loading-sm"></span>
              Sending...
            {:else}
              <UserPlus class="w-4 h-4" />
              Send Invitation
            {/if}
          </button>
        </div>
      </form>
    </div>
    <div
      class="modal-backdrop"
      on:click={() => (showInviteModal = false)}
    ></div>
  </div>
{/if}

<!-- Transfer Ownership Modal -->
{#if showTransferModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg mb-4 text-warning">Transfer Ownership</h3>

      <div class="alert alert-warning mb-4">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="stroke-current shrink-0 h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        <span
          >This action cannot be undone. You will become an admin and lose owner
          privileges.</span
        >
      </div>

      <form on:submit|preventDefault={transferOwnership}>
        <div class="form-control mb-6">
          <label class="label">
            <span class="label-text">Select New Owner</span>
          </label>
          <select
            bind:value={transferTargetId}
            class="select select-bordered"
            disabled={transferLoading}
          >
            <option value="">Choose a team member...</option>
            {#each teamMembers.filter((m) => m.role !== "owner") as member}
              <option value={member.user_id}>
                {member.full_name || member.email} ({roleLabels[member.role]})
              </option>
            {/each}
          </select>
        </div>

        <div class="modal-action">
          <button
            type="button"
            on:click={() => {
              showTransferModal = false
              transferTargetId = ""
            }}
            class="btn btn-ghost"
            disabled={transferLoading}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="btn btn-warning"
            disabled={transferLoading || !transferTargetId}
          >
            {#if transferLoading}
              <span class="loading loading-spinner loading-sm"></span>
              Transferring...
            {:else}
              <Crown class="w-4 h-4" />
              Transfer Ownership
            {/if}
          </button>
        </div>
      </form>
    </div>
    <div
      class="modal-backdrop"
      on:click={() => (showTransferModal = false)}
    ></div>
  </div>
{/if}
