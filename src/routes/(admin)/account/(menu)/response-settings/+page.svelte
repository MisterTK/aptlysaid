<script lang="ts">
  import { getContext } from "svelte"
  import { invalidateAll } from "$app/navigation"
  import {
    Bot,
    Clock,
    Filter,
    List,
    CheckCircle,
    Trash2,
    Eye,
    Pause,
  } from "lucide-svelte"
  import type { PageData } from "./$types"
  import type { Writable } from "svelte/store"

  export let data: PageData

  const adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("response-settings")

  let settings = data.settings || {
    auto_publish: false,
    min_rating: 3,
    max_per_hour: 10,
    max_per_day: 100,
    response_delay: 30,
    business_hours_only: false,
    business_hours_start: "09:00",
    business_hours_end: "18:00",
    timezone: "America/New_York",
    auto_approve_5_star: false,
    require_approval_low_rating: true,
  }

  let saving = false
  let saved = false
  let queueStats = data.queueStats

  const timezones = [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Phoenix",
    "Europe/London",
    "Europe/Paris",
    "Europe/Berlin",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Australia/Sydney",
  ]

  async function saveSettings() {
    saving = true
    saved = false

    try {
      const response = await fetch("/account/api/reviews/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })

      if (!response.ok) {
        throw new Error("Failed to save settings")
      }

      saved = true
      setTimeout(() => (saved = false), 3000)
      await invalidateAll()
    } catch (error) {
      console.error("Error saving settings:", error)
      alert("Failed to save settings. Please try again.")
    } finally {
      saving = false
    }
  }

  async function clearFailedQueue() {
    if (
      !confirm(
        "Are you sure you want to clear all failed items from the queue?",
      )
    ) {
      return
    }

    try {
      const response = await fetch("/account/api/reviews/publish", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          action: "clear-failed",
          tenantId: data.tenantId,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to clear queue")
      }

      await invalidateAll()
      queueStats = data.queueStats
    } catch (error) {
      console.error("Error clearing queue:", error)
      alert("Failed to clear failed items. Please try again.")
    }
  }

  async function pausePublishing() {
    settings.auto_publish = false
    await saveSettings()
  }

  $: hasChanges =
    JSON.stringify(settings) !== JSON.stringify(data.settings || {})
</script>

<svelte:head>
  <title>Response Settings - AptlySaid</title>
</svelte:head>

<div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
  <!-- Header -->
  <div class="mb-8">
    <h1 class="text-3xl font-bold text-gray-900">
      Response Publishing Settings
    </h1>
    <p class="mt-2 text-gray-900/70">
      Configure how and when AI responses are published to Google My Business
    </p>
  </div>

  <div class="grid gap-8 lg:grid-cols-3">
    <!-- Settings Form -->
    <div class="lg:col-span-2 space-y-6">
      <!-- Automated Publishing -->
      <div class="card bg-white shadow-sm">
        <div class="card-body">
          <h2 class="card-title mb-4">
            <Bot class="w-5 h-5 text-primary" />
            Automated Publishing
          </h2>

          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-4">
              <input
                type="checkbox"
                class="toggle toggle-primary toggle-lg"
                bind:checked={settings.auto_publish}
              />
              <span class="label-text text-lg font-medium">
                {settings.auto_publish ? "Enabled" : "Disabled"}
              </span>
            </label>
            <p class="text-sm text-gray-900/60 mt-2 ml-14">
              When enabled, approved responses will be automatically published
              to Google
            </p>
          </div>
        </div>
      </div>

      <!-- Publishing Schedule -->
      <div
        class="card bg-base-100 shadow-sm"
        class:opacity-60={!settings.auto_publish}
      >
        <div class="card-body">
          <h2 class="card-title mb-4">
            <Clock class="w-5 h-5 text-primary" />
            Publishing Schedule
          </h2>

          <div class="grid gap-4 sm:grid-cols-2">
            <div class="form-control">
              <label class="label" for="max-per-hour">
                <span class="label-text">Max per hour</span>
              </label>
              <input
                id="max-per-hour"
                type="number"
                min="1"
                max="100"
                class="input input-bordered"
                bind:value={settings.max_per_hour}
                disabled={!settings.auto_publish}
              />
            </div>

            <div class="form-control">
              <label class="label" for="max-per-day">
                <span class="label-text">Max per day</span>
              </label>
              <input
                id="max-per-day"
                type="number"
                min="1"
                max="1000"
                class="input input-bordered"
                bind:value={settings.max_per_day}
                disabled={!settings.auto_publish}
              />
            </div>
          </div>

          <div class="form-control mt-4">
            <label class="label" for="response-delay">
              <span class="label-text">Delay between responses (seconds)</span>
            </label>
            <input
              id="response-delay"
              type="number"
              min="10"
              max="3600"
              class="input input-bordered"
              bind:value={settings.response_delay}
              disabled={!settings.auto_publish}
            />
            <div class="label">
              <span class="label-text-alt"
                >Minimum 10 seconds to avoid rate limits</span
              >
            </div>
          </div>

          <div class="divider"></div>

          <div class="form-control">
            <label class="label cursor-pointer justify-start gap-4">
              <input
                type="checkbox"
                class="checkbox checkbox-primary"
                bind:checked={settings.business_hours_only}
                disabled={!settings.auto_publish}
              />
              <span class="label-text">Only publish during business hours</span>
            </label>
          </div>

          {#if settings.business_hours_only}
            <div class="grid gap-4 sm:grid-cols-2 mt-4">
              <div class="form-control">
                <label class="label" for="business-start">
                  <span class="label-text">Start time</span>
                </label>
                <input
                  id="business-start"
                  type="time"
                  class="input input-bordered"
                  bind:value={settings.business_hours_start}
                  disabled={!settings.auto_publish}
                />
              </div>

              <div class="form-control">
                <label class="label" for="business-end">
                  <span class="label-text">End time</span>
                </label>
                <input
                  id="business-end"
                  type="time"
                  class="input input-bordered"
                  bind:value={settings.business_hours_end}
                  disabled={!settings.auto_publish}
                />
              </div>
            </div>

            <div class="form-control mt-4">
              <label class="label" for="timezone">
                <span class="label-text">Timezone</span>
              </label>
              <select
                id="timezone"
                class="select select-bordered"
                bind:value={settings.timezone}
                disabled={!settings.auto_publish}
              >
                {#each timezones as tz (tz)}
                  <option value={tz}>{tz}</option>
                {/each}
              </select>
            </div>
          {/if}
        </div>
      </div>

      <!-- Response Criteria -->
      <div
        class="card bg-base-100 shadow-sm"
        class:opacity-60={!settings.auto_publish}
      >
        <div class="card-body">
          <h2 class="card-title mb-4">
            <Filter class="w-5 h-5 text-primary" />
            Response Criteria
          </h2>

          <div class="form-control">
            <label class="label" for="min-rating">
              <span class="label-text">Minimum rating for auto-publish</span>
            </label>
            <select
              id="min-rating"
              class="select select-bordered"
              bind:value={settings.min_rating}
              disabled={!settings.auto_publish}
            >
              <option value={1}>1 star and above</option>
              <option value={2}>2 stars and above</option>
              <option value={3}>3 stars and above</option>
              <option value={4}>4 stars and above</option>
              <option value={5}>5 stars only</option>
            </select>
            <div class="label">
              <span class="label-text-alt">
                Lower-rated reviews will require manual publishing
              </span>
            </div>
          </div>

          <div class="space-y-3 mt-4">
            <div class="form-control">
              <label class="label cursor-pointer justify-start gap-4">
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary"
                  bind:checked={settings.auto_approve_5_star}
                  disabled={!settings.auto_publish}
                />
                <span class="label-text">Auto-approve 5-star responses</span>
              </label>
            </div>

            <div class="form-control">
              <label class="label cursor-pointer justify-start gap-4">
                <input
                  type="checkbox"
                  class="checkbox checkbox-primary"
                  bind:checked={settings.require_approval_low_rating}
                  disabled={!settings.auto_publish}
                />
                <span class="label-text"
                  >Require manual approval for 1-2 star reviews</span
                >
              </label>
            </div>
          </div>
        </div>
      </div>

      <!-- Save Button -->
      <div class="flex justify-end gap-4">
        {#if saved}
          <div class="alert alert-success max-w-xs">
            <CheckCircle class="w-5 h-5" />
            <span>Settings saved successfully!</span>
          </div>
        {/if}

        <button
          class="btn btn-primary"
          on:click={saveSettings}
          disabled={saving || !hasChanges}
        >
          {#if saving}
            <span class="loading loading-spinner"></span>
          {/if}
          Save Settings
        </button>
      </div>
    </div>

    <!-- Queue Status Sidebar -->
    <div class="lg:col-span-1">
      <div class="card bg-white shadow-sm sticky top-4">
        <div class="card-body">
          <h2 class="card-title mb-4">
            <List class="w-5 h-5 text-primary" />
            Queue Status
          </h2>

          <div class="space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-gray-900/70">Status</span>
              <div
                class="badge badge-lg"
                class:badge-success={settings.auto_publish}
              >
                {settings.auto_publish ? "Active" : "Paused"}
              </div>
            </div>

            <div class="divider my-2"></div>

            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-gray-900/70">Pending</span>
                <span class="font-semibold">{queueStats.pending}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-900/70">Processing</span>
                <span class="font-semibold">{queueStats.processing}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-900/70">Completed Today</span>
                <span class="font-semibold text-success"
                  >{queueStats.completed}</span
                >
              </div>
              <div class="flex items-center justify-between">
                <span class="text-gray-900/70">Failed</span>
                <span class="font-semibold text-error">{queueStats.failed}</span
                >
              </div>
            </div>

            {#if queueStats.next_publish_time && settings.auto_publish}
              <div class="divider my-2"></div>
              <div class="text-center">
                <p class="text-sm text-gray-900/70">Next publish in</p>
                <p class="text-lg font-semibold text-primary">
                  {new Date(queueStats.next_publish_time).toLocaleTimeString()}
                </p>
              </div>
            {/if}

            <div class="divider my-2"></div>

            <div class="space-y-2">
              <a
                href="/account/publishing-queue"
                class="btn btn-sm btn-outline w-full"
              >
                <Eye class="w-4 h-4" />
                View Queue
              </a>

              {#if queueStats.failed > 0}
                <button
                  class="btn btn-sm btn-error btn-outline w-full"
                  on:click={clearFailedQueue}
                >
                  <Trash2 class="w-4 h-4" />
                  Clear Failed ({queueStats.failed})
                </button>
              {/if}

              {#if settings.auto_publish}
                <button
                  class="btn btn-sm btn-warning btn-outline w-full"
                  on:click={pausePublishing}
                >
                  <Pause class="w-4 h-4" />
                  Pause Publishing
                </button>
              {/if}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
