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
    // Create v2 API client
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    // Fetch reviews from v2 API
    const { reviews } = await v2Client.getReviews(locationId || undefined)

    // Transform v2 reviews to match existing frontend format
    const transformedReviews = reviews.map((review) => ({
      reviewId: review.platform_review_id,
      name: review.platform_review_id,
      locationName: review.location_name || review.location_id,
      reviewer: {
        displayName: review.author_name,
        profilePhotoUrl: review.author_avatar_url,
      },
      starRating: review.rating.toString(),
      comment: review.review_text,
      reviewReply: review.published_response_id
        ? {
            comment: review.ai_responses?.find(
              (r) => r.id === review.published_response_id,
            )?.content,
          }
        : null,
      createTime: review.reviewed_at,
      updateTime: review.updated_at,
      // Include v2 specific fields for frontend use
      _v2: {
        id: review.id,
        response_status: review.response_status,
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
    // Create v2 API client
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    let result: unknown

    switch (action) {
      case "generate":
        // Generate AI response
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
