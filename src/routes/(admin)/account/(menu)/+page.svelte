<script lang="ts">
  import { getContext, onMount } from "svelte"
  import type { Writable } from "svelte/store"
  import type { PageData } from "./$types"
  import {
    Star,
    TrendingUp,
    AlertCircle,
    MessageSquare,
    ThumbsUp,
    Activity,
    Brain,
    Settings,
    CheckCircle,
    XCircle,
    ArrowUp,
    ArrowDown,
    Target,
    Zap,
  } from "lucide-svelte"

  let { data }: { data: PageData } = $props()
  let adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("home")

  let reviewStats = $state({
    total: 0,
    averageRating: 0,
    responseRate: 0,
    reviewsToday: 0,
    sentiment: { positive: 0, neutral: 0, negative: 0, mixed: 0 },
    trends: {
      thisWeekCount: 0,
      reviewCountTrend: 0,
      thisWeekRating: 0,
      ratingTrend: 0,
      thisWeekResponseRate: 0,
      responseRateTrend: 0,
    },
    aiStats: {
      draftResponses: 0,
      approvedResponses: 0,
      publishedResponses: 0,
      rejectedResponses: 0,
      totalAiResponses: 0,
      aiApprovalRate: 0,
      avgConfidenceScore: 0,
    },
    healthScore: 0,
    workflowStats: {
      activeWorkflows: 0,
      queuedResponses: 0,
    },
    insights: {
      negativeReviews: 0,
      needsAttention: 0,
      recentNegative: 0,
      highPriorityReviews: 0,
    },
  })
  let isLoading = $state(true)

  onMount(async () => {
    if (data.tenantId) {
      await fetchDashboardData()
    }
  })

  async function fetchDashboardData() {
    try {
      const response = await fetch(
        `/account/api/reviews/dashboard?tenantId=${data.tenantId}`,
      )
      if (response.ok) {
        const dashboardData = await response.json()
        reviewStats = dashboardData.stats
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error)
    } finally {
      isLoading = false
    }
  }

  function getRatingColor(rating: number) {
    if (rating >= 4) return "text-success"
    if (rating >= 3) return "text-warning"
    return "text-error"
  }

  function getTrendColor(trend: number) {
    if (trend > 0) return "text-success"
    if (trend < 0) return "text-error"
    return "text-base-content/70"
  }

  function getTrendIcon(trend: number) {
    if (trend > 0) return ArrowUp
    if (trend < 0) return ArrowDown
    return undefined
  }

  function formatTrend(trend: number, isPercentage = false) {
    const symbol = trend > 0 ? "+" : ""
    const suffix = isPercentage ? "%" : ""
    return `${symbol}${trend.toFixed(isPercentage ? 1 : 0)}${suffix}`
  }

  function getHealthScoreColor(score: number) {
    if (score >= 8) return "text-success"
    if (score >= 6) return "text-warning"
    return "text-error"
  }

  function getHealthScoreLabel(score: number) {
    if (score >= 8.5) return "Excellent"
    if (score >= 7) return "Great"
    if (score >= 5.5) return "Good"
    if (score >= 4) return "Fair"
    return "Needs Attention"
  }
</script>

<svelte:head>
  <title>Dashboard - AptlySaid</title>
</svelte:head>

