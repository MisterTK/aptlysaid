import type { RequestHandler } from "./$types"
import { json } from "@sveltejs/kit"
import { V2ApiClient } from "$lib/services/v2-api-client"

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    const session = await locals.safeGetSession()
    if (!session?.user) {
      return json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return json({ error: "No organization selected" }, { status: 400 })
    }

    const body = await request.json()
    const { reviewId } = body

    if (!reviewId) {
      return json({ error: "Review ID is required" }, { status: 400 })
    }

    const v2Client = await V2ApiClient.create(locals.supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    const result = await v2Client.generateAiResponse(reviewId)

    return json({
      success: true,
      workflowId: result.workflowId,
      message: "AI response generation started via workflow",
    })
  } catch (error) {
    console.error("Error generating review response:", error)
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to generate response",
      },
      { status: 500 },
    )
  }
}
