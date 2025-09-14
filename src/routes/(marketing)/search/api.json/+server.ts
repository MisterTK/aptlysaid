import { dev } from "$app/environment"
import { error } from "@sveltejs/kit"

export async function GET() {
  if (dev) {
    const { buildSearchIndex } = await import("$lib/build_index")
    const searchData = await buildSearchIndex()
    return new Response(JSON.stringify(searchData), {
      headers: { "Content-Type": "application/json" },
    })
  }
  error(404, "Search index not found")
}
