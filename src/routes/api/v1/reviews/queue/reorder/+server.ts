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
      .order("created_at", { ascending: true })

    if (fetchError || !queueItems) throw fetchError

    // Reorder in memory
    const item = queueItems[fromIndex]
    queueItems.splice(fromIndex, 1)
    queueItems.splice(toIndex, 0, item)

    // Update queue order using a simple approach since position column doesn't exist
    // We'll use the updated_at timestamp to maintain order
    for (let i = 0; i < queueItems.length; i++) {
      const { error } = await supabaseServiceRole
        .from("response_queue")
        .update({ 
          updated_at: new Date(Date.now() + i * 1000).toISOString() // Stagger timestamps by 1 second
        })
        .eq("id", queueItems[i].id)
        .eq("tenant_id", tenantId)

      if (error) throw error
    }

    return json({ success: true })
  } catch (error) {
    console.error("Failed to reorder queue:", error)
    return json({ error: "Failed to reorder queue" }, { status: 500 })
  }
}
