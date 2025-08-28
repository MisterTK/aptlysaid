import { error, redirect } from "@sveltejs/kit"
import {
  fetchSubscription,
  getOrCreateCustomerId,
} from "../../subscription_helpers.server"
import type { PageServerLoad } from "./$types"

export const load: PageServerLoad = async ({
  locals: { safeGetSession, supabaseServiceRole },
}) => {
  const { session, user } = await safeGetSession()
  if (!session || !user?.id) {
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
        "Unable to access billing information. Please try again or contact support.",
    })
  }

  const subscriptionResult = await fetchSubscription({ customerId })

  if (subscriptionResult.error) {
    console.error("Error fetching subscription:", subscriptionResult.error)
    error(500, {
      message:
        "Unable to retrieve subscription details. Please try again or contact support.",
    })
  }

  const {
    primarySubscription,
    hasEverHadSubscription,
    hasActiveSubscription,
    hasTrialSubscription,
    hasCanceledSubscription,
    subscriptionCount,
  } = subscriptionResult

  return {

    isActiveCustomer: hasActiveSubscription,
    hasEverHadSubscription,
    currentPlanId: primarySubscription?.appSubscription?.id,

    subscription: primarySubscription
      ? {
          id: primarySubscription.stripeSubscription.id,
          status: primarySubscription.stripeSubscription.status,
          planName: primarySubscription.appSubscription.name,
          planId: primarySubscription.appSubscription.id,
          isActive: primarySubscription.isActive,
          isTrialing: primarySubscription.isTrialing,
          isPastDue: primarySubscription.isPastDue,
          isPaused: primarySubscription.isPaused,
          isCanceled: primarySubscription.isCanceled,
          willRenew: primarySubscription.willRenew,
          cancelAtPeriodEnd: primarySubscription.cancelAtPeriodEnd,
          trialEndsAt: primarySubscription.trialEndsAt,
          currentPeriodEndsAt: primarySubscription.currentPeriodEndsAt,
          daysUntilDue: primarySubscription.daysUntilDue,
          price: primarySubscription.appSubscription.price,
          interval: primarySubscription.appSubscription.priceIntervalName,
        }
      : null,

    subscriptionInsights: {
      hasActiveSubscription,
      hasTrialSubscription,
      hasCanceledSubscription,
      totalSubscriptions: subscriptionCount,
      hasMultipleSubscriptions: subscriptionCount > 1,
    },

    customerId,
  }
}
