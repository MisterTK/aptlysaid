import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import pkg from "../../../../package.json"

export const GET: RequestHandler = async ({ locals: { supabase, supabaseServiceRole } }) => {
  const checks = {
    status: "healthy",
    version: pkg.version,
    timestamp: new Date().toISOString(),
    checks: {
      server: "ok",
      database: "checking",
      auth: "checking",
    },
  }

  try {

    const dbClient = supabaseServiceRole || supabase
    const usingServiceRole = !!supabaseServiceRole
    
    const { data: healthData, error: dbError } = await dbClient
      .from("profiles")
      .select("id")
      .limit(1)

    if (dbError) {
      checks.checks.database = `error: ${dbError.message} (using ${usingServiceRole ? 'service' : 'client'} role)`
    } else {
      checks.checks.database = `ok (using ${usingServiceRole ? 'service' : 'client'} role)`
    }

    const { error: authError } = await supabase.auth.getSession()
    checks.checks.auth = authError ? "error" : "ok"

    const hasErrors = Object.values(checks.checks).some(
      (status) => status === "error",
    )
    checks.status = hasErrors ? "degraded" : "healthy"
  } catch (error) {
    console.error("Health check error:", error)
    checks.status = "unhealthy"
    checks.checks.database = "error"
    checks.checks.auth = "error"
  }

  return json(checks, {
    status: checks.status === "healthy" ? 200 : 503,
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  })
}
