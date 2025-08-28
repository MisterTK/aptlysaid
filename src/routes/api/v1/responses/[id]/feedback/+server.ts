import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const POST: RequestHandler = async ({
  params,
  request,
  locals: { safeGetSession, supabaseServiceRole },
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

  const { id } = params

  try {
    const { feedback, issues = [] } = await request.json()

    const { data: aiResponse, error: verifyError } = await supabaseServiceRole
      .from("ai_responses")
      .select("*")
      .eq("id", id)
      .eq("tenant_id", orgId)
      .single()

    if (verifyError || !aiResponse) {
      return json({ error: "AI response not found" }, { status: 404 })
    }

    const { error: updateError } = await supabaseServiceRole
      .from("ai_responses")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejected_by: user.id,
        rejection_reason: feedback,
      })
      .eq("id", id)

    if (updateError) throw updateError

    const { error: feedbackError } = await supabaseServiceRole
      .from("ai_response_feedback")
      .insert({
        ai_response_id: id,
        tenant_id: orgId,
        user_id: user.id,
        feedback_text: feedback,
        feedback_issues: issues,
        created_at: new Date().toISOString(),
      })

    if (feedbackError) {
      console.error("Failed to store feedback:", feedbackError)

    }

    if (issues.includes("wrong_tone")) {

      console.log("User reported wrong tone - consider updating guidance")
    }

    return json({ success: true })
  } catch (error) {
    console.error("Failed to submit feedback:", error)
    return json({ error: "Failed to submit feedback" }, { status: 500 })
  }
}
