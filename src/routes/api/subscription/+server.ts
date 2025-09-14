import { json, error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import {
  getOrCreateCustomerId,
  fetchSubscription,
  cancelSubscription,
  reactivateSubscription,
  updateSubscription,
  getUpcomingInvoice,
  listPaymentMethods,
} from "../../(admin)/account/subscription_helpers.server"

export const GET: RequestHandler = async ({
  locals: { safeGetSession, supabaseServiceRole },
}) => {
  try {
    const { session, user } = await safeGetSession()
    if (!session || !user) {
      error(401, "Unauthorized")
    }

    const { error: customerError, customerId } = await getOrCreateCustomerId({
      supabaseServiceRole,
      user,
    })

    if (customerError || !customerId) {
      console.error("Error getting customer:", customerError)
      error(500, "Unable to retrieve customer information")
    }

    const subscriptionResult = await fetchSubscription({ customerId })

    if (subscriptionResult.error) {
      console.error("Error fetching subscription:", subscriptionResult.error)
      error(500, "Unable to retrieve subscription details")
    }

    const { paymentMethods, error: pmError } = await listPaymentMethods({
      customerId,
    })

    if (pmError) {
      console.error("Error fetching payment methods:", pmError)
    }

    return json({
      ...subscriptionResult,
      paymentMethods: paymentMethods || [],
      customerId,
    })
  } catch (err) {
    console.error("Subscription API error:", err)
    error(500, "Internal server error")
  }
}

export const POST: RequestHandler = async ({
  request,
  locals: { safeGetSession, supabaseServiceRole },
}) => {
  try {
    const { session, user } = await safeGetSession()
    if (!session || !user) {
      error(401, "Unauthorized")
    }

    const { action, ...params } = await request.json()

    const { error: customerError, customerId } = await getOrCreateCustomerId({
      supabaseServiceRole,
      user,
    })

    if (customerError || !customerId) {
      console.error("Error getting customer:", customerError)
      error(500, "Unable to retrieve customer information")
    }

    switch (action) {
      case "cancel": {
        const { subscriptionId, cancelAtPeriodEnd = true, reason } = params

        if (!subscriptionId) {
          error(400, "Subscription ID required")
        }

        const result = await cancelSubscription({
          subscriptionId,
          cancelAtPeriodEnd,
          cancellationReason: reason,
        })

        if (result.error) {
          console.error("Error canceling subscription:", result.error)
          error(500, "Unable to cancel subscription")
        }

        return json({
          success: true,
          subscription: result.subscription,
          message: cancelAtPeriodEnd
            ? "Subscription will be canceled at the end of the current period"
            : "Subscription canceled immediately",
        })
      }

      case "reactivate": {
        const { subscriptionId } = params

        if (!subscriptionId) {
          error(400, "Subscription ID required")
        }

        const result = await reactivateSubscription({ subscriptionId })

        if (result.error) {
          console.error("Error reactivating subscription:", result.error)
          error(500, "Unable to reactivate subscription")
        }

        return json({
          success: true,
          subscription: result.subscription,
          message: "Subscription reactivated successfully",
        })
      }

      case "update": {
        const { subscriptionId, newPriceId, prorationBehavior } = params

        if (!subscriptionId || !newPriceId) {
          error(400, "Subscription ID and new price ID required")
        }

        const result = await updateSubscription({
          subscriptionId,
          newPriceId,
          prorationBehavior,
        })

        if (result.error) {
          console.error("Error updating subscription:", result.error)
          error(500, "Unable to update subscription")
        }

        return json({
          success: true,
          subscription: result.subscription,
          message: "Subscription updated successfully",
        })
      }

      case "preview_update": {
        const { subscriptionId, newPriceId } = params

        if (!subscriptionId || !newPriceId) {
          error(400, "Subscription ID and new price ID required")
        }

        const result = await getUpcomingInvoice({
          customerId,
          subscriptionId,
          newPriceId,
        })

        if (result.error) {
          console.error("Error previewing invoice:", result.error)
          error(500, "Unable to preview subscription changes")
        }

        return json({
          success: true,
          invoice: result.invoice,
          prorationAmount: 0, // Unable to calculate proration without invoice API
          currency: "usd", // Default currency
        })
      }

      default:
        error(400, `Unknown action: ${action}`)
    }
  } catch (err) {
    console.error("Subscription management error:", err)
    error(500, "Internal server error")
  }
}
