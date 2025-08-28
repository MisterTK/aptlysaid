import type { SupabaseClient } from "@supabase/supabase-js"
import * as crypto from "crypto"
import { GoogleMyBusinessService, type GoogleToken } from "./google-my-business"
import { GoogleMyBusinessServiceAlt } from "./GoogleMyBusinessServiceAlt"

const GOOGLE_OAUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_MY_BUSINESS_SCOPE =
  "https://www.googleapis.com/auth/business.manage"

interface WrapperConfig {
  clientId?: string
  clientSecret?: string
  encryptionKey?: string
}

export class GoogleMyBusinessWrapperV3 {
  private static refreshMutex: Map<
    string,
    Promise<{ success: boolean; error?: string }>
  > = new Map()

  constructor(
    private supabase: SupabaseClient | null,
    private config?: WrapperConfig,
  ) {}

  private getEncryptionKey(): string {
    const key =
      this.config?.encryptionKey ||
      process.env.TOKEN_ENCRYPTION_KEY ||
      "4a84bd9de473c1f44b26f3ee151ccb4f"
    if (!key || key === "4a84bd9de473c1f44b26f3ee151ccb4f") {
      console.warn(
        "WARNING: Using default encryption key. Set TOKEN_ENCRYPTION_KEY environment variable for production!",
      )
    }

    return key.padEnd(32, "0").slice(0, 32)
  }

  public encrypt(text: string): string {
    const encryptionKey = this.getEncryptionKey()

    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv(
      "aes-256-cbc",
      Buffer.from(encryptionKey, "utf8"),
      iv,
    )

    const encrypted = Buffer.concat([
      cipher.update(text, "utf8"),
      cipher.final(),
    ])

    return Buffer.concat([iv, encrypted]).toString("base64")
  }

  public decrypt(encryptedString: string): string {
    const encryptionKey = this.getEncryptionKey()
    console.log("🔐 [V3 Wrapper] Starting token decryption")

    try {

      const encryptedBuffer = Buffer.from(encryptedString, "base64")

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

      console.log("✅ [V3 Wrapper] Token decryption successful")
      return decrypted.toString("utf8")
    } catch (error) {
      console.error("❌ [V3 Wrapper] Token decryption failed:", error.message)
      throw new Error(`Token decryption failed: ${error.message}`)
    }
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const clientId = this.config?.clientId
    if (!clientId) {
      throw new Error("Google client ID not configured")
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: `openid email profile ${GOOGLE_MY_BUSINESS_SCOPE}`,
      access_type: "offline",
      prompt: "consent",
      state,
    })

