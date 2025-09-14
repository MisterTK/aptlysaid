import type { PageServerLoad } from "./$types"
import { createAdminClient } from "$lib/server/supabase-admin"
import { getUserOrganization } from "$lib/server/utils"
import { redirect } from "@sveltejs/kit"
import type { SupabaseClient } from "@supabase/supabase-js"

export const load: PageServerLoad = async ({ locals }) => {
  const session = await locals.safeGetSession()
  if (!session) {
    throw redirect(302, "/login")
  }

  const supabase = createAdminClient()
  const organization = await getUserOrganization(supabase, session.user!.id)

  if (!organization) {
    throw redirect(302, "/login")
  }

  try {
    const { data: workflowExecution } = await supabase
      .from("workflows")
      .select("*")
      .eq("organization_id", organization.id)
      .eq("workflow_type", "customer_onboarding")
      .in("status", ["pending", "processing", "retrying"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    const onboardingStatus = await getOnboardingStatus(
      supabase,
      organization.id,
    )

    return {
      organization,
      user: session.user,
      workflowExecution: workflowExecution || null,
      onboardingStatus,
    }
  } catch (error) {
    console.error("Error loading onboarding data:", error)
    return {
      organization,
      user: session.user,
      workflowExecution: null,
      onboardingStatus: null,
    }
  }
}

async function getOnboardingStatus(
  supabase: SupabaseClient,
  organizationId: string,
) {
  try {
    const [
      { data: profile },
      { data: tokens },
      { data: locations },
      { data: guidance },
    ] = await Promise.all([
      supabase
        .from("profiles")
        .select("first_name, last_name, company_name")
        .eq("organization_id", organizationId)
        .single(),

      supabase
        .from("oauth_tokens")
        .select("id")
        .eq("tenant_id", organizationId)
        .eq("provider", "google")
        .eq("status", "active")
        .limit(1),

      supabase
        .from("locations")
        .select("id")
        .eq("organization_id", organizationId)
        .limit(1),

      supabase
        .from("business_guidance")
        .select("id")
        .eq("organization_id", organizationId)
        .limit(1),
    ])

    return {
      welcome_completed: true,
      profile_completed: !!(profile?.first_name && profile?.last_name),
      integrations_connected: !!(tokens && tokens.length > 0),
      locations_discovered: !!(locations && locations.length > 0),
      ai_configured: !!(guidance && guidance.length > 0),
    }
  } catch (error) {
    console.error("Error getting onboarding status:", error)
    return {
      welcome_completed: true,
      profile_completed: false,
      integrations_connected: false,
      locations_discovered: false,
      ai_configured: false,
    }
  }
}
