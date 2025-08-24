import { redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({
  locals: { safeGetSession, supabaseServiceRole },
  cookies,
  depends,
}) => {
  depends("response:settings")

  const { user } = await safeGetSession()
  if (!user) {
    redirect(303, "/login/sign_in")
  }

  const orgId = cookies.get("current_tenant_id")
  if (!orgId) {
    redirect(303, "/account")
  }

  // Get response settings using V2 schema
  const { data: settings, error: settingsError } = await supabaseServiceRole
    .from("response_settings")
    .select("*")
    .eq("tenant_id", orgId)
    .single()

  if (settingsError && settingsError.code !== "PGRST116") {
    console.error("Error fetching response settings:", settingsError)
  }

  // Get queue statistics using V2 schema
  const [{ count: pending }, { count: processing }, { count: failed }] =
    await Promise.all([
      supabaseServiceRole
        .from("response_queue")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", orgId)
        .eq("status", "pending"),
      supabaseServiceRole
        .from("response_queue")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", orgId)
        .eq("status", "processing"),
      supabaseServiceRole
        .from("response_queue")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", orgId)
        .eq("status", "failed"),
    ])

  // Get today's completed count
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { count: completed } = await supabaseServiceRole
    .from("response_queue")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", orgId)
    .eq("status", "completed")
    .gte("published_at", today.toISOString())

  // Calculate next publish time if auto-publish is enabled
  let next_publish_time = null
  if (settings?.auto_publish_enabled && (pending || 0) > 0) {
    const delay = settings.auto_publish_delay_hours || 1
    next_publish_time = new Date(
      Date.now() + delay * 60 * 60 * 1000,
    ).toISOString()
  }

  return {
    settings,
    queueStats: {
      pending: pending || 0,
      processing: processing || 0,
      completed: completed || 0,
      failed: failed || 0,
      next_publish_time,
    },
    tenantId: orgId,
  }
}