    return `${GOOGLE_OAUTH_URL}?${params}`
  }

  async handleOAuthCallback(
    code: string,
    organizationId: string,
    userId: string,
    redirectUri: string,
  ): Promise<void> {
    console.log("V3 handleOAuthCallback - Starting token exchange")

    if (!this.config?.clientId || !this.config?.clientSecret) {
      console.error("V3 handleOAuthCallback - Missing credentials:", {
        clientId: !!this.config?.clientId,
        clientSecret: !!this.config?.clientSecret,
      })
      throw new Error("Google OAuth credentials not configured")
    }

    if (!this.supabase) {
      throw new Error("Supabase client required for token storage")
    }

    console.log("V3 handleOAuthCallback - Exchanging code for tokens")

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    const tokens = await tokenResponse.json()

    if (tokens.error) {
      console.error("V3 handleOAuthCallback - Token exchange error:", {
        error: tokens.error,
        description: tokens.error_description,
        status: tokenResponse.status,
      })
      throw new Error(tokens.error_description || tokens.error)
    }

    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error("No tokens received from Google")
    }

    const grantedScopes = await this.verifyTokenScopes(tokens.access_token)
    const hasBusinessManageScope = grantedScopes.includes(
      "https://www.googleapis.com/auth/business.manage",
    )

    console.log(
      `V3 Token scopes for organization ${organizationId}:`,
      grantedScopes,
    )
    console.log(`V3 Has business.manage scope: ${hasBusinessManageScope}`)

    const encryptedAccessToken = this.encrypt(tokens.access_token)
    const encryptedRefreshToken = this.encrypt(tokens.refresh_token)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)

    const { data: oauthToken, error: tokenError } = await this.supabase
      .from("oauth_tokens")
      .upsert(
        {
          tenant_id: organizationId,
          user_id: userId,
          provider: "google",
          provider_scope: GOOGLE_MY_BUSINESS_SCOPE,
          encrypted_access_token: encryptedAccessToken,
          encrypted_refresh_token: encryptedRefreshToken,
          expires_at: expiresAt.toISOString(),
          status: "active",
          token_metadata: {
            google_scopes: grantedScopes,
            has_business_manage_scope: hasBusinessManageScope,
            connected_at: new Date().toISOString(),
          },
          created_by: userId,
        },
        {
          onConflict: "tenant_id,provider,provider_scope",
        },
      )
      .select("id")
      .single()

    if (tokenError) {
      console.error("V3 Error storing OAuth token:", tokenError)
      throw tokenError
    }

    const { error: linkError } = await this.supabase
      .from("locations")
      .update({ oauth_token_id: oauthToken.id })
      .eq("tenant_id", organizationId)

    if (linkError) {
      console.error("V3 Error linking locations to OAuth token:", linkError)

    }

    if (!hasBusinessManageScope) {
      console.warn(
        `WARNING: Organization ${organizationId} connected without business.manage scope. Limited functionality available.`,
      )
    }

    console.log(
      `V3 Successfully stored OAuth token for organization ${organizationId}`,
    )
  }

  async hasValidToken(organizationId: string): Promise<boolean> {
    if (!this.supabase) {
      await this.logTokenValidation(
        organizationId,
        false,
        "No Supabase client available",
      )
      return false
    }

    try {
      const { data, error } = await this.supabase
        .from("oauth_tokens")
        .select(
          "expires_at, encrypted_access_token, encrypted_refresh_token, status",
        )
        .eq("tenant_id", organizationId)
        .eq("provider", "google")
        .eq("provider_scope", GOOGLE_MY_BUSINESS_SCOPE)
        .eq("status", "active")
        .limit(1)
        .single()

      if (error || !data) {
        await this.logTokenValidation(
          organizationId,
          false,
          `V3 OAuth token not found: ${error?.message || "No data"}`,
        )
        return false
      }

      if (
        !data.encrypted_access_token ||
        !data.encrypted_refresh_token ||
        data.encrypted_access_token.length === 0 ||
        data.encrypted_refresh_token.length === 0
      ) {
        await this.logTokenValidation(
          organizationId,
          false,
          "V3 Empty or missing encrypted tokens",
        )
        return false
      }

      if (!data.expires_at) {
        await this.logTokenValidation(
          organizationId,
          false,
          "V3 Missing token expiration",
        )
        return false
      }

      const expiresAt = new Date(data.expires_at)
      const now = new Date()

      if (expiresAt <= now) {
        await this.logTokenValidation(
          organizationId,
          false,
          "V3 OAuth token already expired",
        )
        return await this.attemptTokenRefresh(organizationId)
      }

      const oneMinuteFromNow = new Date(now.getTime() + 1 * 60 * 1000)

      if (expiresAt <= oneMinuteFromNow) {
        await this.logTokenValidation(
          organizationId,
          true,
          "V3 OAuth token expiring very soon, attempting refresh",
        )
        const refreshed = await this.attemptTokenRefresh(organizationId)
        if (!refreshed) {
          await this.logTokenValidation(
            organizationId,
            true,
            "V3 Refresh failed but token still technically valid",
          )
        }
        return true
      }

      await this.logTokenValidation(
        organizationId,
        true,
        "V3 OAuth token is valid and not expiring soon",
      )
      return true
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Unknown error during token validation"
      await this.logTokenValidation(organizationId, false, `V3 ${errorMessage}`)
      console.error(
        `V3 Unexpected error in hasValidToken for ${organizationId}:`,
        err,
      )
      return false
    }
  }

  private async attemptTokenRefresh(organizationId: string): Promise<boolean> {
    const maxRetries = 3
    const retryDelays = [1000, 2000, 4000]

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.logTokenValidation(
          organizationId,
          true,
          `V3 Token refresh attempt ${attempt}/${maxRetries}`,
        )

        const service = await this.createService(organizationId)
        if (!service) {
          await this.logTokenValidation(
            organizationId,
            false,
            "V3 Failed to create service for token refresh",
          )
          if (attempt === maxRetries) {
            return false
          }
          continue
        }

        await this.logTokenValidation(
          organizationId,
          true,
          "V3 Token validation successful (service created)",
        )
        return true
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error"

        if (err instanceof Error) {
          if (
            err.message.includes("REFRESH_TOKEN_INVALID") ||
            err.message.includes("invalid_grant")
          ) {
            await this.logTokenValidation(
              organizationId,
              false,
              `V3 Invalid refresh token - re-authentication required: ${errorMessage}`,
            )
            return false
          }
        }

        await this.logTokenValidation(
          organizationId,
          false,
          `V3 Token refresh attempt ${attempt} failed: ${errorMessage}`,
        )

        if (attempt < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, retryDelays[attempt - 1]),
          )
        }
      }
    }

    await this.logTokenValidation(
      organizationId,
      false,
      `V3 All ${maxRetries} token refresh attempts failed`,
    )
    return false
  }

  private async logTokenValidation(
    organizationId: string,
    isValid: boolean,
    reason: string,
  ): Promise<void> {

    console.log(
      `[V3 Token Validation] ${organizationId}: ${isValid ? "✅" : "❌"} ${reason}`,
    )
  }

  async getTokens(organizationId: string): Promise<GoogleToken | null> {
    if (!this.supabase) {
      console.error(`V3 No Supabase client available for ${organizationId}`)
      return null
    }

    const { data: unknownToken } = await this.supabase
      .from("oauth_tokens")
      .select("id, status, expires_at")
      .eq("tenant_id", organizationId)
      .eq("provider", "google")
      .limit(1)
      .single()

    if (anyToken) {
      console.log(`V3 Token status check for ${organizationId}:`, {
        status: unknownToken.status,
        expires_at: unknownToken.expires_at,
        isExpired: new Date(anyToken.expires_at) < new Date(),
      })
    }

    const { data, error } = await this.supabase
      .from("oauth_tokens")
      .select(
        "id, encrypted_access_token, encrypted_refresh_token, expires_at, status",
      )
      .eq("tenant_id", organizationId)
      .eq("provider", "google")
      .eq("provider_scope", GOOGLE_MY_BUSINESS_SCOPE)
      .eq("status", "active")
      .limit(1)
      .single()

    if (error || !data) {
      console.log(
        `V3 No active OAuth tokens found for organization ${organizationId}: ${error?.message || "No data"}`,
      )
      if (anyToken) {
        console.log(
          `V3 Token exists but is not active. Status: ${anyToken.status}`,
        )
      }
      return null
    }

    try {

      const accessToken = this.decrypt(data.encrypted_access_token)
      const refreshToken = this.decrypt(data.encrypted_refresh_token)

      await this.supabase
        .from("oauth_tokens")
        .update({ last_used_at: new Date().toISOString() })
        .eq("id", data.id)

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: data.expires_at,
      }
    } catch (err) {
      console.error("V3 Error decrypting OAuth tokens:", err)
      return null
    }
  }

  async updateAccessToken(
    organizationId: string,
    accessToken: string,
    expiresAt: string,
  ): Promise<void> {
    if (!this.supabase) {
      throw new Error("Supabase client required")
    }

    const encryptedAccessToken = this.encrypt(accessToken)

    const { error } = await this.supabase
      .from("oauth_tokens")
      .update({
        encrypted_access_token: encryptedAccessToken,
        expires_at: expiresAt,
        last_refresh_at: new Date().toISOString(),
        refresh_attempts: 0,
        last_refresh_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", organizationId)
      .eq("provider", "google")
      .eq("provider_scope", GOOGLE_MY_BUSINESS_SCOPE)

    if (error) {
      throw error
    }
  }

  async createService(
    organizationId: string,
  ): Promise<GoogleMyBusinessService | null> {
    const tokens = await this.getTokens(organizationId)
    if (!tokens) {
      return null
    }

    return new GoogleMyBusinessService(
      tokens.access_token,
      tokens.refresh_token,
      async (newTokens) => {
        await this.updateAccessToken(
          organizationId,
          newTokens.access_token,
          newTokens.expires_at,
        )
      },
      {
        clientId: this.config?.clientId || "",
        clientSecret: this.config?.clientSecret || "",
      },
    )
  }

  async createAlternativeService(
    organizationId: string,
  ): Promise<GoogleMyBusinessServiceAlt | null> {
    const tokens = await this.getTokens(organizationId)
    if (!tokens) {
      return null
    }

    return new GoogleMyBusinessServiceAlt(
      tokens.access_token,
      tokens.refresh_token,
      async (newTokens) => {
        await this.updateAccessToken(
          organizationId,
          newTokens.access_token,
          newTokens.expires_at,
        )
      },
      {
        clientId: this.config?.clientId || "",
        clientSecret: this.config?.clientSecret || "",
      },
    )
  }

  async verifyTokenScopes(accessToken: string): Promise<string[]> {
    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`,
      )

      if (!response.ok) {
        console.error(
          "V3 Failed to verify token scopes:",
          await response.text(),
        )
        return []
      }

      const tokenInfo = await response.json()
      const scopes = tokenInfo.scope ? tokenInfo.scope.split(" ") : []
      return scopes
    } catch (error) {
      console.error("V3 Error verifying token scopes:", error)
      return []
    }
  }

  async revokeToken(organizationId: string): Promise<void> {
    console.log(
      `V3 Starting token revocation for organization: ${organizationId}`,
    )

    const tokens = await this.getTokens(organizationId)
    if (!tokens) {
      console.log(
        `V3 No tokens found for organization ${organizationId} - already cleaned up`,
      )
      return
    }

    try {
      const response = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${tokens.access_token}`,
        {
          method: "POST",
        },
      )

      if (!response.ok) {
        console.warn(
          `V3 Google token revocation returned ${response.status}: ${response.statusText}`,
        )
      } else {
        console.log(
          `V3 Successfully revoked token with Google for organization ${organizationId}`,
        )
      }
    } catch (err) {
      console.error("V3 Error revoking token with Google:", err)
    }

    if (!this.supabase) {
      throw new Error("Supabase client required for token deletion")
    }

    console.log(
      `V3 Marking OAuth token as revoked for organization: ${organizationId}`,
    )
    const { error: tokenError } = await this.supabase
      .from("oauth_tokens")
      .update({
        status: "revoked",
        updated_at: new Date().toISOString(),
      })
      .eq("tenant_id", organizationId)
      .eq("provider", "google")
      .eq("provider_scope", GOOGLE_MY_BUSINESS_SCOPE)

    if (tokenError) {
      console.error(
        `V3 OAuth token revocation failed for organization ${organizationId}:`,
        tokenError,
      )
      throw new Error(`Failed to revoke OAuth token: ${tokenError.message}`)
    }

    const { error: locationError, count } = await this.supabase
      .from("locations")
      .update({ oauth_token_id: null })
      .eq("tenant_id", organizationId)
      .not("oauth_token_id", "is", null)

    if (locationError) {
      console.error(
        `V3 Location OAuth token clearing failed for organization ${organizationId}:`,
        locationError,
      )

    }

    console.log(
      `V3 Successfully revoked OAuth token and cleared ${count || 0} locations for organization ${organizationId}`,
    )
  }

  async listAccounts(organizationId: string) {
    const service = await this.createService(organizationId)
    if (!service) {
      throw new Error("No Google connection found")
    }
    return service.getAccounts()
  }

  async listLocations(organizationId: string, accountId: string) {
    const service = await this.createService(organizationId)
    if (!service) {
      throw new Error("No Google connection found")
    }
    return service.getLocations(accountId)
  }

  async getReviews(
    organizationId: string,
    accountId: string,
    locationId: string,
  ) {
    const service = await this.createService(organizationId)
    if (!service) {
      throw new Error("No Google connection found")
    }
    return service.getReviews(accountId, locationId)
  }

  async publishResponse(
    organizationId: string,
    accountId: string,
    locationId: string,
    reviewId: string,
    responseText: string,
  ) {
    const service = await this.createService(organizationId)
    if (!service) {
      throw new Error("No Google connection found")
    }
    return service.replyToReview(accountId, locationId, reviewId, responseText)
  }
}
