import { redirect, fail } from "@sveltejs/kit"
import type { PageServerLoad, Actions } from "./$types"
import crypto from "crypto"
import { env as publicEnv } from "$env/dynamic/public"
import { env as privateEnv } from "$env/dynamic/private"
import { PUBLIC_GOOGLE_CLIENT_ID } from "$env/static/public"
import { GOOGLE_CLIENT_SECRET } from "$env/static/private"

// Token encryption functions for secure storage
function getEncryptionKey(): string {
  const key =
    privateEnv.TOKEN_ENCRYPTION_KEY ||
    process.env.TOKEN_ENCRYPTION_KEY ||
    "4a84bd9de473c1f44b26f3ee151ccb4f"
  if (!key || key === "4a84bd9de473c1f44b26f3ee151ccb4f") {
    console.warn(
      "WARNING: Using default encryption key. Set TOKEN_ENCRYPTION_KEY environment variable for production!",
    )
  }
  // Ensure key is 32 bytes for AES-256
  return key.padEnd(32, "0").slice(0, 32)
}

function encryptToken(text: string): string {
  const encryptionKey = getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(
    "aes-256-cbc",
    Buffer.from(encryptionKey, "utf8"),
    iv,
  )

  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])

  // Combine IV and encrypted data and return as base64 string for text storage
  return Buffer.concat([iv, encrypted]).toString("base64")
}

function decryptToken(encryptedString: string): string {
  const encryptionKey = getEncryptionKey()

  try {
    // Convert base64 string back to buffer
    const encryptedBuffer = Buffer.from(encryptedString, "base64")

    // Extract IV (first 16 bytes) and encrypted data
    const iv = encryptedBuffer.slice(0, 16)
    const encrypted = encryptedBuffer.slice(16)

    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(encryptionKey, "utf8"),
      iv,
    )

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ])

    return decrypted.toString("utf8")
  } catch (error) {
    throw new Error(`Token decryption failed: ${error.message}`)
  }
}

// Error message translation for better user experience
function getUserFriendlyErrorMessage(error: string): string {
  const errorMappings: Record<string, string> = {
    // Authentication errors
    REFRESH_TOKEN_INVALID:
      "Your Google connection has expired. Please reconnect your account.",
    invalid_grant:
      "Your authorization has expired. Please reconnect your Google account.",
    ACCESS_TOKEN_SCOPE_INSUFFICIENT:
      "Missing required permissions. Please reconnect with all necessary permissions.",

    // API errors
    "403":
      "Access denied. Please ensure you have management permissions for your Google My Business account.",
    "404":
      "The requested resource was not found. The location or account may have been deleted.",
    "429": "Too many requests. Please wait a few minutes before trying again.",
    "500": "Google's servers are experiencing issues. Please try again later.",
    "502": "Connection to Google failed. Please try again.",
    "503":
      "Google My Business service is temporarily unavailable. Please try again later.",

    // Network errors
    ECONNREFUSED:
      "Could not connect to the service. Please check your internet connection.",
    ETIMEDOUT: "The request timed out. Please try again.",
    NetworkError:
      "Network connection failed. Please check your internet connection.",

    // Permission errors
    PERMISSION_DENIED:
      "You don't have permission to access this resource. Please check your Google My Business role.",
    "location-level access":
      "You have limited access. Some features may not be available with location-level permissions.",

    // Sync errors
    "No Google connection found":
      "Please connect your Google My Business account first.",
    "Token refresh failed":
      "Failed to refresh your authentication. Please try reconnecting your account.",
    "No locations found":
      "No business locations were found. Please check your Google My Business account.",

    // Generic improvements
    "Failed to sync data":
      "We couldn't sync your data right now. Please try again in a few minutes.",
    "Unknown error":
      "Something went wrong. Please try again or contact support if the issue persists.",
  }

  // Check for exact matches first
  if (errorMappings[error]) {
    return errorMappings[error]
  }

  // Check for partial matches
  for (const [key, message] of Object.entries(errorMappings)) {
    if (error.toLowerCase().includes(key.toLowerCase())) {
      return message
    }
  }

  // Return a sanitized version of the original error if no mapping found
  return (
    error
      .replace(/\b\d{3}\b/g, "") // Remove status codes
      .replace(/Error:\s*/gi, "") // Remove "Error:" prefix
      .replace(/\[.*?\]/g, "") // Remove bracketed technical details
      .trim() || "An unexpected error occurred. Please try again."
  )
}

// Helper function for exponential backoff retry
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000,
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      // Don't retry on 4xx errors (client errors)
      if (
        error instanceof Response &&
        error.status >= 400 &&
        error.status < 500
      ) {
        throw lastError
      }

      // If this is the last attempt, throw the error
      if (attempt === maxRetries - 1) {
        throw lastError
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = initialDelay * Math.pow(2, attempt)
      const jitter = Math.random() * 0.3 * baseDelay // 30% jitter
      const delay = Math.floor(baseDelay + jitter)

      console.log(
        `Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms delay. Error: ${lastError.message}`,
      )

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error("Retry failed")
}

