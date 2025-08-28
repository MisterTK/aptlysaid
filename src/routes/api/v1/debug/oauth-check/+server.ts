import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ locals, cookies }) => {
  try {

    const session = await locals.safeGetSession()
    if (!session) {
      return json({ error: "Unauthorized" }, { status: 401 })
    }

    const tenantId = cookies.get("current_tenant_id")
    if (!tenantId) {
      return json({ error: "No tenant selected" }, { status: 400 })
    }

    const { data: allTokens, error: allError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId)

    const { data: googleTokens, error: googleError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("provider", "google")

    const { data: activeTokens, error: activeError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("provider", "google")
        .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
        .eq("status", "active")

    const { data: locations, error: locError } =
      await locals.supabaseServiceRole
        .from("locations")
        .select("id, name, address, platform_data")
        .eq("tenant_id", tenantId)

    const { data: reviews, error: reviewError } =
      await locals.supabaseServiceRole
        .from("reviews")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(10)

    return json({
      tenantId,
      checks: {
        allTokens: {
          count: allTokens?.length || 0,
          error: allError?.message,
          data: allTokens?.map((t) => ({
            id: t.id,
            provider: t.provider,
            provider_scope: t.provider_scope,
            status: t.status,
            expires_at: t.expires_at,
            created_at: t.created_at,
          })),
        },
        googleTokens: {
          count: googleTokens?.length || 0,
          error: googleError?.message,
          data: googleTokens?.map((t) => ({
            id: t.id,
            provider_scope: t.provider_scope,
            status: t.status,
            expires_at: t.expires_at,
          })),
        },
        activeGoogleBusinessTokens: {
          count: activeTokens?.length || 0,
          error: activeError?.message,
          hasConnection:
            !activeError && activeTokens && activeTokens.length > 0,
          data: activeTokens,
        },
        locations: {
          count: locations?.length || 0,
          error: locError?.message,
          names: locations?.map((l) => l.name),
        },
        reviews: {
          count: reviews?.length || 0,
          error: reviewError?.message,
        },
      },
    })
  } catch (err) {
    console.error("Debug endpoint error:", err)
    return json(
      { error: "Failed to check OAuth status", details: err },
      { status: 500 },
    )
  }
}
