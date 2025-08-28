import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({
  locals: { safeGetSession, supabaseServiceRole },
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

  try {

    const { data: queueItems, error } = await supabaseServiceRole
      .from("response_queue")
      .select(
        `
        *,
        ai_responses(
          response_text,
          reviews(
            review_text,
            rating,
            reviewer_name,
            platform_review_id,
            locations(name)
          )
        )
      `,
      )
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "processing"])
      .order("priority", { ascending: false })

    if (error) throw error

    const items =
      queueItems?.map((item) => ({
        id: item.id,
        aiResponseId: item.response_id,
        review: {
          reviewId: item.ai_responses?.reviews?.platform_review_id,
          reviewer: {
            displayName: item.ai_responses?.reviews?.reviewer_name,
          },
          starRating: item.ai_responses?.reviews?.rating?.toString(),
          locationName: item.ai_responses?.reviews?.locations?.name,
        },
        priority: item.priority,
        scheduledTime: item.scheduled_for,
        status: item.status,
      })) || []

    return json({ items })
  } catch (error) {
    console.error("Failed to fetch queue items:", error)
    return json({ error: "Failed to fetch queue items" }, { status: 500 })
  }
}

export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, supabaseServiceRole },
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

  try {
    const { aiResponseId } = await request.json()

    const { data: aiResponse, error: aiError } = await supabaseServiceRole
      .from("ai_responses")
      .select(
        `
        *,
        reviews(location_id)
      `,
      )
      .eq("id", aiResponseId)
      .eq("tenant_id", tenantId)
      .single()

    if (aiError || !aiResponse) {
      throw new Error("AI response not found")
    }

    const { data: existingQueue } = await supabaseServiceRole
      .from("response_queue")
      .select("id")
      .eq("response_id", aiResponseId)
      .eq("tenant_id", tenantId)
      .single()

    if (existingQueue) {
      return json({ message: "Already in queue" })
    }

    const { data: highestItem } = await supabaseServiceRole
      .from("response_queue")
      .select("priority")
      .eq("tenant_id", tenantId)
      .order("priority", { ascending: false })
      .limit(1)
      .single()

    const nextPriority = (highestItem?.priority || 0) + 1

    const { data: settings } = await supabaseServiceRole
      .from("response_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .single()

    const delaySeconds = settings?.response_delay || 30
    const scheduledFor = new Date(Date.now() + delaySeconds * 1000)

    const { data: newItem, error: insertError } = await supabaseServiceRole
      .from("response_queue")
      .insert({
        response_id: aiResponseId,
        tenant_id: tenantId,
        location_id: aiResponse.reviews.location_id,
        platform: "google",
        priority: nextPriority,
        scheduled_for: scheduledFor.toISOString(),
        status: "pending",
        max_attempts: 3,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return json({ success: true, item: newItem })
  } catch (error) {
    console.error("Failed to add to queue:", error)
    return json({ error: "Failed to add to queue" }, { status: 500 })
  }
}

export const PATCH: RequestHandler = async ({
  request,
  locals: { safeGetSession, supabaseServiceRole },
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

  try {
    const { action } = await request.json()

    if (action === "pause") {

      const { error } = await supabaseServiceRole
        .from("response_queue")
        .update({ status: "cancelled" })
        .eq("tenant_id", tenantId)
        .eq("status", "pending")

      if (error) throw error
      return json({ success: true })
    } else if (action === "resume") {

      const { error } = await supabaseServiceRole
        .from("response_queue")
        .update({ status: "pending" })
        .eq("tenant_id", tenantId)
        .eq("status", "cancelled")

      if (error) throw error
      return json({ success: true })
    }

    return json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    console.error("Failed to update queue:", error)
    return json({ error: "Failed to update queue" }, { status: 500 })
  }
}
