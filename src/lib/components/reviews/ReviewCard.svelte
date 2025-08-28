<script lang="ts">
  // Removed unused createEventDispatcher import
  import { slide, scale } from "svelte/transition"
  import { cubicOut } from "svelte/easing"
  import type { Review, AIResponse } from "$lib/types"
  import {
    formatReviewDate,
    getUserTimezone,
    formatFullDateTime,
  } from "$lib/utils/date-formatter"

  interface Props {
    review: Review
    aiResponse?: AIResponse | null
    isGenerating?: boolean
    isSelected?: boolean
    viewMode?: "grid" | "list"
    onApprove?: (id: string) => void
    onReject?: (id: string) => void
    onEdit?: (id: string, text: string) => void
    onPublish?: (id: string) => void
    onQueueAdd?: (id: string) => void
    onRemoveFromQueue?: (id: string) => void
    onSelect?: (id: string) => void
  }

  let {
    review,
    aiResponse = null,
    isGenerating = false,
    isSelected = false,
    viewMode = "grid",
    onApprove,
    onReject,
    onEdit,
    onPublish,
    onQueueAdd,
    onRemoveFromQueue,
    onSelect,
  }: Props = $props()

  // Removed unused createEventDispatcher

  let isExpanded = $state(false)
  let isEditing = $state(false)
  let editText = $state(aiResponse?.response_text || "")
  let showActions = $state(false)
  let copied = $state(false)
  // Removed unused isHovered state

  $effect(() => {
    if (aiResponse?.response_text) {
      editText = aiResponse.response_text
    }
  })

  const reviewState = $derived.by(() => {
    // Check if this is a manual reply from the business owner
    if (review.has_owner_reply && review.response_source === "owner_external") {
      return "manual_reply"
    }
    // Check if this is an AI-generated reply that's been published
    if (review.has_owner_reply && review.response_source === "ai") {
      return "ai_published"
    }
    // Check AI response workflow states
    if (
      aiResponse?.response_queue?.some((q) =>
        ["pending", "processing"].includes(q.status),
      )
    ) {
      return "queued"
    }
    if (aiResponse?.status === "approved") return "approved"
    if (aiResponse?.status === "draft") return "draft"
    return "new"
  })

  const stateConfig = $derived.by(() => {
    switch (reviewState) {
      case "manual_reply":
        return {
          color: "success",
          icon: "✓",
          label: "Replied",
          bgClass: "published-bg",
        }
      case "ai_published":
        return {
          color: "success",
          icon: "✓",
          label: "AI Published",
          bgClass: "published-bg",
        }
      case "queued":
        return {
          color: "info",
          icon: "⏱",
          label: "In Queue",
          bgClass: "queued-bg",
        }
      case "approved":
        return {
          color: "primary",
          icon: "✓",
          label: "Approved",
          bgClass: "approved-bg",
        }
      case "draft":
        return {
          color: "warning",
          icon: "✎",
          label: "Draft",
          bgClass: "draft-bg",
        }
      default:
        return {
          color: "neutral",
          icon: "•",
          label: "New",
          bgClass: "new-bg",
        }
    }
  })

  function handleSelectToggle() {
    onSelect?.(review.id)
  }

  function saveEdit() {
    if (onEdit && aiResponse) {
      onEdit(aiResponse.id, editText)
    }
    isEditing = false
  }

  function cancelEdit() {
    editText = aiResponse?.response_text || ""
    isEditing = false
  }

  function copyResponse() {
    const textToCopy =
      aiResponse?.response_text || review.owner_reply_text || ""
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy)
      copied = true
      setTimeout(() => {
        copied = false
      }, 2000)
    }
  }

  // Get user's timezone for proper date display
  const userTimezone = getUserTimezone()

  function formatDate(dateString: string) {
    return formatReviewDate(dateString, {
      showTimezone: false,
      userTimezone,
    })
  }

  function getInitials(name: string) {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2)
  }
</script>

<div
  class="review-card {viewMode}"
  class:expanded={isExpanded}
  class:selected={isSelected}
  class:generating={isGenerating}
  data-state={reviewState}
