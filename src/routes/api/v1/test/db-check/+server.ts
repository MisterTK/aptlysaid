import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ locals, cookies }) => {
  try {
    const tenantId = cookies.get("current_tenant_id")

    // Direct SQL query to bypass any ORM issues
    // Check if RPC function exists, otherwise provide fallback
    const { data: sqlCheck, error: sqlError } = await locals.supabaseServiceRole
      .rpc("get_oauth_token_debug", { p_tenant_id: tenantId })
      .catch(() => ({
        data: null,
        error: { message: "RPC function not available" },
      }))

    // Check with minimal filters
    const { data: minimalCheck, error: minimalError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId || "")

    // Check with provider filter only
    const { data: providerCheck, error: providerError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId || "")
        .eq("provider", "google")

    // Check all statuses
    const { data: allStatuses, error: statusError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("status, count(*)")
        .eq("tenant_id", tenantId || "")
        .eq("provider", "google")

    return json({
      tenantId: tenantId || "NOT_SET",
      checks: {
        minimal: {
          count: minimalCheck?.length || 0,
          error: minimalError?.message,
          data: minimalCheck,
        },
        withProvider: {
          count: providerCheck?.length || 0,
          error: providerError?.message,
          data: providerCheck?.map((t) => ({
            id: t.id,
            status: t.status,
            provider_scope: t.provider_scope,
            expires_at: t.expires_at,
            created_at: t.created_at,
          })),
        },
        statusBreakdown: {
          data: allStatuses,
          error: statusError?.message,
        },
        sqlDirect: {
          data: sqlCheck,
          error: sqlError?.message || "RPC function may not exist",
        },
      },
    })
  } catch (err) {
    return json(
      {
        error: "Failed to check database",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
