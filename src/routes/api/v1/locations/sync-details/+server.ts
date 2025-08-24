import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { V2ApiClient } from "$lib/services/v2-api-client"

export const GET: RequestHandler = async ({
  locals: { safeGetSession, supabase },
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

  try {
    // Create v2 API client
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    // Get all locations
    const { locations } = await v2Client.getLocations()

    return json({ locations, success: true })
  } catch (error) {
    console.error("Error fetching locations:", error)
    return json({ error: "Internal server error" }, { status: 500 })
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

  const { locationId } = await request.json()

  try {
    // Create v2 API client
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    // If no specific location ID, sync all locations
    if (!locationId) {
      const { locations } = await v2Client.getLocations()
      const workflowIds = []

      for (const location of locations) {
        const { workflowId } = await v2Client.syncLocation(location.id)
        workflowIds.push(workflowId)
      }

      return json({
        success: true,
        workflowIds,
        message: `Started sync for ${workflowIds.length} locations`,
      })
    } else {
      // Sync specific location
      const { workflowId } = await v2Client.syncLocation(locationId)

      return json({
        success: true,
        workflowId,
        message: "Location sync started successfully",
      })
    }
  } catch (error) {
    console.error("Error syncing location details:", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}