>
  <!-- Card Background Effects -->
  <div class="card-bg {stateConfig.bgClass}"></div>
  <div class="card-glow"></div>

  <div class="card-container">
    <!-- Header Section -->
    <div class="card-header">
      <!-- Selection Checkbox -->
      <label class="selection-control">
        <input
          type="checkbox"
          class="selection-checkbox"
          checked={isSelected}
          onchange={handleSelectToggle}
        />
        <span class="checkbox-custom"></span>
      </label>

      <!-- Reviewer Info -->
      <div class="reviewer-info">
        <div class="reviewer-avatar">
          <span class="avatar-text"
            >{getInitials(review.reviewer_name || "Anonymous")}</span
          >
        </div>
        <div class="reviewer-details">
          <h4 class="reviewer-name">{review.reviewer_name || "Anonymous"}</h4>
          <div class="review-meta">
            <div class="rating">
              {#each Array(5)
                .fill(0)
                .map((_, index) => index) as i (i)}
                <span class="star" class:filled={i < review.rating}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                    />
                  </svg>
                </span>
              {/each}
            </div>
            <span class="meta-separator">•</span>
            <span
              class="review-date cursor-help"
              title={formatFullDateTime(
                new Date(review.review_date),
                userTimezone,
                true,
              )}>{formatDate(review.review_date)}</span
            >
          </div>
        </div>
      </div>

      <!-- State Badge -->
      <div class="state-badge" data-color={stateConfig.color}>
        <span class="state-icon">{stateConfig.icon}</span>
        <span class="state-label">{stateConfig.label}</span>
      </div>

      <!-- Action Menu -->
      <button
        class="action-menu-btn"
        onclick={() => {
          showActions = !showActions
        }}
        aria-label="More actions"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="12" cy="5" r="1" stroke-width="2" />
          <circle cx="12" cy="12" r="1" stroke-width="2" />
          <circle cx="12" cy="19" r="1" stroke-width="2" />
        </svg>
      </button>

      {#if showActions}
        <div
          class="action-menu"
          transition:scale={{ duration: 200, easing: cubicOut }}
        >
          <button class="menu-item" onclick={copyResponse}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <rect
                x="9"
                y="9"
                width="13"
                height="13"
                rx="2"
                stroke-width="2"
              />
              <path
                d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"
                stroke-width="2"
              />
            </svg>
            Copy Response
          </button>
          {#if reviewState === "queued" && aiResponse}
            <button
              class="menu-item danger"
              onclick={() => onRemoveFromQueue?.(aiResponse.id)}
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
              Remove from Queue
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Review Content -->
    <div class="review-content">
      <div class="review-text">
        {review.review_text || "No comment provided"}
      </div>

      {#if review.locations?.name}
        <div class="location-tag">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"
              stroke-width="2"
            />
            <circle cx="12" cy="10" r="3" stroke-width="2" />
          </svg>
          <span>{review.locations.name}</span>
        </div>
      {/if}
    </div>

    <!-- Manual Owner Reply Section -->
    {#if review.has_owner_reply && review.response_source === "owner_external"}
      <div
        class="response-section manual-reply"
        transition:slide={{ duration: 300, easing: cubicOut }}
      >
        <div class="response-header">
          <div class="response-title">
            <svg
              class="owner-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                d="M8 7a4 4 0 118 0 4 4 0 01-8 0zM6 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span>Owner Reply</span>
            <span class="badge badge-sm badge-success ml-2"
              >Published Externally</span
            >
          </div>
        </div>
        <div class="response-text">
          {review.owner_reply_text || "Reply published on platform"}
        </div>
        {#if review.owner_reply_date}
          <div class="response-meta">
            Replied on {formatDate(review.owner_reply_date)}
          </div>
        {/if}
      </div>
      <!-- AI Response Section -->
    {:else if aiResponse || isGenerating}
      <div
        class="response-section"
        transition:slide={{ duration: 300, easing: cubicOut }}
      >
        <div class="response-header">
          <div class="response-title">
            <svg
              class="ai-icon"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                d="M12 2v6m0 4v6m0 4v-2m-6-10h6m4 0h6m-15 4h4m8 0h4"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
            <span>AI Response</span>
          </div>

          {#if !isGenerating && aiResponse}
            <button
              class="edit-toggle"
              onclick={() => {
                isEditing = !isEditing
              }}
              title={isEditing ? "Cancel edit" : "Edit response"}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"
                  stroke-width="2"
                />
                <path
                  d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"
                  stroke-width="2"
                />
              </svg>
            </button>
          {/if}
        </div>

        {#if isGenerating}
          <div class="generating-state">
            <div class="generating-loader">
              <span class="loader-dot"></span>
              <span class="loader-dot"></span>
              <span class="loader-dot"></span>
            </div>
            <p class="generating-text">Generating AI response...</p>
          </div>
        {:else if isEditing}
          <div class="edit-container">
            <textarea
              bind:value={editText}
              class="response-textarea"
              rows="4"
              placeholder="Enter your response..."
            ></textarea>
            <div class="edit-actions">
              <button class="btn-secondary" onclick={cancelEdit}>Cancel</button>
              <button class="btn-primary" onclick={saveEdit}
                >Save Changes</button
              >
            </div>
          </div>
        {:else if aiResponse}
          <div class="response-text">{aiResponse.response_text}</div>
        {/if}

        {#if aiResponse && !isEditing && !isGenerating}
          <div class="response-actions">
            {#if reviewState === "draft"}
              <button
                class="btn-approve"
                onclick={() => onApprove?.(aiResponse.id)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    d="M20 6L9 17l-5-5"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                Approve
              </button>
              <button
                class="btn-reject"
                onclick={() => onReject?.(aiResponse.id)}
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
                Reject
              </button>
            {/if}

            {#if reviewState === "approved"}
              <button
                class="btn-publish"
                onclick={() => onPublish?.(aiResponse.id)}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path
                    d="M22 2L11 13"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                  <path
                    d="M22 2L15 22L11 13L2 9L22 2Z"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                Publish to Google
              </button>
              <button
                class="btn-queue"
                onclick={() => onQueueAdd?.(aiResponse.id)}
              >
                <svg
                  width="16"
                  height="16"
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
                Add to Queue
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Expand/Collapse Button -->
    <button
      class="expand-button"
      onclick={() => {
        isExpanded = !isExpanded
      }}
      aria-label={isExpanded ? "Collapse" : "Expand"}
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
          d="M6 9l6 6 6-6"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>
  </div>

  <!-- Copy Feedback -->
  {#if copied}
    <div class="copy-feedback" transition:scale={{ duration: 200 }}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <path
          d="M20 6L9 17l-5-5"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      Copied!
    </div>
  {/if}
</div>

<style>
  /* Base Card Styles */
  .review-card {
    position: relative;
    background: var(--color-surface);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-xl);
    overflow: hidden;
    transition: all var(--transition-base);
  }

  .review-card:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: var(--color-border);
  }

  /* Background Effects */
  .card-bg {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity var(--transition-slow);
  }

  .card-bg.published-bg {
    background: linear-gradient(
      135deg,
      var(--color-success-lighter) 0%,
      var(--color-success-light) 100%
    );
  }

  .card-bg.queued-bg {
    background: linear-gradient(
      135deg,
      var(--color-info-lighter) 0%,
      var(--color-info-light) 100%
    );
  }

  .card-bg.approved-bg {
    background: linear-gradient(
      135deg,
      var(--color-primary-lighter) 0%,
      var(--color-primary-light) 100%
    );
  }

  .card-bg.draft-bg {
    background: linear-gradient(
      135deg,
      var(--color-warning-lighter) 0%,
      var(--color-warning-light) 100%
    );
  }

  .review-card[data-state]:not([data-state="new"]) .card-bg {
    opacity: 0.3;
  }

  .review-card:hover .card-bg {
    opacity: 0.5;
  }

  .card-glow {
    position: absolute;
    inset: -1px;
    background: linear-gradient(
      135deg,
      transparent,
      var(--color-primary),
      transparent
    );
    opacity: 0;
    filter: blur(10px);
    transition: opacity var(--transition-slow);
    z-index: -1;
  }

  .review-card.selected .card-glow {
    opacity: 0.2;
  }

  .card-container {
    position: relative;
    padding: 1.5rem;
  }

  /* Header Section */
  .card-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  /* Selection Control */
  .selection-control {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .selection-checkbox {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }

  .checkbox-custom {
    width: 20px;
    height: 20px;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    cursor: pointer;
  }

  .selection-checkbox:checked ~ .checkbox-custom {
    background: var(--color-primary);
    border-color: var(--color-primary);
  }

  .selection-checkbox:checked ~ .checkbox-custom::after {
    content: "";
    position: absolute;
    left: 7px;
    top: 3px;
    width: 4px;
    height: 8px;
    border: 2px solid white;
    border-top: none;
    border-left: none;
    transform: rotate(45deg);
  }

  /* Reviewer Info */
  .reviewer-info {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .reviewer-avatar {
    width: 40px;
    height: 40px;
    background: var(--color-primary-light);
    border-radius: var(--radius-full);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .avatar-text {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--color-primary);
  }

  .reviewer-details {
    flex: 1;
  }

  .reviewer-name {
    font-size: 1rem;
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: 0.25rem;
  }

  .review-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text-tertiary);
  }

  .rating {
    display: flex;
    gap: 2px;
  }

  .star {
    color: var(--color-border);
    transition: color var(--transition-fast);
  }

  .star.filled {
    color: var(--color-warning);
  }

  .meta-separator {
    opacity: 0.5;
  }

  /* State Badge */
  .state-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: var(--color-surface-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    font-weight: 500;
    transition: all var(--transition-base);
  }

  .state-badge[data-color="success"] {
    background: var(--color-success-lighter);
    border-color: var(--color-success-light);
    color: var(--color-success);
  }

  .state-badge[data-color="info"] {
    background: var(--color-info-lighter);
    border-color: var(--color-info-light);
    color: var(--color-info);
  }

  .state-badge[data-color="primary"] {
    background: var(--color-primary-lighter);
    border-color: var(--color-primary-light);
    color: var(--color-primary);
  }

  .state-badge[data-color="warning"] {
    background: var(--color-warning-lighter);
    border-color: var(--color-warning-light);
    color: var(--color-warning);
  }

  .state-icon {
    font-size: 0.875rem;
  }

  /* Action Menu */
  .action-menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-base);
    position: relative;
  }

  .action-menu-btn:hover {
    background: var(--color-surface-secondary);
    color: var(--color-text-primary);
  }

  .action-menu {
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 0.5rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 10;
    min-width: 180px;
    transform-origin: top right;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    font-size: 0.875rem;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .menu-item:hover {
    background: var(--color-surface-secondary);
  }

  .menu-item.danger {
    color: var(--color-error);
  }

  .menu-item.danger:hover {
    background: var(--color-error-lighter);
  }

  /* Review Content */
  .review-content {
    margin-bottom: 1rem;
  }

  .review-text {
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--color-text-primary);
    margin-bottom: 0.75rem;
  }

  .location-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.75rem;
    background: var(--color-surface-secondary);
    border-radius: var(--radius-full);
    font-size: 0.75rem;
    color: var(--color-text-secondary);
  }

  /* Response Section */
  .response-section {
    margin-top: 1rem;
    padding: 1rem;
    background: var(--color-surface-secondary);
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-border-light);
  }

  /* Manual Reply Styling */
  .response-section.manual-reply {
    background: var(--color-success-lighter);
    border-color: var(--color-success-light);
  }

  .response-meta {
    font-size: 0.75rem;
    color: var(--color-text-tertiary);
    margin-top: 0.5rem;
  }

  .response-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }

  .response-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-secondary);
  }

  .ai-icon {
    color: var(--color-primary);
  }

  .owner-icon {
    color: var(--color-success);
  }

  .edit-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: var(--radius-md);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .edit-toggle:hover {
    background: var(--color-surface);
    color: var(--color-text-primary);
  }

  /* Generating State */
  .generating-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 2rem 1rem;
    text-align: center;
  }

  .generating-loader {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .loader-dot {
    width: 8px;
    height: 8px;
    background: var(--color-primary);
    border-radius: 50%;
    animation: bounce 1.4s ease-in-out infinite both;
  }

  .loader-dot:nth-child(1) {
    animation-delay: -0.32s;
  }
  .loader-dot:nth-child(2) {
    animation-delay: -0.16s;
  }

  @keyframes bounce {
    0%,
    80%,
    100% {
      transform: scale(0);
      opacity: 0.5;
    }
    40% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .generating-text {
    font-size: 0.875rem;
    color: var(--color-text-secondary);
  }

  /* Edit Container */
  .edit-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .response-textarea {
    width: 100%;
    padding: 0.75rem;
    background: var(--color-surface);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    color: var(--color-text-primary);
    resize: vertical;
    transition: all var(--transition-base);
  }

  .response-textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }

  .edit-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  /* Response Text */
  .response-text {
    font-size: 0.875rem;
    line-height: 1.6;
    color: var(--color-text-primary);
  }

  /* Response Actions */
  .response-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  /* Buttons */
  .btn-primary,
  .btn-secondary,
  .btn-approve,
  .btn-reject,
  .btn-publish,
  .btn-queue {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: none;
    border-radius: var(--radius-md);
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--transition-base);
  }

  .btn-primary {
    background: var(--color-primary);
    color: white;
  }

  .btn-primary:hover {
    background: var(--color-primary-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .btn-secondary {
    background: var(--color-surface);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover {
    background: var(--color-surface-secondary);
    border-color: var(--color-border);
  }

  .btn-approve {
    background: var(--color-success);
    color: white;
  }

  .btn-approve:hover {
    background: var(--color-success);
    filter: brightness(1.1);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .btn-reject {
    background: var(--color-surface);
    color: var(--color-error);
    border: 1px solid var(--color-error-light);
  }

  .btn-reject:hover {
    background: var(--color-error-lighter);
    border-color: var(--color-error);
  }

  .btn-publish {
    background: var(--color-primary);
    color: white;
    flex: 1;
  }

  .btn-publish:hover {
    background: var(--color-primary-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .btn-queue {
    background: var(--color-surface);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
  }

  .btn-queue:hover {
    background: var(--color-surface-secondary);
    border-color: var(--color-primary);
    color: var(--color-primary);
  }

  /* Expand Button */
  .expand-button {
    position: absolute;
    bottom: 0.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: var(--color-surface-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-full);
    color: var(--color-text-tertiary);
    cursor: pointer;
    transition: all var(--transition-base);
    opacity: 0;
  }

  .review-card:hover .expand-button {
    opacity: 1;
  }

  .expand-button:hover {
    background: var(--color-surface);
    border-color: var(--color-border);
    color: var(--color-text-primary);
  }

  .expand-icon {
    transition: transform var(--transition-base);
  }

  .review-card.expanded .expand-icon {
    transform: rotate(180deg);
  }

  /* Copy Feedback */
  .copy-feedback {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: var(--color-success);
    color: white;
    border-radius: var(--radius-full);
    font-size: 0.875rem;
    font-weight: 500;
    box-shadow: var(--shadow-lg);
    pointer-events: none;
    z-index: 20;
  }

  /* View Modes */
  .review-card.list {
    border-radius: var(--radius-lg);
  }

  .review-card.list .card-container {
    padding: 1rem 1.5rem;
  }

  .review-card.list .reviewer-avatar {
    width: 36px;
    height: 36px;
  }

  /* States */
  .review-card.generating {
    animation: pulse-glow 2s ease-in-out infinite;
  }

  @keyframes pulse-glow {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
    }
    50% {
      box-shadow: 0 0 0 10px rgba(59, 130, 246, 0);
    }
  }

  /* Mobile Responsive */
  @media (max-width: 768px) {
    .card-container {
      padding: 1rem;
    }

    .response-actions {
      flex-direction: column;
    }

    .btn-publish,
    .btn-queue {
      width: 100%;
      justify-content: center;
    }
  }

  /* Animations */
  .animate-spin {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
