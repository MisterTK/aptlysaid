import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { V2ApiClient } from "$lib/services/v2-api-client"
import type { Database } from "../../../../DatabaseDefinitions"

export const GET: RequestHandler = async ({
  url,
  locals: { safeGetSession, supabase },
  cookies,
}) => {
  try {
    const { user } = await safeGetSession()
    if (!user) {
      return json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return json({ error: "No organization selected" }, { status: 400 })
    }

    const status = url.searchParams.get("status")
    const limit = parseInt(url.searchParams.get("limit") || "20")
    const offset = parseInt(url.searchParams.get("offset") || "0")

    // Create v2 API client
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    // Get workflows from v2 API
    const { workflows } = await v2Client.getWorkflows(status || undefined)

    // Apply pagination
    const paginatedWorkflows = workflows.slice(offset, offset + limit)

    // Calculate stats from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const recentWorkflows = workflows.filter((w) => w.created_at >= oneDayAgo)

    const workflowStats = recentWorkflows.reduce(
      (
        acc: Record<string, number>,
        workflow: Database["public"]["Tables"]["workflows"]["Row"],
      ) => {
        const key = `${workflow.workflow_type}_${workflow.status}`
        acc[key] = (acc[key] || 0) + 1
        return acc
      },
      {},
    )

    return json({
      workflows: paginatedWorkflows,
      stats: workflowStats,
      pagination: {
        limit,
        offset,
        hasMore: paginatedWorkflows.length === limit,
      },
    })
  } catch (error) {
    console.error("Workflow API error:", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}

export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, supabase },
  cookies,
}) => {
  try {
    const { user } = await safeGetSession()
    if (!user) {
      return json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return json({ error: "No organization selected" }, { status: 400 })
    }

    const body = await request.json()
    const { workflowType, context = {} } = body

    if (!workflowType) {
      return json({ error: "workflowType is required" }, { status: 400 })
    }

    // Validate workflow type
    const validWorkflowTypes = [
      "review_processing",
      "review_sync",
      "token_refresh",
    ]

    if (!validWorkflowTypes.includes(workflowType)) {
      return json({ error: "Invalid workflow type" }, { status: 400 })
    }

    // Create v2 API client
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    // Start the workflow
    const { workflowId } = await v2Client.createWorkflow(workflowType, context)

    return json({
      success: true,
      workflowId,
      message: `Workflow ${workflowType} started successfully`,
    })
  } catch (error) {
    console.error("Workflow start API error:", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}

export const PATCH: RequestHandler = async ({
  request,
  locals: { safeGetSession },
  cookies,
}) => {
  try {
    const { user } = await safeGetSession()
    if (!user) {
      return json({ error: "Unauthorized" }, { status: 401 })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return json({ error: "No organization selected" }, { status: 400 })
    }

    const body = await request.json()
    const { workflowId, action } = body

    if (!workflowId || !action) {
      return json(
        { error: "workflowId and action are required" },
        { status: 400 },
      )
    }

    // V2 workflows are managed by the orchestrator
    // For now, we don't support cancel/retry operations
    return json(
      {
        error: "Workflow modifications not supported in v2",
      },
      { status: 501 },
    )
  } catch (error) {
    console.error("Workflow action API error:", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}
