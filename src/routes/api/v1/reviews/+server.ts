import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { V2ApiClient } from "$lib/services/v2-api-client"

export const GET: RequestHandler = async ({
  locals: { safeGetSession, supabase },
  url,
  cookies,
}) => {
  const { user } = await safeGetSession()
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = cookies.get("current_tenant_id")
  if (!orgId) {
    return json({ error: "No organization selected" }, { status: 400 })
  }

  const locationId = url.searchParams.get("locationId")

  try {
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    const { reviews } = await v2Client.getReviews(locationId || undefined)

    const transformedReviews = reviews.map((review) => ({
      reviewId: review.platform_review_id,
      name: review.platform_review_id,
      locationName: review.location?.name || review.location_id,
      reviewer: {
        displayName: review.reviewer_name,
        profilePhotoUrl: review.reviewer_avatar_url,
      },
      starRating: review.rating.toString(),
      comment: review.review_text,
      reviewReply: review.ai_responses?.find((r) => r.status === "published")
        ? {
            comment: review.ai_responses?.find((r) => r.status === "published")
              ?.response_text,
          }
        : null,
      createTime: review.review_date,
      updateTime: review.updated_at,

      _v2: {
        id: review.id,
        status: review.status,
        needs_response: review.needs_response,
        ai_responses: review.ai_responses,
      },
    }))

    return json({ reviews: transformedReviews, success: true })
  } catch (error) {
    console.error("Error fetching reviews:", error)
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to fetch reviews",
      },
      { status: 500 },
    )
  }
}

export const POST: RequestHandler = async ({
  locals: { safeGetSession, supabase },
  request,
  cookies,
}) => {
  const { user } = await safeGetSession()
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const orgId = cookies.get("current_tenant_id")
  if (!orgId) {
    return json({ error: "No organization selected" }, { status: 400 })
  }

  const { reviewId, action, replyText, responseId } = await request.json()

  if (!reviewId || !action) {
    return json({ error: "Missing required parameters" }, { status: 400 })
  }

  try {
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    let result: Record<string, unknown> = {}

    switch (action) {
      case "generate":
        result = await v2Client.generateAiResponse(reviewId)
        break

      case "approve":
        if (!responseId) {
          return json({ error: "Response ID is required" }, { status: 400 })
        }
        result = await v2Client.approveResponse(responseId, reviewId)
        break

      case "reject":
        if (!responseId || !replyText) {
          return json(
            { error: "Response ID and reason are required" },
            { status: 400 },
          )
        }
        result = await v2Client.rejectResponse(responseId, reviewId, replyText)
        break

      default:
        return json({ error: "Invalid action" }, { status: 400 })
    }

    return json({ success: true, ...result })
  } catch (error) {
    console.error("Error managing review:", error)
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to manage review",
      },
      { status: 500 },
    )
  }
}
