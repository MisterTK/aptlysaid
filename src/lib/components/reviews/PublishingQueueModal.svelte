<script lang="ts">
  import type { QueueItem } from "$lib/types"

  interface Props {
    open: boolean
    onClose: () => void
    queueItems: QueueItem[]
    stats: {
      queued: number
      published: number
      todayPublished?: number
      todayLimit?: number
      hourlyRate?: number
    }
    isPaused?: boolean
  }

  let { open = false, onClose, queueItems = [], stats, isPaused = false }: Props = $props()

  function formatTime(date: Date | string | null) {
    if (!date) return "N/A"
    const d = typeof date === "string" ? new Date(date) : date
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  function getRatingStars(rating: string | number) {
    const r = typeof rating === "string" ? parseInt(rating) : rating
    return "★".repeat(r) + "☆".repeat(5 - r)
  }
</script>

{#if open}
  <dialog class="modal modal-open">
    <div class="modal-box max-w-4xl">
      <form method="dialog">
        <button
          class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          onclick={onClose}
        >
          ✕
        </button>
      </form>

      <h3 class="font-bold text-lg mb-4">📊 Publishing Queue Statistics</h3>

      <!-- Statistics Cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div class="stat bg-base-200 rounded-lg">
          <div class="stat-figure text-primary">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              class="inline-block w-8 h-8 stroke-current"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </div>
          <div class="stat-title">Queued</div>
          <div class="stat-value text-primary">{stats.queued}</div>
          <div class="stat-desc">Ready to publish</div>
        </div>

        <div class="stat bg-base-200 rounded-lg">
          <div class="stat-figure text-success">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              class="inline-block w-8 h-8 stroke-current"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div class="stat-title">Published Today</div>
          <div class="stat-value text-success">{stats.todayPublished || 0}</div>
          <div class="stat-desc">
            {#if stats.todayLimit}
              of {stats.todayLimit} daily limit
            {:else}
              Responses sent
            {/if}
          </div>
        </div>

        <div class="stat bg-base-200 rounded-lg">
          <div class="stat-figure text-info">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              class="inline-block w-8 h-8 stroke-current"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </div>
          <div class="stat-title">Publishing Rate</div>
          <div class="stat-value text-info">{stats.hourlyRate || 10}</div>
          <div class="stat-desc">Per hour</div>
        </div>
      </div>

      <!-- Queue Status -->
      <div class="alert {isPaused ? 'alert-warning' : 'alert-info'} mb-6">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          class="stroke-current shrink-0 w-6 h-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <h3 class="font-bold">Queue Status: {isPaused ? "Paused" : "Active"}</h3>
          <div class="text-xs">
            {#if isPaused}
              Publishing is currently paused. Responses will remain in queue.
            {:else if queueItems.length > 0}
              Next response will be published at {formatTime(queueItems[0]?.scheduledTime)}
            {:else}
              No responses queued for publishing.
            {/if}
          </div>
        </div>
      </div>

      <!-- Queue Items -->
      {#if queueItems.length > 0}
        <div class="mb-6">
          <h4 class="font-semibold mb-3">📋 Queued Responses ({queueItems.length})</h4>
          <div class="overflow-x-auto">
            <table class="table table-zebra">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Reviewer</th>
                  <th>Rating</th>
                  <th>Location</th>
                  <th>Scheduled</th>
                  <th>Priority</th>
                </tr>
              </thead>
              <tbody>
                {#each queueItems.slice(0, 10) as item, index}
                  <tr>
                    <th>{index + 1}</th>
                    <td>
                      <div class="font-medium">
                        {item.review.reviewer.displayName}
                      </div>
                    </td>
                    <td>
                      <div class="text-warning">
                        {getRatingStars(item.review.starRating)}
                      </div>
                    </td>
                    <td>{item.review.locationName}</td>
                    <td>{formatTime(item.scheduledTime)}</td>
                    <td>
                      <div class="badge badge-ghost badge-sm">
                        {item.priority || "Normal"}
                      </div>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
            {#if queueItems.length > 10}
              <div class="text-center mt-2 text-sm text-base-content/60">
                ... and {queueItems.length - 10} more items
              </div>
            {/if}
          </div>
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center py-8 text-base-content/60">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="1.5"
            stroke="currentColor"
            class="w-16 h-16 mb-4"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25 2.25M12 13.875l2.25-2.25M12 13.875l-2.25 2.25M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
            />
          </svg>
          <p class="text-lg font-medium mb-2">No items in queue</p>
          <p class="text-sm">Approved responses will appear here for publishing</p>
        </div>
      {/if}

      <!-- Actions -->
      <div class="modal-action">
        <a href="/account/response-settings" class="btn btn-primary">
          ⚙️ Configure Auto-Publishing
        </a>
        <button class="btn" onclick={onClose}>Close</button>
      </div>
    </div>
    <button class="modal-backdrop" onclick={onClose}>✕</button>
  </dialog>
{/if}