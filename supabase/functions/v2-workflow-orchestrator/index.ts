import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
}

// Retry utility
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxRetries - 1) throw error
      const delay = initialDelay * Math.pow(2, i)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

// TODO: [SECURITY] Implement proper token encryption using AES-256-GCM
// These are stub functions that MUST be replaced before production
// Consider using Supabase Vault or Web Crypto API for encryption
const decryptToken = (token) => token
const encryptToken = (token) => token
// External integrator client
class ExternalIntegratorClient {
  baseUrl
  authToken
  constructor(baseUrl, authToken) {
    this.baseUrl = baseUrl
    this.authToken = authToken
    this.generateResponse = (reviewContent, tenantSettings) =>
      this.request("generate-ai-response", {
        reviewContent,
        tenantSettings,
      })
    this.publishToGMB = (gmbReviewId, responseContent, tenantId) =>
      this.request("publish-to-gmb", {
        gmbReviewId,
        responseContent,
        tenantId,
      })
    this.syncGMBReviews = (locationId, tenantId) =>
      this.request("sync-gmb-reviews", {
        locationId,
        tenantId,
      })
    this.syncLocations = (tenantId, tokenId) =>
      this.request("sync-locations", {
        tenantId,
        tokenId,
      })
    this.refreshOAuthToken = (tenantId) =>
      this.request("refresh-oauth-token", {
        tenantId,
      })
  }
  async request(action, data) {
    return retryWithBackoff(async () => {
      // Append the action to the URL path as expected by the external integrator
      const url = `${this.baseUrl}/${action}`
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify(data),
      })
      if (!response.ok) {
        const error = new Error(
          `External integrator error: ${response.statusText}`,
        )
        error.status = response.status
        throw error
      }
      return response.json()
    }, action)
  }
  generateResponse
  publishToGMB
  syncGMBReviews
  syncLocations
  refreshOAuthToken
}
// Workflow step definitions
const workflowSteps = {
  async generateAIResponse(ctx, supabase) {
    // Support both field naming conventions
    const reviewId = ctx.reviewId || ctx.review_id
    const tenantId = ctx.tenantId || ctx.tenant_id
    // Debug logging
    await supabase.from("system_logs").insert({
      category: "workflow",
      log_level: "info",
      message: `Starting generateAIResponse step`,
      metadata: {
        reviewId,
        tenantId,
        context: ctx,
      },
    })
    if (!reviewId || !tenantId) {
      throw new Error(
        `Missing required context: reviewId=${reviewId}, tenantId=${tenantId}`,
      )
    }
    const { data: review } = await supabase
      .from("reviews")
      .select(
        "review_text, rating, platform_data, status, needs_response, response_source, has_owner_reply",
      )
      .eq("id", reviewId)
      .single()
    if (!review) throw new Error(`Review not found: ${reviewId}`)
    // Skip rating-only reviews
    if (!review.review_text?.trim()) {
      await supabase
        .from("reviews")
        .update({
          status: "responded",
          needs_response: false,
        })
        .eq("id", reviewId)
      return {
        skipped: true,
        reason: "rating_only",
      }
    }
    // Check if owner already responded manually via GMB
    const hasOwnerReply =
      review.response_source === "owner_external" ||
      review.has_owner_reply ||
      review.platform_data?.has_owner_reply ||
      review.platform_data?.reviewReply?.comment ||
      review.platform_data?.owner_reply_text
    if (hasOwnerReply) {
      await supabase
        .from("reviews")
        .update({
          status: "responded",
          needs_response: false,
          response_source: review.response_source || "owner_external",
        })
        .eq("id", reviewId)
      return {
        skipped: true,
        reason: "owner_already_responded",
      }
    }
    // Check if review is already marked as not needing response
    if (!review.needs_response || review.status === "responded") {
      return {
        skipped: true,
        reason: "no_response_needed",
      }
    }
    // Check if we already have an AI response for this review
    const { data: existingResponse } = await supabase
      .from("ai_responses")
      .select("id, status")
      .eq("review_id", reviewId)
      .eq("tenant_id", tenantId)
      .maybeSingle()
    if (existingResponse) {
      return {
        skipped: true,
        reason: "ai_response_exists",
        responseId: existingResponse.id,
      }
    }
    const { data: tenant } = await supabase
      .from("tenants")
      .select("settings")
      .eq("id", tenantId)
      .single()
    if (!tenant) throw new Error(`Tenant not found: ${tenantId}`)
    const baseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!baseUrl || !serviceKey) {
      throw new Error(
        "Missing environment configuration for external integrator",
      )
    }
    const client = new ExternalIntegratorClient(
      baseUrl + "/functions/v1/v2-external-integrator",
      serviceKey,
    )
    const aiResponse = await client.generateResponse(review.review_text, {
      ...tenant.settings,
      tenant_id: tenantId,
      reviewId,
      rating: review.rating || 3,
    })
    const { data: newResponse } = await supabase
      .from("ai_responses")
      .insert({
        review_id: reviewId,
        tenant_id: tenantId,
        response_text: aiResponse.content,
        tone:
          review.rating >= 4
            ? "grateful"
            : review.rating <= 2
              ? "empathetic"
              : "professional",
        status: "draft",
        ai_model: aiResponse.model || "unknown",
        generation_tokens:
          aiResponse.metadata?.generationTokens ||
          aiResponse.metadata?.totalTokens,
        generation_time_ms: aiResponse.metadata?.generationTimeMs,
        response_language: "en",
        metadata: aiResponse.metadata || {},
      })
      .select("id")
      .single()
    await supabase
      .from("reviews")
      .update({
        status: "processing",
        response_source: "ai",
      })
      .eq("id", reviewId)
    return {
      createdResponseId: newResponse.id,
    }
  },
  async waitForApproval(ctx, supabase) {
    if (ctx.skipped && ctx.reason === "rating_only") {
      return {
        completed: true,
        skipped: true,
        reason: "rating_only",
      }
    }
    const { createdResponseId, reviewId, tenantId } = ctx
    if (!createdResponseId || !reviewId || !tenantId) {
      throw new Error(
        `Missing context for approval check: responseId=${createdResponseId}, reviewId=${reviewId}, tenantId=${tenantId}`,
      )
    }
    // Get AI response and review details
    const { data: response } = await supabase
      .from("ai_responses")
      .select("status, response_text, tone, metadata")
      .eq("id", createdResponseId)
      .single()
    if (!response) {
      throw new Error(`AI response not found: ${createdResponseId}`)
    }
    // If already approved manually, continue
    if (response.status === "approved") {
      return {
        approved: true,
        approval_method: "manual",
      }
    }
    // Get review details for auto-publishing evaluation
    const { data: review } = await supabase
      .from("reviews")
      .select("rating, location_id, review_text")
      .eq("id", reviewId)
      .single()
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`)
    }
    // Get response settings for this location/tenant
    const { data: settings } = await supabase
      .from("response_settings")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("location_id", review.location_id)
      .maybeSingle()
    // If no settings or auto-publish disabled, wait for manual approval
    if (!settings || !settings.auto_publish_enabled) {
      if (response.status === "draft") {
        throw new Error("Waiting for manual approval - auto-publish disabled")
      }
      return {
        approved: false,
        reason: "auto_publish_disabled",
      }
    }
    // Check rating-based auto-publish settings
    const rating = review.rating || 3
    let shouldAutoPublish = false
    if (rating >= 4 && settings.auto_publish_positive) {
      shouldAutoPublish = true
    } else if (rating === 3 && settings.auto_publish_neutral) {
      shouldAutoPublish = true
    } else if (rating <= 2 && settings.auto_publish_negative) {
      shouldAutoPublish = true
    }
    if (!shouldAutoPublish) {
      if (response.status === "draft") {
        throw new Error(
          `Waiting for manual approval - rating ${rating} not configured for auto-publish`,
        )
      }
      return {
        approved: false,
        reason: "rating_not_configured_for_auto_publish",
      }
    }
    // Check quality thresholds
    const confidenceScore = response.metadata?.confidence_score || 0
    const qualityScore = response.metadata?.quality_score || 0
    if (confidenceScore < (settings.min_confidence_score || 0.8)) {
      if (settings.require_human_review_below_threshold) {
        if (response.status === "draft") {
          throw new Error(
            `Waiting for manual approval - confidence score ${confidenceScore} below threshold ${settings.min_confidence_score}`,
          )
        }
        return {
          approved: false,
          reason: "confidence_below_threshold",
        }
      }
    }
    if (qualityScore < (settings.min_quality_score || 0.7)) {
      if (settings.require_human_review_below_threshold) {
        if (response.status === "draft") {
          throw new Error(
            `Waiting for manual approval - quality score ${qualityScore} below threshold ${settings.min_quality_score}`,
          )
        }
        return {
          approved: false,
          reason: "quality_below_threshold",
        }
      }
    }
    // Check response length
    if (
      settings.max_response_length &&
      response.response_text.length > settings.max_response_length
    ) {
      if (response.status === "draft") {
        throw new Error(
          `Waiting for manual approval - response length ${response.response_text.length} exceeds limit ${settings.max_response_length}`,
        )
      }
      return {
        approved: false,
        reason: "response_too_long",
      }
    }
    // Check excluded keywords
    if (settings.excluded_keywords?.length > 0) {
      const responseText = response.response_text.toLowerCase()
      const hasExcludedKeyword = settings.excluded_keywords.some((keyword) =>
        responseText.includes(keyword.toLowerCase()),
      )
      if (hasExcludedKeyword) {
        if (response.status === "draft") {
          throw new Error(
            "Waiting for manual approval - response contains excluded keywords",
          )
        }
        return {
          approved: false,
          reason: "contains_excluded_keywords",
        }
      }
    }
    // Check working hours if enabled
    if (settings.working_hours_only && settings.working_hours) {
      const now = new Date()
      const currentHour = now.getHours()
      const currentDay = now.getDay() // 0 = Sunday
      const workingHours = settings.working_hours
      const todayHours = workingHours[currentDay] || workingHours["default"]
      if (!todayHours || !todayHours.enabled) {
        if (response.status === "draft") {
          throw new Error("Waiting for manual approval - outside working hours")
        }
        return {
          approved: false,
          reason: "outside_working_hours",
        }
      }
      if (currentHour < todayHours.start || currentHour >= todayHours.end) {
        if (response.status === "draft") {
          throw new Error(
            `Waiting for manual approval - outside working hours (${todayHours.start}-${todayHours.end})`,
          )
        }
        return {
          approved: false,
          reason: "outside_working_hours",
        }
      }
    }
    // All checks passed - auto-approve the response
    await supabase
      .from("ai_responses")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: null,
        approval_metadata: {
          approval_method: "auto_publish",
          settings_used: {
            auto_publish_enabled: settings.auto_publish_enabled,
            rating_check: `rating_${rating}_approved`,
            confidence_score: confidenceScore,
            quality_score: qualityScore,
            checks_passed: [
              "rating_configuration",
              "confidence_threshold",
              "quality_threshold",
              "response_length",
              "excluded_keywords",
              "working_hours",
            ],
          },
          auto_approved_at: new Date().toISOString(),
        },
      })
      .eq("id", createdResponseId)
    // Add to response queue for publishing if notifications enabled
    if (settings.notify_on_auto_publish) {
      await supabase.from("system_logs").insert({
        tenant_id: tenantId,
        category: "auto_publish",
        log_level: "info",
        message: `Response auto-approved for review ${reviewId}`,
        metadata: {
          response_id: createdResponseId,
          review_id: reviewId,
          rating: rating,
          confidence_score: confidenceScore,
          quality_score: qualityScore,
          location_id: review.location_id,
        },
      })
    }
    return {
      approved: true,
      approval_method: "auto_publish",
      auto_publish_reason: `rating_${rating}_configured`,
      confidence_score: confidenceScore,
      quality_score: qualityScore,
    }
  },
  async publishResponse(ctx, supabase) {
    const { createdResponseId, reviewId, tenantId, queueItemId } = ctx
    // Get response and validate it's approved
    const { data: response } = await supabase
      .from("ai_responses")
      .select("response_text, status, metadata, approved_by")
      .eq("id", createdResponseId)
      .single()
    if (!response || response.status !== "approved") {
      throw new Error(
        `Cannot publish unapproved response - status: ${response?.status || "not found"}`,
      )
    }
    // Get review and location details
    const { data: review } = await supabase
      .from("reviews")
      .select("platform_review_id, location_id, rating, platform_data")
      .eq("id", reviewId)
      .single()
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`)
    }
    // If a response was manually approved (approved_by is not null), bypass all checks.
    const isManuallyApproved = !!response.approved_by
    if (!isManuallyApproved) {
      // CRITICAL: Validate publishing through response_settings for auto-approved responses
      const { data: settings } = await supabase
        .from("response_settings")
        .select("*")
        .eq("tenant_id", tenantId)
        .eq("location_id", review.location_id)
        .maybeSingle()
      // If no settings exist, allow publishing (default behavior)
      // But if settings exist, they must allow publishing
      if (settings) {
        // Check if auto-publishing is enabled for this rating
        const rating = review.rating || 3
        let publishingAllowed = false
        if (rating >= 4 && settings.auto_publish_positive) {
          publishingAllowed = true
        } else if (rating === 3 && settings.auto_publish_neutral) {
          publishingAllowed = true
        } else if (rating <= 2 && settings.auto_publish_negative) {
          publishingAllowed = true
        }
        if (!publishingAllowed) {
          throw new Error(
            `Publishing not allowed - rating ${rating} not configured for auto-publish.`,
          )
        }
        // Check rate limits
        if (settings.rate_limits) {
          const rateLimits = settings.rate_limits
          if (rateLimits.daily_limit || rateLimits.hourly_limit) {
            // Check recent publishing activity
            const dayAgo = new Date(
              Date.now() - 24 * 60 * 60 * 1000,
            ).toISOString()
            const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
            const { data: recentPublishes } = await supabase
              .from("ai_responses")
              .select("published_at")
              .eq("tenant_id", tenantId)
              .gte("published_at", dayAgo)
              .not("published_at", "is", null)
            const todayCount =
              recentPublishes?.filter((r) => r.published_at >= dayAgo).length ||
              0
            const hourCount =
              recentPublishes?.filter((r) => r.published_at >= hourAgo)
                .length || 0
            if (
              rateLimits.daily_limit &&
              todayCount >= rateLimits.daily_limit
            ) {
              throw new Error(
                `Daily publishing limit reached: ${todayCount}/${rateLimits.daily_limit}`,
              )
            }
            if (
              rateLimits.hourly_limit &&
              hourCount >= rateLimits.hourly_limit
            ) {
              throw new Error(
                `Hourly publishing limit reached: ${hourCount}/${rateLimits.hourly_limit}`,
              )
            }
          }
        }
        // Check working hours again at publish time
        if (settings.working_hours_only && settings.working_hours) {
          const now = new Date()
          const currentHour = now.getHours()
          const currentDay = now.getDay()
          const workingHours = settings.working_hours
          const todayHours = workingHours[currentDay] || workingHours["default"]
          if (
            !todayHours?.enabled ||
            currentHour < todayHours.start ||
            currentHour >= todayHours.end
          ) {
            throw new Error(
              `Cannot publish outside working hours (${todayHours?.start || 9}-${todayHours?.end || 17})`,
            )
          }
        }
      }
    }
    const baseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!baseUrl || !serviceKey) {
      throw new Error(
        "Missing environment configuration for external integrator",
      )
    }
    const client = new ExternalIntegratorClient(
      baseUrl + "/functions/v1/v2-external-integrator",
      serviceKey,
    )
    // Use the original, non-normalized review ID if available, as it's more specific and less likely to fail.
    const reviewIdToPublish =
      review.platform_data?.original_review_id || review.platform_review_id
    await client.publishToGMB(
      reviewIdToPublish,
      response.response_text,
      tenantId,
    )
    // Update statuses
    const { data: tenantUser } = await supabase
      .from("tenant_users")
      .select("user_id")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .in("role", ["owner", "admin"])
      .order("role")
      .limit(1)
      .single()
    if (tenantUser) {
      await supabase
        .from("ai_responses")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          published_by: tenantUser.user_id,
        })
        .eq("id", createdResponseId)
    }
    await supabase
      .from("reviews")
      .update({
        status: "responded",
      })
      .eq("id", reviewId)
    if (queueItemId) {
      await supabase
        .from("response_queue")
        .update({
          status: "published",
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", queueItemId)
    }
    return {
      published: true,
    }
  },
  async syncReviews(ctx, supabase) {
    const { locationId, tenantId } = ctx
    const baseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!baseUrl || !serviceKey) {
      throw new Error(
        "Missing environment configuration for external integrator",
      )
    }
    const client = new ExternalIntegratorClient(
      baseUrl + "/functions/v1/v2-external-integrator",
      serviceKey,
    )
    const syncResult = await client.syncGMBReviews(locationId, tenantId)
    await supabase
      .from("locations")
      .update({
        status: "active",
        last_sync_at: new Date().toISOString(),
      })
      .eq("id", locationId)
    return {
      syncedCount: syncResult.count,
    }
  },
  async refreshToken(ctx, supabase) {
    // Log incoming context for debugging
    await supabase.from("system_logs").insert({
      category: "workflow",
      log_level: "debug",
      message: "Token refresh started",
      metadata: {
        context: ctx,
        contextKeys: Object.keys(ctx || {}),
      },
    })
    const { tenantId, tokenId } = ctx
    if (!tenantId || !tokenId) {
      throw new Error(
        `Missing required context for token refresh: tenantId=${tenantId}, tokenId=${tokenId}`,
      )
    }
    // Get the oauth token that needs refresh (including expired ones)
    const { data: tokens, error: fetchError } = await supabase
      .from("oauth_tokens")
      .select("*")
      .eq("id", tokenId)
      .single()
    if (fetchError) {
      throw new Error(`Failed to fetch token: ${fetchError.message}`)
    }
    if (!tokens || !tokens.encrypted_refresh_token) {
      throw new Error(`No refresh token found for token ID: ${tokenId}`)
    }
    // Decrypt the refresh token using token-manager
    let refreshTokenData
    try {
      refreshTokenData = await decryptToken(tokens.encrypted_refresh_token)
    } catch (decryptError) {
      throw new Error(
        `Failed to decrypt refresh token: ${decryptError instanceof Error ? decryptError.message : "Unknown error"}`,
      )
    }
    // Refresh the token with Google
    const clientId =
      Deno.env.get("PUBLIC_GOOGLE_CLIENT_ID") ||
      Deno.env.get("GOOGLE_CLIENT_ID") ||
      ""
    const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || ""
    if (!clientId || !clientSecret) {
      throw new Error(
        `Missing Google OAuth credentials - clientId: ${clientId ? "present" : "missing"}, clientSecret: ${clientSecret ? "present" : "missing"}`,
      )
    }
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        refresh_token: refreshTokenData,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    })
    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        `Token refresh failed: ${response.statusText} - ${errorText}`,
      )
    }
    const newTokenData = await response.json()
    // Encrypt the new access token using token-manager
    let encryptedAccessToken
    try {
      encryptedAccessToken = await encryptToken(newTokenData.access_token)
    } catch (encryptError) {
      throw new Error(
        `Failed to encrypt new access token: ${encryptError instanceof Error ? encryptError.message : "Unknown error"}`,
      )
    }
    // Update the oauth_tokens record
    const { error: updateError } = await supabase
      .from("oauth_tokens")
      .update({
        encrypted_access_token: encryptedAccessToken,
        expires_at: new Date(
          Date.now() + newTokenData.expires_in * 1000,
        ).toISOString(),
        last_refresh_at: new Date().toISOString(),
        refresh_attempts: 0,
        needs_refresh: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokenId)
    if (updateError) {
      throw new Error(`Failed to update token: ${updateError.message}`)
    }
    // Log successful refresh
    await supabase.from("system_logs").insert({
      category: "workflow",
      log_level: "info",
      message: "Token refresh completed successfully",
      metadata: {
        tenant_id: tenantId,
        token_id: tokenId,
        new_expires_at: new Date(
          Date.now() + newTokenData.expires_in * 1000,
        ).toISOString(),
      },
    })
    return {
      refreshed: true,
      newExpiresAt: new Date(Date.now() + newTokenData.expires_in * 1000),
    }
  },
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async syncLocations(ctx, _supabase) {
    const { tenantId, tokenId } = ctx
    if (!tenantId || !tokenId) {
      throw new Error(
        `Missing required context for location sync: tenantId=${tenantId}, tokenId=${tokenId}`,
      )
    }
    const baseUrl = Deno.env.get("SUPABASE_URL")
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!baseUrl || !serviceKey) {
      throw new Error(
        "Missing environment configuration for external integrator",
      )
    }
    const client = new ExternalIntegratorClient(
      baseUrl + "/functions/v1/v2-external-integrator",
      serviceKey,
    )
    const syncResult = await client.syncLocations(tenantId, tokenId)
    return {
      ...syncResult,
    }
  },
}
// Workflow definitions
const workflows = {
  review_processing: {
    steps: [
      {
        name: "generate_ai_response",
        execute: workflowSteps.generateAIResponse,
      },
      {
        name: "wait_for_approval",
        execute: workflowSteps.waitForApproval,
      },
      {
        name: "publish_response",
        execute: workflowSteps.publishResponse,
      },
    ],
  },
  ai_response_generation: {
    steps: [
      {
        name: "generate_ai_response",
        execute: workflowSteps.generateAIResponse,
      },
    ],
  },
  response_publishing: {
    steps: [
      {
        name: "publish_response",
        execute: workflowSteps.publishResponse,
      },
    ],
  },
  review_sync: {
    steps: [
      {
        name: "sync_reviews",
        execute: workflowSteps.syncReviews,
      },
    ],
  },
  token_refresh: {
    steps: [
      {
        name: "refresh_token",
        execute: workflowSteps.refreshToken,
      },
    ],
  },
  sync_locations: {
    steps: [
      {
        name: "sync_locations",
        execute: workflowSteps.syncLocations,
      },
    ],
  },
}
// Process workflow
async function processWorkflow(workflow, supabase) {
  const definition = workflows[workflow.workflow_type]
  if (!definition)
    throw new Error(`Unknown workflow type: ${workflow.workflow_type}`)
  const currentStep = definition.steps.find(
    (s) => s.name === workflow.current_step,
  )
  if (!currentStep) throw new Error(`Unknown step: ${workflow.current_step}`)
  // Execute step - use input_data for initial context if context_data is empty
  const stepContext =
    workflow.context_data && Object.keys(workflow.context_data).length > 0
      ? workflow.context_data
      : workflow.input_data
  const resultContext = await currentStep.execute(stepContext, supabase)
  const updatedContext = {
    ...stepContext,
    ...resultContext,
  }
  // Find next step
  const currentIndex = definition.steps.indexOf(currentStep)
  const nextStep = definition.steps[currentIndex + 1]
  // Update workflow
  const updateData = {
    current_step: nextStep ? nextStep.name : null,
    status: nextStep ? "running" : "completed",
    context_data: updatedContext,
    step_index: (workflow.step_index || 0) + 1,
    completed_steps: (workflow.completed_steps || 0) + 1,
    updated_at: new Date().toISOString(),
    ...(!nextStep && {
      completed_at: new Date().toISOString(),
    }),
  }
  // Log what we're updating
  await supabase.from("system_logs").insert({
    category: "workflow",
    log_level: "debug",
    message: "Updating workflow after step completion",
    metadata: {
      workflow_id: workflow.id,
      workflow_type: workflow.workflow_type,
      current_step: currentStep.name,
      next_step: nextStep?.name || "completed",
      new_status: updateData.status,
      update_data: updateData,
    },
  })
  const { error: updateError } = await supabase
    .from("workflows")
    .update(updateData)
    .eq("id", workflow.id)
  if (updateError) {
    throw new Error(`Failed to update workflow: ${updateError.message}`)
  }
  return {
    status: "step_completed",
    currentStep: currentStep.name,
    nextStep: nextStep?.name || "completed",
  }
}
// Main handler with proper error boundaries
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    })
  }
  const url = new URL(req.url)
  const path = url.pathname.split("/").pop()
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          error: "Missing environment configuration",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      )
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    // Health check
    if (path === "health") {
      return new Response(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      )
    }
    const { workflowId, action, max_workflows } = await req.json()
    // Batch processing
    if (action === "process_pending_workflows") {
      const limit = max_workflows || 50
      // Mark stale workflows as failed
      const staleThreshold = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      await supabase
        .from("workflows")
        .update({
          status: "failed",
          error_details: {
            message: "Workflow timed out",
            timestamp: new Date().toISOString(),
          },
        })
        .eq("status", "running")
        .lt("updated_at", staleThreshold)
      // Get pending workflows
      const { data: workflows } = await supabase
        .from("workflows")
        .select("*")
        .in("status", ["pending", "running"])
        .order("created_at")
        .limit(limit)
      if (!workflows?.length) {
        return new Response(
          JSON.stringify({
            message: "No pending workflows",
            processed_count: 0,
          }),
          {
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
            },
          },
        )
      }
      let processedCount = 0
      let errorCount = 0
      for (const workflow of workflows) {
        if (!workflow?.id) continue
        try {
          // Mark pending as running and set total_steps
          if (workflow.status === "pending") {
            const definition = workflows[workflow.workflow_type]
            const totalSteps = definition ? definition.steps.length : 1
            await supabase
              .from("workflows")
              .update({
                status: "running",
                step_index: 0,
                completed_steps: 0,
                total_steps: totalSteps,
                started_at: new Date().toISOString(),
              })
              .eq("id", workflow.id)
            workflow.status = "running"
            workflow.total_steps = totalSteps
          }
          await processWorkflow(workflow, supabase)
          processedCount++
        } catch (error) {
          errorCount++
          // Handle failure
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          await supabase
            .from("workflows")
            .update({
              status: "failed",
              error_details: {
                message: errorMessage,
                timestamp: new Date().toISOString(),
              },
            })
            .eq("id", workflow.id)
          // Handle response_queue item based on error type
          if (
            workflow.workflow_type === "response_publishing" &&
            workflow.input_data?.queueItemId
          ) {
            const queueItemId = workflow.input_data.queueItemId
            const reviewId = workflow.input_data.reviewId
            // Specific handling for 404 Not Found errors
            if (errorMessage.includes("NOT_FOUND")) {
              console.log(
                `Handling NOT_FOUND error for queue item ${queueItemId}`,
              )
              // Mark queue item as failed immediately, no retry
              await supabase
                .from("response_queue")
                .update({
                  status: "failed",
                  error_message: `Permanent failure: Review not found on GMB (404).`,
                  processing_completed_at: new Date().toISOString(),
                  processing_started_at: null,
                })
                .eq("id", queueItemId)
              // Optionally, update the review itself to prevent future processing
              if (reviewId) {
                await supabase
                  .from("reviews")
                  .update({
                    status: "archived",
                    metadata: {
                      failure_reason: "GMB_NOT_FOUND",
                      failed_at: new Date().toISOString(),
                    },
                  })
                  .eq("id", reviewId)
              }
            } else {
              // Existing retry logic for all other errors
              const { data: queueItem } = await supabase
                .from("response_queue")
                .select("attempt_count, max_attempts")
                .eq("id", queueItemId)
                .single()
              if (queueItem) {
                const newAttemptCount = (queueItem.attempt_count || 0) + 1
                const maxAttempts =
                  queueItem.max_attempts === null ||
                  queueItem.max_attempts === undefined
                    ? 3
                    : queueItem.max_attempts
                const canRetry = newAttemptCount <= maxAttempts
                await supabase
                  .from("response_queue")
                  .update({
                    status: canRetry ? "pending" : "failed",
                    processing_started_at: null,
                    error_message: errorMessage,
                    attempt_count: newAttemptCount,
                    last_attempt_at: new Date().toISOString(),
                    next_retry_at: canRetry
                      ? new Date(
                          Date.now() + Math.pow(2, newAttemptCount - 1) * 60000,
                        ).toISOString()
                      : null,
                  })
                  .eq("id", queueItemId)
              }
            }
          }
        }
      }
      return new Response(
        JSON.stringify({
          message: "Batch processing completed",
          processed_count: processedCount,
          error_count: errorCount,
          total_workflows: workflows.length,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      )
    }
    // Single workflow processing
    if (!workflowId) throw new Error("workflowId is required")
    const { data: workflow } = await supabase
      .from("workflows")
      .select("*")
      .eq("id", workflowId)
      .single()
    if (!workflow) throw new Error(`Workflow not found: ${workflowId}`)
    if (workflow.status !== "running" && workflow.status !== "pending") {
      return new Response(
        JSON.stringify({
          message: "Workflow not in running or pending state",
          current_status: workflow.status,
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      )
    }
    // Set total_steps if pending
    if (workflow.status === "pending") {
      const definition = workflows[workflow.workflow_type]
      const totalSteps = definition ? definition.steps.length : 1
      await supabase
        .from("workflows")
        .update({
          status: "running",
          step_index: 0,
          completed_steps: 0,
          total_steps: totalSteps,
          started_at: new Date().toISOString(),
        })
        .eq("id", workflowId)
      workflow.status = "running"
      workflow.total_steps = totalSteps
    }
    const result = await processWorkflow(workflow, supabase)
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    )
  }
})