// Orchestrated sync function that coordinates all sync operations
async function orchestratedSync(
  supabase: unknown,
  tenantId: string,
  syncType: "oauth_callback" | "manual" | "scheduled" = "manual",
  privateEnv?: Record<string, unknown>,
): Promise<{
  success: boolean
  message: string
  results: {
    accountInfoFetched: boolean
    locationsSynced: number
    locationDetailsSynced: number
    reviewsSynced: number
    errors: string[]
    syncStatusId?: string
  }
}> {
  const results = {
    accountInfoFetched: false,
    locationsSynced: 0,
    locationDetailsSynced: 0,
    reviewsSynced: 0,
    errors: [] as string[],
    syncStatusId: undefined as string | undefined,
  }

  try {
    // Ensure we have access to environment variables
    const env = privateEnv || (await import("$env/dynamic/private")).env

    console.log(`Starting ${syncType} sync for tenant ${tenantId}`)

    // Get the active OAuth token for this tenant
    const { data: tokenData, error: tokenError } = await supabase
      .from("oauth_tokens")
      .select("id, encrypted_access_token, encrypted_refresh_token, expires_at")
      .eq("tenant_id", tenantId)
      .eq("provider", "google")
      .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
      .eq("status", "active")
      .single()

    if (tokenError || !tokenData) {
      const errorMsg = "No Google connection found"
      results.errors.push(errorMsg)
      console.error(`Sync failed for tenant ${tenantId}:`, results)
      return {
        success: false,
        message: getUserFriendlyErrorMessage(errorMsg),
        results,
      }
    }

    // Decrypt the access token (V2 schema stores encrypted tokens)
    const decryptedAccessToken = decryptToken(tokenData.encrypted_access_token)

    // Step 1: Fetch account info
    console.log("Fetching account info for tenant", tenantId)

    try {
      const accountInfoResponse = await retryWithBackoff(
        async () => {
          const response = await fetch(
            `${env.PRIVATE_SUPABASE_URL || publicEnv.PUBLIC_SUPABASE_URL}/functions/v1/v2-external-integrator/fetch-account-info`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.PRIVATE_SUPABASE_SERVICE_ROLE || publicEnv.PUBLIC_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                tenantId,
                accessToken: decryptedAccessToken,
              }),
            },
          )

          if (!response.ok) {
            throw new Error(`Account info fetch failed: ${response.status}`)
          }

          return response
        },
        2,
        500,
      )

      results.accountInfoFetched = true
      const accountResult = await accountInfoResponse.json()
      console.log("Account info fetched:", accountResult)
    } catch (error) {
      console.error("Failed to fetch account info after retries:", error)
      results.errors.push("Failed to fetch account info")
    }

    // Step 2: Sync Google My Business data (locations and reviews) using V2 external integrator
    console.log("🔄 Starting comprehensive sync for tenant", tenantId)

    try {
      // Call the comprehensive sync endpoint in v2-external-integrator
      const syncResponse = await retryWithBackoff(
        async () => {
          const response = await fetch(
            `${env.PRIVATE_SUPABASE_URL || publicEnv.PUBLIC_SUPABASE_URL}/functions/v1/v2-external-integrator/sync-all-locations`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${env.PRIVATE_SUPABASE_SERVICE_ROLE || publicEnv.PUBLIC_SUPABASE_ANON_KEY}`,
              },
              body: JSON.stringify({
                tenantId: tenantId,
              }),
            },
          )

          if (!response.ok) {
            const errorText = await response.text()
            throw new Error(
              `Comprehensive sync failed: ${response.status} - ${errorText}`,
            )
          }

          const responseData = await response.json()
          return responseData
        },
        3,
        2000,
      )

      console.log("Comprehensive sync completed:", syncResponse)

      // Update results with sync data
      results.locationsSynced = syncResponse.locationsSynced || 0
      results.reviewsSynced = syncResponse.reviewsSynced || 0

      if (syncResponse.errors && syncResponse.errors.length > 0) {
        results.errors.push(...syncResponse.errors)
      }
    } catch (error) {
      console.error("Comprehensive sync failed:", error)
      results.errors.push(
        `Comprehensive sync failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      )
    }

    // Step 3: Sync location details (comprehensive data)
    if (results.locationsSynced > 0) {
      console.log("Syncing location details for tenant", tenantId)

      try {
        const locationDetailsResponse = await retryWithBackoff(
          async () => {
            const response = await fetch(
              `${env.PRIVATE_SUPABASE_URL || publicEnv.PUBLIC_SUPABASE_URL}/functions/v1/sync-location-details`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${env.PRIVATE_SUPABASE_SERVICE_ROLE || publicEnv.PUBLIC_SUPABASE_ANON_KEY}`,
                  "X-Cron-Secret":
                    privateEnv.CRON_SECRET ||
                    "cron_secret_2025_reviews_production",
                },
                body: JSON.stringify({
                  tenantId,
                }),
              },
            )

            if (!response.ok) {
              throw new Error(
                `Location details sync failed: ${response.status}`,
              )
            }

            return response
          },
          2,
          1000,
        )

        const detailsResult = await locationDetailsResponse.json()
        results.locationDetailsSynced = detailsResult.locations_synced || 0
      } catch (error) {
        console.error("Location details sync failed after retries:", error)
        results.errors.push("Failed to sync location details")
      }
    }

    // Log final status
    const finalStatus = results.errors.length === 0 ? "completed" : "partial"
    console.log(`Sync ${finalStatus} for tenant ${tenantId}:`, results)

    return {
      success: results.errors.length === 0,
      message:
        results.errors.length === 0
          ? `Sync completed successfully! Synced ${results.locationsSynced} locations with ${results.reviewsSynced} reviews.`
          : `Sync completed with some errors. Synced ${results.locationsSynced} locations with ${results.reviewsSynced} reviews.`,
      results,
    }
  } catch (error) {
    console.error("Orchestrated sync error:", error)
    const errorMsg =
      error instanceof Error ? error.message : "Unknown sync error"
    results.errors.push(errorMsg)
    console.error(`Sync failed for tenant ${tenantId}:`, results)

    return {
      success: false,
      message: getUserFriendlyErrorMessage(errorMsg),
      results,
    }
  }
}

export const load: PageServerLoad = async ({
  locals: { safeGetSession, supabaseServiceRole },
  cookies,
  url,
}) => {
  const { user } = await safeGetSession()
  if (!user) {
    redirect(303, "/login/sign_in")
  }

  const orgId = cookies.get("current_tenant_id")
  if (!orgId) {
    redirect(303, "/account")
  }

  // Debug: First check all tokens for this tenant
  const { data: allTenantTokens, error: allTokensError } =
    await supabaseServiceRole
      .from("oauth_tokens")
      .select("*")
      .eq("tenant_id", orgId)

  console.log(`[DEBUG] All tokens query for tenant ${orgId}:`, {
    tokensFound: allTenantTokens?.length || 0,
    error: allTokensError?.message,
    tokens: allTenantTokens?.map((t) => ({
      id: t.id,
      provider: t.provider,
      provider_scope: t.provider_scope,
      status: t.status,
      expires_at: t.expires_at,
      created_at: t.created_at,
    })),
  })

  // V2 Schema: Check if tenant has OAuth tokens (for detailed health display)
  const { data: oauthToken, error: tokenCheckError } = await supabaseServiceRole
    .from("oauth_tokens")
    .select(
      "id, provider, provider_scope, status, expires_at, last_refresh_at, last_used_at, token_metadata, provider_user_email, created_at, last_refresh_error",
    )
    .eq("tenant_id", orgId)
    .eq("provider", "google")
    .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
    .in("status", ["active", "refresh_failed", "expired"]) // Include failed tokens
    .single()

  // Connection detection based on oauth_tokens table  
  const hasGoogleConnection = !tokenCheckError && !!oauthToken

  console.log(`[DEBUG] Token check for tenant ${orgId}:`, {
    hasOAuthToken: !!oauthToken,
    tokenStatus: oauthToken?.status,
    hasConnection: hasGoogleConnection,
    error: tokenCheckError?.message,
  })

  // Handle OAuth callback
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  if (error) {
    return {
      googleConnected: hasGoogleConnection,
      businessAccounts: null,
      error:
        error === "access_denied"
          ? "Authorization was cancelled"
          : `OAuth error: ${error}`,
    }
  }

  if (code && state) {
    // Verify state matches
    const expectedState = cookies.get("google_oauth_state")
    if (!expectedState || state !== expectedState) {
      return {
        googleConnected: hasGoogleConnection,
        businessAccounts: null,
        error: "Invalid OAuth state - please try again",
      }
    }

    // Check if this is a reconnection (preserving data) or new connection
    const isReconnection = cookies.get("google_oauth_reconnect") === "true"

    try {
      // Handle OAuth callback
      const redirectUrl = url.origin + "/account/integrations"
      console.log(
        `OAuth callback - orgId: ${orgId}, userId: ${user.id}, redirectUrl: ${redirectUrl}, isReconnection: ${isReconnection}`,
      )

      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id:
            PUBLIC_GOOGLE_CLIENT_ID || publicEnv.PUBLIC_GOOGLE_CLIENT_ID || "",
          client_secret:
            GOOGLE_CLIENT_SECRET || privateEnv.GOOGLE_CLIENT_SECRET || "",
          redirect_uri: redirectUrl,
          grant_type: "authorization_code",
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text()
        throw new Error(`Failed to exchange code: ${error}`)
      }

      const tokens = await tokenResponse.json()

      // First check if a token already exists for this tenant/provider/scope
      const { data: existingToken } = await supabaseServiceRole
        .from("oauth_tokens")
        .select("id")
        .eq("tenant_id", orgId)
        .eq("provider", "google")
        .eq("provider_scope", "https://www.googleapis.com/auth/business.manage")
        .single()

      let tokenStoreResult, insertError

      if (existingToken) {
        // Update existing token - reset status to active on successful reconnection
        const { data, error } = await supabaseServiceRole
          .from("oauth_tokens")
          .update({
            user_id: user.id,
            encrypted_access_token: encryptToken(tokens.access_token),
            encrypted_refresh_token: encryptToken(tokens.refresh_token),
            expires_at: new Date(
              Date.now() + tokens.expires_in * 1000,
            ).toISOString(),
            status: "active", // Reset to active on successful OAuth
            refresh_attempts: 0, // Reset retry counter
            last_refresh_at: null,
            last_refresh_error: null, // Clear any previous errors
            token_metadata: {
              oauth_scopes: [
                "https://www.googleapis.com/auth/business.manage",
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile",
              ],
              token_type: "Bearer",
              connected_at: new Date().toISOString(),
              is_reconnection: isReconnection,
              previous_status: existingToken.status, // Track what status was before
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingToken.id)
          .select()
          .single()

        tokenStoreResult = data
        insertError = error
      } else {
        // Insert new token
        const { data, error } = await supabaseServiceRole
          .from("oauth_tokens")
          .insert({
            tenant_id: orgId,
            user_id: user.id,
            provider: "google",
            provider_scope: "https://www.googleapis.com/auth/business.manage",
            encrypted_access_token: encryptToken(tokens.access_token),
            encrypted_refresh_token: encryptToken(tokens.refresh_token),
            expires_at: new Date(
              Date.now() + tokens.expires_in * 1000,
            ).toISOString(),
            status: "active",
            token_metadata: {
              oauth_scopes: [
                "https://www.googleapis.com/auth/business.manage",
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile",
              ],
              token_type: "Bearer",
              connected_at: new Date().toISOString(),
              is_reconnection: isReconnection,
            },
            created_by: user.id,
          })
          .select()
          .single()

        tokenStoreResult = data
        insertError = error
      }

      if (insertError) {
        throw new Error(`Failed to store OAuth tokens: ${insertError.message}`)
      }

      // Verify tokens were stored successfully
      const { data: verifyTokens, error: verifyError } =
        await supabaseServiceRole
          .from("oauth_tokens")
          .select("encrypted_access_token")
          .eq("tenant_id", orgId)
          .eq("provider", "google")
          .eq("status", "active")
          .single()

      if (verifyError || !verifyTokens?.encrypted_access_token) {
        throw new Error(
          "Token storage verification failed - tokens were not saved properly",
        )
      }

      console.log(`OAuth tokens successfully stored for tenant ${orgId}`, {
        tokenStored: !!verifyTokens.encrypted_access_token,
        tokenId: tokenStoreResult?.id,
      })

      // Clear state cookies
      cookies.delete("google_oauth_state", { path: "/" })
      cookies.delete("google_oauth_reconnect", { path: "/" })

      // Check if this is a new user's first connection (for onboarding)
      // Skip onboarding if this is a reconnection
      const { data: tenant } = await supabaseServiceRole
        .from("tenants")
        .select("onboarding_completed")
        .eq("id", orgId)
        .single()

      const isFirstConnection = !isReconnection && !tenant?.onboarding_completed

      // Trigger orchestrated sync after successful OAuth connection
      try {
        console.log(
          `Triggering direct sync for tenant ${orgId} after OAuth connection`,
        )

        const syncResult = await orchestratedSync(
          supabaseServiceRole,
          orgId,
          "oauth_callback",
          privateEnv,
        )

        if (!syncResult.success) {
          console.error(
            "OAuth sync had errors:",
            syncResult.results?.errors || syncResult.message,
          )
        }
      } catch (syncError) {
        console.error("Error during immediate sync after OAuth:", syncError)
        // Don't fail the OAuth flow if sync fails - user can manually sync later
      }

      // Start customer onboarding workflow for new users
      if (isFirstConnection) {
        try {
          console.log(
            `Starting onboarding workflow for new user organization ${orgId}`,
          )

          const { error: workflowError } = await supabaseServiceRole.rpc(
            "api_start_workflow",
            {
              p_tenant_id: orgId,
              p_workflow_type: "customer_onboarding",
              p_context: {
                trigger: "oauth_callback",
                first_connection: true,
                user_id: user.id,
              },
              p_priority: 1,
            },
          )

          if (workflowError) {
            console.error("Error starting onboarding workflow:", workflowError)
          } else {
            console.log("Onboarding workflow started successfully")
          }
        } catch (workflowError) {
          console.error("Error starting onboarding workflow:", workflowError)
        }

        // Redirect to onboarding for new users
        redirect(303, "/account/onboarding")
      }

      // Redirect to clear URL parameters and show success for existing users
      redirect(303, "/account/integrations?success=true")
    } catch (err) {
      // Re-throw redirects (they're not errors)
      if (
        err &&
        typeof err === "object" &&
        "status" in err &&
        "location" in err
      ) {
        throw err
      }

      console.error("Error exchanging OAuth code:", err)
      // Clear state cookies on error
      cookies.delete("google_oauth_state", { path: "/" })
      cookies.delete("google_oauth_reconnect", { path: "/" })

      return {
        googleConnected: hasGoogleConnection,
        businessAccounts: null,
        error:
          err instanceof Error
            ? `OAuth Error: ${err.message}`
            : "Failed to connect Google account",
      }
    }
  }

  // V2 Schema: Get locations (without OAuth tokens, which are in oauth_tokens table)
  const accessibleLocations = await supabaseServiceRole
    .from("locations")
    .select(
      `
      id, name, address, phone, website, google_place_id, platform_data, metadata, 
      sync_enabled, last_sync_at, status, created_at, updated_at
    `,
    )
    .eq("tenant_id", orgId)
    .order("created_at", { ascending: false })

  const locationsList = accessibleLocations?.data || []
  let businessAccounts = null
  let invitations = null

  if (hasGoogleConnection) {
    try {
      // Check if token needs refresh
      const tokenExpired = oauthToken.expires_at
        ? new Date(oauthToken.expires_at) < new Date()
        : true

      if (tokenExpired) {
        // Get refresh token for token refresh
        const { data: refreshTokenData } = await supabaseServiceRole
          .from("oauth_tokens")
          .select("encrypted_refresh_token")
          .eq("id", oauthToken.id)
          .single()

        if (refreshTokenData?.encrypted_refresh_token) {
          // Refresh the token
          const refreshResponse = await fetch(
            "https://oauth2.googleapis.com/token",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                refresh_token: decryptToken(refreshTokenData.encrypted_refresh_token),
                client_id:
                  PUBLIC_GOOGLE_CLIENT_ID ||
                  publicEnv.PUBLIC_GOOGLE_CLIENT_ID ||
                  "",
                client_secret:
                  GOOGLE_CLIENT_SECRET || privateEnv.GOOGLE_CLIENT_SECRET || "",
                grant_type: "refresh_token",
              }),
            },
          )

          if (refreshResponse.ok) {
            const newTokens = await refreshResponse.json()

            // Update the OAuth token with new access token
            await supabaseServiceRole
              .from("oauth_tokens")
              .update({
                encrypted_access_token: encryptToken(newTokens.access_token),
                expires_at: new Date(
                  Date.now() + newTokens.expires_in * 1000,
                ).toISOString(),
                last_refresh_at: new Date().toISOString(),
                refresh_attempts: 0,
                last_refresh_error: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", oauthToken.id)
          }
        }
      }

      // For now, we'll use the locations from the database
      // In production, you'd make actual GMB API calls here
      businessAccounts = []
      invitations = []
    } catch (err) {
      console.error("Error fetching business data:", err)
      businessAccounts = null
      invitations = null
    }
  }

  // Get review counts for each location to show sync status
  let locationReviewCounts: Record<string, number> = {}
  let lastSyncTime: string | null = null
  if (hasGoogleConnection) {
    const { data: reviewCounts } = await supabaseServiceRole
      .from("reviews")
      .select("location_id")
      .eq("tenant_id", orgId)

    if (reviewCounts) {
      locationReviewCounts = reviewCounts.reduce(
        (acc, review) => {
          acc[review.location_id] = (acc[review.location_id] || 0) + 1
          return acc
        },
        {} as Record<string, number>,
      )
    }

    // Get last sync time from locations
    const { data: lastSync } = await supabaseServiceRole
      .from("locations")
      .select("last_sync_at")
      .eq("tenant_id", orgId)
      .not("last_sync_at", "is", null)
      .order("last_sync_at", { ascending: false })
      .limit(1)
      .single()

    lastSyncTime = lastSync?.last_sync_at || null
  }

  // V2 Schema: Enhanced token health check using oauth_tokens table
  let tokenHealth = null
  if (hasGoogleConnection && oauthToken) {
    const expiresAt = oauthToken.expires_at
      ? new Date(oauthToken.expires_at)
      : null

    const now = new Date()
    const expiresIn = expiresAt
      ? (expiresAt.getTime() - now.getTime()) / 1000
      : null

    const tokenMetadata = oauthToken.token_metadata || {}
    const connectedAt = tokenMetadata.connected_at || oauthToken.created_at
    const lastRefreshed = oauthToken.last_refresh_at
    const scopes = tokenMetadata.oauth_scopes || []

    // Get refresh token availability
    const { data: refreshTokenData } = await supabaseServiceRole
      .from("oauth_tokens")
      .select("encrypted_refresh_token")
      .eq("id", oauthToken.id)
      .single()

    const errors: string[] = []

    // Check for refresh_failed status first
    if (oauthToken.status === "refresh_failed") {
      errors.push("Token refresh failed - re-authentication required")
      if (oauthToken.last_refresh_error) {
        errors.push(`Error: ${oauthToken.last_refresh_error}`)
      }
    } else if (oauthToken.status === "expired") {
      errors.push("Token expired - re-authentication required")
    } else if (expiresIn !== null && expiresIn <= 0) {
      errors.push("Token expired")
    }

    if (!scopes.includes("https://www.googleapis.com/auth/business.manage")) {
      errors.push("Missing required business.manage scope")
    }
    if (!refreshTokenData?.encrypted_refresh_token) {
      errors.push("Missing refresh token")
    }

    tokenHealth = {
      healthy:
        oauthToken.status === "active" &&
        expiresIn !== null &&
        expiresIn > 3600 &&
        errors.length === 0,
      needsRefresh:
        oauthToken.status === "active" &&
        expiresIn !== null &&
        expiresIn <= 3600 &&
        expiresIn > 0,
      needsReauth:
        oauthToken.status === "refresh_failed" ||
        oauthToken.status === "expired" ||
        !refreshTokenData?.encrypted_refresh_token ||
        (expiresIn !== null && expiresIn <= 0),
      expiresIn,
      errors,
      connectedAt,
      lastRefreshed,
      scopes: scopes.length,
      tokenStatus: oauthToken.status,
    }

    console.log(`Token health for tenant ${orgId}:`, {
      tokenId: oauthToken.id,
      tokenStatus: oauthToken.status,
      expiresIn,
      healthy: tokenHealth.healthy,
      errors: errors.length,
    })
  }

  return {
    googleConnected: hasGoogleConnection,
    businessAccounts,
    accessibleLocations: locationsList,
    invitations,
    locationReviewCounts,
    lastSyncTime,
    tokenHealth,
    success: url.searchParams.get("success") === "true",
    successType: url.searchParams.get("success"),
    disconnected: url.searchParams.get("disconnected") === "true",
  }
}

export const actions: Actions = {
  resetTokenStatus: async ({
    locals: { safeGetSession, supabaseServiceRole },
    cookies,
  }) => {
    const { user } = await safeGetSession()
    if (!user) {
      return fail(401, { error: "Unauthorized" })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return fail(400, { error: "No organization selected" })
    }

    try {
      // Reset the token status to active to allow retry
      const { data, error } = await supabaseServiceRole
        .from("oauth_tokens")
        .update({
          status: "active",
          refresh_attempts: 0,
          last_refresh_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", orgId)
        .eq("provider", "google")
        .eq("status", "refresh_failed")
        .select()
        .single()

      if (error) {
        console.error("Failed to reset token status:", error)
        return fail(500, { error: "Failed to reset token status" })
      }

      if (!data) {
        return fail(404, { error: "No failed token found to reset" })
      }

      console.log(`Reset token status for tenant ${orgId}`)
      return {
        success: true,
        message: "Token status reset. Try refreshing the connection.",
      }
    } catch (error) {
      console.error("Error resetting token status:", error)
      return fail(500, { error: "Failed to reset token" })
    }
  },

  connectGoogle: async ({ cookies, request }) => {
    try {
      const clientId =
        PUBLIC_GOOGLE_CLIENT_ID ||
        publicEnv.PUBLIC_GOOGLE_CLIENT_ID ||
        process.env.PUBLIC_GOOGLE_CLIENT_ID

      if (!clientId) {
        console.error("OAuth Connect - No client ID found in any source")
        return fail(500, { error: "Google Client ID not configured" })
      }

      // Generate random state for CSRF protection
      const state = crypto.randomUUID()
      cookies.set("google_oauth_state", state, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 10, // 10 minutes
      })

      const url = new URL(request.url)
      const redirectUri = `${url.origin}/account/integrations`

      // Build OAuth URL
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
      authUrl.searchParams.append("client_id", clientId)
      authUrl.searchParams.append("redirect_uri", redirectUri)
      authUrl.searchParams.append("response_type", "code")
      authUrl.searchParams.append(
        "scope",
        [
          "https://www.googleapis.com/auth/business.manage",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ].join(" "),
      )
      authUrl.searchParams.append("state", state)
      authUrl.searchParams.append("access_type", "offline")
      authUrl.searchParams.append("prompt", "consent")

      // Return the redirect URL instead of using redirect() in an action
      return { redirect: authUrl.toString() }
    } catch (error) {
      console.error("connectGoogle error:", error)
      return fail(500, {
        error:
          error instanceof Error
            ? error.message
            : "Failed to initiate Google connection",
      })
    }
  },

  disconnectGoogle: async ({
    locals: { safeGetSession, supabaseServiceRole },
    cookies,
    request,
  }) => {
    const { user } = await safeGetSession()
    if (!user) {
      return fail(401, { error: "Unauthorized" })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return fail(400, { error: "No organization selected" })
    }

    const formData = await request.formData()
    const confirmDisconnect = formData.get("confirmDisconnect")

    if (confirmDisconnect !== "true") {
      return fail(400, { error: "Disconnect confirmation required" })
    }

    try {
      console.log(
        `Starting Google My Business disconnect for organization ${orgId}`,
      )

      // Start a transaction for comprehensive cleanup
      const cleanupOperations = []

      // 1. Clean up response queue
      const { error: queueError } = await supabaseServiceRole
        .from("response_queue")
        .delete()
        .eq("tenant_id", orgId)

      if (queueError) {
        console.error("Error cleaning response_queue:", queueError)
        cleanupOperations.push("response_queue: failed")
      } else {
        cleanupOperations.push("response_queue: cleaned")
      }

      // 2. Clean up response analytics
      const { error: analyticsError } = await supabaseServiceRole
        .from("response_analytics")
        .delete()
        .eq("tenant_id", orgId)

      if (analyticsError) {
        console.error("Error cleaning response_analytics:", analyticsError)
        cleanupOperations.push("response_analytics: failed")
      } else {
        cleanupOperations.push("response_analytics: cleaned")
      }

      // 3. Clean up response settings
      const { error: settingsError } = await supabaseServiceRole
        .from("response_settings")
        .delete()
        .eq("tenant_id", orgId)

      if (settingsError) {
        console.error("Error cleaning response_settings:", settingsError)
        cleanupOperations.push("response_settings: failed")
      } else {
        cleanupOperations.push("response_settings: cleaned")
      }

      // 4. Clean up batch generation jobs
      const { error: batchJobsError } = await supabaseServiceRole
        .from("batch_generation_jobs")
        .delete()
        .eq("tenant_id", orgId)

      if (batchJobsError) {
        console.error("Error cleaning batch_generation_jobs:", batchJobsError)
        cleanupOperations.push("batch_generation_jobs: failed")
      } else {
        cleanupOperations.push("batch_generation_jobs: cleaned")
      }

      // 5. Clean up AI responses
      const { error: aiResponsesError } = await supabaseServiceRole
        .from("ai_responses")
        .delete()
        .eq("tenant_id", orgId)

      if (aiResponsesError) {
        console.error("Error cleaning ai_responses:", aiResponsesError)
        cleanupOperations.push("ai_responses: failed")
      } else {
        cleanupOperations.push("ai_responses: cleaned")
      }

      // 6. Clean up reviews (Google platform only to preserve other review sources)
      const { error: reviewsError } = await supabaseServiceRole
        .from("reviews")
        .delete()
        .eq("tenant_id", orgId)
        .eq("platform", "google")

      if (reviewsError) {
        console.error("Error cleaning Google reviews:", reviewsError)
        cleanupOperations.push("google_reviews: failed")
      } else {
        cleanupOperations.push("google_reviews: cleaned")
      }

      // 7. Clean up OAuth tokens
      const { error: oauthTokensError } = await supabaseServiceRole
        .from("oauth_tokens")
        .delete()
        .eq("tenant_id", orgId)
        .eq("provider", "google")

      if (oauthTokensError) {
        console.error("Error cleaning OAuth tokens:", oauthTokensError)
        cleanupOperations.push("oauth_tokens: failed")
      } else {
        cleanupOperations.push("oauth_tokens: cleaned")
      }

      console.log(
        `Google My Business disconnect completed for organization ${orgId}:`,
        cleanupOperations,
      )

      redirect(303, "/account/integrations?disconnected=true")
    } catch (error) {
      // Re-throw redirects (they're not errors)
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        "location" in error
      ) {
        throw error
      }

      console.error("Error disconnecting Google My Business:", error)
      return fail(500, {
        error:
          error instanceof Error
            ? error.message
            : "Failed to disconnect Google My Business account",
      })
    }
  },

  refreshConnection: async ({
    locals: { safeGetSession, supabaseServiceRole },
    cookies,
  }) => {
    const { user } = await safeGetSession()
    if (!user) {
      return fail(401, { error: "Unauthorized" })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return fail(400, { error: "No organization selected" })
    }

    try {
      // Get the OAuth token for this tenant
      const { data: oauthToken } = await supabaseServiceRole
        .from("oauth_tokens")
        .select("id, encrypted_refresh_token")
        .eq("tenant_id", orgId)
        .eq("provider", "google")
        .eq("status", "active")
        .single()

      if (!oauthToken) {
        return fail(400, { error: "No Google connection found" })
      }

      // Refresh the token
      const refreshResponse = await fetch(
        "https://oauth2.googleapis.com/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            refresh_token: decryptToken(oauthToken.encrypted_refresh_token),
            client_id:
              PUBLIC_GOOGLE_CLIENT_ID ||
              publicEnv.PUBLIC_GOOGLE_CLIENT_ID ||
              "",
            client_secret:
              GOOGLE_CLIENT_SECRET || privateEnv.GOOGLE_CLIENT_SECRET || "",
            grant_type: "refresh_token",
          }),
        },
      )

      if (!refreshResponse.ok) {
        const error = await refreshResponse.text()
        console.error("Token refresh failed:", error)
        return fail(400, {
          error: "Connection is no longer valid. Please reconnect.",
        })
      }

      const newTokens = await refreshResponse.json()

      // V2 Schema: Update the OAuth token with new access token
      await supabaseServiceRole
        .from("oauth_tokens")
        .update({
          encrypted_access_token: encryptToken(newTokens.access_token),
          expires_at: new Date(
            Date.now() + newTokens.expires_in * 1000,
          ).toISOString(),
          last_refresh_at: new Date().toISOString(),
          refresh_attempts: 0,
          last_refresh_error: null,
          token_metadata: {
            ...oauthToken.token_metadata,
            refresh_count: (oauthToken.token_metadata?.refresh_count || 0) + 1,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", oauthToken.id)

      return { success: true, message: "Connection refreshed successfully" }
    } catch (error) {
      console.error("Error refreshing connection:", error)
      return fail(500, { error: "Failed to refresh connection" })
    }
  },

  reconnectGoogle: async ({ cookies, request }) => {
    // This is similar to connectGoogle but specifically for re-authentication
    // It keeps the existing data and just updates the tokens
    try {
      const clientId =
        PUBLIC_GOOGLE_CLIENT_ID ||
        publicEnv.PUBLIC_GOOGLE_CLIENT_ID ||
        process.env.PUBLIC_GOOGLE_CLIENT_ID

      if (!clientId) {
        console.error("OAuth Reconnect - No client ID found in any source")
        return fail(500, { error: "Google Client ID not configured" })
      }

      // Generate random state for CSRF protection
      const state = crypto.randomUUID()
      cookies.set("google_oauth_state", state, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 10, // 10 minutes
      })

      // Set a flag to indicate this is a reconnection, not a new connection
      cookies.set("google_oauth_reconnect", "true", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 10, // 10 minutes
      })

      const url = new URL(request.url)
      const redirectUri = `${url.origin}/account/integrations`

      // Build OAuth URL
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth")
      authUrl.searchParams.append("client_id", clientId)
      authUrl.searchParams.append("redirect_uri", redirectUri)
      authUrl.searchParams.append("response_type", "code")
      authUrl.searchParams.append(
        "scope",
        [
          "https://www.googleapis.com/auth/business.manage",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
        ].join(" "),
      )
      authUrl.searchParams.append("state", state)
      authUrl.searchParams.append("access_type", "offline")
      authUrl.searchParams.append("prompt", "consent") // Force re-consent to get new refresh token

      // Return the redirect URL instead of using redirect() in an action
      return { redirect: authUrl.toString() }
    } catch (error) {
      console.error("reconnectGoogle error:", error)
      return fail(500, {
        error:
          error instanceof Error
            ? error.message
            : "Failed to initiate Google reconnection",
      })
    }
  },

  syncNow: async ({
    locals: { safeGetSession, supabaseServiceRole },
    cookies,
  }) => {
    const { user } = await safeGetSession()
    if (!user) {
      return fail(401, { error: "Unauthorized" })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return fail(400, { error: "No organization selected" })
    }

    try {
      console.log(
        `🚀 Manual sync triggered for tenant ${orgId} by user ${user.id}`,
      )

      const syncResult = await orchestratedSync(
        supabaseServiceRole,
        orgId,
        "manual",
        privateEnv,
      )

      if (syncResult.success) {
        return {
          success: true,
          message: syncResult.message,
          syncResults: syncResult.results,
        }
      } else {
        return fail(500, {
          error: syncResult.message,
          syncResults: syncResult.results,
        })
      }
    } catch (error) {
      console.error("Error during manual sync:", error)
      return fail(500, {
        error: error instanceof Error ? error.message : "Failed to sync data",
      })
    }
  },
}
