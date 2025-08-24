import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const DELETE: RequestHandler = async ({
  params,
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
    const { error } = await supabaseServiceRole
      .from("response_queue")
      .delete()
      .eq("id", id)
      .eq("tenant_id", orgId)

    if (error) throw error

    return json({ success: true })
  } catch (error) {
    console.error("Failed to remove from queue:", error)
    return json({ error: "Failed to remove from queue" }, { status: 500 })
  }
}
