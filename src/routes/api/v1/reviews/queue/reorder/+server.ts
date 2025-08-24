import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

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
    const { fromIndex, toIndex } = await request.json()

    // Get all queue items in order
    const { data: queueItems, error: fetchError } = await supabaseServiceRole
      .from("response_queue")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("status", ["pending", "processing"])
      .order("position", { ascending: true })

    if (fetchError || !queueItems) throw fetchError

    // Reorder in memory
    const item = queueItems[fromIndex]
    queueItems.splice(fromIndex, 1)
    queueItems.splice(toIndex, 0, item)

    // Update positions in database
    const updates = queueItems.map((item, index) => ({
      id: item.id,
      position: index + 1,
    }))

    // Batch update
    for (const update of updates) {
      const { error } = await supabaseServiceRole
        .from("response_queue")
        .update({ position: update.position })
        .eq("id", update.id)
        .eq("tenant_id", tenantId)

      if (error) throw error
    }

    return json({ success: true })
  } catch (error) {
    console.error("Failed to reorder queue:", error)
    return json({ error: "Failed to reorder queue" }, { status: 500 })
  }
}
