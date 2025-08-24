import { error, json } from "@sveltejs/kit"
import Stripe from "stripe"
import type { RequestHandler } from "./$types"

// Initialize Stripe with modern configuration - lazy load to avoid build-time dependencies
let stripe: Stripe | null = null
function getStripe() {
  if (!stripe) {
    const apiKey = process.env.PRIVATE_STRIPE_API_KEY
    if (!apiKey) {
      throw new Error("PRIVATE_STRIPE_API_KEY is not set")
    }
    stripe = new Stripe(apiKey, {
      apiVersion: "2024-12-18.acacia",
      maxNetworkRetries: 3,
      timeout: 10000,
      appInfo: {
        name: "AptlySaid",
        version: "1.0.0",
        url: "https://aptlysaid.com",
      },
    })
  }
  return stripe
}

export const POST: RequestHandler = async ({
  request,
  locals: { supabaseServiceRole },
}) => {
  // const _supabase = supabaseServiceRole // Available if needed
  try {
    // Get webhook secret at runtime (it's optional in the environment)
    const webhookSecret =
      import.meta.env?.PRIVATE_STRIPE_WEBHOOK_SECRET ||
      process.env.PRIVATE_STRIPE_WEBHOOK_SECRET

    // Validate webhook secret is configured
    if (!webhookSecret) {
      console.error("Stripe webhook secret not configured")
      error(500, "Webhook configuration error")
    }

    // Get the raw body and signature
    const body = await request.text()
    const signature = request.headers.get("stripe-signature")

    if (!signature) {
      console.error("Missing Stripe signature header")
      error(400, "Missing signature")
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = getStripe().webhooks.constructEvent(
        body,
        signature,
        webhookSecret,
      )
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message)
      error(400, `Webhook Error: ${err.message}`)
    }

    // Log webhook event for debugging
    console.log(`Received webhook event: ${event.type} (${event.id})`)

    // Handle different event types
    switch (event.type) {
      case "customer.subscription.created":
        await handleSubscriptionCreated(
          event.data.object as Stripe.Subscription,
        )
        break

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(
          event.data.object as Stripe.Subscription,
        )
        break

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(
          event.data.object as Stripe.Subscription,
        )
        break

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(event.data.object as Stripe.Subscription)
        break

      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(
          event.data.object as Stripe.Checkout.Session,
        )
        break

      case "customer.created":
        await handleCustomerCreated(event.data.object as Stripe.Customer)
        break

      case "customer.updated":
        await handleCustomerUpdated(event.data.object as Stripe.Customer)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    // Return success response
    return json({ received: true, event_id: event.id })
  } catch (err) {
    console.error("Webhook processing error:", err)

    // Return appropriate error response
    if (err.status) {
      error(err.status, err.body || "Webhook processing failed")
    }

    error(500, "Internal webhook error")
  }
}

