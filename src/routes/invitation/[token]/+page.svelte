<script lang="ts">
  import { enhance } from "$app/forms"
  import { UserCheck, Building2, Clock, Mail } from "lucide-svelte"
  import type { PageData } from "./$types"

  export let data: PageData

  let isAccepting = false
  let isDeclining = false

  const formatRole = (role: string) => {
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
  }
</script>

<svelte:head>
  <title>Team Invitation - {data.invitation.tenant.name}</title>
  <meta
    name="description"
    content="You've been invited to join {data.invitation.tenant
      .name} on AptlySaid"
  />
</svelte:head>

<div
  class="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50 flex items-center justify-center p-4"
>
  <div class="max-w-md w-full">
    <!-- Invitation Card -->
    <div
      class="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
    >
      <!-- Header -->
      <div
        class="bg-gradient-to-r from-indigo-500 to-purple-600 p-8 text-center"
      >
        <div
          class="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4"
        >
          <UserCheck class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-white mb-2">You're Invited!</h1>
        <p class="text-indigo-100">Join the team on AptlySaid</p>
      </div>

      <!-- Content -->
      <div class="p-8">
        <!-- Organization Info -->
        <div class="flex items-center gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
          <div
            class="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center"
          >
            <Building2 class="w-5 h-5 text-indigo-600" />
          </div>
          <div>
            <h3 class="font-semibold text-gray-900">
              {data.invitation.tenant.name}
            </h3>
            <p class="text-sm text-gray-500">Tenant</p>
          </div>
        </div>

        <!-- Invitation Details -->
        <div class="space-y-4 mb-8">
          <div class="flex items-center gap-3">
            <Mail class="w-5 h-5 text-gray-400" />
            <div>
              <p class="text-sm text-gray-600">Invited email</p>
              <p class="font-medium">{data.invitation.email}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <UserCheck class="w-5 h-5 text-gray-400" />
            <div>
              <p class="text-sm text-gray-600">Role</p>
              <span
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800"
              >
                {formatRole(data.invitation.role)}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <Clock class="w-5 h-5 text-gray-400" />
            <div>
              <p class="text-sm text-gray-600">Expires</p>
              <p class="text-sm font-medium text-red-600">
                {formatDate(data.invitation.expires_at)}
              </p>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="space-y-3">
          <form
            method="POST"
            action="?/accept"
            use:enhance={() => {
              isAccepting = true
              return async ({ update }) => {
                await update()
                isAccepting = false
              }
            }}
          >
            <button
              type="submit"
              disabled={isAccepting || isDeclining}
              class="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {#if isAccepting}
                <div
                  class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"
                ></div>
                Accepting...
              {:else}
                <UserCheck class="w-4 h-4" />
                Accept Invitation
              {/if}
            </button>
          </form>

          <form
            method="POST"
            action="?/decline"
            use:enhance={() => {
              isDeclining = true
              return async ({ update }) => {
                await update()
                isDeclining = false
              }
            }}
          >
            <button
              type="submit"
              disabled={isAccepting || isDeclining}
              class="w-full bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {#if isDeclining}
                <div
                  class="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin mx-auto"
                ></div>
              {:else}
                Decline
              {/if}
            </button>
          </form>
        </div>

        <!-- Help Text -->
        <div class="mt-6 p-4 bg-blue-50 rounded-lg">
          <p class="text-sm text-blue-800">
            <strong>What happens next?</strong> After accepting, you'll be added
            to the team and can access the tenant's reviews and AI response management
            features.
          </p>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="text-center mt-6">
      <p class="text-sm text-gray-500">
        AptlySaid - AI-Powered Review Management
      </p>
    </div>
  </div>
</div>
