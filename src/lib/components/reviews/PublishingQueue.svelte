<script lang="ts">
  // Removed unused createEventDispatcher import
  import { slide } from "svelte/transition"
  import { flip } from "svelte/animate"
  import { cubicOut } from "svelte/easing"
  import type { QueueItem, PublishingSettings } from "$lib/types"

  interface Props {
    items: QueueItem[]
    settings: PublishingSettings
    onReorder?: (fromIndex: number, toIndex: number) => void
    onRemove?: (id: string) => void
    onSettingsChange?: (settings: PublishingSettings) => void
    onPause?: () => void
    onResume?: () => void
    isPaused?: boolean
    stats?: {
      todayPublished: number
      todayLimit: number
      hourlyRate: number
    }
  }

  let {
    items = [],
    settings,
    onReorder,
    onRemove,
    onSettingsChange,
    onPause,
    onResume,
    isPaused = false,
    stats = {
      todayPublished: 45,
      todayLimit: 100,
      hourlyRate: 10,
    },
  }: Props = $props()

  // Removed unused dispatch

  let isExpanded = $state(true)
  let showSettings = $state(false)
  let countdown = $state("")
  let draggedItem = $state<string | null>(null)

  // Settings form state
  let editSettings = $state({ ...settings })

  // Update countdown every second
  $effect(() => {
    if (!items.length || isPaused) {
      countdown = ""
      return
    }

    const interval = setInterval(() => {
      const next = items[0]?.scheduledTime
      if (next) {
        const now = new Date()
        const diff = next.getTime() - now.getTime()

        if (diff <= 0) {
          countdown = "Publishing now..."
        } else {
          const minutes = Math.floor(diff / 60000)
          const seconds = Math.floor((diff % 60000) / 1000)
          countdown = `${minutes}m ${seconds}s`
        }
      }
    }, 1000)

    return () => clearInterval(interval)
  })

  function handleReorder(index: number, direction: "up" | "down") {
    if (!onReorder) return

    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex >= 0 && newIndex < items.length) {
      onReorder(index, newIndex)
    }
  }

  function handleRemove(id: string) {
    onRemove?.(id)
  }

  function saveSettings() {
    onSettingsChange?.(editSettings)
    showSettings = false
  }

  function togglePause() {
    if (isPaused) {
      onResume?.()
    } else {
      onPause?.()
    }
  }

  function handleDragStart(e: DragEvent, id: string) {
    draggedItem = id
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move"
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault()
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move"
    }
  }

  function handleDrop(e: DragEvent, targetId: string) {
    e.preventDefault()
    if (!draggedItem || draggedItem === targetId || !onReorder) return

    const fromIndex = items.findIndex((item) => item.id === draggedItem)
    const toIndex = items.findIndex((item) => item.id === targetId)

    if (fromIndex !== -1 && toIndex !== -1) {
      onReorder(fromIndex, toIndex)
    }
    draggedItem = null
  }

  const progressPercentage = $derived(
    Math.round((stats.todayPublished / stats.todayLimit) * 100),
  )

  const statusColor = $derived(isPaused ? "warning" : "success")
</script>

