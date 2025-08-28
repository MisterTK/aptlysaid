import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import pkg from "../../../../package.json"

export const GET: RequestHandler = async ({ locals: { supabase } }) => {
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

    const { error: dbError } = await supabase
      .from("profiles")
      .select("count")
      .limit(1)
      .single()

    checks.checks.database = dbError ? "error" : "ok"

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