<div class="max-w-7xl mx-auto">
  <div class="mb-6">
    <h1 class="text-3xl font-bold mb-2">Review Dashboard</h1>
    <p class="text-base-content/70">
      Monitor and manage your Google Business reviews in one place
    </p>
  </div>

  {#if data.tenant}
    <!-- Onboarding Check -->
    {#if !data.tenant.metadata?.onboarding_completed}
      <div class="alert alert-info mb-6">
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clip-rule="evenodd"
          />
        </svg>
        <div>
          <h3 class="font-bold">Welcome to AptlySaid!</h3>
          <p class="text-sm">
            Let's get you set up with AI-powered review management in just a few
            steps.
          </p>
        </div>
        <div>
          <a href="/account/onboarding" class="btn btn-sm btn-primary">
            Start Setup
          </a>
        </div>
      </div>
    {/if}

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      <a href="/account/reviews" class="btn btn-primary btn-block">
        <MessageSquare class="w-4 h-4" />
        Manage Reviews
      </a>
      <a href="/account/business-guidance" class="btn btn-secondary btn-block">
        <Brain class="w-4 h-4" />
        AI Guidance
      </a>
      <a href="/account/integrations" class="btn btn-accent btn-block">
        {#if data.googleConnected}
          <CheckCircle class="w-4 h-4" />
          Google Connected
        {:else}
          <XCircle class="w-4 h-4" />
          No Integrations
        {/if}
      </a>
      <a href="/account/response-settings" class="btn btn-outline btn-block">
        <Settings class="w-4 h-4" />
        Publishing Settings
      </a>
    </div>

    <!-- Review Stats with Trends -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
      <div class="stat bg-base-100 rounded-lg shadow-sm">
        <div class="stat-figure text-primary">
          <Activity class="w-8 h-8" />
        </div>
        <div class="stat-title">This Week</div>
        <div class="stat-value">{reviewStats.trends.thisWeekCount}</div>
        <div class="stat-desc flex items-center gap-1">
          {#if reviewStats.trends.reviewCountTrend !== 0}
            {@const TrendIcon = getTrendIcon(
              reviewStats.trends.reviewCountTrend,
            )}
            {#if TrendIcon}
              <TrendIcon
                class="w-3 h-3 {getTrendColor(
                  reviewStats.trends.reviewCountTrend,
                )}"
              />
            {/if}
            <span class={getTrendColor(reviewStats.trends.reviewCountTrend)}>
              {formatTrend(reviewStats.trends.reviewCountTrend)} from last week
            </span>
          {:else}
            <span class="text-base-content/70">Same as last week</span>
          {/if}
        </div>
      </div>

      <div class="stat bg-base-100 rounded-lg shadow-sm">
        <div class="stat-figure text-secondary">
          <Star class="w-8 h-8" />
        </div>
        <div class="stat-title">Avg Rating</div>
        <div class="stat-value {getRatingColor(reviewStats.averageRating)}">
          {reviewStats.averageRating.toFixed(1)} ⭐
        </div>
        <div class="stat-desc flex items-center gap-1">
          {#if reviewStats.trends.ratingTrend !== 0}
            {@const TrendIcon = getTrendIcon(reviewStats.trends.ratingTrend)}
            {#if TrendIcon}
              <TrendIcon
                class="w-3 h-3 {getTrendColor(reviewStats.trends.ratingTrend)}"
              />
            {/if}
            <span class={getTrendColor(reviewStats.trends.ratingTrend)}>
              {formatTrend(reviewStats.trends.ratingTrend, true)} this week
            </span>
          {:else}
            <span class="text-base-content/70">Steady this week</span>
          {/if}
        </div>
      </div>

      <div class="stat bg-base-100 rounded-lg shadow-sm">
        <div class="stat-figure text-accent">
          <MessageSquare class="w-8 h-8" />
        </div>
        <div class="stat-title">Response Rate</div>
        <div class="stat-value">{reviewStats.responseRate}%</div>
        <div class="stat-desc flex items-center gap-1">
          {#if reviewStats.trends.responseRateTrend !== 0}
            {@const TrendIcon = getTrendIcon(
              reviewStats.trends.responseRateTrend,
            )}
            {#if TrendIcon}
              <TrendIcon
                class="w-3 h-3 {getTrendColor(
                  reviewStats.trends.responseRateTrend,
                )}"
              />
            {/if}
            <span class={getTrendColor(reviewStats.trends.responseRateTrend)}>
              {formatTrend(reviewStats.trends.responseRateTrend, true)} this week
            </span>
          {:else}
            <span class="text-base-content/70">Steady this week</span>
          {/if}
        </div>
      </div>

      <div class="stat bg-base-100 rounded-lg shadow-sm">
        <div class="stat-figure text-info">
          <Brain class="w-8 h-8" />
        </div>
        <div class="stat-title">AI Performance</div>
        <div class="stat-value">{reviewStats.aiStats.totalAiResponses}</div>
        <div class="stat-desc">
          <div>{reviewStats.aiStats.aiApprovalRate}% approval rate</div>
          <div class="text-xs">
            {#if reviewStats.aiStats.avgConfidenceScore > 0}
              Confidence: {(
                reviewStats.aiStats.avgConfidenceScore * 100
              ).toFixed(0)}%
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Workflow & Queue Status (V2 Schema) -->
    {#if reviewStats.workflowStats && (reviewStats.workflowStats.activeWorkflows > 0 || reviewStats.workflowStats.queuedResponses > 0)}
      <div class="alert alert-info mb-8">
        <div class="flex-1">
          <h3 class="font-semibold">Processing Status</h3>
          <p class="text-sm">
            {#if reviewStats.workflowStats.activeWorkflows > 0}
              {reviewStats.workflowStats.activeWorkflows} active workflow{reviewStats
                .workflowStats.activeWorkflows > 1
                ? "s"
                : ""}
            {/if}
            {#if reviewStats.workflowStats.activeWorkflows > 0 && reviewStats.workflowStats.queuedResponses > 0}
              and
            {/if}
            {#if reviewStats.workflowStats.queuedResponses > 0}
              {reviewStats.workflowStats.queuedResponses} response{reviewStats
                .workflowStats.queuedResponses > 1
                ? "s"
                : ""} in queue
            {/if}
          </p>
        </div>
        <div class="flex gap-2">
          <a href="/account/workflows" class="btn btn-sm">View Workflows</a>
        </div>
      </div>
    {/if}

    <!-- Business Health Score and Weekly Summary -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
      <!-- Business Health Score -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title mb-4 flex items-center gap-2">
            <Target class="w-5 h-5" />
            Business Health Score
          </h2>
          <div class="text-center">
            <div
              class="text-4xl font-bold {getHealthScoreColor(
                reviewStats.healthScore,
              )} mb-2"
            >
              {reviewStats.healthScore.toFixed(1)}/10
            </div>
            <div
              class="text-lg font-semibold {getHealthScoreColor(
                reviewStats.healthScore,
              )} mb-4"
            >
              {getHealthScoreLabel(reviewStats.healthScore)}
            </div>
            <div class="text-sm text-base-content/70">
              Based on rating trends, response rate, and review volume
              consistency
            </div>
          </div>
        </div>
      </div>

      <!-- Weekly Summary -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h2 class="card-title mb-4 flex items-center gap-2">
            <Zap class="w-5 h-5" />
            Weekly Summary
          </h2>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between">
              <span>This week you received</span>
              <span class="font-semibold"
                >{reviewStats.trends.thisWeekCount} reviews</span
              >
            </div>
            <div class="flex items-center justify-between">
              <span>Average rating</span>
              <span
                class="font-semibold {getRatingColor(
                  reviewStats.trends.thisWeekRating,
                )}"
              >
                {reviewStats.trends.thisWeekRating.toFixed(1)} ⭐
              </span>
            </div>
            <div class="flex items-center justify-between">
              <span>Response rate</span>
              <span class="font-semibold"
                >{reviewStats.trends.thisWeekResponseRate.toFixed(0)}%</span
              >
            </div>
            {#if reviewStats.aiStats.draftResponses > 0}
              <div
                class="flex items-center justify-between bg-warning/10 px-3 py-2 rounded"
              >
                <span>AI responses ready</span>
                <a
                  href="/account/reviews?filter=ai-draft"
                  class="font-semibold text-warning hover:underline"
                >
                  {reviewStats.aiStats.draftResponses} awaiting review
                </a>
              </div>
            {/if}
          </div>
        </div>
      </div>
    </div>

    <!-- Insights at a Glance -->
    <div class="card bg-base-100 shadow-sm">
      <div class="card-body">
        <div class="flex justify-between items-center mb-4">
          <h2 class="card-title">Insights at a Glance</h2>
          <a href="/account/reviews" class="btn btn-ghost btn-sm"
            >Manage Reviews →</a
          >
        </div>

        {#if isLoading}
          <div class="flex justify-center py-8">
            <span class="loading loading-spinner loading-lg"></span>
          </div>
        {:else}
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <!-- Trending Insight -->
            <div class="text-center p-4 rounded-lg bg-base-200/50">
              {#if reviewStats.trends.reviewCountTrend > 0 && reviewStats.trends.ratingTrend >= 0}
                <TrendingUp class="w-12 h-12 mx-auto text-success mb-3" />
                <div class="text-lg font-semibold text-success mb-1">
                  📈 Trending Up
                </div>
                <div class="text-sm text-base-content/70">
                  Rating improved {formatTrend(
                    reviewStats.trends.ratingTrend,
                    true,
                  )} this week
                </div>
              {:else if reviewStats.trends.reviewCountTrend > 0}
                <Activity class="w-12 h-12 mx-auto text-primary mb-3" />
                <div class="text-lg font-semibold text-primary mb-1">
                  📊 More Active
                </div>
                <div class="text-sm text-base-content/70">
                  {formatTrend(reviewStats.trends.reviewCountTrend)} more reviews
                  this week
                </div>
              {:else if reviewStats.trends.responseRateTrend > 5}
                <MessageSquare class="w-12 h-12 mx-auto text-accent mb-3" />
                <div class="text-lg font-semibold text-accent mb-1">
                  💬 Great Engagement
                </div>
                <div class="text-sm text-base-content/70">
                  Response rate up {formatTrend(
                    reviewStats.trends.responseRateTrend,
                    true,
                  )}
                </div>
              {:else}
                <Target class="w-12 h-12 mx-auto text-info mb-3" />
                <div class="text-lg font-semibold text-info mb-1">
                  📊 Steady Performance
                </div>
                <div class="text-sm text-base-content/70">
                  Consistent ratings and review volume
                </div>
              {/if}
            </div>

            <!-- Performance Insight -->
            <div class="text-center p-4 rounded-lg bg-base-200/50">
              {#if reviewStats.responseRate >= 80}
                <CheckCircle class="w-12 h-12 mx-auto text-success mb-3" />
                <div class="text-lg font-semibold text-success mb-1">
                  ⭐ Excellent Response
                </div>
                <div class="text-sm text-base-content/70">
                  {reviewStats.responseRate}% response rate (industry avg: 60%)
                </div>
              {:else if reviewStats.responseRate >= 60}
                <ThumbsUp class="w-12 h-12 mx-auto text-warning mb-3" />
                <div class="text-lg font-semibold text-warning mb-1">
                  👍 Good Response
                </div>
                <div class="text-sm text-base-content/70">
                  {reviewStats.responseRate}% response rate matches industry
                  average
                </div>
              {:else}
                <AlertCircle class="w-12 h-12 mx-auto text-error mb-3" />
                <div class="text-lg font-semibold text-error mb-1">
                  ⚠️ Opportunity
                </div>
                <div class="text-sm text-base-content/70">
                  {reviewStats.responseRate}% response rate (can improve)
                </div>
              {/if}
            </div>

            <!-- Current Focus -->
            <div class="text-center p-4 rounded-lg bg-base-200/50">
              {#if reviewStats.insights.recentNegative > 0}
                <AlertCircle class="w-12 h-12 mx-auto text-error mb-3" />
                <div class="text-lg font-semibold text-error mb-1">
                  🚨 Needs Attention
                </div>
                <div class="text-sm text-base-content/70 mb-2">
                  {reviewStats.insights.recentNegative} negative reviews this week
                </div>
                <a
                  href="/account/reviews?rating=1,2"
                  class="btn btn-error btn-xs">View Reviews</a
                >
              {:else if reviewStats.aiStats.draftResponses > 0}
                <Brain class="w-12 h-12 mx-auto text-warning mb-3" />
                <div class="text-lg font-semibold text-warning mb-1">
                  🤖 AI Ready
                </div>
                <div class="text-sm text-base-content/70 mb-2">
                  {reviewStats.aiStats.draftResponses} AI responses awaiting approval
                </div>
                <a
                  href="/account/reviews?status=ai-draft"
                  class="btn btn-warning btn-xs">Review Responses</a
                >
              {:else if reviewStats.total > 0}
                <Star class="w-12 h-12 mx-auto text-success mb-3" />
                <div class="text-lg font-semibold text-success mb-1">
                  ✨ All Caught Up
                </div>
                <div class="text-sm text-base-content/70">
                  No urgent issues - keep up the great work!
                </div>
              {:else}
                <MessageSquare class="w-12 h-12 mx-auto text-info mb-3" />
                <div class="text-lg font-semibold text-info mb-1">
                  🚀 Get Started
                </div>
                <div class="text-sm text-base-content/70 mb-2">
                  Connect Google to start managing reviews
                </div>
                <a href="/account/integrations" class="btn btn-primary btn-xs"
                  >Connect Now</a
                >
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="alert alert-warning">
      <AlertCircle class="w-5 h-5" />
      <span>No tenant selected. Please select or create a tenant.</span>
    </div>
  {/if}
</div>
