import { json } from "@sveltejs/kit"

export async function GET() {
  const debug = {
    process_env_client_id: !!process.env.PUBLIC_GOOGLE_CLIENT_ID,
    process_env_secret: !!process.env.GOOGLE_CLIENT_SECRET,
    node_env: process.env.NODE_ENV,
  }

  return json(debug)
}
