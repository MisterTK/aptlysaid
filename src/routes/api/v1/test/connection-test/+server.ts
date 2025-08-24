import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ locals, cookies }) => {
  try {
    const session = await locals.safeGetSession()
    if (!session?.user) {
      return json({ error: "Not authenticated" }, { status: 401 })
    }

    const tenantId = cookies.get("current_tenant_id")
    if (!tenantId) {
      return json({ error: "No tenant selected" }, { status: 400 })
    }

    // Test 1: Raw query without any filters
    const { data: allTokens, error: allError } =
      await locals.supabaseServiceRole.from("oauth_tokens").select("*")

    // Test 2: Filter by tenant only
    const { data: tenantTokens, error: tenantError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId)

    // Test 3: The exact production query
    const { data: productionQuery, error: prodError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("id, provider, provider_scope, status, expires_at")
        .eq("tenant_id", tenantId)
        .eq("provider", "google")
        .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
        .eq("status", "active")
        .single()

    // Test 4: Check if it's a case sensitivity or whitespace issue
    const { data: caseTest } = await locals.supabaseServiceRole
      .from("oauth_tokens")
      .select("*")
      .ilike("provider", "%google%")
      .eq("tenant_id", tenantId)

    return json({
      tenantId,
      tests: {
        allTokens: {
          count: allTokens?.length || 0,
          error: allError?.message,
          sample: allTokens?.slice(0, 2).map((t) => ({
            tenant_id: t.tenant_id,
            provider: t.provider,
            status: t.status,
          })),
        },
        tenantTokens: {
          count: tenantTokens?.length || 0,
          error: tenantError?.message,
          data: tenantTokens,
        },
        productionQuery: {
          found: !!productionQuery,
          error: prodError?.message,
          data: productionQuery,
        },
        caseTest: {
          count: caseTest?.length || 0,
          data: caseTest,
        },
      },
      diagnostics: {
        tenantIdType: typeof tenantId,
        tenantIdValue: tenantId,
        tenantIdLength: tenantId.length,
      },
    })
  } catch (err) {
    console.error("Connection test error:", err)
    return json(
      {
        error: "Test failed",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
