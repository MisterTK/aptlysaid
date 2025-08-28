import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { ResponsePublisherService } from "$lib/services/response-publisher"
import { GoogleMyBusinessWrapperV3 } from "$lib/services/google-my-business-wrapper-v2"

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    console.log("POST /api/reviews/publish - Starting")

    // Use consistent authentication pattern
    console.log("POST /api/reviews/publish - Getting session")
    let session
    try {
      session = await locals.safeGetSession()
      console.log("POST /api/reviews/publish - Session obtained:", !!session)
    } catch (sessionError) {
      console.error("POST /api/reviews/publish - Session error:", sessionError)
      return json(
        {
          error: "Authentication failed",
          details:
            sessionError instanceof Error
              ? sessionError.message
              : String(sessionError),
        },
        { status: 401 },
      )
    }

    if (!session) {
      console.log("POST /api/reviews/publish - No session")
      return json({ error: "Unauthorized" }, { status: 401 })
    }

    const user = session.user
    console.log("POST /api/reviews/publish - User:", user?.id)

    console.log("POST /api/reviews/publish - Parsing request body")
    let body, responseId, action
    try {
      body = await request.json()
      // Support both old and new field names for backwards compatibility
      responseId = body.responseId || body.aiResponseId || body.response_id
      action = body.action
      console.log("POST /api/reviews/publish - Request parsed successfully:", {
        responseId,
        action,
        bodyKeys: Object.keys(body),
      })
    } catch (parseError) {
      console.error(
        "POST /api/reviews/publish - Failed to parse request body:",
        parseError,
      )
      return json(
        {
          error: "Invalid request body",
          details:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
        },
        { status: 400 },
      )
    }

    if (!responseId || !action) {
      return json(
        { error: "Missing required fields (responseId and action)" },
        { status: 400 },
      )
    }

    // Use consistent tenant access pattern like other endpoints
    const tenantId = cookies.get("current_tenant_id")
    if (!tenantId) {
      console.log("POST /api/reviews/publish - No tenant ID in cookies")
      return json({ error: "No tenant selected" }, { status: 400 })
    }

    console.log(
      "POST /api/reviews/publish - Using tenant from cookies:",
      tenantId,
    )

    const tenant = { id: tenantId }
    console.log("POST /api/reviews/publish - Found tenant:", tenant.id)

    // First check if token exists and its status (match wrapper's exact query)
    const { data: tokenCheck } = await locals.supabaseServiceRole
      .from("oauth_tokens")
      .select("id, status, expires_at")
      .eq("tenant_id", tenant.id)
      .eq("provider", "google")
      .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
      .single()

    console.log("POST /api/reviews/publish - Token check:", {
      exists: !!tokenCheck,
      status: tokenCheck?.status,
      expires_at: tokenCheck?.expires_at,
      isExpired: tokenCheck
        ? new Date(tokenCheck.expires_at) < new Date()
        : null,
    })

    console.log(
      "POST /api/reviews/publish - Creating GoogleMyBusinessWrapperV3",
    )

    let googleWrapper, googleService
    try {
      googleWrapper = new GoogleMyBusinessWrapperV3(
        locals.supabaseServiceRole,
        {
          clientId: process.env.PUBLIC_GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          encryptionKey: process.env.TOKEN_ENCRYPTION_KEY!,
        },
      )
      console.log("POST /api/reviews/publish - Wrapper created successfully")
    } catch (wrapperError) {
      console.error(
        "POST /api/reviews/publish - Wrapper creation failed:",
        wrapperError,
      )
      return json(
        {
          error: "Failed to initialize Google service wrapper",
          details:
            wrapperError instanceof Error
              ? wrapperError.message
              : String(wrapperError),
        },
        { status: 500 },
      )
    }

    console.log(
      "POST /api/reviews/publish - Attempting to create Google service",
    )
    try {
      googleService = await googleWrapper.createService(tenant.id)
      console.log(
        "POST /api/reviews/publish - Service creation completed, result:",
        !!googleService,
      )
    } catch (serviceError) {
      console.error(
        "POST /api/reviews/publish - Service creation threw error:",
        serviceError,
      )
      return json(
        {
          error: "Failed to create Google service",
          details:
            serviceError instanceof Error
              ? serviceError.message
              : String(serviceError),
        },
        { status: 500 },
      )
    }

    if (!googleService) {
      console.error("Google service creation failed for tenant:", tenant.id)
      console.error(
        "POST /api/reviews/publish - Service creation failed for tenant:",
        tenant.id,
        "Token check result:",
        tokenCheck,
      )
      return json(
        {
          error: "Google My Business service unavailable",
          message: tokenCheck
            ? `Token exists but service creation failed. Status: ${tokenCheck.status}, Expired: ${new Date(tokenCheck.expires_at) < new Date()}`
            : "No Google connection found. Please connect your account in Integrations.",
          needsConnection: !tokenCheck,
          needsReauth:
            tokenCheck &&
            (tokenCheck.status !== "active" ||
              new Date(tokenCheck.expires_at) < new Date()),
          tokenStatus: tokenCheck?.status,
          tokenExpired: tokenCheck
            ? new Date(tokenCheck.expires_at) < new Date()
            : null,
        },
        { status: 400 },
      )
    }
    console.log(
      "POST /api/reviews/publish - Google service created successfully",
    )

    console.log("POST /api/reviews/publish - Creating ResponsePublisherService")
    let publisherService
    try {
      publisherService = new ResponsePublisherService(
        locals.supabaseServiceRole,
        googleService,
      )
      console.log(
        "POST /api/reviews/publish - ResponsePublisherService created successfully",
      )
    } catch (publisherError) {
      console.error(
        "POST /api/reviews/publish - ResponsePublisherService creation failed:",
        publisherError,
      )
      return json(
        {
          error: "Failed to initialize publisher service",
          details:
            publisherError instanceof Error
              ? publisherError.message
              : String(publisherError),
        },
        { status: 500 },
      )
    }

    try {
      console.log("POST /api/reviews/publish - Processing action:", action)

      switch (action) {
        case "publish-single": {
          console.log(
            "POST /api/reviews/publish - Publishing single response:",
            responseId,
          )
          // Publish a single response immediately
          const result = await publisherService.publishSingleResponse(
            responseId,
            user?.id,
          )
          console.log("POST /api/reviews/publish - Publish result:", result)

          if (!result.success) {
            console.error(
              "POST /api/reviews/publish - Publish failed:",
              result.error,
            )
            return json(
              { error: result.error || "Failed to publish response" },
              { status: 500 },
            )
          }

          return json(result)
        }

        case "queue-single": {
          console.log(
            "POST /api/reviews/publish - Queueing single response:",
            responseId,
          )
          // Check if already queued
          const { data: existingQueue } = await locals.supabaseServiceRole
            .from("response_queue")
            .select("id, status")
            .eq("response_id", responseId)
            .maybeSingle()

          if (existingQueue) {
            return json({
              success: true,
              queued: 0,
              message: `Response already ${existingQueue.status === "pending" ? "queued" : existingQueue.status}`,
            })
          }

          // Get review_id and location_id for the AI response
          console.log(
            "POST /api/reviews/publish - Fetching AI response:",
            responseId,
          )
          const { data: aiResponse, error: fetchError } =
            await locals.supabaseServiceRole
              .from("ai_responses")
              .select(
                `
              review_id,
              reviews!inner(location_id)
            `,
              )
              .eq("id", responseId)
              .single()

          console.log("POST /api/reviews/publish - AI response fetch result:", {
            aiResponse,
            fetchError,
          })

          if (fetchError || !aiResponse) {
            console.error(
              "POST /api/reviews/publish - AI response not found:",
              fetchError,
            )
            return json({ error: "AI response not found" }, { status: 404 })
          }

          // Extract location_id from the joined reviews data
          // The query structure returns reviews as an object with location_id property
          const locationId = aiResponse.reviews?.location_id

          if (!locationId) {
            console.error(
              "POST /api/reviews/publish - Missing location_id:",
              aiResponse,
            )
            return json(
              { error: "Location ID not found for this response" },
              { status: 400 },
            )
          }

          // Add to queue with required fields based on actual schema
          console.log(
            "POST /api/reviews/publish - Inserting into queue with data:",
            {
              tenant_id: tenant.id,
              response_id: responseId,
              location_id: locationId,
              aiResponseStructure: aiResponse,
            },
          )

          const { error: queueError } = await locals.supabaseServiceRole
            .from("response_queue")
            .insert({
              tenant_id: tenant.id,
              response_id: responseId,
              location_id: locationId,
              platform: "google",
              scheduled_for: new Date().toISOString(),
              status: "pending",
              max_attempts: 3,
              priority: 50,
            })

          if (queueError) {
            console.error(
              "POST /api/reviews/publish - Queue insertion failed:",
              queueError,
            )
            return json({ error: queueError.message }, { status: 500 })
          }

          console.log(
            "POST /api/reviews/publish - Successfully queued response",
          )
          return json({ success: true, queued: 1 })
        }

        default:
          return json({ error: "Invalid action" }, { status: 400 })
      }
    } catch (switchError) {
      console.error(
        "POST /api/reviews/publish - Error in switch statement:",
        switchError,
      )
      return json(
        {
          error: "Failed to process publish request",
          details:
            switchError instanceof Error
              ? switchError.message
              : String(switchError),
        },
        { status: 500 },
      )
    }
  } catch (err) {
    console.error("POST /api/reviews/publish - General error:", err)
    return json(
      {
        error: "Failed to publish response",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}

export const PUT: RequestHandler = async ({ request, locals, cookies }) => {
  try {
    // Use consistent authentication pattern
    const session = await locals.safeGetSession()
    if (!session) {
      return json({ error: "Unauthorized" }, { status: 401 })
    }

    // const user = session.user
    const body = await request.json()
    const { action } = body

    if (!action) {
      return json({ error: "Missing required fields" }, { status: 400 })
    }

    // Use consistent tenant access pattern like other endpoints
    const tenantId = cookies.get("current_tenant_id")
    if (!tenantId) {
      return json({ error: "No tenant selected" }, { status: 400 })
    }

    const tenant = { id: tenantId }

    // First check if token exists and its status (match wrapper's exact query)
    const { data: tokenCheck } = await locals.supabaseServiceRole
      .from("oauth_tokens")
      .select("id, status, expires_at")
      .eq("tenant_id", tenant.id)
      .eq("provider", "google")
      .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
      .single()

    console.log("PUT /api/reviews/publish - Token check:", {
      exists: !!tokenCheck,
      status: tokenCheck?.status,
      expires_at: tokenCheck?.expires_at,
      isExpired: tokenCheck
        ? new Date(tokenCheck.expires_at) < new Date()
        : null,
    })

    const googleWrapper = new GoogleMyBusinessWrapperV3(
      locals.supabaseServiceRole,
      {
        clientId: process.env.PUBLIC_GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        encryptionKey: process.env.TOKEN_ENCRYPTION_KEY!,
      },
    )

    console.log("Creating Google service for tenant:", tenant.id)
    const googleService = await googleWrapper.createService(tenant.id)
    if (!googleService) {
      console.error("Google service creation failed for tenant:", tenant.id)
      console.log(
        "PUT /api/reviews/publish - Service creation failed for tenant:",
        tenant.id,
      )
      return json(
        {
          error: "Google My Business service unavailable",
          message: tokenCheck
            ? `Token exists but service creation failed. Status: ${tokenCheck.status}, Expired: ${new Date(tokenCheck.expires_at) < new Date()}`
            : "No Google connection found. Please connect your account in Integrations.",
          needsConnection: !tokenCheck,
          needsReauth:
            tokenCheck &&
            (tokenCheck.status !== "active" ||
              new Date(tokenCheck.expires_at) < new Date()),
          tokenStatus: tokenCheck?.status,
          tokenExpired: tokenCheck
            ? new Date(tokenCheck.expires_at) < new Date()
            : null,
        },
        { status: 400 },
      )
    }

    const publisherService = new ResponsePublisherService(
      locals.supabaseServiceRole,
      googleService,
    )

    switch (action) {
      case "queue-all-approved": {
        // Add all approved responses to the queue
        const queuedCount = await publisherService.queueApprovedResponses(
          tenant.id,
        )
        return json({ success: true, queued: queuedCount })
      }

      case "process-queue": {
        // Process a batch from the queue
        const result = await publisherService.processBatch(
          tenant.id,
          5,
          user?.id,
        )
        return json(result)
      }

      case "retry-failed": {
        // Retry failed responses
        await publisherService.retryFailedResponses(tenant.id)
        return json({ success: true })
      }

      case "clear-failed": {
        // Clear failed responses
        await publisherService.clearFailedResponses(tenant.id)
        return json({ success: true })
      }

      case "queue-selected": {
        // Queue selected AI responses for publishing
        // Support both old and new field names for backwards compatibility
        const responseIds =
          body.responseIds || body.aiResponseIds || body.response_ids

        if (
          !responseIds ||
          !Array.isArray(responseIds) ||
          responseIds.length === 0
        ) {
          return json(
            { error: "responseIds array is required" },
            { status: 400 },
          )
        }

        const queuedCount = await publisherService.queueSelectedResponses(
          tenant.id,
          responseIds,
        )
        return json({ success: true, queued: queuedCount })
      }

      default:
        return json({ error: "Invalid action" }, { status: 400 })
    }
  } catch (err) {
    console.error("Error processing queue:", err)
    return json({ error: "Failed to process queue" }, { status: 500 })
  }
}

export const GET: RequestHandler = async ({ locals, cookies }) => {
  try {
    console.log("GET /api/reviews/publish - Starting")

    // Use consistent authentication pattern
    const session = await locals.safeGetSession()
    if (!session) {
      console.log("GET /api/reviews/publish - No session")
      return json({ error: "Unauthorized" }, { status: 401 })
    }

    // const user = session.user

    // Use consistent tenant access pattern like other endpoints
    const tenantId = cookies.get("current_tenant_id")
    if (!tenantId) {
      console.log("GET /api/reviews/publish - No tenant ID in cookies")
      return json({ error: "No tenant selected" }, { status: 400 })
    }

    console.log(
      "GET /api/reviews/publish - Using tenant from cookies:",
      tenantId,
    )

    const tenant = { id: tenantId }
    console.log("GET /api/reviews/publish - Tenant:", tenant.id)

    console.log("GET /api/reviews/publish - Creating GoogleWrapper")
    const googleWrapper = new GoogleMyBusinessWrapperV3(
      locals.supabaseServiceRole,
      {
        clientId: process.env.PUBLIC_GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        encryptionKey: process.env.TOKEN_ENCRYPTION_KEY!,
      },
    )

    console.log(
      "GET /api/reviews/publish - Creating Google service for tenant:",
      tenant.id,
    )

    // First check if token exists at all
    const { data: tokenCheck } = await locals.supabaseServiceRole
      .from("oauth_tokens")
      .select("id, status, expires_at")
      .eq("tenant_id", tenant.id)
      .eq("provider", "google")
      .single()

    console.log("GET /api/reviews/publish - Token check:", {
      exists: !!tokenCheck,
      status: tokenCheck?.status,
      expires_at: tokenCheck?.expires_at,
      isExpired: tokenCheck
        ? new Date(tokenCheck.expires_at) < new Date()
        : null,
    })

    console.log("Creating Google service for tenant:", tenant.id)
    const googleService = await googleWrapper.createService(tenant.id)
    if (!googleService) {
      console.error("Google service creation failed for tenant:", tenant.id)
      console.log(
        "GET /api/reviews/publish - No Google service created for tenant:",
        tenant.id,
      )

      // Return more detailed error
      return json(
        {
          error: "Google My Business service unavailable",
          message: tokenCheck
            ? `Token exists but service creation failed. Status: ${tokenCheck.status}, Expired: ${new Date(tokenCheck.expires_at) < new Date()}`
            : "No Google connection found. Please connect your account in Integrations.",
          needsConnection: !tokenCheck,
          needsReauth:
            tokenCheck &&
            (tokenCheck.status !== "active" ||
              new Date(tokenCheck.expires_at) < new Date()),
          tokenStatus: tokenCheck?.status,
          tokenExpired: tokenCheck
            ? new Date(tokenCheck.expires_at) < new Date()
            : null,
        },
        { status: 400 },
      )
    }

    console.log("GET /api/reviews/publish - Creating publisher service")
    const publisherService = new ResponsePublisherService(
      locals.supabaseServiceRole,
      googleService,
    )

    console.log("GET /api/reviews/publish - Getting queue status")
    const status = await publisherService.getQueueStatus(tenant.id)

    console.log("GET /api/reviews/publish - Returning status:", status)
    return json(status)
  } catch (err) {
    console.error("Error getting queue status:", err)
    return json(
      {
        error:
          err instanceof Error ? err.message : "Failed to get queue status",
      },
      { status: 500 },
    )
  }
}
