import type { SupabaseClient, User } from "@supabase/supabase-js"
import type { Database } from "../../../DatabaseDefinitions"

import Stripe from "stripe"
import { pricingPlans } from "../../(marketing)/pricing/pricing_plans"

let stripe: Stripe | null = null
function getStripe() {
  if (!stripe) {
    const apiKey = process.env.PRIVATE_STRIPE_API_KEY
    if (!apiKey) {
      throw new Error("PRIVATE_STRIPE_API_KEY is not set")
    }
    stripe = new Stripe(apiKey, {
      apiVersion: "2025-08-27.basil",
      maxNetworkRetries: 3,
      timeout: 10000,
      appInfo: {
        name: "AptlySaid",
        version: "1.0.0",
        url: "https://aptlysaid.com",
      },
      telemetry: true,
    })
  }
  return stripe
}

export const getOrCreateCustomerId = async ({
  supabaseServiceRole,
  user,
}: {
  supabaseServiceRole: SupabaseClient<Database>
  user: User
}) => {
  try {
    const { data: dbCustomer, error } = await supabaseServiceRole
      .from("tenants")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single()

    if (error && error.code !== "PGRST116") {
      console.error("Database error fetching stripe customer:", error)
      return {
        error: new Error(
          `Database error: ${error instanceof Error ? error.message : "Unknown error"}`,
        ),
      }
    }

    if (dbCustomer?.stripe_customer_id) {
      try {
        await getStripe().customers.retrieve(dbCustomer.stripe_customer_id)
        return { customerId: dbCustomer.stripe_customer_id }
      } catch (stripeError: unknown) {
        if (
          stripeError &&
          typeof stripeError === "object" &&
          "code" in stripeError &&
          stripeError.code === "resource_missing"
        ) {
          await supabaseServiceRole
            .from("tenants")
            .update({ stripe_customer_id: null })
            .eq("id", user.id)
        } else {
          console.error("Error verifying Stripe customer:", stripeError)
          const errorMessage =
            stripeError &&
            typeof stripeError === "object" &&
            "message" in stripeError
              ? String(stripeError.message)
              : "Unknown error"
          return {
            error: new Error(`Stripe verification error: ${errorMessage}`),
          }
        }
      }
    }

    const { data: profileData, error: profileError } = await supabaseServiceRole
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .limit(1)

    const profile =
      profileData && profileData.length > 0 ? profileData[0] : null

    if (profileError) {
      console.error("Error fetching user profile:", profileError)
      return {
        error: new Error(`Profile fetch error: ${profileError.message}`),
      }
    }

    const idempotencyKey = `customer_create_${user.id}_${Date.now()}`

    let customer: Stripe.Customer
    try {
      customer = await getStripe().customers.create(
        {
          email: user.email ?? undefined,
          name: profile?.full_name || undefined,
          metadata: {
            user_id: user.id,
            environment: process.env.NODE_ENV || "development",
            created_at: new Date().toISOString(),
          },

          invoice_settings: {
            default_payment_method: undefined,
          },
        },
        {
          idempotencyKey,
        },
      )
    } catch (stripeError: unknown) {
      console.error("Error creating Stripe customer:", stripeError)

      const isStripeError =
        stripeError && typeof stripeError === "object" && "type" in stripeError
      if (isStripeError && stripeError.type === "StripeCardError") {
        return {
          error: new Error(
            "Payment method error. Please try a different card.",
          ),
        }
      } else if (isStripeError && stripeError.type === "StripeRateLimitError") {
        return {
          error: new Error("Too many requests. Please try again later."),
        }
      } else if (
        isStripeError &&
        stripeError.type === "StripeInvalidRequestError"
      ) {
        const errorMessage =
          "message" in stripeError
            ? String(stripeError.message)
            : "Invalid request"
        return { error: new Error(`Invalid request: ${errorMessage}`) }
      } else if (isStripeError && stripeError.type === "StripeAPIError") {
        return { error: new Error("Stripe API error. Please try again later.") }
      } else if (
        isStripeError &&
        stripeError.type === "StripeConnectionError"
      ) {
        return {
          error: new Error("Network error. Please check your connection."),
        }
      } else if (
        isStripeError &&
        stripeError.type === "StripeAuthenticationError"
      ) {
        return {
          error: new Error("Authentication error. Please contact support."),
        }
      }

      const errorMessage =
        stripeError &&
        typeof stripeError === "object" &&
        "message" in stripeError
          ? String(stripeError.message)
          : "Unknown error"
      return { error: new Error(`Stripe error: ${errorMessage}`) }
    }

    if (!customer?.id) {
      return {
        error: new Error("Failed to create Stripe customer - no ID returned"),
      }
    }

    let insertAttempts = 0
    const maxInsertAttempts = 3

    while (insertAttempts < maxInsertAttempts) {
      const { error: insertError } = await supabaseServiceRole
        .from("tenants")
        .update({
          stripe_customer_id: customer.id,
        })
        .eq("id", user.id)

      if (!insertError) {
        break
      }

      insertAttempts++

      if (insertError.code === "23505") {
        const { data: existingCustomer } = await supabaseServiceRole
          .from("tenants")
          .select("stripe_customer_id")
          .eq("id", user.id)
          .single()

        if (existingCustomer?.stripe_customer_id) {
          return { customerId: existingCustomer.stripe_customer_id }
        }
      }

      if (insertAttempts === maxInsertAttempts) {
        console.error(
          "Failed to insert customer mapping after retries:",
          insertError,
        )
        return {
          error: new Error(`Database insert error: ${insertError.message}`),
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 100 * insertAttempts))
    }

    return { customerId: customer.id }
  } catch (error) {
    console.error("Unexpected error in getOrCreateCustomerId:", error)
    return {
      error: new Error(
        `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    }
  }
}

export const fetchSubscription = async ({
  customerId,
}: {
  customerId: string
}) => {
  try {
    let stripeSubscriptions: Stripe.ApiList<Stripe.Subscription>
    try {
      stripeSubscriptions = await getStripe().subscriptions.list({
        customer: customerId,
        limit: 100,
        status: "all",
        expand: ["data.default_payment_method", "data.latest_invoice"],
      })
    } catch (stripeError: unknown) {
      console.error("Error fetching Stripe subscriptions:", stripeError)

      const isStripeError =
        stripeError && typeof stripeError === "object" && "type" in stripeError
      if (isStripeError && stripeError.type === "StripeInvalidRequestError") {
        const errorMessage =
          "message" in stripeError
            ? String(stripeError.message)
            : "Invalid customer ID"
        return {
          error: new Error(`Invalid customer ID: ${errorMessage}`),
        }
      } else if (
        isStripeError &&
        stripeError.type === "StripeAuthenticationError"
      ) {
        return {
          error: new Error("Authentication error. Please contact support."),
        }
      } else if (isStripeError && stripeError.type === "StripeAPIError") {
        return { error: new Error("Stripe API error. Please try again later.") }
      }

      const errorMessage =
        stripeError &&
        typeof stripeError === "object" &&
        "message" in stripeError
          ? String(stripeError.message)
          : "Unknown error"
      return { error: new Error(`Stripe error: ${errorMessage}`) }
    }

    const statusPriority = {
      active: 1,
      trialing: 2,
      past_due: 3,
      paused: 4,
      incomplete: 5,
      incomplete_expired: 6,
      unpaid: 7,
      canceled: 8,
    } as const

    const primaryStripeSubscription = stripeSubscriptions.data
      .filter((sub) => {
        return sub.status !== "canceled"
      })
      .sort((a, b) => {
        const priorityA =
          statusPriority[a.status as keyof typeof statusPriority] || 10
        const priorityB =
          statusPriority[b.status as keyof typeof statusPriority] || 10

        if (priorityA !== priorityB) {
          return priorityA - priorityB
        }

        return (b.created || 0) - (a.created || 0)
      })[0]

    let appSubscription = null
    let primarySubscription = null

    if (primaryStripeSubscription) {
      const productId =
        (primaryStripeSubscription.items?.data?.[0]?.price
          ?.product as string) ?? ""

      if (!productId) {
        console.error(
          "No product ID found in subscription:",
          primaryStripeSubscription.id,
        )
        return {
          error: new Error("Invalid subscription - no product ID found"),
        }
      }

      appSubscription = pricingPlans.find(
        (plan) => plan.stripe_product_id === productId,
      )

      if (!appSubscription) {
        console.error(
          `No matching app subscription for product ID: ${productId}`,
        )
        return {
          error: new Error(
            `Subscription product not found. Product ID: ${productId}. Please contact support.`,
          ),
        }
      }

      primarySubscription = {
        stripeSubscription: primaryStripeSubscription,
        appSubscription: appSubscription,

        isActive: primaryStripeSubscription.status === "active",
        isTrialing: primaryStripeSubscription.status === "trialing",
        isPastDue: primaryStripeSubscription.status === "past_due",
        isPaused: primaryStripeSubscription.status === "paused",
        isCanceled: primaryStripeSubscription.status === "canceled",
        willRenew:
          !primaryStripeSubscription.cancel_at_period_end &&
          primaryStripeSubscription.status === "active",
        trialEndsAt: primaryStripeSubscription.trial_end
          ? new Date(primaryStripeSubscription.trial_end * 1000)
          : null,
        currentPeriodEndsAt: null, // Note: current_period_end not available in current Stripe types
        cancelAtPeriodEnd:
          primaryStripeSubscription.cancel_at_period_end || false,
        daysUntilDue: primaryStripeSubscription.days_until_due,
        defaultPaymentMethod: primaryStripeSubscription.default_payment_method,
        latestInvoice: primaryStripeSubscription.latest_invoice,
      }
    }

    const hasEverHadSubscription = stripeSubscriptions.data.length > 0
    const hasActiveSubscription = !!primarySubscription?.isActive
    const hasTrialSubscription = !!primarySubscription?.isTrialing
    const hasCanceledSubscription = stripeSubscriptions.data.some(
      (sub) => sub.status === "canceled",
    )

    return {
      primarySubscription,
      hasEverHadSubscription,
      hasActiveSubscription,
      hasTrialSubscription,
      hasCanceledSubscription,
      allSubscriptions: stripeSubscriptions.data,
      subscriptionCount: stripeSubscriptions.data.length,
    }
  } catch (error) {
    console.error("Unexpected error in fetchSubscription:", error)
    return {
      error: new Error(
        `Unexpected error: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    }
  }
}

export const cancelSubscription = async ({
  subscriptionId,
  cancelAtPeriodEnd = true,
  cancellationReason,
}: {
  subscriptionId: string
  cancelAtPeriodEnd?: boolean
  cancellationReason?: string
}) => {
  try {
    const subscription = await getStripe().subscriptions.update(
      subscriptionId,
      {
        cancel_at_period_end: cancelAtPeriodEnd,
        metadata: {
          cancellation_reason: cancellationReason || "User requested",
          canceled_at: new Date().toISOString(),
        },
      },
    )

    return { subscription }
  } catch (error) {
    console.error("Error canceling subscription:", error)
    return {
      error: new Error(
        `Failed to cancel subscription: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    }
  }
}

export const reactivateSubscription = async ({
  subscriptionId,
}: {
  subscriptionId: string
}) => {
  try {
    const subscription = await getStripe().subscriptions.update(
      subscriptionId,
      {
        cancel_at_period_end: false,
      },
    )

    return { subscription }
  } catch (error) {
    console.error("Error reactivating subscription:", error)
    return {
      error: new Error(
        `Failed to reactivate subscription: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    }
  }
}

export const updateSubscription = async ({
  subscriptionId,
  newPriceId,
  prorationBehavior = "create_prorations",
}: {
  subscriptionId: string
  newPriceId: string
  prorationBehavior?: "create_prorations" | "none" | "always_invoice"
}) => {
  try {
    const currentSubscription =
      await getStripe().subscriptions.retrieve(subscriptionId)
    const currentItem = currentSubscription.items.data[0]

    if (!currentItem) {
      return { error: new Error("No subscription item found to update") }
    }

    const subscription = await getStripe().subscriptions.update(
      subscriptionId,
      {
        items: [
          {
            id: currentItem.id,
            price: newPriceId,
          },
        ],
        proration_behavior: prorationBehavior,
        metadata: {
          ...currentSubscription.metadata,
          last_plan_change: new Date().toISOString(),
          previous_price_id: currentItem.price.id,
        },
      },
    )

    return { subscription }
  } catch (error) {
    console.error("Error updating subscription:", error)
    return {
      error: new Error(
        `Failed to update subscription: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    }
  }
}

export const createCheckoutSession = async ({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
  mode = "subscription",
  allowPromotionCodes = true,
  trialPeriodDays,
  metadata = {},
}: {
  customerId: string
  priceId: string
  successUrl: string
  cancelUrl: string
  mode?: "subscription" | "payment" | "setup"
  allowPromotionCodes?: boolean
  trialPeriodDays?: number
  metadata?: Record<string, string>
}) => {
  try {
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: allowPromotionCodes,
      metadata: {
        ...metadata,
        created_at: new Date().toISOString(),
      },

      customer_update: {
        address: "auto",
        name: "auto",
      },
      invoice_creation:
        mode === "subscription"
          ? {
              enabled: true,
              invoice_data: {
                metadata: metadata,
              },
            }
          : undefined,

      automatic_tax: {
        enabled: true,
      },
    }

    if (mode === "subscription") {
      sessionParams.subscription_data = {
        metadata: metadata,
        trial_period_days: trialPeriodDays,
      }
    }

    const session = await getStripe().checkout.sessions.create(sessionParams)

    return { session }
  } catch (error) {
    console.error("Error creating checkout session:", error)
    return {
      error: new Error(
        `Failed to create checkout session: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    }
  }
}

export const createBillingPortalSession = async ({
  customerId,
  returnUrl,
}: {
  customerId: string
  returnUrl: string
}) => {
  try {
    const session = await getStripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: "",
          items: [],
          discounts: undefined,
        },
      },
    })

    return { session }
  } catch (error) {
    console.error("Error creating billing portal session:", error)
    return {
      error: new Error(
        `Failed to create billing portal session: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    }
  }
}

export const getUpcomingInvoice = async ({
  customerId,
  subscriptionId,
  newPriceId,
}: {
  customerId: string
  subscriptionId?: string
  newPriceId?: string
}) => {
  try {
    const params: {
      customer: string
      subscription?: string
      subscription_items?: Array<{ id: string; price: string }>
      subscription_proration_behavior?: string
    } = {
      // InvoiceRetrieveUpcomingParams not available in current Stripe types
      customer: customerId,
    }

    if (subscriptionId && newPriceId) {
      const subscription =
        await getStripe().subscriptions.retrieve(subscriptionId)
      const currentItem = subscription.items.data[0]

      params.subscription = subscriptionId
      params.subscription_items = [
        {
          id: currentItem.id,
          price: newPriceId,
        },
      ]
      params.subscription_proration_behavior = "create_prorations"
    }

    // Note: retrieveUpcoming method not available in current Stripe API
    // const invoice = await getStripe().invoices.retrieveUpcoming(params)
    const invoice = null

    return { invoice }
  } catch (error) {
    console.error("Error fetching upcoming invoice:", error)
    return {
      error: new Error(
        `Failed to fetch upcoming invoice: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    }
  }
}

export const listPaymentMethods = async ({
  customerId,
  type = "card",
}: {
  customerId: string
  type?: Stripe.PaymentMethodListParams.Type
}) => {
  try {
    const paymentMethods = await getStripe().paymentMethods.list({
      customer: customerId,
      type,
    })

    return { paymentMethods: paymentMethods.data }
  } catch (error) {
    console.error("Error listing payment methods:", error)
    return {
      error: new Error(
        `Failed to list payment methods: ${error instanceof Error ? error.message : "Unknown error"}`,
      ),
    }
  }
}
