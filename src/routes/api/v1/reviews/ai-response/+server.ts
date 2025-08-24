import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { getUserOrganization } from "$lib/server/utils"

export const PATCH: RequestHandler = async ({ request, locals }) => {
  try {
    const session = await locals.safeGetSession()
    if (!session) {
      return json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = session.user
    const body = await request.json()
    const {
      responseId,
      responseIds,
      reviewId,
      status,
      action,
      text,
      feedback,
    } = body

    // Handle bulk operations
    if (responseIds && action) {
      if (!["approve", "reject"].includes(action)) {
        return json({ error: "Invalid action" }, { status: 400 })
      }

      const userOrganization = await getUserOrganization(
        locals.supabase,
        user.id,
      )
      if (!userOrganization) {
        return json({ error: "Unauthorized" }, { status: 403 })
      }

      const newStatus = action === "approve" ? "approved" : "rejected"
      const updates: Record<string, string | null> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }

      if (newStatus === "approved") {
        updates.approved_at = new Date().toISOString()
        updates.approved_by = user.id
      } else if (newStatus === "rejected") {
        updates.rejected_at = new Date().toISOString()
        updates.rejected_by = user.id
        if (feedback) {
          updates.rejection_feedback = feedback
        }
      }

      const { data: responses, error } = await locals.supabaseServiceRole
        .from("ai_responses")
        .update(updates)
        .in("id", responseIds)
        .eq("tenant_id", userOrganization.id)
        .select()

      if (error) {
        console.error("Error bulk updating AI responses:", error)
        return json({ error: "Failed to update AI responses" }, { status: 500 })
      }

      return json({ responses, count: responses?.length || 0 })
    }

    // Handle single response operations
    if (!responseId) {
      return json({ error: "Missing responseId" }, { status: 400 })
    }

    // Handle text editing
    if (action === "edit") {
      if (!text) {
        return json({ error: "Missing text for edit" }, { status: 400 })
      }

      const userOrganization = await getUserOrganization(
        locals.supabase,
        user.id,
      )
      if (!userOrganization) {
        return json({ error: "Unauthorized" }, { status: 403 })
      }

      const { data: response, error } = await locals.supabaseServiceRole
        .from("ai_responses")
        .update({
          generated_response: text,
          updated_at: new Date().toISOString(),
        })
        .eq("id", responseId)
        .eq("tenant_id", userOrganization.id)
        .select()
        .single()

      if (error) {
        console.error("Error updating AI response text:", error)
        return json({ error: "Failed to update AI response" }, { status: 500 })
      }

      return json({ response })
    }

    // Handle status updates (approve/reject)
    if (action && ["approve", "reject"].includes(action)) {
      const newStatus = action === "approve" ? "approved" : "rejected"

      const userOrganization = await getUserOrganization(
        locals.supabase,
        user.id,
      )
      if (!userOrganization) {
        return json({ error: "Unauthorized" }, { status: 403 })
      }

      const updates: Record<string, string | null> = {
        status: newStatus,
        updated_at: new Date().toISOString(),
      }

      if (newStatus === "approved") {
        updates.approved_at = new Date().toISOString()
        updates.approved_by = user.id
      } else if (newStatus === "rejected") {
        updates.rejected_at = new Date().toISOString()
        updates.rejected_by = user.id
        if (feedback) {
          updates.rejection_feedback = feedback
        }
      }

      const { data: response, error } = await locals.supabaseServiceRole
        .from("ai_responses")
        .update(updates)
        .eq("id", responseId)
        .eq("tenant_id", userOrganization.id)
        .select()
        .single()

      if (error) {
        console.error("Error updating AI response:", error)
        return json({ error: "Failed to update AI response" }, { status: 500 })
      }

      return json({ response })
    }

    // Legacy format support
    if (!reviewId || !status) {
      return json({ error: "Missing required fields" }, { status: 400 })
    }

    if (!["approved", "rejected"].includes(status)) {
      return json({ error: "Invalid status" }, { status: 400 })
    }

    const updates: Record<string, string | null> = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === "approved") {
      updates.approved_at = new Date().toISOString()
      updates.approved_by = user.id
    } else if (status === "rejected") {
      updates.rejected_at = new Date().toISOString()
      updates.rejected_by = user.id
      if (feedback) {
        updates.rejection_feedback = feedback
      }
    }

    const { data: response, error } = await locals.supabaseServiceRole
      .from("ai_responses")
      .update(updates)
      .eq("id", responseId)
      .eq("review_id", reviewId)
      .select()
      .single()

    if (error) {
      console.error("Error updating AI response:", error)
      return json({ error: "Failed to update AI response" }, { status: 500 })
    }

    return json({ response })
  } catch (error) {
    console.error("AI Response API: Unexpected error", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}
