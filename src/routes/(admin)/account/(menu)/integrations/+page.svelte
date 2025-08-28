<script lang="ts">
  import { getContext } from "svelte"
  import type { Writable } from "svelte/store"
  import type { PageData } from "./$types"
  import { enhance } from "$app/forms"
  import { goto } from "$app/navigation"

  let { data }: { data: PageData } = $props()
  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("integrations")

  let disconnecting = $state(false)
  let showDisconnectModal = $state(false)
  let refreshing = $state(false)
  let syncing = $state(false)
  let syncResult = $state<{
    type: "success" | "error"
    message: string
    details?: {
      locations?: number
      reviews?: number
    }
  } | null>(null)
</script>

<svelte:head>
  <title>Integrations</title>
</svelte:head>

<h1 class="text-2xl font-bold mb-6">Integrations</h1>

{#if data.success}
  <div class="alert alert-success mb-6">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="stroke-current shrink-0 h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      ><path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      /></svg
    >
    <span>Successfully connected Google My Business account!</span>
  </div>
{/if}

{#if data.disconnected}
  <div class="alert alert-success mb-6">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="stroke-current shrink-0 h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      ><path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      /></svg
    >
    <span>
      Successfully disconnected Google My Business! All related data has been
      removed from your account. You can reconnect anytime to start fresh.
    </span>
  </div>
{/if}

{#if data.error}
  <div class="alert alert-error mb-6">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="stroke-current shrink-0 h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      ><path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
      /></svg
    >
    <span>{data.error}</span>
  </div>
{/if}

<div class="grid gap-6">
  <!-- Google My Business Integration -->
  <div class="card bg-white shadow-sm">
    <div class="card-body">
      <div class="flex items-start justify-between">
        <div class="flex gap-4">
          <div class="avatar">
            <div
              class="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center"
            >
              <svg
                class="w-8 h-8 text-blue-600"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </div>
          </div>
          <div>
            <h3 class="text-lg font-semibold">Google My Business</h3>
            <p class="text-sm text-gray-600">
              Connect your Google My Business account to manage reviews
            </p>
          </div>
        </div>

        {#if data.googleConnected}
          <div class="flex flex-col items-end gap-2">
            <div class="flex items-center gap-2">
              <div class="badge badge-success gap-1">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="w-4 h-4"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                Connected
              </div>
              <form
                method="POST"
                action="?/refreshConnection"
                use:enhance={() => {
                  refreshing = true
                  return async ({ result, update }) => {
                    await update()
                    refreshing = false

                    if (result.type === "success") {
                      // Refresh the page to show updated data
                      window.location.reload()
                    }
                  }
                }}
              >
                <button
                  type="submit"
                  class="btn btn-sm btn-ghost"
                  title="Refresh connection"
                  aria-label="Refresh connection"
                  disabled={refreshing}
                >
                  {#if refreshing}
                    <span class="loading loading-spinner loading-xs"></span>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width="1.5"
                      stroke="currentColor"
                      class="w-4 h-4"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                      />
                    </svg>
                  {/if}
                </button>
              </form>
              <button
                type="button"
                class="btn btn-sm btn-ghost"
                onclick={() => (showDisconnectModal = true)}
              >
                Disconnect
              </button>
            </div>
            {#if data.lastSyncTime}
              <div class="text-xs text-gray-500">
                Last sync: {new Date(data.lastSyncTime).toLocaleString()}
              </div>
            {/if}
          </div>
        {:else}
          <form
            method="POST"
            action="?/connectGoogle"
            use:enhance={() => {
              return async ({ result }) => {
                if (result.type === "success" && result.data?.redirect) {
                  // Use window.location for external redirects
                  window.location.href = result.data.redirect
                }
              }
            }}
          >
            <button type="submit" class="btn btn-primary btn-sm">Connect</button
            >
          </form>
        {/if}
      </div>

      {#if data.googleConnected}
        <!-- V2 Enhanced Token Health Status -->
        {#if data.tokenHealth}
          <div class="mt-4 pt-4 border-t">
            <div class="flex items-center justify-between">
              <h4 class="font-medium text-sm">Connection Health</h4>
              <div class="flex items-center gap-2 text-xs">
                {#if data.tokenHealth.healthy}
                  <span class="badge badge-success badge-sm">Healthy</span>
                {:else if data.tokenHealth.needsReauth}
                  <form
                    method="POST"
                    action="?/reconnectGoogle"
                    use:enhance={() => {
                      return async ({ result }) => {
                        if (
                          result.type === "success" &&
                          result.data?.redirect
                        ) {
                          // Use window.location for external redirects
                          window.location.href = result.data.redirect
                        }
                      }
                    }}
                  >
                    <button type="submit" class="btn btn-error btn-xs">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="1.5"
                        stroke="currentColor"
                        class="w-3 h-3 mr-1"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                        />
                      </svg>
                      Re-authenticate Required
                    </button>
                  </form>
                {:else if data.tokenHealth.needsRefresh}
                  <span class="badge badge-warning badge-sm">Needs Refresh</span
                  >
                {:else}
                  <span class="badge badge-error badge-sm">Unhealthy</span>
                {/if}
              </div>
            </div>

            <div class="mt-2 space-y-1">
              {#if data.tokenHealth.errors.length > 0}
                {#each data.tokenHealth.errors as error, index (index)}
                  <p class="text-xs text-error">• {error}</p>
                {/each}
              {/if}

              {#if data.tokenHealth.expiresIn !== null && data.tokenHealth.expiresIn > 0}
                <p class="text-xs text-gray-500">
                  Token expires in: {Math.floor(
                    data.tokenHealth.expiresIn / 60,
                  )} minutes
                </p>
              {/if}

              {#if data.tokenHealth.scopes}
                <p class="text-xs text-gray-500">
                  Permissions: {data.tokenHealth.scopes} scopes granted
                </p>
              {/if}

              {#if data.tokenHealth.connectedAt}
                <p class="text-xs text-gray-500">
                  Connected: {new Date(
                    data.tokenHealth.connectedAt,
                  ).toLocaleDateString()}
                </p>
              {/if}

              {#if data.tokenHealth.lastRefreshed}
                <p class="text-xs text-gray-500">
                  Last refreshed: {new Date(
                    data.tokenHealth.lastRefreshed,
                  ).toLocaleString()}
                </p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Sync Status and Action Section -->
        <div class="mt-4 pt-4 border-t">
          <div class="flex items-center justify-between">
            <div>
              <h4 class="font-medium text-sm">Data Synchronization</h4>
              <p class="text-xs text-gray-600 mt-1">
                {#if data.lastSyncTime}
                  Last synced: {new Date(data.lastSyncTime).toLocaleString()}
                {:else}
                  No sync history yet
                {/if}
              </p>
            </div>
            <form
              method="POST"
              action="?/syncNow"
              use:enhance={() => {
                syncing = true
                syncResult = null
                return async ({ result }) => {
                  syncing = false
                  if (result.type === "success" && result.data) {
                    syncResult = {
                      type: "success",
                      message:
                        result.data.message || "Sync completed successfully",
                      details: result.data.syncResults,
                    }
                    // Reload the page after a delay to show updated data
                    setTimeout(() => {
                      window.location.reload()
                    }, 2000)
                  } else if (result.type === "failure" && result.data) {
                    syncResult = {
                      type: "error",
                      message: result.data.error || "Sync failed",
                    }
                  }
                }
              }}
            >
              <button
                type="submit"
                class="btn btn-primary btn-sm"
                disabled={syncing}
              >
                {#if syncing}
                  <span class="loading loading-spinner loading-xs"></span>
                  Syncing...
                {:else}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width="1.5"
                    stroke="currentColor"
                    class="w-4 h-4 mr-1"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  Sync Now
                {/if}
              </button>
            </form>
          </div>

          {#if syncResult}
            <div class="mt-3">
              <div
                class="alert {syncResult.type === 'success'
                  ? 'alert-success'
                  : 'alert-error'} text-sm"
              >
                <span>{syncResult.message}</span>
                {#if syncResult.type === "success" && syncResult.details}
                  <div class="text-xs mt-1">
                    {#if syncResult.details.locationsSynced > 0}
                      • {syncResult.details.locationsSynced} locations discovered
                    {/if}
                    {#if syncResult.details.reviewsSynced > 0}
                      • {syncResult.details.reviewsSynced} reviews synced
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          {/if}

          <!-- Show message for new connections -->
          {#if !data.accessibleLocations || data.accessibleLocations.length === 0}
            <div class="mt-3">
              <div class="alert alert-info text-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width="1.5"
                  stroke="currentColor"
                  class="w-5 h-5"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                  />
                </svg>
                <div>
                  <span class="font-medium">Welcome!</span> Click "Sync Now" to discover
                  your Google My Business locations and import reviews.
                </div>
              </div>
            </div>
          {/if}
        </div>

        {#if data.accessibleLocations && data.accessibleLocations.length > 0}
          <div class="mt-4 pt-4 border-t">
            <h4 class="font-medium mb-2">Connected Locations</h4>
            <p class="text-sm text-gray-600 mb-3">
              These are your business locations connected through Google My
              Business.
            </p>
            <div class="space-y-3">
              {#each data.accessibleLocations as location (location.id)}
                {@const reviewCount =
                  data.locationReviewCounts?.[location.id] || 0}
                {@const platformData = location.platform_data || {}}
                {@const lastSyncAt = location.last_sync_at}
                {@const syncEnabled = location.sync_enabled}
                {@const status = location.status}

                <div class="p-4 bg-gray-50 rounded-lg border">
                  <div class="flex items-start justify-between">
                    <div class="flex-1">
                      <div class="flex items-center gap-2 mb-1">
                        <div class="font-medium text-sm">
                          {location.name}
                        </div>

                        <!-- V2 Schema: Enhanced status indicators -->
                        {#if status === "active"}
                          <span class="badge badge-success badge-xs"
                            >Active</span
                          >
                        {:else if status === "paused"}
                          <span class="badge badge-warning badge-xs"
                            >Paused</span
                          >
                        {:else}
                          <span class="badge badge-neutral badge-xs"
                            >{status || "Unknown"}</span
                          >
                        {/if}
                      </div>

                      {#if location.address}
                        <div class="text-xs text-gray-500 mb-1">
                          📍 {location.address}
                        </div>
                      {/if}

                      {#if location.phone}
                        <div class="text-xs text-gray-500 mb-1">
                          📞 {location.phone}
                        </div>
                      {/if}

                      {#if location.website}
                        <div class="text-xs text-gray-500 mb-1">
                          🌐 <a
                            href={location.website}
                            target="_blank"
                            class="text-blue-600 hover:underline"
                            >{location.website}</a
                          >
                        </div>
                      {/if}

                      {#if location.google_place_id}
                        <div class="text-xs text-gray-400 mb-2">
                          Google Place ID: {location.google_place_id}
                        </div>
                      {/if}

                      <!-- V2 Schema: Sync information -->
                      <div
                        class="flex items-center gap-4 text-xs text-gray-500"
                      >
                        {#if syncEnabled}
                          <span class="flex items-center gap-1">
                            <svg
                              class="w-3 h-3 text-green-500"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clip-rule="evenodd"
                              />
                            </svg>
                            Auto-sync enabled
                          </span>
                        {:else}
                          <span class="flex items-center gap-1 text-orange-500">
                            <svg
                              class="w-3 h-3"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                                clip-rule="evenodd"
                              />
                            </svg>
                            Auto-sync disabled
                          </span>
                        {/if}

                        {#if lastSyncAt}
                          <span
                            >Last sync: {new Date(
                              lastSyncAt,
                            ).toLocaleDateString()}</span
                          >
                        {:else}
                          <span>Never synced</span>
                        {/if}
                      </div>
                    </div>

                    <div class="text-right">
                      {#if reviewCount > 0}
                        <div class="badge badge-success badge-sm mb-2">
                          {reviewCount} reviews synced
                        </div>
                      {:else}
                        <div class="badge badge-neutral badge-sm mb-2">
                          No reviews yet
                        </div>
                      {/if}

                      <!-- V2 Schema: Platform-specific data -->
                      {#if platformData.gmb_account_id}
                        <div class="text-xs text-gray-400">
                          Account: {platformData.gmb_account_id}
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      {/if}
    </div>
  </div>

  <!-- Future Integrations -->
  <div class="card bg-white shadow-sm opacity-50">
    <div class="card-body">
      <div class="flex items-start justify-between">
        <div class="flex gap-4">
          <div class="avatar">
            <div
              class="w-12 h-12 rounded-lg bg-orange-100 flex items-center justify-center"
            >
              <svg
                class="w-8 h-8 text-orange-600"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"
                />
              </svg>
            </div>
          </div>
          <div>
            <h3 class="text-lg font-semibold">Yelp Business</h3>
            <p class="text-sm text-gray-600">
              Coming soon - Connect your Yelp business account
            </p>
          </div>
        </div>
        <button class="btn btn-sm btn-disabled">Coming Soon</button>
      </div>
    </div>
  </div>

  <div class="card bg-white shadow-sm opacity-50">
    <div class="card-body">
      <div class="flex items-start justify-between">
        <div class="flex gap-4">
          <div class="avatar">
            <div
              class="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center"
            >
              <svg
                class="w-8 h-8 text-blue-600"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path
                  d="M12 2.04c-5.5 0-10 4.49-10 10.02 0 5 3.66 9.15 8.44 9.9v-7H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.92 3.78-3.92 1.09 0 2.23.19 2.23.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.9h-2.33v7a10 10 0 008.44-9.9c0-5.53-4.5-10.02-10-10.02z"
                />
              </svg>
            </div>
          </div>
          <div>
            <h3 class="text-lg font-semibold">Facebook Pages</h3>
            <p class="text-sm text-gray-600">
              Coming soon - Manage Facebook page reviews
            </p>
          </div>
        </div>
        <button class="btn btn-sm btn-disabled">Coming Soon</button>
      </div>
    </div>
  </div>
</div>

<!-- Disconnect Confirmation Modal -->
{#if showDisconnectModal}
  <div class="modal modal-open">
    <div class="modal-box">
      <h3 class="font-bold text-lg text-error">
        Disconnect Google My Business
      </h3>
      <div class="py-4">
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
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 14.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <span class="font-semibold"
            >This action will permanently remove all Google My Business data!</span
          >
        </div>

        <p class="mb-4">
          Disconnecting will remove all of the following data from your account:
        </p>

        <ul class="list-disc list-inside space-y-1 text-sm mb-4">
          <li>All Google My Business reviews</li>
          <li>AI-generated responses and drafts</li>
          <li>Business location data</li>
          <li>Response queue and publishing settings</li>
          <li>Business guidance and upsell items</li>
          <li>Response metrics and analytics</li>
          <li>OAuth connection to Google</li>
        </ul>

        <p class="text-sm text-gray-600 mb-4">
          <strong>Good news:</strong> You can reconnect your Google My Business account
          later and start fresh. Your other account data (billing, settings, etc.)
          will remain unchanged.
        </p>
      </div>

      <div class="modal-action">
        <button
          type="button"
          class="btn btn-ghost"
          onclick={() => (showDisconnectModal = false)}
          disabled={disconnecting}
        >
          Cancel
        </button>

        <form
          method="POST"
          action="?/disconnectGoogle"
          use:enhance={() => {
            disconnecting = true
            return async ({ result, update }) => {
              await update()
              disconnecting = false
              showDisconnectModal = false

              if (result.type === "redirect") {
                // Handle redirect manually
                goto(result.location)
              }
            }
          }}
        >
          <input type="hidden" name="confirmDisconnect" value="true" />
          <button type="submit" class="btn btn-error" disabled={disconnecting}>
            {#if disconnecting}
              <span class="loading loading-spinner loading-sm"></span>
              Disconnecting...
            {:else}
              Yes, Disconnect & Remove Data
            {/if}
          </button>
        </form>
      </div>
    </div>

    <!-- Modal backdrop -->
    <button
      class="modal-backdrop"
      onclick={() => !disconnecting && (showDisconnectModal = false)}
      onkeydown={(e) =>
        e.key === "Escape" && !disconnecting && (showDisconnectModal = false)}
      aria-label="Close modal"
    ></button>
  </div>
{/if}
