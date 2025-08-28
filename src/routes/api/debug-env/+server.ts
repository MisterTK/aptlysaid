import { json } from "@sveltejs/kit"
import { env as publicEnv } from "$env/dynamic/public"
import { env as privateEnv } from "$env/dynamic/private"

export async function GET() {
  const debug = {
    dynamic_public_client_id: !!publicEnv.PUBLIC_GOOGLE_CLIENT_ID,
    dynamic_private_secret: !!privateEnv.GOOGLE_CLIENT_SECRET,
    process_env_client_id: !!process.env.PUBLIC_GOOGLE_CLIENT_ID,
    process_env_secret: !!process.env.GOOGLE_CLIENT_SECRET,
    node_env: process.env.NODE_ENV,
    final_client_id: !!(
      publicEnv.PUBLIC_GOOGLE_CLIENT_ID ||
      process.env.PUBLIC_GOOGLE_CLIENT_ID
    ),
    final_secret: !!(
      privateEnv.GOOGLE_CLIENT_SECRET ||
      process.env.GOOGLE_CLIENT_SECRET
    ),
  }

  return json(debug)
}
