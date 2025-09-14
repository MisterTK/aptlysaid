import { redirect } from "@sveltejs/kit"
import type { PageServerLoad } from "./$types"
import { GoogleMyBusinessWrapperV3 } from "$lib/services/google-my-business-wrapper-v2"
import type {
  SupabaseClient,
  Session,
  User,
  AMREntry,
} from "@supabase/supabase-js"

const publicEnv = process.env
const privateEnv = process.env

export const load: PageServerLoad = async ({
  locals: { safeGetSession, supabaseServiceRole },
  cookies,
}) => {
  const { user } = await safeGetSession()
  if (!user) {
    redirect(303, "/login/sign_in")
  }

  const { data: orgMembershipsData } = await supabaseServiceRole
    .from("tenant_users")
    .select("tenant_id, role, tenants(id, name, slug)")
    .eq("user_id", user.id)
    .limit(1)

  const orgMemberships =
    orgMembershipsData && orgMembershipsData.length > 0
      ? orgMembershipsData[0]
      : null

  if (!orgMemberships) {
    redirect(303, "/account/create-organization")
  }

  const currentTenant = orgMemberships.tenants
  if (currentTenant) {
    cookies.set("current_tenant_id", currentTenant.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })
  }

  let googleConnected = false
  if (currentTenant?.id) {
    try {
      const gmb = new GoogleMyBusinessWrapperV3(supabaseServiceRole, {
        clientId: publicEnv.PUBLIC_GOOGLE_CLIENT_ID,
        clientSecret: privateEnv.GOOGLE_CLIENT_SECRET,
        encryptionKey: privateEnv.TOKEN_ENCRYPTION_KEY,
      })
      googleConnected = await gmb.hasValidToken(currentTenant.id)
    } catch (error) {
      console.error("Error checking Google connection:", error)
    }
  }

  return {
    tenant: currentTenant,
    tenantId: currentTenant?.id,
    userRole: orgMemberships.role,
    googleConnected,
  }
}

export const actions = {
  signout: async ({
    locals: { supabase, safeGetSession },
  }: {
    locals: {
      supabase: SupabaseClient
      safeGetSession: () => Promise<{
        session: Session | null
        user: User | null
        amr: AMREntry[] | null
      }>
    }
  }) => {
    const { session } = await safeGetSession()
    if (session) {
      await supabase.auth.signOut()
      redirect(303, "/")
    }
  },
}
