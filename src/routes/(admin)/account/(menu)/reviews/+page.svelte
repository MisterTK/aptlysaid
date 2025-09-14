<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import type { PageData } from "./$types"
  import { invalidateAll } from "$app/navigation"
  import { fly, scale } from "svelte/transition"
  import { cubicOut } from "svelte/easing"
  import { SvelteSet, SvelteMap } from "svelte/reactivity"
  import {
    formatReviewDate,
    getUserTimezone,
    formatFullDateTime,
  } from "$lib/utils/date-formatter"
  import PublishingQueueModal from "$lib/components/reviews/PublishingQueueModal.svelte"
  import type { QueueItem, PublishingSettings } from "$lib/types"

  let { data }: { data: PageData } = $props()
  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("reviews")

  let selectedReviewIds = new SvelteSet<string>()

  // Filters and Sorting
  let selectedLocation = $state("all")
  let filterRating = $state("all")
  let filterStatus = $state("all")
  let sortBy = $state("newest")
  let searchQuery = $state("")
  let viewMode = $state<"grid" | "list">("grid")

  // Publishing state
  let showPublishingModal = $state(false)
  let publishingStats = $state<{
    pending: number
    processing: number
    completed: number
    failed: number
    total: number
    todayPublished?: number
    todayLimit?: number
    hourlyRate?: number
  } | null>(null)
  let isPublishing = $state(false)
  let publishingStates = new SvelteMap<string, boolean>()
  let publishError = $state<string | null>(null)

  // Publishing queue state
  let queueItems = $state<QueueItem[]>([])
  let queuePaused = $state(false)
  let publishingSettings = $state<PublishingSettings>({
    autoPublish: false,
    minRating: 3,
    maxPerHour: 10,
    maxPerDay: 100,
    delaySeconds: 30,
    businessHoursOnly: true,
    businessHours: {
      start: "09:00",
      end: "17:00",
      timezone: "America/New_York",
      days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    },
  })

  // Inline editing state
  let editingResponseId = $state<string | null>(null)
  let editingText = $state("")

  // Load preferences from localStorage
  onMount(() => {
    const savedPrefs = localStorage.getItem("reviews-preferences")
    if (savedPrefs) {
      try {
        const prefs = JSON.parse(savedPrefs)
        selectedLocation = prefs.selectedLocation || "all"
        filterRating = prefs.filterRating || "all"
        filterStatus = prefs.filterStatus || "all"
        sortBy = prefs.sortBy || "newest"
        viewMode = prefs.viewMode || "grid"
      } catch (e) {
        console.warn("Failed to load preferences:", e)
      }
    }

    // Enhanced keyboard shortcuts
    const handleKeyboard = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "a":
            e.preventDefault()
            selectAllVisible()
            break
          case "/":
            e.preventDefault()
            document.getElementById("search-input")?.focus()
            break
          case "Enter":
            e.preventDefault()
            if (selectedReviewIds.size > 0) bulkApprove()
            break
          case "p":
            e.preventDefault()
            if (data.hasApprovedResponses) openPublishingModal()
            break
        }
      }
      // Quick filter shortcuts without modifier
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        (e.target as HTMLElement)?.tagName !== "INPUT" &&
        (e.target as HTMLElement)?.tagName !== "TEXTAREA"
      ) {
        switch (e.key) {
          case "1":
            filterStatus = "unreplied"
            break
          case "2":
            filterStatus = "ai-generated"
            break
          case "3":
            filterStatus = "approved"
            break
          case "4":
            filterStatus = "replied"
            break
        }
      }
    }
    document.addEventListener("keydown", handleKeyboard)
    return () => document.removeEventListener("keydown", handleKeyboard)
  })

  // Save preferences when they change
  $effect(() => {
    const prefs = {
      selectedLocation,
      filterRating,
      filterStatus,
      sortBy,
      viewMode,
    }
    localStorage.setItem("reviews-preferences", JSON.stringify(prefs))
  })

  // Get user's timezone for proper date display
  const userTimezone = getUserTimezone()

  function formatDate(dateString: string): string {
    return formatReviewDate(dateString, {
      showTimezone: false,
      userTimezone,
    })
  }

  // Get sentiment badge color
  function getSentimentColor(label: string | null | undefined): string {
    switch (label?.toLowerCase()) {
      case "positive":
        return "badge-success"
      case "negative":
        return "badge-error"
      case "neutral":
        return "badge-warning"
      default:
        return "badge-ghost"
    }
  }

  let filteredReviews = $derived.by(() => {
    if (!data.reviews) return []

    let reviews = [...data.reviews]

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      reviews = reviews.filter(
        (r) =>
          r.review_text?.toLowerCase().includes(query) ||
          r.reviewer_name?.toLowerCase().includes(query) ||
          r.locations?.name?.toLowerCase().includes(query),
      )
    }

    // Filter by location
    if (selectedLocation !== "all") {
      reviews = reviews.filter((r) => r.locations?.name === selectedLocation)
    }

    // Filter by rating
    if (filterRating !== "all") {
      reviews = reviews.filter((r) => r.rating === parseInt(filterRating))
    }

    // Filter by status
    if (filterStatus === "replied") {
      // Show all reviews that have been replied to (either manually or via AI)
      reviews = reviews.filter((r) => r.has_owner_reply === true)
    } else if (filterStatus === "unreplied") {
      // New Review: only reviews that do not yet have a draft AI response
      reviews = reviews.filter(
        (r) =>
          (!r.ai_responses || r.ai_responses.length === 0) && r.review_text,
      )
    } else if (filterStatus === "ai-generated") {
      // Show reviews with draft AI responses waiting for approval
      reviews = reviews.filter((r) =>
        r.ai_responses?.some((resp) => resp.status === "draft"),
      )
    } else if (filterStatus === "approved") {
      // Show reviews with approved AI responses that are NOT yet in queue
      reviews = reviews.filter((r) =>
        r.ai_responses?.some((resp) => {
          const isApproved = resp.status === "approved"
          const isInQueue =
            resp.response_queue &&
            Array.isArray(resp.response_queue) &&
            resp.response_queue.length > 0 &&
            resp.response_queue.some(
              (q) => q.status && ["pending", "processing"].includes(q.status),
            )
          return isApproved && !isInQueue
        }),
      )
    } else if (filterStatus === "queued") {
      // Show reviews with AI responses that ARE in publishing queue
      reviews = reviews.filter((r) =>
        r.ai_responses?.some(
          (resp) =>
            resp.response_queue &&
            Array.isArray(resp.response_queue) &&
            resp.response_queue.length > 0 &&
            resp.response_queue.some(
              (q) => q.status && ["pending", "processing"].includes(q.status),
            ),
        ),
      )
    }

    // Sort
    if (sortBy === "newest") {
      reviews.sort(
        (a, b) =>
          new Date(b.review_date).getTime() - new Date(a.review_date).getTime(),
      )
    } else if (sortBy === "oldest") {
      reviews.sort(
        (a, b) =>
          new Date(a.review_date).getTime() - new Date(b.review_date).getTime(),
      )
    } else if (sortBy === "rating-high") {
      reviews.sort((a, b) => b.rating - a.rating)
    } else if (sortBy === "rating-low") {
      reviews.sort((a, b) => a.rating - b.rating)
    } else if (sortBy === "priority") {
      reviews.sort((a, b) => (b.priority_score || 0) - (a.priority_score || 0))
    }

    return reviews
  })

  let stats = $derived.by(() => {
    const total = data.reviews?.length || 0

    // Actionable reviews are those with text content that can be responded to
    const actionableReviews =
      data.reviews?.filter((r) => r.review_text && !r.has_owner_reply).length ||
      0

    // Reviews that already have replies (either manual from external source or AI-published)
    const published =
      data.reviews?.filter((r) => r.has_owner_reply === true).length || 0

    // Count manual vs AI replies
    const manualReplies =
      data.reviews?.filter(
        (r) =>
          r.has_owner_reply === true && r.response_source === "owner_external",
      ).length || 0

    const aiPublishedReplies =
      data.reviews?.filter(
        (r) => r.has_owner_reply === true && r.response_source === "ai",
      ).length || 0

    // AI response workflow stats
    const aiGenerated =
      data.allAiResponses?.filter((r) => r.status === "draft").length || 0

    // Count responses that ARE in queue (pending or processing)
    const queued =
      data.allAiResponses?.filter((r) => {
        // Check if response_queue exists and has items with pending/processing status
        return (
          r.response_queue &&
          Array.isArray(r.response_queue) &&
          r.response_queue.length > 0 &&
          r.response_queue.some(
            (q) => q.status && ["pending", "processing"].includes(q.status),
          )
        )
      }).length || 0

    // Count approved responses that are NOT in queue (ready to be queued)
    const approved =
      data.allAiResponses?.filter((r) => {
        const isApproved = r.status === "approved"
        const isInQueue =
          r.response_queue &&
          Array.isArray(r.response_queue) &&
          r.response_queue.length > 0 &&
          r.response_queue.some(
            (q) => q.status && ["pending", "processing"].includes(q.status),
          )
        return isApproved && !isInQueue
      }).length || 0

    // New reviews that need AI response generation
    const newReviews =
      data.reviews?.filter(
        (r) => r.review_text && !r.has_owner_reply && !r.ai_responses?.length,
      ).length || 0

    const avgRating =
      total > 0
        ? data.reviews?.reduce((sum, r) => sum + r.rating, 0) / total
        : 0

    return {
      total,
      newReviews,
      aiGenerated,
      approved,
      queued,
      published,
      manualReplies,
      aiPublishedReplies,
      avgRating,
      actionableReviews,
    }
  })

  function selectAllVisible() {
    filteredReviews.forEach((review) => {
      selectedReviewIds.add(review.id)
    })
    selectedReviewIds = new SvelteSet(selectedReviewIds)
  }

  function clearSelection() {
    selectedReviewIds.clear()
    selectedReviewIds = new SvelteSet()
  }

  function toggleReviewSelection(reviewId: string) {
    if (selectedReviewIds.has(reviewId)) {
      selectedReviewIds.delete(reviewId)
    } else {
      selectedReviewIds.add(reviewId)
    }
    selectedReviewIds = new SvelteSet(selectedReviewIds)
  }

  async function openPublishingModal() {
    showPublishingModal = true
    publishError = null

    try {
      const response = await fetch(`/api/v1/reviews/queue`, {
        credentials: "include",
      })
      if (response.ok) {
        const queueData = await response.json()

        // Transform queue items to match PublishingQueue component format
        queueItems = queueData.items.map(
          (item: Record<string, unknown>, index: number) => ({
            id: item.id,
            aiResponseId: item.aiResponseId,
            review: {
              id: item.review?.reviewId || "",
              reviewer: {
                displayName: item.review?.reviewer?.displayName || "Anonymous",
              },
              starRating: item.review?.starRating || "0",
              locationName: item.review?.locationName || "",
              review_text: "", // Not provided by API but not used in queue display
              rating: parseInt(item.review?.starRating || "0"),
              review_date: new Date().toISOString(), // Not provided by API
            },
            position: index + 1,
            scheduledTime: item.scheduledTime
              ? new Date(item.scheduledTime)
              : new Date(),
            status: item.status,
          }),
        )

        publishingStats = {
          pending: queueData.items.filter(
            (i: { status: string }) => i.status === "pending",
          ).length,
          processing: queueData.items.filter(
            (i: { status: string }) => i.status === "processing",
          ).length,
          completed: 0,
          failed: queueData.items.filter(
            (i: { status: string }) => i.status === "failed",
          ).length,
          total: queueData.items.length,
        }

        // Update queue stats for the PublishingQueue component
        publishingStats = {
          ...publishingStats,
          todayPublished: stats.aiPublishedReplies, // Use existing stats
          todayLimit: publishingSettings.maxPerDay,
          hourlyRate: publishingSettings.maxPerHour,
        }
      }
    } catch (error) {
      console.error("Error fetching publishing stats:", error)
    }
  }

  function closePublishingModal() {
    showPublishingModal = false
  }

  async function queueAllApproved() {
    try {
      isPublishing = true
      publishError = null

      // Get all approved AI responses that aren't already queued or published
      const approvedResponses =
        data.allAiResponses?.filter(
          (resp) =>
            resp.status === "approved" &&
            !resp.response_queue?.some(
              (q) =>
                q.status &&
                ["pending", "processing", "published"].includes(q.status),
            ),
        ) || []

      if (approvedResponses.length === 0) {
        publishError = "No approved responses available to queue"
        return
      }

      // Queue each approved response
      for (const response of approvedResponses) {
        const res = await fetch("/api/v1/reviews/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            aiResponseId: response.id,
          }),
        })

        if (!res.ok) {
          console.error(`Failed to queue response ${response.id}`)
        }
      }

      await invalidateAll()
      await openPublishingModal()
    } catch {
      publishError = "An error occurred while queuing responses"
    } finally {
      isPublishing = false
    }
  }

  async function queueSingle(aiResponseId: string) {
    if (!aiResponseId || publishingStates.get(aiResponseId)) return

    publishingStates.set(aiResponseId, true)
    publishingStates = new SvelteMap(publishingStates)
    publishError = null

    try {
      const response = await fetch("/api/v1/reviews/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          aiResponseId: aiResponseId,
        }),
      })

      if (response.ok) {
        await invalidateAll()
      } else {
        const error = await response.json()
        publishError = error.error || "Failed to queue response"
      }
    } catch (error) {
      console.error("Error queueing response:", error)
      publishError = "Network error occurred"
    } finally {
      publishingStates.set(aiResponseId, false)
      publishingStates = new SvelteMap(publishingStates)
    }
  }

  async function bulkApprove() {
    if (selectedReviewIds.size === 0) return

    try {
      const aiResponseIds =
        data.reviews
          ?.filter(
            (r) =>
              selectedReviewIds.has(r.id) &&
              r.ai_responses?.some((resp) => resp.status === "draft"),
          )
          .flatMap((r) => r.ai_responses?.map((resp) => resp.id))
          .filter(Boolean) || []

      if (aiResponseIds.length === 0) {
        alert("No draft AI responses selected")
        return
      }

      const response = await fetch("/api/v1/reviews/ai-response", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          responseIds: aiResponseIds,
          action: "approve",
        }),
      })

      if (response.ok) {
        await invalidateAll()
        clearSelection()
      } else {
        const error = await response.json()
        alert(error.error || "Failed to approve responses")
      }
    } catch {
      alert("An error occurred while approving responses")
    }
  }

  async function editAiResponse(aiResponseId: string, newText: string) {
    try {
      const response = await fetch("/api/v1/reviews/ai-response", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          responseId: aiResponseId,
          action: "edit",
          text: newText,
        }),
      })

      if (response.ok) {
        await invalidateAll()
      } else {
        const error = await response.json()
        alert(error.error || "Failed to update response")
      }
    } catch {
      alert("An error occurred while updating response")
    }
  }

  async function saveEdit(aiResponseId: string) {
    if (!editingText.trim()) return

    await editAiResponse(aiResponseId, editingText)
    editingResponseId = null
    editingText = ""
  }

  async function approveResponse(aiResponseId: string) {
    try {
      const response = await fetch("/api/v1/reviews/ai-response", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          responseId: aiResponseId,
          action: "approve",
        }),
      })

      if (response.ok) {
        await invalidateAll()
      } else {
        const error = await response.json()
        alert(error.error || "Failed to approve response")
      }
    } catch {
      alert("An error occurred while approving response")
    }
  }

  $effect(() => {
    if (editingResponseId) {
      const review = data.reviews?.find((r) =>
        r.ai_responses?.some((resp) => resp.id === editingResponseId),
      )
      if (review?.ai_responses) {
        const response = review.ai_responses.find(
          (resp) => resp.id === editingResponseId,
        )
        if (response) {
          editingText = response.response_text
        }
      }
    }
  })
