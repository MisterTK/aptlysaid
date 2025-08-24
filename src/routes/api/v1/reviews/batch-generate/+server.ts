import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { V2ApiClient } from "$lib/services/v2-api-client"

export const POST: RequestHandler = async ({
  locals: { safeGetSession, supabase },
  request,
  cookies,
}) => {
  const { user } = await safeGetSession()
  if (!user) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = cookies.get("current_tenant_id")
  if (!tenantId) {
    return json({ error: "No tenant selected" }, { status: 400 })
  }

  const { reviewIds } = await request.json()

  // If no specific review IDs provided, get all reviews needing responses
  let targetReviewIds = reviewIds

  try {
    // Create v2 API client
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    if (!targetReviewIds || targetReviewIds.length === 0) {
      // Get all reviews that need AI responses
      const { reviews } = await v2Client.getReviews()

      // Filter reviews needing responses
      targetReviewIds = reviews
        .filter(
          (review) =>
            review.response_status === "pending" &&
            (!review.ai_responses || review.ai_responses.length === 0),
        )
        .map((review) => review.id)

      if (targetReviewIds.length === 0) {
        return json({ error: "No reviews need AI responses" }, { status: 400 })
      }
    }

    // Start batch generation
    const { workflowIds } =
      await v2Client.batchGenerateResponses(targetReviewIds)

    return json({
      success: true,
      workflowIds,
      totalReviews: workflowIds.length,
      message: `Started ${workflowIds.length} AI response generation workflows`,
    })
  } catch (error) {
    console.error("Error batch generating responses:", error)
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to batch generate responses",
      },
      { status: 500 },
    )
  }
}