// Event handlers
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log(`Subscription created: ${subscription.id}`)

  try {
    // Find user by customer ID
    const { data: customer } = await supabase
      .from("stripe_customers")
      .select("id")
      .eq("stripe_customer_id", subscription.customer as string)
      .single()

    if (!customer) {
      console.error(`No user found for customer: ${subscription.customer}`)
      return
    }

    // Log subscription creation
    await logWebhookEvent({
      event_type: "subscription.created",
      user_id: customer.id,
      stripe_customer_id: subscription.customer as string,
      subscription_id: subscription.id,
      metadata: {
        status: subscription.status,
        plan_id: subscription.items.data[0]?.price?.id,
        trial_end: subscription.trial_end,
      },
    })

    console.log(`Subscription created successfully for user: ${customer.id}`)
  } catch (error) {
    console.error("Error handling subscription created:", error)
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  console.log(`Subscription updated: ${subscription.id}`)

  try {
    // Find user by customer ID
    const { data: customer } = await supabase
      .from("stripe_customers")
      .select("id")
      .eq("stripe_customer_id", subscription.customer as string)
      .single()

    if (!customer) {
      console.error(`No user found for customer: ${subscription.customer}`)
      return
    }

    // Log subscription update
    await logWebhookEvent({
      event_type: "subscription.updated",
      user_id: customer.id,
      stripe_customer_id: subscription.customer as string,
      subscription_id: subscription.id,
      metadata: {
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end,
        current_period_end: subscription.current_period_end,
        plan_id: subscription.items.data[0]?.price?.id,
      },
    })

    // Handle specific status changes
    if (subscription.status === "canceled") {
      console.log(`Subscription canceled for user: ${customer.id}`)
      // Could trigger email notification here
    } else if (subscription.status === "past_due") {
      console.log(`Subscription past due for user: ${customer.id}`)
      // Could trigger dunning management here
    }
  } catch (error) {
    console.error("Error handling subscription updated:", error)
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  console.log(`Subscription deleted: ${subscription.id}`)

  try {
    // Find user by customer ID
    const { data: customer } = await supabase
      .from("stripe_customers")
      .select("id")
      .eq("stripe_customer_id", subscription.customer as string)
      .single()

    if (!customer) {
      console.error(`No user found for customer: ${subscription.customer}`)
      return
    }

    // Log subscription deletion
    await logWebhookEvent({
      event_type: "subscription.deleted",
      user_id: customer.id,
      stripe_customer_id: subscription.customer as string,
      subscription_id: subscription.id,
      metadata: {
        ended_at: subscription.ended_at,
        canceled_at: subscription.canceled_at,
      },
    })

    console.log(`Subscription deleted for user: ${customer.id}`)
  } catch (error) {
    console.error("Error handling subscription deleted:", error)
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  console.log(`Invoice payment succeeded: ${invoice.id}`)

  try {
    if (invoice.billing_reason === "subscription_create") {
      // First payment for a new subscription
      console.log("First payment completed for new subscription")
    } else if (invoice.billing_reason === "subscription_cycle") {
      // Recurring payment
      console.log("Recurring payment completed")
    }

    // Log successful payment
    await logWebhookEvent({
      event_type: "invoice.payment_succeeded",
      user_id: null, // Could fetch from customer ID if needed
      stripe_customer_id: invoice.customer as string,
      subscription_id: invoice.subscription as string,
      metadata: {
        amount_paid: invoice.amount_paid,
        currency: invoice.currency,
        billing_reason: invoice.billing_reason,
      },
    })
  } catch (error) {
    console.error("Error handling invoice payment succeeded:", error)
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  console.log(`Invoice payment failed: ${invoice.id}`)

  try {
    // Find user by customer ID for notifications
    const { data: customer } = await supabase
      .from("stripe_customers")
      .select("id")
      .eq("stripe_customer_id", invoice.customer as string)
      .single()

    // Log failed payment
    await logWebhookEvent({
      event_type: "invoice.payment_failed",
      user_id: customer?.id || null,
      stripe_customer_id: invoice.customer as string,
      subscription_id: invoice.subscription as string,
      metadata: {
        amount_due: invoice.amount_due,
        currency: invoice.currency,
        attempt_count: invoice.attempt_count,
        next_payment_attempt: invoice.next_payment_attempt,
      },
    })

    if (customer) {
      console.log(`Payment failed for user: ${customer.id}`)
      // Could trigger email notification here
    }
  } catch (error) {
    console.error("Error handling invoice payment failed:", error)
  }
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  console.log(`Trial will end: ${subscription.id}`)

  try {
    // Find user by customer ID
    const { data: customer } = await supabase
      .from("stripe_customers")
      .select("id")
      .eq("stripe_customer_id", subscription.customer as string)
      .single()

    if (!customer) {
      console.error(`No user found for customer: ${subscription.customer}`)
      return
    }

    // Log trial ending
    await logWebhookEvent({
      event_type: "subscription.trial_will_end",
      user_id: customer.id,
      stripe_customer_id: subscription.customer as string,
      subscription_id: subscription.id,
      metadata: {
        trial_end: subscription.trial_end,
      },
    })

    console.log(`Trial ending soon for user: ${customer.id}`)
    // Could trigger trial ending notification here
  } catch (error) {
    console.error("Error handling trial will end:", error)
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
) {
  console.log(`Checkout session completed: ${session.id}`)

  try {
    // Log checkout completion
    await logWebhookEvent({
      event_type: "checkout.session.completed",
      user_id: session.metadata?.user_id || null,
      stripe_customer_id: session.customer as string,
      subscription_id: session.subscription as string,
      metadata: {
        mode: session.mode,
        amount_total: session.amount_total,
        currency: session.currency,
        payment_status: session.payment_status,
      },
    })

    if (session.mode === "subscription") {
      console.log("Subscription checkout completed successfully")
    }
  } catch (error) {
    console.error("Error handling checkout session completed:", error)
  }
}

async function handleCustomerCreated(customer: Stripe.Customer) {
  console.log(`Customer created: ${customer.id}`)

  try {
    // Log customer creation
    await logWebhookEvent({
      event_type: "customer.created",
      user_id: customer.metadata?.user_id || null,
      stripe_customer_id: customer.id,
      subscription_id: null,
      metadata: {
        email: customer.email,
        name: customer.name,
      },
    })
  } catch (error) {
    console.error("Error handling customer created:", error)
  }
}

async function handleCustomerUpdated(customer: Stripe.Customer) {
  console.log(`Customer updated: ${customer.id}`)

  try {
    // Log customer update
    await logWebhookEvent({
      event_type: "customer.updated",
      user_id: customer.metadata?.user_id || null,
      stripe_customer_id: customer.id,
      subscription_id: null,
      metadata: {
        email: customer.email,
        name: customer.name,
      },
    })
  } catch (error) {
    console.error("Error handling customer updated:", error)
  }
}

// Utility function to log webhook events for debugging and audit
async function logWebhookEvent({
  event_type,
  user_id,
  stripe_customer_id,
  subscription_id,
  metadata,
}: {
  event_type: string
  user_id: string | null
  stripe_customer_id: string | null
  subscription_id: string | null
  metadata: Record<string, any>
}) {
  try {
    // Note: You might want to create a dedicated table for webhook events
    // For now, this is just logging to console, but you could store in database
    console.log("Webhook Event:", {
      event_type,
      user_id,
      stripe_customer_id,
      subscription_id,
      metadata,
      timestamp: new Date().toISOString(),
    })

    // Example: Store in a webhook_events table (uncomment if you create the table)
    /*
    await supabase
      .from("webhook_events")
      .insert({
        event_type,
        user_id,
        stripe_customer_id,
        subscription_id,
        metadata,
        processed_at: new Date().toISOString()
      })
    */
  } catch (error) {
    console.error("Error logging webhook event:", error)
  }
}
