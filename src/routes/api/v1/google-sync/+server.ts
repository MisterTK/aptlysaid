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

  const tenantId = cookies.get("current_tenant_id")
  if (!tenantId) {
    return json({ error: "No organization selected" }, { status: 400 })
  }

  try {

    const { data: tokenData } = await supabase
      .from("oauth_tokens")
      .select("status, token_metadata")
      .eq("tenant_id", tenantId)
      .eq("provider", "google")
      .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
      .eq("status", "active")
      .single()

    if (!tokenData) {
      return json({ error: "No Google connection found" }, { status: 404 })
    }

    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    const { workflowId } = await v2Client.createWorkflow("review_sync", {
      tenantId: tenantId,
      triggerType: "manual_sync",
      syncAll: true,
    })

    console.log(
      `Created review sync workflow ${workflowId} for tenant ${tenantId}`,
    )

    return json({
      success: true,
      workflowId: workflowId,
      oauth_status: tokenData.status,
      token_metadata: tokenData.token_metadata,
      message:
        "Review sync workflow created successfully. Sync will complete asynchronously.",
      status: "workflow_created",
    })
  } catch (error) {
    console.error("Error creating review sync workflow:", error)
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create sync workflow",
      },
      { status: 500 },
    )
  }
}

export const POST = GET
