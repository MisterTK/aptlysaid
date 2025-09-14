import { redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({
  locals: { safeGetSession, supabaseServiceRole },
  cookies,
}) => {
  const { user } = await safeGetSession()
  if (!user) {
    redirect(303, "/login/sign_in")
  }

  const orgId = cookies.get("current_tenant_id")
  if (!orgId) {
    redirect(303, "/account")
  }

  try {
    const { data: workflows, error: workflowsError } = await supabaseServiceRole
      .from("workflows")
      .select(
        `
        id,
        workflow_name,
        workflow_type,
        status,
        current_step,
        total_steps,
        progress,
        priority,
        input_data,
        output_data,
        error_details,
        scheduled_for,
        started_at,
        completed_at,
        created_at,
        updated_at
      `,
      )
      .eq("tenant_id", orgId)
      .order("created_at", { ascending: false })
      .limit(20)

    if (workflowsError) {
      console.error("Error loading workflows:", workflowsError)
    }

    const { data: stats } = await supabaseServiceRole
      .from("workflows")
      .select("status, workflow_type")
      .eq("tenant_id", orgId)
      .gte(
        "created_at",
        new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      )

    const workflowStats = (
      (stats as { workflow_type: string; status: string }[]) || []
    ).reduce(
      (
        acc: Record<string, number>,
        workflow: { workflow_type: string; status: string },
      ) => {
        if (workflow.workflow_type && workflow.status) {
          const key = `${workflow.workflow_type}_${workflow.status}`
          acc[key] = (acc[key] || 0) + 1
        }
        return acc
      },
      {} as Record<string, number>,
    )

    return {
      workflows: workflows || [],
      stats: workflowStats,
      tenantId: orgId,
    }
  } catch (error) {
    console.error("Error in workflows page load:", error)
    return {
      workflows: [],
      stats: {},
      tenantId: orgId,
    }
  }
}
