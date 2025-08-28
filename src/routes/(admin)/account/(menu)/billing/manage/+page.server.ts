import { error, redirect } from "@sveltejs/kit"
import {
  getOrCreateCustomerId,
  createBillingPortalSession,
} from "../../../subscription_helpers.server"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({
  url,
  locals: { safeGetSession, supabaseServiceRole },
}) => {
  const { session, user } = await safeGetSession()
  if (!session || !user) {
    redirect(303, "/login")
  }

  const { error: idError, customerId } = await getOrCreateCustomerId({
    supabaseServiceRole,
    user,
  })

  if (idError || !customerId) {
    console.error("Error creating customer:", idError)
    error(500, {
      message:
        "Unable to access customer account. Please try again or contact support.",
    })
  }

  const { session: portalSession, error: portalError } =
    await createBillingPortalSession({
      customerId,
      returnUrl: `${url.origin}/account/billing?portal=closed`,
    })

  if (portalError || !portalSession?.url) {
    console.error("Error creating billing portal session:", portalError)
    error(500, {
      message:
        "Unable to access billing portal. Please try again or contact support.",
    })
  }

  redirect(303, portalSession.url)
}
