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

  const { locationId } = await request.json()

  if (!locationId) {
    return json({ error: "Location ID is required" }, { status: 400 })
  }

  try {
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    const { workflowId } = await v2Client.syncLocation(locationId)

    return json({
      success: true,
      workflowId,
      message: "Sync workflow started successfully",
    })
  } catch (error) {
    console.error("Error syncing reviews:", error)
    return json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync reviews",
      },
      { status: 500 },
    )
  }
}
