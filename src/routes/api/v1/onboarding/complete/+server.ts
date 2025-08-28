import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { V2ApiClient } from "$lib/services/v2-api-client"

export const POST: RequestHandler = async ({
  locals: { safeGetSession, supabase },
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

  try {

    const v2Client = await V2ApiClient.create(supabase)
    if (!v2Client) {
      return json({ error: "Failed to create API client" }, { status: 500 })
    }

    const { progress } = await v2Client.advanceOnboarding(
      "onboarding_completed",
      {
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        onboarding_version: "2.0",
      },
    )

    const { error: updateError } = await supabase
      .from("tenants")
      .update({
        onboarding_completed: true,
        onboarding_step: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orgId)

    if (updateError) {
      console.error("Error updating tenant onboarding status:", updateError)

    }

    return json({
      success: true,
      message: "Onboarding completed successfully",
      redirect_url: "/account",
      progress,
    })
  } catch (error) {
    console.error("Onboarding completion error:", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}
