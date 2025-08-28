import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ url, locals }) => {
  const tenantId = url.searchParams.get("tenantId")

  if (!tenantId) {
    return json({ error: "Tenant ID required" }, { status: 400 })
  }

  try {
    const { data: reviews, error: reviewsError } =
      await locals.supabaseServiceRole
        .from("reviews")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("review_date", { ascending: false })

    if (reviewsError) {
      console.error("Error fetching reviews:", reviewsError)
      return json({ error: "Failed to fetch reviews" }, { status: 500 })
    }

    const now = new Date()
    const todayStart = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    )
    const tomorrowStart = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    )

    const { data: reviewsToday, error: todayError } =
      await locals.supabaseServiceRole
        .from("reviews")
        .select("id, review_date, tenant_id")
        .eq("tenant_id", tenantId)
        .gte("review_date", todayStart.toISOString())
        .lt("review_date", tomorrowStart.toISOString())

    if (todayError) {
      console.error("Error fetching today's reviews:", todayError)
    }

    const total = reviews?.length || 0
    const averageRating =
      total > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / total : 0

    const reviewsWithReplies = reviews?.filter((r) => r.has_owner_reply) || []
    const responseRate =
      total > 0 ? Math.round((reviewsWithReplies.length / total) * 100) : 0

    const thisWeekStart = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 7,
    )
    const lastWeekStart = new Date(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - 14,
    )

    const thisWeekReviews =
      reviews?.filter((r) => new Date(r.review_date) >= thisWeekStart) || []
    const lastWeekReviews =
      reviews?.filter((r) => {
        const reviewDate = new Date(r.review_date)
        return reviewDate >= lastWeekStart && reviewDate < thisWeekStart
      }) || []

    const thisWeekCount = thisWeekReviews.length
    const lastWeekCount = lastWeekReviews.length
    const reviewCountTrend = thisWeekCount - lastWeekCount

    const thisWeekRating =
      thisWeekReviews.length > 0
        ? thisWeekReviews.reduce((sum, r) => sum + r.rating, 0) /
          thisWeekReviews.length
        : 0
    const lastWeekRating =
      lastWeekReviews.length > 0
        ? lastWeekReviews.reduce((sum, r) => sum + r.rating, 0) /
          lastWeekReviews.length
        : 0
    const ratingTrend = thisWeekRating - lastWeekRating

    const thisWeekReplied = thisWeekReviews.filter(
      (r) => r.has_owner_reply,
    ).length
    const thisWeekResponseRate =
      thisWeekCount > 0 ? (thisWeekReplied / thisWeekCount) * 100 : 0

    const lastWeekReplied = lastWeekReviews.filter(
      (r) => r.has_owner_reply,
    ).length
    const lastWeekResponseRate =
      lastWeekCount > 0 ? (lastWeekReplied / lastWeekCount) * 100 : 0
    const responseRateTrend = thisWeekResponseRate - lastWeekResponseRate

    const sentiment = {
      positive: 0,
      neutral: 0,
      negative: 0,
      mixed: 0,
    }

    if (total > 0) {
      const sentimentCounts = reviews.reduce(
        (acc, r) => {
          if (r.sentiment_label) {
            acc[r.sentiment_label] = (acc[r.sentiment_label] || 0) + 1
          } else {
            if (r.rating >= 4) acc.positive++
            else if (r.rating === 3) acc.neutral++
            else acc.negative++
          }
          return acc
        },
        { positive: 0, neutral: 0, negative: 0, mixed: 0 },
      )

      sentiment.positive = Math.round((sentimentCounts.positive / total) * 100)
      sentiment.neutral = Math.round((sentimentCounts.neutral / total) * 100)
      sentiment.negative = Math.round((sentimentCounts.negative / total) * 100)
      sentiment.mixed = Math.round((sentimentCounts.mixed / total) * 100)
    }

    const { data: allAiResponses } = await locals.supabaseServiceRole
      .from("ai_responses")
      .select("status, created_at, confidence_score, quality_score")
      .eq("tenant_id", tenantId)

    const draftResponses =
      allAiResponses?.filter((r) => r.status === "draft").length || 0
    const approvedResponses =
      allAiResponses?.filter((r) => r.status === "approved").length || 0
    const publishedResponses =
      allAiResponses?.filter((r) => r.status === "published").length || 0
    const rejectedResponses =
      allAiResponses?.filter((r) => r.status === "rejected").length || 0
    const totalAiResponses = allAiResponses?.length || 0

    const aiApprovalRate =
      totalAiResponses > 0
        ? Math.round(
            ((approvedResponses + publishedResponses) / totalAiResponses) * 100,
          )
        : 0

    const avgConfidenceScore =
      allAiResponses && allAiResponses.length > 0
        ? allAiResponses.reduce(
            (sum, r) => sum + (r.confidence_score || 0),
            0,
          ) / allAiResponses.length
        : 0

    let healthScore = 5.0

    if (averageRating >= 4.5) healthScore += 2.0
    else if (averageRating >= 4.0) healthScore += 1.5
    else if (averageRating >= 3.5) healthScore += 1.0
    else if (averageRating >= 3.0) healthScore += 0.5
    else healthScore -= 1.0

    if (responseRate >= 80) healthScore += 1.5
    else if (responseRate >= 60) healthScore += 1.0
    else if (responseRate >= 40) healthScore += 0.5
    else healthScore -= 0.5

    if (reviewCountTrend > 0 && ratingTrend >= 0) healthScore += 1.0
    else if (reviewCountTrend >= 0 && ratingTrend >= 0) healthScore += 0.5
    else if (ratingTrend < -0.2) healthScore -= 0.5

    if (thisWeekCount >= 5) healthScore += 0.5

    healthScore = Math.max(0, Math.min(10, healthScore))

    const { data: activeWorkflows } = await locals.supabaseServiceRole
      .from("workflows")
      .select("id, workflow_type, status")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "running", "waiting"])

    const { data: queuedResponses } = await locals.supabaseServiceRole
      .from("response_queue")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")

    const stats = {
      total,
      averageRating,
      responseRate,
      reviewsToday: reviewsToday?.length || 0,
      sentiment,
      trends: {
        thisWeekCount,
        reviewCountTrend,
        thisWeekRating,
        ratingTrend,
        thisWeekResponseRate,
        responseRateTrend,
      },
      aiStats: {
        draftResponses,
        approvedResponses,
        publishedResponses,
        rejectedResponses,
        totalAiResponses,
        aiApprovalRate,
        avgConfidenceScore,
      },
      healthScore,
      workflowStats: {
        activeWorkflows: activeWorkflows?.length || 0,
        queuedResponses: queuedResponses?.length || 0,
      },
      insights: {
        negativeReviews:
          reviews?.filter(
            (r) => r.rating <= 2 || r.sentiment_label === "negative",
          ).length || 0,
        needsAttention: draftResponses + approvedResponses,
        recentNegative: thisWeekReviews.filter(
          (r) => r.rating <= 2 || r.sentiment_label === "negative",
        ).length,
        highPriorityReviews:
          reviews?.filter((r) => r.priority_score >= 80).length || 0,
      },
    }

    return json({ stats })
  } catch (error) {
    console.error("Dashboard error:", error)
    return json({ error: "Failed to fetch dashboard data" }, { status: 500 })
  }
}