</script>

<svelte:head>
  <title>Reviews - AI-Powered Management</title>
</svelte:head>

<div class="min-h-screen bg-base-100">
  <!-- Header Section -->
  <div class="mb-8">
    <div
      class="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 mb-6"
    >
      <div>
        <h1 class="text-4xl font-bold text-aptly-navy-500 mb-3">
          Review Management
        </h1>
        <p class="text-aptly-gray-600 text-lg">
          Manage and respond to customer reviews with AI assistance
        </p>
        <div class="text-sm text-aptly-gray-500 mt-2 font-medium">
          <span class="text-aptly-navy-400">Shortcuts:</span>
          ⌘A Select All • ⌘P Publish • ⌘Enter Approve • 1-4 Quick Filters
        </div>
      </div>

      <!-- Quick Overview Stats -->
      <div
        class="bg-white rounded-2xl shadow-lg border border-aptly-gray-200 p-6"
      >
        <div class="grid grid-cols-3 gap-6 text-center">
          <div class="space-y-1">
            <div class="text-2xl font-bold text-aptly-navy-500">
              {stats.actionableReviews}
            </div>
            <div class="text-sm text-aptly-gray-600">Actionable Reviews</div>
            <div class="text-xs text-aptly-gray-500">{stats.total} total</div>
          </div>
          <div class="space-y-1">
            <div class="text-2xl font-bold text-success">{stats.published}</div>
            <div class="text-sm text-aptly-gray-600">Replied</div>
          </div>
          <div class="space-y-1">
            <div class="text-2xl font-bold text-aptly-gold-500">
              {stats.avgRating.toFixed(1)}
            </div>
            <div class="text-sm text-aptly-gray-600">Avg Rating</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Compact Workflow Guide -->
    <div class="bg-base-100 rounded-xl border border-base-300 p-4 mb-6">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold text-base-content">
          Review Response Workflow
        </h2>
        <div class="text-sm text-base-content/60">
          {stats.actionableReviews > 0
            ? Math.round((stats.published / stats.actionableReviews) * 100)
            : 0}% Complete
        </div>
      </div>

      <!-- Compact Process Steps -->
      <div class="flex items-center justify-between gap-2">
        <!-- Step 1: New Review -->
        <div class="flex flex-col items-center text-center flex-1">
          <div
            class="w-10 h-10 rounded-full bg-neutral/20 flex items-center justify-center mb-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="w-5 h-5 text-neutral"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
              />
            </svg>
          </div>
          <div class="text-xs font-medium">New Review</div>
          <div class="text-xs text-base-content/60 mb-1">
            Awaiting AI Response
          </div>
          <div class="text-sm font-bold text-base-content">
            {stats.newReviews}
          </div>
        </div>

        <div class="w-4 h-0.5 bg-base-300"></div>

        <!-- Step 2: AI Draft -->
        <div class="flex flex-col items-center text-center flex-1">
          <div
            class="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center mb-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="w-5 h-5 text-warning"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"
              />
            </svg>
          </div>
          <div class="text-xs font-medium">AI Draft</div>
          <div class="text-xs text-base-content/60 mb-1">Awaiting Approval</div>
          <div class="text-sm font-bold text-base-content">
            {stats.aiGenerated}
          </div>
        </div>

        <div class="w-4 h-0.5 bg-base-300"></div>

        <!-- Step 3: Approved -->
        <div class="flex flex-col items-center text-center flex-1">
          <div
            class="w-10 h-10 rounded-full bg-info/20 flex items-center justify-center mb-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="w-5 h-5 text-info"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <div class="text-xs font-medium">Approved</div>
          <div class="text-xs text-base-content/60 mb-1">Ready to Publish</div>
          <div class="text-sm font-bold text-base-content">
            {stats.approved}
          </div>
        </div>

        <div class="w-4 h-0.5 bg-base-300"></div>

        <!-- Step 4: Queued -->
        <div class="flex flex-col items-center text-center flex-1">
          <div
            class="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center mb-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="w-5 h-5 text-accent"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </div>
          <div class="text-xs font-medium">Queued</div>
          <div class="text-xs text-base-content/60 mb-1">Publishing Soon</div>
          <div class="text-sm font-bold text-base-content">
            {stats.queued}
          </div>
        </div>

        <div class="w-4 h-0.5 bg-base-300"></div>

        <!-- Step 5: Published -->
        <div class="flex flex-col items-center text-center flex-1">
          <div
            class="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center mb-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="w-5 h-5 text-success"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
              />
            </svg>
          </div>
          <div class="text-xs font-medium">Published</div>
          <div class="text-xs text-base-content/60 mb-1">Live on Google</div>
          <div class="text-sm font-bold text-base-content">
            {stats.published}
          </div>
        </div>
      </div>

      <!-- Simple Progress Bar -->
      <div class="mt-4">
        <div class="progress progress-primary bg-base-300 h-2">
          <div
            class="bg-gradient-to-r from-primary to-success transition-all duration-500"
            style="width: {stats.total > 0
              ? (stats.published / stats.total) * 100
              : 0}%"
          ></div>
        </div>
      </div>
    </div>
  </div>

  <!-- Success Messages -->
  {#if data.imported}
    <div class="alert alert-success mb-4" in:fly={{ y: -20, duration: 300 }}>
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
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>Successfully imported {data.imported} reviews!</span>
    </div>
  {/if}

  <!-- Publishing Error Messages -->
  {#if publishError}
    <div class="alert alert-error mb-4" in:fly={{ y: -20, duration: 300 }}>
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
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{publishError}</span>
      <button class="btn btn-sm btn-ghost" onclick={() => (publishError = null)}
        >Dismiss</button
      >
    </div>
  {/if}

  <!-- Modern Action Bar -->
  <div
    class="card bg-base-100 shadow-xl border border-base-300/50 mb-8 filter-card"
  >
    <div class="card-body p-6">
      <!-- Header Section -->
      <div
        class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6"
      >
        <!-- Search with Enhanced Design -->
        <div class="relative flex-1 max-w-lg">
          <div class="form-control">
            <div class="input-group">
              <span class="bg-base-200">
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
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
              </span>
              <input
                id="search-input"
                type="text"
                placeholder="Search reviews... (⌘/ for shortcuts)"
                class="input input-bordered w-full focus:ring-2 focus:ring-primary/20 transition-all duration-200"
                bind:value={searchQuery}
              />
              {#if searchQuery}
                <button
                  class="btn btn-square btn-ghost btn-sm"
                  onclick={() => (searchQuery = "")}
                  title="Clear search"
                >
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              {/if}
            </div>
          </div>
        </div>

        <!-- View Mode Toggle with Enhanced Design -->
        <div class="join shadow-lg">
          <input
            class="join-item btn btn-sm"
            type="radio"
            name="view-options"
            aria-label="Grid view"
            checked={viewMode === "grid"}
            onchange={() => (viewMode = "grid")}
          />
          <div
            class="join-item btn btn-sm"
            class:btn-active={viewMode === "grid"}
          >
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
                d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"
              />
            </svg>
          </div>

          <input
            class="join-item btn btn-sm"
            type="radio"
            name="view-options"
            aria-label="List view"
            checked={viewMode === "list"}
            onchange={() => (viewMode = "list")}
          />
          <div
            class="join-item btn btn-sm"
            class:btn-active={viewMode === "list"}
          >
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
                d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
              />
            </svg>
          </div>
        </div>
      </div>

      <!-- Filters with Modern Chip Design -->
      <div class="flex flex-wrap gap-3 mb-4">
        <div class="dropdown">
          <div tabindex="0" role="button" class="btn btn-sm btn-outline gap-2">
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
                d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z"
              />
            </svg>
            {selectedLocation === "all" ? "All Locations" : selectedLocation}
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
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </div>
          <ul
            tabindex="0"
            class="dropdown-content z-[9999] menu p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-300"
          >
            <li>
              <button
                onclick={() => (selectedLocation = "all")}
                class:active={selectedLocation === "all"}>All Locations</button
              >
            </li>
            {#each data.locations as location (location)}
              <li>
                <button
                  onclick={() => (selectedLocation = location)}
                  class:active={selectedLocation === location}
                  >{location}</button
                >
              </li>
            {/each}
          </ul>
        </div>

        <div class="dropdown">
          <div tabindex="0" role="button" class="btn btn-sm btn-outline gap-2">
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
                d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.563.563 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
              />
            </svg>
            {filterRating === "all"
              ? "All Ratings"
              : filterRating === "5"
                ? "⭐⭐⭐⭐⭐"
                : filterRating === "4"
                  ? "⭐⭐⭐⭐"
                  : filterRating === "3"
                    ? "⭐⭐⭐"
                    : filterRating === "2"
                      ? "⭐⭐"
                      : "⭐"}
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
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </div>
          <ul
            tabindex="0"
            class="dropdown-content z-[9999] menu p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-300"
          >
            <li>
              <button
                onclick={() => (filterRating = "all")}
                class:active={filterRating === "all"}>All Ratings</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterRating = "5")}
                class:active={filterRating === "5"}>⭐⭐⭐⭐⭐</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterRating = "4")}
                class:active={filterRating === "4"}>⭐⭐⭐⭐</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterRating = "3")}
                class:active={filterRating === "3"}>⭐⭐⭐</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterRating = "2")}
                class:active={filterRating === "2"}>⭐⭐</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterRating = "1")}
                class:active={filterRating === "1"}>⭐</button
              >
            </li>
          </ul>
        </div>

        <div class="dropdown">
          <div tabindex="0" role="button" class="btn btn-sm btn-outline gap-2">
            <div class="badge badge-sm badge-neutral">
              {filterStatus === "all"
                ? "All"
                : filterStatus === "unreplied"
                  ? "New Review"
                  : filterStatus === "ai-generated"
                    ? "AI Draft"
                    : filterStatus === "approved"
                      ? "Approved"
                      : filterStatus === "queued"
                        ? "Queued"
                        : "Published"}
            </div>
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
                d="m19.5 8.25-7.5 7.5-7.5-7.5"
              />
            </svg>
          </div>
          <ul
            tabindex="0"
            class="dropdown-content z-[9999] menu p-2 shadow-lg bg-base-100 rounded-box w-52 border border-base-300"
          >
            <li>
              <button
                onclick={() => (filterStatus = "all")}
                class:active={filterStatus === "all"}>All Status</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterStatus = "unreplied")}
                class:active={filterStatus === "unreplied"}>New Review</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterStatus = "ai-generated")}
                class:active={filterStatus === "ai-generated"}>AI Draft</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterStatus = "approved")}
                class:active={filterStatus === "approved"}>Approved</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterStatus = "queued")}
                class:active={filterStatus === "queued"}
                >Queued for Publishing</button
              >
            </li>
            <li>
              <button
                onclick={() => (filterStatus = "replied")}
                class:active={filterStatus === "replied"}>Published</button
              >
            </li>
          </ul>
        </div>

        <select class="select select-bordered select-sm" bind:value={sortBy}>
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="rating-high">Highest Rating</option>
          <option value="rating-low">Lowest Rating</option>
          <option value="priority">Highest Priority</option>
        </select>
      </div>

      <!-- Bulk Actions with Enhanced Design -->
      {#if selectedReviewIds.size > 0}
        <div class="alert alert-info" in:fly={{ y: -10, duration: 200 }}>
          <div class="flex-1">
            <div class="flex items-center gap-4 flex-wrap">
              <div class="badge badge-primary badge-lg font-bold">
                {selectedReviewIds.size} selected
              </div>

              <div class="flex gap-2 flex-wrap">
                <button
                  onclick={clearSelection}
                  class="btn btn-ghost btn-sm btn-outline"
                >
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                  Clear
                </button>

                {#if data.reviews?.filter((r) => selectedReviewIds.has(r.id) && r.ai_responses?.some((resp) => resp.status === "draft")).length > 0}
                  {@const draftCount =
                    data.reviews?.filter(
                      (r) =>
                        selectedReviewIds.has(r.id) &&
                        r.ai_responses?.some((resp) => resp.status === "draft"),
                    ).length || 0}
                  <button
                    onclick={bulkApprove}
                    class="btn btn-success btn-sm shadow-lg hover:shadow-xl transition-all duration-200"
                  >
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
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                    Approve {draftCount} Draft{draftCount > 1 ? "s" : ""}
                  </button>
                {/if}

                {#if stats.approved > 0}
                  <button
                    onclick={queueAllApproved}
                    disabled={isPublishing}
                    class="btn btn-primary btn-sm shadow-lg hover:shadow-xl transition-all duration-200"
                  >
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
                        d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m5.25-.75L17.25 9m0 0L21 12.75M17.25 9v12"
                      />
                    </svg>
                    {isPublishing ? "Adding..." : "Add to Publishing Queue"}
                  </button>
                {/if}

                {#if stats.queued > 0}
                  <button
                    onclick={openPublishingModal}
                    class="btn btn-secondary btn-sm shadow-lg hover:shadow-xl transition-all duration-200"
                  >
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
                        d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75"
                      />
                    </svg>
                    Manage Publishing Queue ({stats.queued})
                  </button>
                {/if}
              </div>
            </div>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Reviews Grid/List -->
  <div class="space-y-4">
    {#if filteredReviews.length === 0}
      <div class="text-center py-12">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="w-12 h-12 mx-auto text-base-content/30 mb-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155"
          />
        </svg>
        <p class="text-base-content/50">
          No reviews found matching your filters
        </p>
      </div>
    {:else if viewMode === "grid"}
      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {#each filteredReviews as review (review.id)}
          {@const isSelected = selectedReviewIds.has(review.id)}
          <div
            class="card bg-base-100 shadow-xl hover:shadow-2xl transition-all duration-200"
            class:ring-2={isSelected}
            class:ring-primary={isSelected}
            in:scale={{
              duration: 300,
              delay: filteredReviews.indexOf(review) * 50,
              easing: cubicOut,
            }}
          >
            <div class="card-body">
              <!-- Selection Checkbox -->
              <div class="flex items-start justify-between mb-2">
                <label class="cursor-pointer flex items-center gap-2">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-primary"
                    checked={isSelected}
                    onchange={() => toggleReviewSelection(review.id)}
                  />
                  <span class="text-sm font-medium"
                    >{review.reviewer_name || "Anonymous"}</span
                  >
                </label>
                <div class="flex items-center gap-1">
                  {#each Array.from({ length: review.rating }, (_, i) => i) as i (i)}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      class="w-4 h-4 text-warning"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  {/each}
                </div>
              </div>

              <!-- Review Content -->
              <p class="text-sm mb-3 whitespace-pre-wrap">
                {review.review_text || "No comment provided"}
              </p>

              <!-- Sentiment and Keywords -->
              {#if review.sentiment_label || (review.priority_score && review.priority_score >= 70)}
                <div class="flex flex-wrap gap-2 mb-3">
                  {#if review.sentiment_label}
                    <span
                      class="badge badge-sm {getSentimentColor(
                        review.sentiment_label,
                      )}"
                    >
                      {review.sentiment_label}
                      {#if review.sentiment_score}
                        <span class="ml-1 opacity-70"
                          >({(review.sentiment_score * 100).toFixed(0)}%)</span
                        >
                      {/if}
                    </span>
                  {/if}
                  {#if review.priority_score && review.priority_score >= 70}
                    <span class="badge badge-sm badge-error">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="2"
                        stroke="currentColor"
                        class="w-3 h-3 mr-1"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                        />
                      </svg>
                      High Priority
                    </span>
                  {/if}
                </div>
              {/if}

              <!-- Metadata -->
              <div
                class="flex items-center justify-between text-xs text-base-content/60 mb-3"
              >
                <div class="flex items-center gap-2">
                  <span>{review.locations?.name}</span>
                  {#if review.platform !== "google"}
                    <span class="badge badge-xs">{review.platform}</span>
                  {/if}
                  {#if review.reviewer_is_anonymous === false}
                    <span
                      class="badge badge-xs badge-success"
                      title="Verified reviewer"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        class="w-3 h-3"
                      >
                        <path
                          fill-rule="evenodd"
                          d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                          clip-rule="evenodd"
                        />
                      </svg>
                    </span>
                  {/if}
                </div>
                <span
                  title={formatFullDateTime(
                    new Date(review.review_date),
                    userTimezone,
                    true,
                  )}
                  class="cursor-help">{formatDate(review.review_date)}</span
                >
              </div>

              <!-- Owner Reply (Manual) -->
              {#if review.has_owner_reply && review.response_source === "owner_external"}
                <div
                  class="bg-success/10 rounded-lg p-3 mb-3 border border-success/20"
                >
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium">Owner Reply</p>
                      <span class="badge badge-sm badge-success"
                        >Published Externally</span
                      >
                    </div>
                  </div>
                  <p class="text-sm whitespace-pre-wrap">
                    {review.owner_reply_text || "Reply published on platform"}
                  </p>
                  {#if review.owner_reply_date}
                    <p class="text-xs text-base-content/60 mt-2">
                      Replied on {formatDate(review.owner_reply_date)}
                    </p>
                  {/if}
                </div>
                <!-- AI Response Preview -->
              {:else if review.ai_responses && review.ai_responses.length > 0}
                {@const aiResponse = review.ai_responses[0]}
                {@const isEditing = editingResponseId === aiResponse.id}
                <div class="bg-base-200 rounded-lg p-3 mb-3">
                  <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-medium">AI Response</p>
                      <span
                        class="badge badge-sm"
                        class:badge-warning={aiResponse.status === "draft"}
                        class:badge-success={aiResponse.status === "approved" ||
                          aiResponse.status === "published"}
                        class:badge-info={aiResponse.status === "queued"}
                      >
                        {aiResponse.status}
                      </span>
                      {#if aiResponse.confidence_score}
                        <span
                          class="badge badge-xs"
                          class:badge-success={aiResponse.confidence_score >=
                            0.8}
                          class:badge-warning={aiResponse.confidence_score <
                            0.8 && aiResponse.confidence_score >= 0.6}
                          class:badge-error={aiResponse.confidence_score < 0.6}
                        >
                          {(aiResponse.confidence_score * 100).toFixed(0)}%
                          confident
                        </span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-1">
                      {#if !isEditing && aiResponse.status === "draft"}
                        <button
                          onclick={() => (editingResponseId = aiResponse.id)}
                          class="btn btn-ghost btn-xs"
                          title="Edit response"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-3 h-3"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.287 4.287 0 0 1-1.897 1.13L6 18l.8-2.685a4.287 4.287 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                            />
                          </svg>
                        </button>
                      {/if}
                      <div class="dropdown">
                        <button tabindex="0" class="btn btn-ghost btn-xs">
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="1.5"
                            stroke="currentColor"
                            class="w-3 h-3"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M12 6.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 12.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5ZM12 18.75a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5Z"
                            />
                          </svg>
                        </button>
                        <ul
                          tabindex="0"
                          class="dropdown-content menu bg-base-100 rounded-box z-[9999] w-52 p-2 shadow"
                        >
                          <li>
                            <button
                              onclick={() =>
                                navigator.clipboard.writeText(
                                  aiResponse.response_text,
                                )}>Copy Response</button
                            >
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {#if isEditing}
                    <div class="space-y-2">
                      <textarea
                        bind:value={editingText}
                        class="textarea textarea-sm w-full"
                        rows="3"
                        placeholder="Edit AI response..."
                      ></textarea>
                      <div class="flex gap-2 justify-end">
                        <button
                          onclick={() => (editingResponseId = null)}
                          class="btn btn-ghost btn-xs"
                        >
                          Cancel
                        </button>
                        <button
                          onclick={() => saveEdit(aiResponse.id)}
                          class="btn btn-primary btn-xs"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  {:else}
                    <p class="text-sm whitespace-pre-wrap">
                      {aiResponse.response_text}
                    </p>

                    {#if aiResponse.status === "draft"}
                      <div class="flex gap-2 mt-2">
                        <button
                          onclick={() => approveResponse(aiResponse.id)}
                          class="btn btn-success btn-xs"
                        >
                          ✓ Approve
                        </button>
                      </div>
                    {:else if aiResponse.status === "rejected"}
                      <div class="alert alert-error mt-2">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="stroke-current shrink-0 h-4 w-4"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        <div class="text-xs">
                          <span class="font-medium">Rejected</span>
                          {#if aiResponse.rejection_feedback}
                            <span class="ml-1"
                              >- {aiResponse.rejection_feedback}</span
                            >
                          {/if}
                        </div>
                      </div>
                    {/if}
                  {/if}
                </div>
              {/if}

              <!-- Actions -->
              <div class="card-actions justify-end">
                {#if review.ai_responses?.some((r) => r.status === "approved") && !review.has_owner_reply}
                  {@const approvedResponse = review.ai_responses.find(
                    (r) => r.status === "approved",
                  )}
                  {#if approvedResponse}
                    {@const isQueued =
                      approvedResponse.response_queue &&
                      Array.isArray(approvedResponse.response_queue) &&
                      approvedResponse.response_queue.length > 0 &&
                      approvedResponse.response_queue.some(
                        (q) =>
                          q.status &&
                          ["pending", "processing"].includes(q.status),
                      )}
                    {@const isCurrentlyProcessing =
                      publishingStates.get(approvedResponse.id) || false}
                    {#if isQueued}
                      <div class="flex items-center gap-2 text-sm text-info">
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
                            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                          />
                        </svg>
                        In Publishing Queue
                      </div>
                    {:else}
                      <button
                        onclick={() => queueSingle(approvedResponse.id)}
                        class="btn btn-sm btn-primary"
                        disabled={isCurrentlyProcessing}
                      >
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
                            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                          />
                        </svg>
                        {isCurrentlyProcessing
                          ? "Adding to Queue..."
                          : "Add to Publishing Queue"}
                      </button>
                    {/if}
                  {/if}
                {:else if review.has_owner_reply}
                  <div class="flex items-center gap-2 text-sm text-success">
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
                        d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                    {review.response_source === "ai"
                      ? "AI Published"
                      : "Replied"}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <!-- List View -->
      <div class="overflow-x-auto">
        <table class="table w-full">
          <thead>
            <tr>
              <th>
                <label>
                  <input
                    type="checkbox"
                    class="checkbox"
                    checked={selectedReviewIds.size ===
                      filteredReviews.length && filteredReviews.length > 0}
                    onchange={selectedReviewIds.size === filteredReviews.length
                      ? clearSelection
                      : selectAllVisible}
                  />
                </label>
              </th>
              <th>Reviewer</th>
              <th>Rating</th>
              <th>Review</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredReviews as review (review.id)}
              <tr
                class="hover"
                in:fly={{
                  x: -20,
                  duration: 300,
                  delay: filteredReviews.indexOf(review) * 50,
                }}
              >
                <th>
                  <label>
                    <input
                      type="checkbox"
                      class="checkbox"
                      checked={selectedReviewIds.has(review.id)}
                      onchange={() => toggleReviewSelection(review.id)}
                    />
                  </label>
                </th>
                <td>
                  <div>
                    <div class="font-bold flex items-center gap-2">
                      {review.reviewer_name || "Anonymous"}
                      {#if review.reviewer_is_anonymous === false}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                          class="w-4 h-4 text-success"
                        >
                          <path
                            fill-rule="evenodd"
                            d="M16.403 12.652a3 3 0 0 0 0-5.304 3 3 0 0 0-3.75-3.751 3 3 0 0 0-5.305 0 3 3 0 0 0-3.751 3.75 3 3 0 0 0 0 5.305 3 3 0 0 0 3.75 3.751 3 3 0 0 0 5.305 0 3 3 0 0 0 3.751-3.75Zm-2.546-4.46a.75.75 0 0 0-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                            clip-rule="evenodd"
                          />
                        </svg>
                      {/if}
                    </div>
                    <div class="text-sm opacity-50">
                      {review.locations?.name}
                      {#if review.platform !== "google"}
                        <span class="badge badge-xs ml-1"
                          >{review.platform}</span
                        >
                      {/if}
                    </div>
                  </div>
                </td>
                <td>
                  <div class="rating rating-sm">
                    {#each Array.from({ length: review.rating }, (_, i) => i) as i (i)}
                      <span class="mask mask-star-2 bg-orange-400"></span>
                    {/each}
                  </div>
                </td>
                <td>
                  <div class="max-w-xs truncate">
                    {review.review_text || ""}
                  </div>
                </td>
                <td>
                  {#if review.has_owner_reply}
                    <span class="badge badge-success">Replied</span>
                  {:else if review.ai_responses?.some((r) => r.status === "approved")}
                    <span class="badge badge-warning">Approved</span>
                  {:else if review.ai_responses?.some((r) => r.status === "draft")}
                    <span class="badge badge-info">Draft</span>
                  {:else}
                    <span class="badge badge-neutral">New</span>
                  {/if}
                </td>
                <td>
                  <div class="text-sm">
                    {new Date(review.review_date).toLocaleDateString()}
                  </div>
                </td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn btn-xs btn-ghost">View</button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>
</div>

<!-- Floating Action Button for Queue Statistics -->
{#if stats.queued > 0 || stats.approved > 0}
  <div class="fixed bottom-6 right-6 z-40">
    <div class="indicator">
      {#if stats.queued > 0}
        <span class="indicator-item badge badge-secondary">
          {stats.queued}
        </span>
      {/if}
      <button
        onclick={openPublishingModal}
        class="btn btn-circle btn-lg btn-primary shadow-xl"
        title="View Publishing Queue Statistics"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="w-6 h-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 3h18v18H3V3zm16 5H5m14 4H5m14 4H5"
          />
        </svg>
      </button>
    </div>
  </div>
{/if}

<!-- Publishing Queue Modal -->
<PublishingQueueModal
  open={showPublishingModal}
  onClose={closePublishingModal}
  {queueItems}
  stats={{
    queued: stats.queued,
    published: stats.aiPublishedReplies,
    todayPublished: stats.todayPublished || 0,
    todayLimit: 100,
    hourlyRate: 10,
  }}
  isPaused={queuePaused}
/>
