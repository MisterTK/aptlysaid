import { error, redirect } from "@sveltejs/kit"
import {
  fetchSubscription,
  getOrCreateCustomerId,
  createCheckoutSession,
} from "../../subscription_helpers.server"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({
  params,
  url,
  locals: { safeGetSession, supabaseServiceRole },
}) => {
  const { session, user } = await safeGetSession()
  if (!session || !user) {
    redirect(303, "/login")
  }

  if (params.slug === "free_plan") {
    redirect(303, "/account")
  }

  const { error: idError, customerId } = await getOrCreateCustomerId({
    supabaseServiceRole,
    user,
  })

  if (idError || !customerId) {
    console.error("Error creating customer:", idError)
    error(500, {
      message:
        "Unable to create customer account. Please try again or contact support.",
    })
  }

  const { primarySubscription, error: subscriptionError } =
    await fetchSubscription({
      customerId,
    })

  if (subscriptionError) {
    console.error("Error fetching subscription:", subscriptionError)
    error(500, {
      message: "Unable to check subscription status. Please try again.",
    })
  }

  if (
    primarySubscription &&
    (primarySubscription.isActive || primarySubscription.isTrialing)
  ) {
    redirect(303, "/account/billing")
  }

  const { session: checkoutSession, error: checkoutError } =
    await createCheckoutSession({
      customerId,
      priceId: params.slug,
      successUrl: `${url.origin}/account?success=subscription`,
      cancelUrl: `${url.origin}/pricing?canceled=true`,
      mode: "subscription",
      allowPromotionCodes: true,
      metadata: {
        user_id: user.id,
        source: "subscription_page",
        price_id: params.slug,
      },
    })

  if (checkoutError || !checkoutSession?.url) {
    console.error("Error creating checkout session:", checkoutError)
    error(500, {
      message:
        "Unable to create checkout session. Please try again or contact support.",
    })
  }

  redirect(303, checkoutSession.url)
}
