/**
 * V2 API Edge Function - Final Production Version
 *
 * Complete API endpoint for the AI Review Management System with:
 * - Full OAuth token management via oauth_tokens table
 * - All GET/POST/PUT/DELETE endpoints
 * - Workflow orchestration for review operations
 * - Tenant isolation and RBAC
 * - Comprehensive error handling and logging
 */ import { createClient } from "npm:@supabase/supabase-js@2"
// ====================================================================
// CONFIGURATION
// ====================================================================
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
}
const WORKFLOW_TYPES = {
  REVIEW_SYNC: "review_sync",
  RESPONSE_GENERATION: "response_generation",
  RESPONSE_PUBLISHING: "response_publishing",
  BATCH_PROCESSING: "batch_processing",
  TOKEN_REFRESH: "token_refresh",
}
// const WORKFLOW_FIRST_STEPS = {
//   [WORKFLOW_TYPES.REVIEW_SYNC]: "fetch_reviews",
//   [WORKFLOW_TYPES.RESPONSE_GENERATION]: "generate_response",
//   [WORKFLOW_TYPES.RESPONSE_PUBLISHING]: "validate_response",
//   [WORKFLOW_TYPES.BATCH_PROCESSING]: "validate_batch",
//   [WORKFLOW_TYPES.TOKEN_REFRESH]: "refresh_token"
// };
// ====================================================================
// AUTHENTICATION & AUTHORIZATION
// ====================================================================
async function getAuthenticatedUser(req, supabase) {
  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Invalid authorization header")
  }
  const token = authHeader.substring(7)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)
  if (error || !user) {
    throw new Error("Authentication failed")
  }
  return user
}
async function getUserTenant(userId, supabase) {
  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id, role")
    .eq("user_id", userId)
    .eq("status", "active")
    .single()
  if (error || !data) {
    console.error(`No active tenant for user ${userId}:`, error)
    return null
  }
  return data.tenant_id
}
async function canManageResponses(userId, tenantId, supabase) {
  const { data } = await supabase
    .from("tenant_users")
    .select("role")
    .eq("user_id", userId)
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .single()
  return ["owner", "admin", "manager"].includes(data?.role)
}
// ====================================================================
// OAUTH TOKEN MANAGEMENT
// ====================================================================
async function getOAuthToken(tenantId, supabase) {
  const { data, error } = await supabase
    .from("oauth_tokens")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("provider", "google")
    .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
    .eq("status", "active")
    .single()
  if (error || !data) {
    console.error(`OAuth token lookup failed for tenant ${tenantId}:`, error)
    return null
  }
  // Update last used timestamp
  await supabase
    .from("oauth_tokens")
    .update({
      last_used_at: new Date().toISOString(),
    })
    .eq("id", data.id)
  return data
}
function isTokenExpiring(expiresAt) {
  const expiry = new Date(expiresAt)
  const tenMinutesFromNow = new Date(Date.now() + 10 * 60 * 1000)
  return expiry <= tenMinutesFromNow
}
async function triggerTokenRefresh(tenantId, supabase) {
  // Create a token refresh workflow
  await createWorkflow(
    WORKFLOW_TYPES.TOKEN_REFRESH,
    {
      tenantId,
      priority: 100,
    },
    tenantId,
    "system",
    supabase,
  )
}
// ====================================================================
// WORKFLOW MANAGEMENT
// ====================================================================
function getFirstStep(workflowType) {
  const firstSteps = {
    review_sync: "fetch_reviews",
    response_generation: "generate_response",
    response_publishing: "validate_response",
    batch_processing: "validate_batch",
    token_refresh: "refresh_token",
    review_processing: "generate_response",
    customer_onboarding: "create_account",
    location_discovery: "discover_locations",
  }
  return firstSteps[workflowType] || "initialize"
}
async function createWorkflow(
  workflowType,
  context,
  tenantId,
  userId,
  supabase,
) {
  const { data: workflow, error } = await supabase
    .from("workflows")
    .insert({
      tenant_id: tenantId,
      workflow_type: workflowType,
      workflow_name: `${workflowType}_${Date.now()}`,
      status: "pending",
      current_step: getFirstStep(workflowType),
      context_data: context,
      input_data: context,
      priority: context.priority || 50,
      metadata: {
        created_by: userId,
        source: "v2-api",
        created_at: new Date().toISOString(),
      },
    })
    .select("id")
    .single()
  if (error || !workflow) {
    console.error("Workflow creation failed:", error)
    throw new Error(`Failed to create workflow: ${error?.message}`)
  }
  // Trigger workflow execution
  const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/v2-workflow-orchestrator`
  const response = await fetch(orchestratorUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
    },
    body: JSON.stringify({
      workflowId: workflow.id,
    }),
  })
  if (!response.ok) {
    const errorText = await response.text()
    console.error("Workflow start failed:", errorText)
    await supabase
      .from("workflows")
      .update({
        status: "failed",
        error_message: `Failed to start: ${errorText}`,
      })
      .eq("id", workflow.id)
    throw new Error(`Failed to start workflow: ${errorText}`)
  }
  return workflow.id
}
// ====================================================================
// API HANDLERS
// ====================================================================
async function handleSyncReviews(body, tenantId, userId, supabase) {
  const { locationId, options = {} } = body
  if (!locationId) {
    throw new Error("locationId is required")
  }
  // Verify location and OAuth token
  const { data: location } = await supabase
    .from("locations")
    .select("id, name, oauth_token_id")
    .eq("id", locationId)
    .eq("tenant_id", tenantId)
    .single()
  if (!location) {
    throw new Error("Location not found or access denied")
  }
  if (!location.oauth_token_id) {
    throw new Error("Location not connected to Google My Business")
  }
  // Check OAuth token status
  const token = await getOAuthToken(tenantId, supabase)
  if (!token) {
    throw new Error("No active OAuth token found")
  }
  if (isTokenExpiring(token.expires_at)) {
    await triggerTokenRefresh(tenantId, supabase)
  }
  const workflowId = await createWorkflow(
    WORKFLOW_TYPES.REVIEW_SYNC,
    {
      locationId,
      tenantId,
      userId,
      syncOptions: options,
      locationName: location.name,
    },
    tenantId,
    userId,
    supabase,
  )
  return {
    success: true,
    data: {
      workflowId,
    },
    message: "Review sync initiated",
  }
}
async function handleGenerateResponse(body, tenantId, userId, supabase) {
  const { reviewId, review_id, options = {} } = body
  const actualReviewId = reviewId || review_id // Support both naming conventions
  if (!actualReviewId) {
    throw new Error("reviewId is required")
  }
  // Verify review exists
  const { data: review } = await supabase
    .from("reviews")
    .select("id, customer_name, rating, review_text")
    .eq("id", actualReviewId)
    .eq("tenant_id", tenantId)
    .single()
  if (!review) {
    throw new Error("Review not found or access denied")
  }
  // Use review_processing workflow type for compatibility
  const workflowId = await createWorkflow(
    "review_processing",
    {
      reviewId: actualReviewId,
      tenantId,
      userId,
      options,
      reviewData: review,
    },
    tenantId,
    userId,
    supabase,
  )
  return {
    success: true,
    data: {
      workflowId,
    },
    message: "Response generation started",
  }
}
async function handlePublishResponse(body, tenantId, userId, supabase) {
  const { responseId, options = {} } = body
  if (!responseId) {
    throw new Error("responseId is required")
  }
  // Verify response and check status
  const { data: response } = await supabase
    .from("ai_responses")
    .select("id, status, review_id, response_text")
    .eq("id", responseId)
    .eq("tenant_id", tenantId)
    .single()
  if (!response) {
    throw new Error("Response not found or access denied")
  }
  if (!["approved", "draft"].includes(response.status)) {
    throw new Error(`Cannot publish response with status: ${response.status}`)
  }
  // Check OAuth token
  const token = await getOAuthToken(tenantId, supabase)
  if (!token) {
    throw new Error("No active OAuth token for publishing")
  }
  if (isTokenExpiring(token.expires_at)) {
    await triggerTokenRefresh(tenantId, supabase)
  }
  const workflowId = await createWorkflow(
    WORKFLOW_TYPES.RESPONSE_PUBLISHING,
    {
      responseId,
      reviewId: response.review_id,
      tenantId,
      userId,
      publishOptions: options,
      responseText: response.response_text,
    },
    tenantId,
    userId,
    supabase,
  )
  return {
    success: true,
    data: {
      workflowId,
    },
    message: "Publishing initiated",
  }
}
async function handleBatchGenerate(body, tenantId, userId, supabase) {
  const { reviewIds, options = {} } = body
  if (!reviewIds || !Array.isArray(reviewIds) || reviewIds.length === 0) {
    throw new Error("reviewIds array is required")
  }
  if (reviewIds.length > 50) {
    throw new Error("Maximum 50 reviews per batch")
  }
  // Verify all reviews exist
  const { data: reviews, error } = await supabase
    .from("reviews")
    .select("id")
    .in("id", reviewIds)
    .eq("tenant_id", tenantId)
  if (error || reviews.length !== reviewIds.length) {
    throw new Error("Some reviews not found or access denied")
  }
  const workflowId = await createWorkflow(
    WORKFLOW_TYPES.BATCH_PROCESSING,
    {
      reviewIds,
      tenantId,
      userId,
      batchOptions: options,
      batchSize: reviewIds.length,
    },
    tenantId,
    userId,
    supabase,
  )
  return {
    success: true,
    data: {
      workflowId,
      count: reviewIds.length,
    },
    message: `Batch processing started for ${reviewIds.length} reviews`,
  }
}
async function handleWorkflowStatus(body, tenantId, supabase) {
  const { workflowId } = body
  if (!workflowId) {
    throw new Error("workflowId is required")
  }
  const { data: workflow, error } = await supabase
    .from("workflows")
    .select(
      `
      id,
      workflow_type,
      workflow_name,
      status,
      current_step,
      progress_percentage,
      error_message,
      output_data,
      started_at,
      completed_at,
      retry_count
    `,
    )
    .eq("id", workflowId)
    .eq("tenant_id", tenantId)
    .single()
  if (error || !workflow) {
    throw new Error("Workflow not found or access denied")
  }
  // Get recent steps
  const { data: steps } = await supabase
    .from("workflow_steps")
    .select("step_name, status, started_at, completed_at, error_message")
    .eq("workflow_id", workflowId)
    .order("started_at", {
      ascending: false,
    })
    .limit(10)
  return {
    success: true,
    data: {
      workflow,
      steps: steps || [],
    },
  }
}
async function handleOAuthStatus(tenantId, supabase) {
  const token = await getOAuthToken(tenantId, supabase)
  if (!token) {
    return {
      success: true,
      data: {
        connected: false,
        requiresAuth: true,
      },
      message: "No Google My Business connection found",
    }
  }
  const expiring = isTokenExpiring(token.expires_at)
  const needsReauth = token.status !== "active" || token.refresh_attempts >= 3
  return {
    success: true,
    data: {
      connected: true,
      tokenStatus: token.status,
      expiresAt: token.expires_at,
      needsRefresh: expiring,
      requiresAuth: needsReauth,
      refreshAttempts: token.refresh_attempts,
    },
    message: needsReauth
      ? "Token requires re-authentication"
      : expiring
        ? "Token expiring soon, refresh scheduled"
        : "Connection active",
  }
}
// ====================================================================
// GET ENDPOINT HANDLERS
// ====================================================================
async function handleGetBusinessGuidance(tenantId, supabase) {
  const { data: guidance } = await supabase
    .from("business_guidance")
    .select("*")
    .eq("tenant_id", tenantId)
    .single()
  return {
    success: true,
    data: {
      guidance,
    },
  }
}
async function handleGetUpsellItems(tenantId, supabase) {
  const { data: items } = await supabase
    .from("upsell_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .order("priority", {
      ascending: false,
    })
  return {
    success: true,
    data: {
      items,
    },
  }
}
async function handleGetResponseSettings(tenantId, supabase) {
  const { data: settings } = await supabase
    .from("response_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .single()
  return {
    success: true,
    data: {
      settings,
    },
  }
}
async function handleGetResponseQueue(tenantId, supabase) {
  const { data: queue } = await supabase
    .from("response_queue")
    .select(
      `
      *,
      ai_response:response_id(
        response_text,
        review:review_id(
          review_text,
          rating,
          customer_name,
          location:location_id(name)
        )
      )
    `,
    )
    .eq("tenant_id", tenantId)
    .in("status", ["pending", "processing"])
    .order("scheduled_for")
  return {
    success: true,
    data: {
      queue,
    },
  }
}
async function handleGetTeamMembers(tenantId, supabase) {
  const { data: members } = await supabase
    .from("tenant_users")
    .select(
      `
      *,
      profile:profiles!tenant_users_user_id_fkey(
        id,
        full_name,
        email,
        avatar_url
      )
    `,
    )
    .eq("tenant_id", tenantId)
    .order("created_at")
  return {
    success: true,
    data: {
      members,
    },
  }
}
async function handleGetInvitations(tenantId, supabase) {
  const { data: invitations } = await supabase
    .from("tenant_invitations")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", {
      ascending: false,
    })
  return {
    success: true,
    data: {
      invitations,
    },
  }
}
async function handleGetOnboardingProgress(tenantId, supabase) {
  const { data: tenant } = await supabase
    .from("tenants")
    .select("onboarding_completed, onboarding_step, onboarding_data")
    .eq("id", tenantId)
    .single()
  return {
    success: true,
    data: {
      progress: tenant,
    },
  }
}
async function handleGetResponseMetrics(tenantId, supabase) {
  const { data: metrics } = await supabase
    .from("response_analytics")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("period_start", {
      ascending: false,
    })
    .limit(30)
  return {
    success: true,
    data: {
      metrics,
    },
  }
}
async function handleGetReviews(tenantId, supabase) {
  const { data: reviews } = await supabase
    .from("reviews")
    .select(
      `
      *,
      location:location_id(name),
      ai_responses(
        id,
        response_text,
        status,
        confidence_score,
        created_at
      )
    `,
    )
    .eq("tenant_id", tenantId)
    .order("review_date", {
      ascending: false,
    })
    .limit(50)
  return {
    success: true,
    data: {
      reviews,
    },
  }
}
async function handleGetLocations(tenantId, supabase) {
  const { data: locations } = await supabase
    .from("locations")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name")
  return {
    success: true,
    data: {
      locations,
    },
  }
}
async function handleGetWorkflows(tenantId, supabase) {
  const { data: workflows } = await supabase
    .from("workflows")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", {
      ascending: false,
    })
    .limit(20)
  return {
    success: true,
    data: {
      workflows,
    },
  }
}
async function handleGetPendingResponses(tenantId, supabase) {
  const { data: responses } = await supabase
    .from("ai_responses")
    .select(
      `
      *,
      review:review_id(
        review_text,
        rating,
        customer_name,
        location:location_id(name)
      )
    `,
    )
    .eq("tenant_id", tenantId)
    .eq("status", "draft")
    .order("created_at", {
      ascending: false,
    })
  return {
    success: true,
    data: {
      responses,
    },
  }
}
async function handleGetAIResponse(responseId, tenantId, supabase) {
  const { data: aiResponse, error } = await supabase
    .from("ai_responses")
    .select("*")
    .eq("id", responseId)
    .eq("tenant_id", tenantId)
    .single()
  if (error || !aiResponse) {
    throw new Error("AI response not found")
  }
  return {
    success: true,
    data: {
      ai_response: aiResponse,
    },
  }
}
async function handleGetProfile(userId, supabase) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single()
  return {
    success: true,
    data: {
      profile,
    },
  }
}
// ====================================================================
// POST/PUT/DELETE ENDPOINT HANDLERS
// ====================================================================
async function handleApproveResponse(body, tenantId, userId, supabase) {
  const { responseId, response_id, approved, feedback } = body
  const actualResponseId = responseId || response_id
  // Get the response and its workflow
  const { data: aiResponse } = await supabase
    .from("ai_responses")
    .select("*, review:review_id(id)")
    .eq("id", actualResponseId)
    .eq("tenant_id", tenantId)
    .single()
  if (!aiResponse) {
    throw new Error("Response not found")
  }
  if (approved !== false) {
    // Approve the response
    const { error: updateError } = await supabase
      .from("ai_responses")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: userId,
      })
      .eq("id", actualResponseId)
    if (updateError) {
      throw new Error(updateError.message)
    }
    // Find and resume the workflow
    const { data: workflow } = await supabase
      .from("workflows")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("workflow_type", "response_generation")
      .eq("current_step", "wait_for_approval")
      .eq("context_data->reviewId", aiResponse.review.id)
      .single()
    if (workflow) {
      // Resume workflow by calling orchestrator
      const orchestratorUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/v2-workflow-orchestrator`
      await fetch(orchestratorUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          workflowId: workflow.id,
        }),
      })
    }
  } else {
    // Reject the response
    await supabase
      .from("ai_responses")
      .update({
        status: "rejected",
        rejection_feedback: feedback,
        rejection_reason: feedback,
        rejected_at: new Date().toISOString(),
        rejected_by: userId,
      })
      .eq("id", actualResponseId)
    // Update review status back to new
    await supabase
      .from("reviews")
      .update({
        status: "new",
        needs_response: true,
      })
      .eq("id", aiResponse.review.id)
  }
  return {
    success: true,
    message: approved !== false ? "Response approved" : "Response rejected",
  }
}
async function handleUpdateBusinessGuidance(body, tenantId, supabase) {
  const { data, error } = await supabase
    .from("business_guidance")
    .upsert(
      {
        tenant_id: tenantId,
        ...body,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "tenant_id",
        ignoreDuplicates: false,
      },
    )
    .select()
    .single()
  if (error) {
    throw new Error(error.message)
  }
  return {
    success: true,
    data: {
      guidance: data,
    },
  }
}
async function handleCreateUpsellItem(body, tenantId, supabase) {
  const { data, error } = await supabase
    .from("upsell_items")
    .insert({
      tenant_id: tenantId,
      ...body,
    })
    .select()
    .single()
  if (error) {
    throw new Error(error.message)
  }
  return {
    success: true,
    data: {
      item: data,
    },
  }
}
async function handleUpdateUpsellItem(itemId, body, tenantId, supabase) {
  // Verify item belongs to tenant
  const { data: existing } = await supabase
    .from("upsell_items")
    .select("id")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .single()
  if (!existing) {
    throw new Error("Item not found")
  }
  const { data, error } = await supabase
    .from("upsell_items")
    .update(body)
    .eq("id", itemId)
    .select()
    .single()
  if (error) {
    throw new Error(error.message)
  }
  return {
    success: true,
    data: {
      item: data,
    },
  }
}
async function handleDeleteUpsellItem(itemId, tenantId, supabase) {
  // Verify item belongs to tenant
  const { data: existing } = await supabase
    .from("upsell_items")
    .select("id")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .single()
  if (!existing) {
    throw new Error("Item not found")
  }
  const { error } = await supabase
    .from("upsell_items")
    .delete()
    .eq("id", itemId)
  if (error) {
    throw new Error(error.message)
  }
  return {
    success: true,
    message: "Item deleted successfully",
  }
}
async function handleUpdateResponseSettings(body, tenantId, supabase) {
  const { data, error } = await supabase
    .from("response_settings")
    .upsert({
      tenant_id: tenantId,
      ...body,
    })
    .select()
    .single()
  if (error) {
    throw new Error(error.message)
  }
  return {
    success: true,
    data: {
      settings: data,
    },
  }
}
async function handleInviteMember(body, tenantId, userId, supabase) {
  const { email, role } = body
  const { data, error } = await supabase
    .from("tenant_invitations")
    .insert({
      tenant_id: tenantId,
      email,
      role,
      invited_by: userId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single()
  if (error) {
    throw new Error(error.message)
  }
  return {
    success: true,
    data: {
      invitation: data,
    },
  }
}
async function handleAdvanceOnboarding(body, tenantId, supabase) {
  const { event_type, event_data } = body
  // Update tenant onboarding data
  const { data: tenant } = await supabase
    .from("tenants")
    .select("onboarding_data, onboarding_step")
    .eq("id", tenantId)
    .single()
  const updatedData = {
    ...tenant?.onboarding_data,
    [event_type]: event_data,
    last_updated: new Date().toISOString(),
  }
  // Determine next step based on event type
  let nextStep = tenant?.onboarding_step
  let completed = false
  // Simple onboarding flow logic
  if (event_type === "welcome_completed") nextStep = "google_auth"
  else if (event_type === "google_auth_completed") nextStep = "business_setup"
  else if (event_type === "business_setup_completed") {
    nextStep = "complete"
    completed = true
  }
  await supabase
    .from("tenants")
    .update({
      onboarding_data: updatedData,
      onboarding_step: nextStep,
      onboarding_completed: completed,
    })
    .eq("id", tenantId)
  return {
    success: true,
    data: {
      progress: {
        onboarding_completed: completed,
        onboarding_step: nextStep,
        onboarding_data: updatedData,
      },
    },
  }
}
async function handleQueueApprovedResponses(body, tenantId, supabase) {
  const { responseIds, delayHours = 24 } = body
  // Get approved responses to queue
  let query = supabase
    .from("ai_responses")
    .select("id, review_id, reviews!inner(location_id)")
    .eq("tenant_id", tenantId)
    .eq("status", "approved")
    .is("published_at", null)
  if (responseIds && responseIds.length > 0) {
    query = query.in("id", responseIds)
  }
  const { data: responses } = await query
  // Add to response queue
  const queueItems = []
  for (const response of responses || []) {
    const scheduledFor = new Date(Date.now() + delayHours * 60 * 60 * 1000)
    queueItems.push({
      tenant_id: tenantId,
      response_id: response.id,
      location_id: response.reviews.location_id,
      platform: "google",
      status: "pending",
      priority: 50,
      scheduled_for: scheduledFor.toISOString(),
      max_attempts: 3,
    })
  }
  if (queueItems.length > 0) {
    const { error } = await supabase.from("response_queue").insert(queueItems)
    if (error) {
      throw new Error(error.message)
    }
  }
  return {
    success: true,
    data: {
      message: `Queued ${queueItems.length} responses`,
      count: queueItems.length,
    },
  }
}
async function handleUpdateProfile(body, userId, supabase) {
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id: userId,
      ...body,
    })
    .select()
    .single()
  if (error) {
    throw new Error(error.message)
  }
  return {
    success: true,
    data: {
      profile: data,
    },
  }
}
async function handleSyncLocation(body, tenantId, userId, supabase) {
  const { locationId } = body
  // Verify location belongs to tenant
  const { data: location } = await supabase
    .from("locations")
    .select("id, name")
    .eq("id", locationId)
    .eq("tenant_id", tenantId)
    .single()
  if (!location) {
    throw new Error("Location not found")
  }
  // Check OAuth token
  const token = await getOAuthToken(tenantId, supabase)
  if (!token) {
    throw new Error("No active OAuth token found")
  }
  if (isTokenExpiring(token.expires_at)) {
    await triggerTokenRefresh(tenantId, supabase)
  }
  const workflowId = await createWorkflow(
    WORKFLOW_TYPES.REVIEW_SYNC,
    {
      locationId,
      tenantId,
      userId,
      locationName: location.name,
    },
    tenantId,
    userId,
    supabase,
  )
  return {
    success: true,
    data: {
      workflowId,
    },
    message: "Location sync initiated",
  }
}
// ====================================================================
// MAIN REQUEST HANDLER
// ====================================================================
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders,
    })
  }
  const url = new URL(req.url)
  const path = url.pathname.replace("/v2-api", "")
  const endpoint = `${req.method} ${path}`
  // Initialize Supabase client
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Service configuration error",
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
  // Use anon key for auth validation, service key for operations
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  try {
    // Authenticate user
    const user = await getAuthenticatedUser(req, supabaseAuth)
    let tenantId = await getUserTenant(user.id, supabase)
    // TEMPORARY: Fallback for V1 to V2 migration
    if (!tenantId) {
      const { data: existingGuidance } = await supabase
        .from("business_guidance")
        .select("tenant_id")
        .limit(1)
        .single()
      if (existingGuidance?.tenant_id) {
        tenantId = existingGuidance.tenant_id
        // Create the missing tenant_users relationship
        await supabase.from("tenant_users").upsert(
          {
            tenant_id: tenantId,
            user_id: user.id,
            role: "owner",
            status: "active",
            joined_at: new Date().toISOString(),
          },
          {
            onConflict: "tenant_id,user_id",
          },
        )
      }
    }
    if (!tenantId) {
      throw new Error("No active tenant membership found")
    }
    // Check permissions for restricted endpoints
    const restrictedEndpoints = [
      "/generate-response",
      "/publish-response",
      "/batch-generate",
      "/reviews/publish",
    ]
    if (restrictedEndpoints.includes(path)) {
      const hasPermission = await canManageResponses(
        user.id,
        tenantId,
        supabase,
      )
      if (!hasPermission) {
        throw new Error("Insufficient permissions for this operation")
      }
    }
    // Route to appropriate handler
    let result
    // Handle routes with path matching
    switch (true) {
      // ===== GET ENDPOINTS =====
      case path === "/business-guidance" && req.method === "GET":
        result = await handleGetBusinessGuidance(tenantId, supabase)
        break
      case path === "/upsell-items" && req.method === "GET":
        result = await handleGetUpsellItems(tenantId, supabase)
        break
      case path === "/response-settings" && req.method === "GET":
        result = await handleGetResponseSettings(tenantId, supabase)
        break
      case path === "/response-queue" && req.method === "GET":
        result = await handleGetResponseQueue(tenantId, supabase)
        break
      case path === "/team-members" && req.method === "GET":
        result = await handleGetTeamMembers(tenantId, supabase)
        break
      case path === "/invitations" && req.method === "GET":
        result = await handleGetInvitations(tenantId, supabase)
        break
      case path === "/onboarding-progress" && req.method === "GET":
        result = await handleGetOnboardingProgress(tenantId, supabase)
        break
      case path === "/response-metrics" && req.method === "GET":
        result = await handleGetResponseMetrics(tenantId, supabase)
        break
      case path === "/reviews" && req.method === "GET":
        result = await handleGetReviews(tenantId, supabase)
        break
      case path === "/locations" && req.method === "GET":
        result = await handleGetLocations(tenantId, supabase)
        break
      case path === "/workflows" && req.method === "GET":
        result = await handleGetWorkflows(tenantId, supabase)
        break
      case path === "/pending-responses" && req.method === "GET":
        result = await handleGetPendingResponses(tenantId, supabase)
        break
      case path.match(/^\/ai-responses\/(.+)$/) && req.method === "GET": {
        const match = path.match(/^\/ai-responses\/(.+)$/)
        const responseId = match[1]
        result = await handleGetAIResponse(responseId, tenantId, supabase)
        break
      }
      case path === "/profile" && req.method === "GET":
        result = await handleGetProfile(user.id, supabase)
        break
      case path === "/oauth-status" && req.method === "GET":
        result = await handleOAuthStatus(tenantId, supabase)
        break
      // ===== POST ENDPOINTS =====
      case path === "/sync-reviews" && req.method === "POST":
        result = await handleSyncReviews(
          await req.json(),
          tenantId,
          user.id,
          supabase,
        )
        break
      case path === "/generate-response" && req.method === "POST":
        result = await handleGenerateResponse(
          await req.json(),
          tenantId,
          user.id,
          supabase,
        )
        break
      case path === "/publish-response" && req.method === "POST":
        result = await handlePublishResponse(
          await req.json(),
          tenantId,
          user.id,
          supabase,
        )
        break
      case path === "/batch-generate" && req.method === "POST":
        result = await handleBatchGenerate(
          await req.json(),
          tenantId,
          user.id,
          supabase,
        )
        break
      case path === "/workflow-status" && req.method === "POST":
        result = await handleWorkflowStatus(
          await req.json(),
          tenantId,
          supabase,
        )
        break
      case path === "/approve-response" && req.method === "POST": {
        const hasPermission = await canManageResponses(
          user.id,
          tenantId,
          supabase,
        )
        if (!hasPermission) {
          throw new Error("Insufficient permissions for this operation")
        }
        result = await handleApproveResponse(
          await req.json(),
          tenantId,
          user.id,
          supabase,
        )
        break
      }
      case path === "/business-guidance" && req.method === "POST":
        result = await handleUpdateBusinessGuidance(
          await req.json(),
          tenantId,
          supabase,
        )
        break
      case path === "/upsell-items" && req.method === "POST":
        result = await handleCreateUpsellItem(
          await req.json(),
          tenantId,
          supabase,
        )
        break
      case path === "/response-settings" && req.method === "POST":
        result = await handleUpdateResponseSettings(
          await req.json(),
          tenantId,
          supabase,
        )
        break
      case path === "/invite-member" && req.method === "POST": {
        const hasPermission = await canManageResponses(
          user.id,
          tenantId,
          supabase,
        )
        if (!hasPermission) {
          throw new Error("Insufficient permissions")
        }
        result = await handleInviteMember(
          await req.json(),
          tenantId,
          user.id,
          supabase,
        )
        break
      }
      case path === "/advance-onboarding" && req.method === "POST":
        result = await handleAdvanceOnboarding(
          await req.json(),
          tenantId,
          supabase,
        )
        break
      case path === "/queue-approved-responses" && req.method === "POST":
        result = await handleQueueApprovedResponses(
          await req.json(),
          tenantId,
          supabase,
        )
        break
      case path === "/sync-location" && req.method === "POST":
        result = await handleSyncLocation(
          await req.json(),
          tenantId,
          user.id,
          supabase,
        )
        break
      // ===== COMPATIBILITY ENDPOINTS FOR FRONTEND =====
      case path === "/reviews/publish" && req.method === "GET":
        // GET /account/api/reviews/publish - get publishing stats
        result = await handleGetResponseQueue(tenantId, supabase)
        break
      case path === "/reviews/publish" && req.method === "POST": {
        // POST /account/api/reviews/publish - queue single response
        const postBody = await req.json()
        if (postBody.responseId) {
          result = await handleQueueApprovedResponses(
            {
              responseIds: [postBody.responseId],
            },
            tenantId,
            supabase,
          )
        } else {
          throw new Error("responseId is required")
        }
        break
      }
      case path === "/reviews/publish" && req.method === "PUT": {
        // PUT /account/api/reviews/publish - batch operations
        const putBody = await req.json()
        if (putBody.action === "queue-all-approved") {
          result = await handleQueueApprovedResponses({}, tenantId, supabase)
        } else if (putBody.action === "queue-selected" && putBody.responseIds) {
          result = await handleQueueApprovedResponses(
            {
              responseIds: putBody.responseIds,
            },
            tenantId,
            supabase,
          )
        } else if (putBody.action === "clear-failed") {
          // Clear failed queue items
          const { error } = await supabase
            .from("response_queue")
            .delete()
            .eq("tenant_id", tenantId)
            .eq("status", "failed")
          if (error) {
            throw new Error(error.message)
          }
          result = {
            success: true,
            message: "Failed queue items cleared",
          }
        } else {
          throw new Error("Invalid action or missing parameters")
        }
        break
      }
      case path === "/reviews/settings" && req.method === "POST":
        // POST /account/api/reviews/settings - update response settings
        result = await handleUpdateResponseSettings(
          await req.json(),
          tenantId,
          supabase,
        )
        break
      // ===== PUT ENDPOINTS =====
      case path.startsWith("/upsell-items/") && req.method === "PUT": {
        const itemId = path.split("/")[2]
        result = await handleUpdateUpsellItem(
          itemId,
          await req.json(),
          tenantId,
          supabase,
        )
        break
      }
      case path === "/profile" && req.method === "PUT":
        result = await handleUpdateProfile(await req.json(), user.id, supabase)
        break
      // ===== DELETE ENDPOINTS =====
      case path.startsWith("/upsell-items/") && req.method === "DELETE": {
        const itemId = path.split("/")[2]
        result = await handleDeleteUpsellItem(itemId, tenantId, supabase)
        break
      }
      default:
        throw new Error(`Not found: ${req.method} ${path}`)
    }
    // Log successful API call
    await supabase.from("system_logs").insert({
      log_level: "info",
      log_source: "v2-api",
      message: `API call: ${endpoint}`,
      context_data: {
        user_id: user.id,
        tenant_id: tenantId,
        endpoint,
        timestamp: new Date().toISOString(),
      },
    })
    return new Response(JSON.stringify(result), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    })
  } catch (error) {
    console.error(`API Error [${endpoint}]:`, error)
    // Log error
    await supabase.from("system_logs").insert({
      log_level: "error",
      log_source: "v2-api",
      message: `API error: ${endpoint}`,
      error_details: {
        error: error.message,
        stack: error.stack,
        endpoint,
      },
    })
    const statusCode = error.message.includes("not found")
      ? 404
      : error.message.includes("denied") || error.message.includes("permission")
        ? 403
        : error.message.includes("Authentication")
          ? 401
          : 400
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
      }),
      {
        status: statusCode,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    )
  }
})
