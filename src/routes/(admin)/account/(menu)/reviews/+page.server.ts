import { redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"

interface Location {
  name: string
  locationId: string
  title?: string
  address?: string | { addressLines?: string[] }
  primaryPhone?: string
  websiteUrl?: string
}

interface Account {
  name: string
  accountId: string
  type?: string
  role?: string
  state?: string
  profilePhotoUrl?: string
  locations?: Location[]
}

export const load: PageServerLoad = async ({
  locals: { safeGetSession, supabaseServiceRole },
  cookies,
  url,
}) => {
  const { session, user } = await safeGetSession()
  if (!user) {
    redirect(303, "/login/sign_in")
  }

  const orgId = cookies.get("current_tenant_id")
  if (!orgId) {
    redirect(303, "/account")
  }

  const { data: oauthToken } = await supabaseServiceRole
    .from("oauth_tokens")
    .select("status")
    .eq("tenant_id", orgId)
    .eq("provider", "google")
    .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
    .eq("status", "active")
    .single()

  const isConnected = !!oauthToken

  const { data: dbReviews, error } = await supabaseServiceRole
    .from("reviews")
    .select(`
      *,
      ai_responses(
        *,
        response_queue(*)
      ),
      locations(id, name, address)
    `)
    .eq("tenant_id", orgId)
    .order("review_date", { ascending: false })
    .range(0, 4999)

  if (error) {
    console.error("Error fetching reviews from database:", error)
  }

  const allAiResponses = dbReviews?.flatMap(r => r.ai_responses) || []

  // Debug logging
  console.log('Sample DB Review:', JSON.stringify(dbReviews?.[0], null, 2))
  console.log('Sample AI Response:', JSON.stringify(allAiResponses?.[0], null, 2))
  
  // Also get queue items separately for debugging
  const { data: queueDebug } = await supabaseServiceRole
    .from("response_queue")
    .select("*, ai_responses(id, status)")
    .eq("tenant_id", orgId)
    .in("status", ["pending", "processing"])
  
  console.log('Queue items:', JSON.stringify(queueDebug, null, 2))

  const { data: businessGuidance } = await supabaseServiceRole
    .from("business_guidance")
    .select("*")
    .eq("tenant_id", orgId)
    .single()

  const { data: upsellItems } = await supabaseServiceRole
    .from("upsell_items")
    .select("*")
    .eq("tenant_id", orgId)
    .eq("is_active", true)

  const reviews = dbReviews || []

  const uniqueLocations = [...new Map(dbReviews?.map(r => r.locations).filter(Boolean).map(loc => [loc.id, loc])).values()]

  const accounts: Account[] =
    uniqueLocations.length > 0
      ? [
          {
            name: "Imported Locations",
            accountId: "imported",
            locations: uniqueLocations.map((loc) => ({
              name: loc.name,
              locationId: loc.id,
              title: loc.name,
              address: loc.address || undefined,
            })),
          },
        ]
      : []

  const hasApprovedResponses = allAiResponses?.some((r) => r.status === "approved") || false
  const locations = uniqueLocations.map((loc) => loc.name)

  return {
    connected: isConnected,
    reviews,
    accounts,
    locations,
    imported: url.searchParams.get("imported"),
    success: url.searchParams.get("success"),
    hasBusinessGuidance: !!businessGuidance,
    businessGuidance,
    upsellItems: upsellItems || [],
    hasApprovedResponses,
    tenantId: orgId,
    session,
    allAiResponses,
    orphanedAiResponses: [], // This can be improved if needed
  }
}