<div class="publishing-queue" class:expanded={isExpanded}>
  <div class="queue-container">
    <!-- Header -->
    <div class="queue-header">
      <div class="header-content">
        <h3 class="queue-title">
          <svg
            class="title-icon"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              d="M3 3h18v18H3V3zm16 5H5m14 4H5m14 4H5"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
          Publishing Queue
        </h3>
        <button
          class="expand-button"
          onclick={() => {
            isExpanded = !isExpanded
          }}
          aria-label={isExpanded ? "Collapse queue" : "Expand queue"}
        >
          <svg
            class="expand-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              d="M19 9l-7 7-7-7"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>

    {#if isExpanded}
      <div
        class="queue-content"
        transition:slide={{ duration: 300, easing: cubicOut }}
      >
        <!-- Status Section -->
        <div class="status-section">
          <div class="status-card" data-status={statusColor}>
            <div class="status-header">
              <span class="status-label">Status</span>
              <div class="status-indicator">
                <span class="indicator-dot"></span>
                <span class="indicator-text"
                  >{isPaused ? "Paused" : "Active"}</span
                >
              </div>
            </div>

            {#if !isPaused && items.length > 0}
              <div class="next-publish">
                <span class="next-label">Next publish in</span>
                <span class="countdown">{countdown}</span>
              </div>
            {/if}
          </div>

          <div class="progress-card">
            <div class="progress-header">
              <span class="progress-label">Today's Progress</span>
              <span class="progress-text"
                >{stats.todayPublished}/{stats.todayLimit}</span
              >
            </div>
            <div class="progress-bar">
              <div
                class="progress-fill"
                style="width: {progressPercentage}%"
                data-status={progressPercentage > 90
                  ? "warning"
                  : progressPercentage > 95
                    ? "error"
                    : "success"}
              ></div>
            </div>
            <div class="progress-rate">
              <span class="rate-label">Current rate:</span>
              <span class="rate-value">{stats.hourlyRate}/hour</span>
            </div>
          </div>
        </div>

        <!-- Queue Items -->
        <div class="queue-section">
          <div class="section-header">
            <h4 class="section-title">Queue Order</h4>
            <span class="queue-count">{items.length} items</span>
          </div>

          {#if items.length === 0}
            <div class="empty-state">
              <svg
                class="empty-icon"
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <rect
                  x="3"
                  y="3"
                  width="18"
                  height="18"
                  rx="2"
                  ry="2"
                  stroke-width="1.5"
                />
                <path
                  d="M9 9h6m-6 4h6m-6 4h4"
                  stroke-width="1.5"
                  stroke-linecap="round"
                />
              </svg>
              <p class="empty-title">No items in queue</p>
              <p class="empty-text">Approved responses will appear here</p>
            </div>
          {:else}
            <div class="queue-list custom-scrollbar">
              {#each items as item, index (item.id)}
                <div
                  class="queue-item"
                  class:dragging={draggedItem === item.id}
                  animate:flip={{ duration: 300 }}
                  transition:slide={{ duration: 200 }}
                  draggable="true"
                  ondragstart={(e) => handleDragStart(e, item.id)}
                  ondragover={handleDragOver}
                  ondrop={(e) => handleDrop(e, item.id)}
                  role="listitem"
                  aria-grabbed={draggedItem === item.id}
                >
                  <div class="item-number">{index + 1}</div>

                  <div class="item-content">
                    <div class="item-header">
                      <span class="reviewer-name"
                        >{item.review.reviewer.displayName}</span
                      >
                      <div class="rating">
                        {#each Array(5).fill(0).map((_, index) => index) as i (i)}
                          <span
                            class="star"
                            class:filled={i < parseInt(item.review.starRating)}
                            >★</span
                          >
                        {/each}
                      </div>
                    </div>
                    <div class="item-meta">
                      <span class="location">{item.review.locationName}</span>
                      {#if item.scheduledTime}
                        <span class="scheduled-time">
                          {new Date(item.scheduledTime).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      {/if}
                    </div>
                  </div>

                  <div class="item-actions">
                    <button
                      class="action-btn move-btn"
                      onclick={() => handleReorder(index, "up")}
                      disabled={index === 0}
                      title="Move up"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path
                          d="M12 19V5m-7 7l7-7 7 7"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      class="action-btn move-btn"
                      onclick={() => handleReorder(index, "down")}
                      disabled={index === items.length - 1}
                      title="Move down"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path
                          d="M12 5v14m7-7l-7 7-7-7"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </button>
                    <button
                      class="action-btn remove-btn"
                      onclick={() => handleRemove(item.id)}
                      title="Remove from queue"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                      >
                        <path
                          d="M18 6L6 18M6 6l12 12"
                          stroke-width="2"
                          stroke-linecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Settings Section -->
        <div class="settings-section">
          <button
            class="settings-header"
            onclick={() => {
              showSettings = !showSettings
            }}
          >
            <div class="settings-title-container">
              <svg
                class="settings-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <circle cx="12" cy="12" r="3" stroke-width="2" />
                <path
                  d="M12 1v6m0 6v6m3.464-13.535l4.243 4.243M4.757 16.757l4.243 4.243m0-13.456L4.757 3.301m13.486 13.456l4.243 4.243"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              <h4 class="section-title">Publishing Settings</h4>
            </div>
            <svg
              class="chevron-icon"
              class:rotated={showSettings}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                d="M9 5l7 7-7 7"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          {#if showSettings}
            <div class="settings-content" transition:slide={{ duration: 200 }}>
              <div class="settings-grid">
                <div class="setting-field">
                  <label for="rate-select" class="field-label"
                    >Publishing Rate</label
                  >
                  <select
                    id="rate-select"
                    class="field-select"
                    bind:value={editSettings.maxPerHour}
                  >
                    <option value={5}>5/hour</option>
                    <option value={10}>10/hour</option>
                    <option value={20}>20/hour</option>
                    <option value={30}>30/hour</option>
                    <option value={50}>50/hour</option>
                  </select>
                </div>

                <div class="setting-field">
                  <label for="min-rating-select" class="field-label"
                    >Minimum Rating</label
                  >
                  <select
                    id="min-rating-select"
                    class="field-select"
                    bind:value={editSettings.minRating}
                  >
                    <option value={1}>★ (All)</option>
                    <option value={2}>★★+</option>
                    <option value={3}>★★★+</option>
                    <option value={4}>★★★★+</option>
                    <option value={5}>★★★★★</option>
                  </select>
                </div>

                <div class="setting-field full-width">
                  <label class="field-label">Business Hours</label>
                  <div class="time-inputs">
                    <input
                      type="time"
                      class="field-input"
                      value={editSettings.businessHours.start}
                      onchange={(e) => {
                        editSettings.businessHours.start = e.currentTarget.value
                      }}
                    />
                    <span class="time-separator">to</span>
                    <input
                      type="time"
                      class="field-input"
                      value={editSettings.businessHours.end}
                      onchange={(e) => {
                        editSettings.businessHours.end = e.currentTarget.value
                      }}
                    />
                    <select
                      class="field-select timezone-select"
                      bind:value={editSettings.businessHours.timezone}
                    >
                      <option value="America/New_York">EST</option>
                      <option value="America/Chicago">CST</option>
                      <option value="America/Denver">MST</option>
                      <option value="America/Los_Angeles">PST</option>
                    </select>
                  </div>
                </div>
              </div>

              <button class="save-button" onclick={saveSettings}>
                Save Settings
              </button>
            </div>
          {:else if !showSettings}
            <div class="settings-summary">
              <div class="summary-item">
                <span class="summary-label">Rate:</span>
                <span class="summary-value">{settings.maxPerHour}/hour</span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Hours:</span>
                <span class="summary-value">
                  {settings.businessHours.start}-{settings.businessHours.end}
                </span>
              </div>
              <div class="summary-item">
                <span class="summary-label">Min Rating:</span>
                <span class="summary-value"
                  >{"★".repeat(settings.minRating)}</span
                >
              </div>
            </div>
          {/if}
        </div>

        <!-- Action Button -->
        <div class="queue-actions">
          <button
            class="pause-button"
            data-status={isPaused ? "paused" : "active"}
            onclick={togglePause}
          >
            {#if isPaused}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <polygon
                  points="5 3 19 12 5 21 5 3"
                  stroke-width="2"
                  stroke-linejoin="round"
                />
              </svg>
              Resume Queue
            {:else}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <rect x="6" y="4" width="4" height="16" stroke-width="2" />
                <rect x="14" y="4" width="4" height="16" stroke-width="2" />
              </svg>
              Pause Queue
            {/if}
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .publishing-queue {
    width: 100%;
    background: white;
    transition: all 0.3s;
    display: flex;
    flex-direction: column;
  }

  .queue-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  /* Header */
  .queue-header {
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
    background: #f8fafc;
  }

  .header-content {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .queue-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1rem;
    font-weight: 600;
    color: #111827;
  }

  .title-icon {
    color: #6366f1;
  }

  .expand-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    color: #6b7280;
    transition: all 0.2s;
    cursor: pointer;
  }

  .expand-button:hover {
    background: #f9fafb;
    border-color: #d1d5db;
    color: #111827;
  }

  .expand-icon {
    transition: transform 0.2s;
  }

  .expanded .expand-icon {
    transform: rotate(180deg);
  }

  /* Content */
  .queue-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
  }

  /* Status Section */
  .status-section {
    padding: 1.5rem;
    display: grid;
    gap: 1rem;
  }

  .status-card,
  .progress-card {
    padding: 1rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    transition: all 0.2s;
  }

  .status-card[data-status="success"] {
    background: #f0fdf4;
    border-color: #bbf7d0;
  }

  .status-card[data-status="warning"] {
    background: #fffbeb;
    border-color: #fde68a;
  }

  .status-header,
  .progress-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
  }

  .status-label,
  .progress-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .indicator-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #9ca3af;
    transition: all 0.2s;
  }

  .status-card[data-status="success"] .indicator-dot {
    background: #10b981;
    box-shadow: 0 0 0 3px #bbf7d0;
  }

  .status-card[data-status="warning"] .indicator-dot {
    background: #f59e0b;
    box-shadow: 0 0 0 3px #fde68a;
  }

  .indicator-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: #111827;
  }

  .next-publish {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .next-label {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .countdown {
    font-size: 1.25rem;
    font-weight: 600;
    color: #6366f1;
    font-family: monospace;
  }

  /* Progress */
  .progress-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: #111827;
  }

  .progress-bar {
    height: 6px;
    background: #e5e7eb;
    border-radius: 9999px;
    overflow: hidden;
    margin: 0.75rem 0;
  }

  .progress-fill {
    height: 100%;
    background: #10b981;
    transition: width 0.3s;
  }

  .progress-fill[data-status="warning"] {
    background: #f59e0b;
  }

  .progress-fill[data-status="error"] {
    background: #ef4444;
  }

  .progress-rate {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .rate-label {
    color: #9ca3af;
  }

  .rate-value {
    color: #111827;
    font-weight: 500;
  }

  /* Queue Section */
  .queue-section {
    flex: 1;
    padding: 0 1.5rem 1.5rem;
    display: flex;
    flex-direction: column;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .section-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .queue-count {
    font-size: 0.75rem;
    font-weight: 500;
    color: #9ca3af;
    background: #f9fafb;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
  }

  /* Empty State */
  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    text-align: center;
  }

  .empty-icon {
    color: #9ca3af;
    margin-bottom: 1rem;
  }

  .empty-title {
    font-size: 1rem;
    font-weight: 500;
    color: #111827;
    margin-bottom: 0.25rem;
  }

  .empty-text {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  /* Queue List */
  .queue-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .queue-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    cursor: move;
    transition: all 0.2s;
  }

  .queue-item:hover {
    background: #f9fafb;
    border-color: #d1d5db;
    transform: translateY(-1px);
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
  }

  .queue-item.dragging {
    opacity: 0.5;
  }

  .item-number {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #e0e7ff;
    color: #6366f1;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .item-content {
    flex: 1;
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
  }

  .reviewer-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: #111827;
  }

  .rating {
    display: flex;
    gap: 1px;
  }

  .star {
    font-size: 0.75rem;
    color: #d1d5db;
  }

  .star.filled {
    color: #f59e0b;
  }

  .item-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: #9ca3af;
  }

  .location {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scheduled-time {
    font-family: monospace;
  }

  .item-actions {
    display: flex;
    gap: 0.25rem;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover:not(:disabled) {
    background: white;
    border-color: #e5e7eb;
    color: #111827;
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .remove-btn:hover:not(:disabled) {
    color: #ef4444;
  }

  /* Settings Section */
  .settings-section {
    padding: 0 1.5rem 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 1rem 0;
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .settings-title-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .settings-icon {
    color: #6366f1;
  }

  .chevron-icon {
    color: #9ca3af;
    transition: transform 0.2s;
  }

  .chevron-icon.rotated {
    transform: rotate(90deg);
  }

  /* Settings Content */
  .settings-content {
    padding-top: 0.5rem;
  }

  .settings-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .setting-field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .setting-field.full-width {
    grid-column: 1 / -1;
  }

  .field-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: #6b7280;
  }

  .field-select,
  .field-input {
    padding: 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #111827;
    transition: all 0.2s;
  }

  .field-select:focus,
  .field-input:focus {
    outline: none;
    border-color: #6366f1;
  }

  .time-inputs {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .time-separator {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  .timezone-select {
    flex: 1;
  }

  /* Settings Summary */
  .settings-summary {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem 0;
  }

  .summary-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
  }

  .summary-label {
    color: #9ca3af;
  }

  .summary-value {
    color: #111827;
    font-weight: 500;
  }

  /* Buttons */
  .save-button {
    width: 100%;
    padding: 0.75rem;
    background: #6366f1;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .save-button:hover {
    background: #4f46e5;
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  /* Queue Actions */
  .queue-actions {
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .pause-button {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.875rem;
    background: #6366f1;
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: white;
    cursor: pointer;
    transition: all 0.2s;
  }

  .pause-button[data-status="paused"] {
    background: #10b981;
  }

  .pause-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .pause-button[data-status="active"]:hover {
    background: #f59e0b;
  }

  .pause-button[data-status="paused"]:hover {
    background: #10b981;
    filter: brightness(1.1);
  }

  /* Mobile Responsive */
  @media (max-width: 1024px) {
    .publishing-queue {
      width: 100%;
      max-width: none;
    }
  }

  @media (max-width: 768px) {
    .publishing-queue {
      width: 100%;
    }
  }
</style>
