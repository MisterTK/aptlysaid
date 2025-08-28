import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { env as publicEnv } from "$env/dynamic/public"
import { env as privateEnv } from "$env/dynamic/private"
import { PUBLIC_GOOGLE_CLIENT_ID } from "$env/static/public"
import { GOOGLE_CLIENT_SECRET } from "$env/static/private"

export const POST: RequestHandler = async ({ request }) => {
  const { code } = await request.json()

  if (!code) {
    return json({ error: "No authorization code provided" }, { status: 400 })
  }

  const clientId = PUBLIC_GOOGLE_CLIENT_ID || publicEnv.PUBLIC_GOOGLE_CLIENT_ID
  const clientSecret = GOOGLE_CLIENT_SECRET || privateEnv.GOOGLE_CLIENT_SECRET

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "https://reviews-dusky.vercel.app/account/integrations",
        grant_type: "authorization_code",
      }),
    })

    const data = await response.json()

    return json({
      success: !data.error,
      status: response.status,
      error: data.error,
      error_description: data.error_description,

      has_access_token: !!data.access_token,
      has_refresh_token: !!data.refresh_token,
      config_check: {
        client_id_length: clientId?.length || 0,
        client_secret_length: clientSecret?.length || 0,
        client_id_preview: clientId ? clientId.substring(0, 20) + "..." : null,
      },
    })
  } catch (error) {
    return json(
      {
        success: false,
        error: "Network error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
