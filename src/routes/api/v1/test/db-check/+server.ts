import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ locals, cookies }) => {
  try {
    const tenantId = cookies.get("current_tenant_id")

    const sqlCheck = null
    const sqlError = {
      message:
        "RPC function 'get_oauth_token_debug' not available in current schema",
    }

    const { data: minimalCheck, error: minimalError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId || "")

    const { data: providerCheck, error: providerError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("*")
        .eq("tenant_id", tenantId || "")
        .eq("provider", "google")

    const { data: allStatuses, error: statusError } =
      await locals.supabaseServiceRole
        .from("oauth_tokens")
        .select("status")
        .eq("tenant_id", tenantId || "")
        .eq("provider", "google")

    // Count the statuses manually since Supabase count syntax is different
    const statusCounts =
      allStatuses?.reduce((acc: Record<string, number>, token) => {
        acc[token.status] = (acc[token.status] || 0) + 1
        return acc
      }, {}) || {}

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
          data: statusCounts,
          raw: allStatuses,
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
