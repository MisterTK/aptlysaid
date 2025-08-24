import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"

export const GET: RequestHandler = async ({ url, locals }) => {
  const jobId = url.searchParams.get("jobId")

  if (!jobId) {
    return json({ error: "Job ID required" }, { status: 400 })
  }

  const session = await locals.safeGetSession()
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: job, error } = await locals.supabaseServiceRole
    .from("batch_generation_jobs")
    .select("*")
    .eq("id", jobId)
    .single()

  if (error) {
    console.error("Error fetching job status:", error)
    return json({ error: "Failed to fetch job status" }, { status: 500 })
  }

  return json({ job })
}
