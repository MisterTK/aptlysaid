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
    return json({ error: "No tenant selected" }, { status: 400 })
  }

  try {
    // Create v2 API client
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    const { settings } = await v2Client.getResponseSettings()

    // Map database field names to frontend field names
    const mappedSettings = settings
      ? {
          auto_publish: settings.auto_publish_enabled,
          min_rating: settings.require_approval_below_rating,
          max_per_hour: settings.publish_rate_limit_per_hour,
          max_per_day: settings.publish_rate_limit_per_hour * 24, // Calculate from hourly limit
          response_delay: settings.auto_publish_delay_hours * 3600, // Convert hours to seconds
          business_hours_only: false, // Not in v2 schema
          business_hours_start: 9, // Default
          business_hours_end: 17, // Default
          timezone: "America/New_York", // Default
          // Default values for UI-only fields
          auto_approve_5_star: false,
          require_approval_low_rating: true,
        }
      : null

    return json(mappedSettings)
  } catch (error) {
    console.error("Error getting response settings:", error)
    return json({ error: "Failed to get response settings" }, { status: 500 })
  }
}

export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, supabase },
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
    const rawSettings = await request.json()

    // Map field names from frontend to actual database schema
    const settings = {
      auto_publish_enabled: rawSettings.auto_publish,
      auto_publish_positive:
        rawSettings.auto_publish && rawSettings.min_rating <= 4,
      auto_publish_neutral:
        rawSettings.auto_publish && rawSettings.min_rating <= 3,
      auto_publish_negative:
        rawSettings.auto_publish && rawSettings.min_rating <= 2,
      min_confidence_score: 0.8, // Default
      min_quality_score: 0.7, // Default
      require_human_review_below_threshold: !rawSettings.auto_approve_5_star,
      rate_limits: {
        max_per_hour: rawSettings.max_per_hour || 10,
        max_per_day: rawSettings.max_per_day || 100,
        response_delay: rawSettings.response_delay || 30,
      },
      include_upsell: false, // Default for now
    }

    // Validate settings
    if (
      settings.min_confidence_score < 0 ||
      settings.min_confidence_score > 1
    ) {
      return json(
        { error: "Confidence score must be between 0 and 1" },
        { status: 400 },
      )
    }

    if (settings.min_quality_score < 0 || settings.min_quality_score > 1) {
      return json(
        { error: "Quality score must be between 0 and 1" },
        { status: 400 },
      )
    }

    if (
      settings.rate_limits.max_per_hour < 0 ||
      settings.rate_limits.max_per_hour > 100
    ) {
      return json(
        { error: "Max responses per hour must be between 0 and 100" },
        { status: 400 },
      )
    }

    // Create v2 API client
    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    await v2Client.saveResponseSettings(settings)

    return json({ success: true })
  } catch (error) {
    console.error("Error updating response settings:", error)
    return json(
      { error: "Failed to update response settings" },
      { status: 500 },
    )
  }
}
