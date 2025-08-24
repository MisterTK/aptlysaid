export interface GoogleToken {
  access_token: string
  refresh_token: string
  expires_at: string
}

interface BusinessLocation {
  name: string
  locationId: string
  title?: string
  address?:
    | {
        addressLines?: string[]
      }
    | string
  primaryPhone?: string
  websiteUrl?: string
  accountId?: string // Track which account owns this location (if known)
}

interface BusinessAccount {
  name: string
  accountId: string
  type: string
  role: string
  state: string
  profilePhotoUrl?: string
}

interface Review {
  reviewId?: string
  name?: string // Google's resource name format (e.g., accounts/123/locations/456/reviews/789)
  reviewer: {
    displayName: string
    profilePhotoUrl?: string
  }
  starRating: string
  comment?: string
  createTime: string
  updateTime: string
  reviewReply?: {
    comment: string
    updateTime: string
  }
  locationName?: string
}

interface Invitation {
  name: string
  targetAccount?: {
    accountName: string
    email?: string
  }
  targetLocation?: {
    locationName: string
    address?: string
  }
  role: string
  state: string
}

interface LocationIdentifiers {
  accountId?: string
  locationId: string
  fullName?: string // Full resource name like accounts/123/locations/456
}

// API endpoints for different Google My Business services
const GOOGLE_MY_BUSINESS_API =
  "https://mybusinessbusinessinformation.googleapis.com/v1"
const GOOGLE_MY_BUSINESS_ACCOUNT_MANAGEMENT_API =
  "https://mybusinessaccountmanagement.googleapis.com/v1"
// Reviews API requires the v4 endpoint
const GOOGLE_MY_BUSINESS_REVIEWS_API = "https://mybusiness.googleapis.com/v4"

export class GoogleMyBusinessService {
  constructor(
    private accessToken: string,
    private refreshToken: string,
    private onTokenRefresh?: (tokens: {
      access_token: string
      expires_at: string
    }) => Promise<void>,
    private credentials?: {
      clientId: string
      clientSecret: string
    },
  ) {}

  // Helper method to extract location identifiers from various formats
  private parseLocationName(locationName: string): LocationIdentifiers {
    const parts = locationName.split("/")

    // Handle full resource name: accounts/123/locations/456
    if (
      parts.length >= 4 &&
      parts[0] === "accounts" &&
      parts[2] === "locations"
    ) {
      return {
        accountId: parts[1],
        locationId: parts[3],
        fullName: locationName,
      }
    }

    // Handle partial name: locations/456
    if (parts.length >= 2 && parts[0] === "locations") {
      return {
        locationId: parts[1],
        fullName: locationName,
      }
    }

    // Handle just the ID
    return {
      locationId: locationName
        .replace("locations/", "")
        .replace("accounts/", ""),
      fullName: undefined,
    }
  }

  // Helper to determine if we should use wildcard approach
  private shouldUseWildcard(accountId?: string): boolean {
    return !accountId || accountId === "-" || accountId === "wildcard"
  }

  private async makeRequest(
    url: string,
    options: RequestInit = {},
    retryCount = 0,
  ): Promise<Response> {
    const maxRetries = 3
    const baseDelay = 1000 // 1 second

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      })

      if (response.status === 401) {
        // Token expired, try to refresh
        await this.refreshAccessToken()

        // Retry the request with new token (don't count as retry attempt)
        return this.makeRequest(url, options, retryCount)
      }

      // Handle retryable errors with exponential backoff
      if (this.shouldRetry(response.status) && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount) // Exponential backoff: 1s, 2s, 4s
        const jitter = Math.random() * 1000 // Add jitter to prevent thundering herd

        console.warn(
          `Request failed with status ${response.status}, retrying in ${delay + jitter}ms (attempt ${retryCount + 1}/${maxRetries})`,
        )

        await new Promise((resolve) => setTimeout(resolve, delay + jitter))
        return this.makeRequest(url, options, retryCount + 1)
      }

      return response
    } catch (error) {
      // Network errors - retry with exponential backoff
      if (this.isNetworkError(error) && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount)
        const jitter = Math.random() * 1000

        console.warn(
          `Network error: ${error instanceof Error ? error.message : "Unknown"}, retrying in ${delay + jitter}ms (attempt ${retryCount + 1}/${maxRetries})`,
        )

        await new Promise((resolve) => setTimeout(resolve, delay + jitter))
        return this.makeRequest(url, options, retryCount + 1)
      }

      throw error
    }
  }

  /**
   * Determine if a status code should trigger a retry
   */
  private shouldRetry(status: number): boolean {
    return (
      status === 429 || // Too Many Requests
      status === 502 || // Bad Gateway
      status === 503 || // Service Unavailable
      status === 504 // Gateway Timeout
    )
  }

  /**
   * Determine if an error is a network error worth retrying
   */
  private isNetworkError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.message.includes("network") ||
        error.message.includes("timeout") ||
        error.message.includes("ECONNRESET") ||
        error.message.includes("ENOTFOUND") ||
        error.message.includes("fetch"))
    )
  }

  private async refreshAccessToken(retryCount = 0): Promise<void> {
    const maxRetries = 3
    const baseDelay = 1000

    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          refresh_token: this.refreshToken,
          client_id: this.credentials?.clientId || "",
          client_secret: this.credentials?.clientSecret || "",
          grant_type: "refresh_token",
        }),
      })

      if (!tokenResponse.ok) {
        const error = await tokenResponse.json()
        console.error("Token refresh failed:", error)

        // If refresh fails due to invalid grant, mark token as invalid (don't retry)
        if (error.error === "invalid_grant") {
          // Token is permanently invalid, need re-authentication
          throw new Error("REFRESH_TOKEN_INVALID")
        }

        // Retry on temporary errors
        if (
          (error.error === "temporarily_unavailable" ||
            tokenResponse.status >= 500) &&
          retryCount < maxRetries
        ) {
          const delay = baseDelay * Math.pow(2, retryCount)
          const jitter = Math.random() * 1000

          console.warn(
            `Token refresh failed with ${error.error}, retrying in ${delay + jitter}ms (attempt ${retryCount + 1}/${maxRetries})`,
          )

          await new Promise((resolve) => setTimeout(resolve, delay + jitter))
          return this.refreshAccessToken(retryCount + 1)
        }

        throw new Error(
          `Failed to refresh access token: ${error.error_description || error.error}`,
        )
      }

      const tokens = await tokenResponse.json()
      this.accessToken = tokens.access_token

      if (this.onTokenRefresh) {
        const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
        await this.onTokenRefresh({
          access_token: tokens.access_token,
          expires_at: expiresAt.toISOString(),
        })
      }
    } catch (error) {
      // Network errors - retry with exponential backoff
      if (this.isNetworkError(error) && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount)
        const jitter = Math.random() * 1000

        console.warn(
          `Network error during token refresh, retrying in ${delay + jitter}ms (attempt ${retryCount + 1}/${maxRetries})`,
        )

        await new Promise((resolve) => setTimeout(resolve, delay + jitter))
        return this.refreshAccessToken(retryCount + 1)
      }

      throw error
    }
  }

  async getAccounts(): Promise<BusinessAccount[]> {
    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_ACCOUNT_MANAGEMENT_API}/accounts`,
    )

    if (!response.ok) {
      console.error("Failed to fetch accounts:", await response.text())
      return []
    }

    const data = await response.json()
    return data.accounts || []
  }

  async getLocations(accountId: string): Promise<BusinessLocation[]> {
    // Remove 'accounts/' prefix if present
    const cleanAccountId = accountId.replace("accounts/", "")

    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_API}/accounts/${cleanAccountId}/locations`,
    )

    if (!response.ok) {
      console.error("Failed to fetch locations:", await response.text())
      return []
    }

    const data = await response.json()
    return data.locations || []
  }

  async getLocationsForAccount(accountId: string): Promise<BusinessLocation[]> {
    // This method maintains backward compatibility
    return this.getLocations(accountId)
  }

  // Get ALL locations the user has access to using wildcard account
  async getAllLocationsWithWildcard(): Promise<BusinessLocation[]> {
    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_API}/accounts/-/locations?readMask=name,title`,
    )

    if (!response.ok) {
      console.error(
        "Failed to fetch locations with wildcard:",
        await response.text(),
      )
      return []
    }

    const data = await response.json()
    const locations = data.locations || []

    // Process locations to ensure they have the expected structure
    return locations.map((location: Record<string, unknown>) => {
      const identifiers = this.parseLocationName(String(location.name || ""))
      return {
        name: location.name,
        locationId: identifiers.locationId,
        title: location.title,
        accountId: identifiers.accountId, // Will be populated if the name includes account info
        // These fields won't be available with the limited readMask, but we keep them for compatibility
        address: location.address,
        primaryPhone: location.primaryPhone,
        websiteUrl: location.websiteUrl,
      }
    })
  }

  async getInvitations(): Promise<Invitation[]> {
    // The invitations endpoint requires listing through each account
    // We need to get all accounts first, then check invitations for each
    const allInvitations: Invitation[] = []

    try {
      const accounts = await this.getAccounts()

      for (const account of accounts) {
        try {
          const accountName = account.name || `accounts/${account.accountId}`
          const response = await this.makeRequest(
            `${GOOGLE_MY_BUSINESS_ACCOUNT_MANAGEMENT_API}/${accountName}/invitations`,
          )

          if (response.ok) {
            const data = await response.json()
            if (data.invitations) {
              allInvitations.push(...data.invitations)
            }
          } else {
            // Log but don't fail completely if one account fails
            console.error(
              `Failed to fetch invitations for account ${accountName}:`,
              await response.text(),
            )
          }
        } catch (err) {
          console.error(
            `Error fetching invitations for account ${account.name}:`,
            err,
          )
        }
      }

      return allInvitations
    } catch (error) {
      console.error("Failed to fetch accounts for invitations:", error)
      return []
    }
  }

  async acceptInvitation(invitationName: string): Promise<boolean> {
    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_ACCOUNT_MANAGEMENT_API}/${invitationName}:accept`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    )

    if (!response.ok) {
      console.error("Failed to accept invitation:", await response.text())
      return false
    }

    return true
  }

  // Get all locations the user has access to (including those without account access)
  async getAllAccessibleLocations(): Promise<BusinessLocation[]> {
    try {
      // Use the wildcard account approach to get ALL locations at once
      // This includes both account-owned locations AND directly shared locations
      const wildcardLocations = await this.getAllLocationsWithWildcard()

      if (wildcardLocations.length > 0) {
        console.log(
          `Found ${wildcardLocations.length} locations using wildcard approach`,
        )
        return wildcardLocations
      }

      // Fallback to the old approach if wildcard fails or returns no results
      console.log(
        "Wildcard approach returned no locations, falling back to account-based approach",
      )
      return await this.getAllAccessibleLocationsViaAccounts()
    } catch (error) {
      console.error(
        "Failed to fetch locations with wildcard, falling back to account-based approach:",
        error,
      )
      return await this.getAllAccessibleLocationsViaAccounts()
    }
  }

  // Legacy method that iterates through accounts - kept as fallback
  private async getAllAccessibleLocationsViaAccounts(): Promise<
    BusinessLocation[]
  > {
    const allLocations: BusinessLocation[] = []
    const locationIds = new Set<string>() // Track unique locations

    // Get all locations from accounts we own or have access to
    const accounts = await this.getAccounts()
    for (const account of accounts) {
      try {
        const locations = await this.getLocations(account.accountId)
        for (const location of locations) {
          const locationId =
            location.name.split("/").pop() || location.locationId
          if (!locationIds.has(locationId)) {
            locationIds.add(locationId)
            allLocations.push(location)
          }
        }
      } catch (error) {
        console.error(
          `Failed to fetch locations for account ${account.accountId}:`,
          error,
        )
      }
    }

    // Check for any pending invitations that might give us access to additional locations
    const invitations = await this.getInvitations()
    if (invitations.length > 0) {
      console.log("Found pending invitations:", invitations)
    }

    return allLocations
  }

  // Dedicated method for fetching reviews using wildcard approach
  async getReviewsWithWildcard(locationId: string): Promise<Review[]> {
    const cleanLocationId = locationId.replace("locations/", "")

    try {
      const response = await this.makeRequest(
        `${GOOGLE_MY_BUSINESS_REVIEWS_API}/accounts/-/locations/${cleanLocationId}/reviews`,
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          "Failed to fetch reviews using wildcard approach:",
          errorText,
        )

        // If we get a specific error about the location not existing with wildcard,
        // it might mean the user doesn't have access to this location
        if (response.status === 404 || errorText.includes("NOT_FOUND")) {
          console.warn(
            `Location ${locationId} might not be accessible with current credentials`,
          )
        }
        return []
      }

      const data = await response.json()
      return data.reviews || []
    } catch (error) {
      console.error("Error fetching reviews with wildcard approach:", error)
      return []
    }
  }

  async getReviews(accountId: string, locationId: string): Promise<Review[]> {
    // Clean the IDs
    const cleanLocationId = locationId.replace("locations/", "")

    // If we should use wildcard (no account, or account is wildcard indicator)
    if (this.shouldUseWildcard(accountId)) {
      return this.getReviewsWithWildcard(cleanLocationId)
    }

    // Try the direct approach first with specific account
    const cleanAccountId = accountId.replace("accounts/", "")

    // Check if accountId and locationId are the same (common mistake)
    if (cleanAccountId === cleanLocationId) {
      console.warn(
        `Account ID and Location ID are the same (${cleanAccountId}), this is likely an error. Using wildcard approach.`,
      )
      return this.getReviewsWithWildcard(cleanLocationId)
    }

    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_REVIEWS_API}/accounts/${cleanAccountId}/locations/${cleanLocationId}/reviews`,
    )

    if (response.ok) {
      const data = await response.json()
      return data.reviews || []
    }

    // Log failure and try wildcard approach as fallback
    const errorText = await response.text()
    console.warn(
      `Direct reviews fetch failed for account ${accountId}, location ${locationId}: ${errorText}`,
    )
    console.log("Attempting wildcard approach as fallback...")

    return this.getReviewsWithWildcard(cleanLocationId)
  }

  // Get reviews using the full location name (e.g., "accounts/123/locations/456")
  async getReviewsByLocationName(locationName: string): Promise<Review[]> {
    const identifiers = this.parseLocationName(locationName)

    // If we have a full location name with account, try direct approach first
    if (identifiers.fullName && identifiers.accountId) {
      const response = await this.makeRequest(
        `${GOOGLE_MY_BUSINESS_REVIEWS_API}/${identifiers.fullName}/reviews`,
      )

      if (response.ok) {
        const data = await response.json()
        const reviews = data.reviews || []

        // Add the location name to each review for context
        return reviews.map((review: Review) => ({
          ...review,
          locationName,
        }))
      }

      // If direct approach fails, log the error
      const errorText = await response.text()
      console.warn(
        `Direct reviews fetch failed for ${locationName}: ${errorText}`,
      )

      // Check if it's an access issue vs other errors
      if (response.status === 403 || errorText.includes("PERMISSION_DENIED")) {
        console.log(
          "Permission denied with direct access, trying wildcard approach...",
        )
      }
    }

    // Use wildcard approach as fallback or primary method
    try {
      const reviews = await this.getReviewsWithWildcard(identifiers.locationId)

      // Add the location name to each review for context
      return reviews.map((review: Review) => ({
        ...review,
        locationName,
      }))
    } catch (error) {
      console.error("Error fetching reviews:", error)
      return []
    }
  }

  async replyToReview(
    accountId: string,
    locationId: string,
    reviewId: string,
    comment: string,
  ): Promise<boolean> {
    // Remove prefixes if present
    const cleanLocationId = locationId.replace("locations/", "")
    const cleanReviewId = reviewId.replace("reviews/", "")

    // If using wildcard approach
    if (this.shouldUseWildcard(accountId)) {
      const response = await this.makeRequest(
        `${GOOGLE_MY_BUSINESS_REVIEWS_API}/accounts/-/locations/${cleanLocationId}/reviews/${cleanReviewId}/reply`,
        {
          method: "PUT",
          body: JSON.stringify({ comment }),
        },
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error("Failed to reply to review with wildcard:", errorText)
        return false
      }

      return true
    }

    // Direct approach with specific account
    const cleanAccountId = accountId.replace("accounts/", "")

    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_REVIEWS_API}/accounts/${cleanAccountId}/locations/${cleanLocationId}/reviews/${cleanReviewId}/reply`,
      {
        method: "PUT",
        body: JSON.stringify({ comment }),
      },
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Failed to reply to review:", errorText)

      // If permission denied, we could try wildcard as fallback
      if (response.status === 403 || errorText.includes("PERMISSION_DENIED")) {
        console.log("Attempting wildcard approach for reply...")
        const wildcardResponse = await this.makeRequest(
          `${GOOGLE_MY_BUSINESS_REVIEWS_API}/accounts/-/locations/${cleanLocationId}/reviews/${cleanReviewId}/reply`,
          {
            method: "PUT",
            body: JSON.stringify({ comment }),
          },
        )

        if (wildcardResponse.ok) {
          return true
        }
      }

      return false
    }

    return true
  }

  // Reply to a review using the full review name (e.g., "accounts/123/locations/456/reviews/789")
  async replyToReviewByName(
    reviewName: string,
    comment: string,
  ): Promise<boolean> {
    // First try with the provided review name
    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_REVIEWS_API}/${reviewName}/reply`,
      {
        method: "PUT",
        body: JSON.stringify({ comment }),
      },
    )

    if (response.ok) {
      return true
    }

    const errorText = await response.text()
    console.error("Failed to reply to review by name:", errorText)

    // If permission denied, try wildcard approach
    if (response.status === 403 || errorText.includes("PERMISSION_DENIED")) {
      // Extract location and review IDs from the full name
      const parts = reviewName.split("/")
      if (
        parts.length >= 6 &&
        parts[0] === "accounts" &&
        parts[2] === "locations" &&
        parts[4] === "reviews"
      ) {
        const locationId = parts[3]
        const reviewId = parts[5]

        console.log("Attempting wildcard approach for reply by name...")
        const wildcardResponse = await this.makeRequest(
          `${GOOGLE_MY_BUSINESS_REVIEWS_API}/accounts/-/locations/${locationId}/reviews/${reviewId}/reply`,
          {
            method: "PUT",
            body: JSON.stringify({ comment }),
          },
        )

        if (wildcardResponse.ok) {
          return true
        }

        const wildcardError = await wildcardResponse.text()
        console.error("Wildcard approach also failed:", wildcardError)
      }
    }

    return false
  }

  async deleteReviewReply(
    accountId: string,
    locationId: string,
    reviewId: string,
  ): Promise<boolean> {
    // Remove prefixes if present
    const cleanAccountId = accountId.replace("accounts/", "")
    const cleanLocationId = locationId.replace("locations/", "")
    const cleanReviewId = reviewId.replace("reviews/", "")

    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_REVIEWS_API}/accounts/${cleanAccountId}/locations/${cleanLocationId}/reviews/${cleanReviewId}/reply`,
      {
        method: "DELETE",
      },
    )

    if (!response.ok) {
      console.error("Failed to delete review reply:", await response.text())
      return false
    }

    return true
  }

  // Delete a review reply using the full review name (e.g., "accounts/123/locations/456/reviews/789")
  async deleteReviewReplyByName(reviewName: string): Promise<boolean> {
    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_REVIEWS_API}/${reviewName}/reply`,
      {
        method: "DELETE",
      },
    )

    if (!response.ok) {
      console.error(
        "Failed to delete review reply by name:",
        await response.text(),
      )
      return false
    }

    return true
  }

  async getBusinessInfo(accountId: string, locationId: string) {
    // Remove prefixes if present
    const cleanAccountId = accountId.replace("accounts/", "")
    const cleanLocationId = locationId.replace("locations/", "")

    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_API}/accounts/${cleanAccountId}/locations/${cleanLocationId}?readMask=name,title,phoneNumbers,websiteUri,regularHours,specialHours`,
    )

    if (!response.ok) {
      console.error("Failed to fetch business info:", await response.text())
      return null
    }

    return await response.json()
  }

  // Get business info using the full location name (e.g., "accounts/123/locations/456")
  async getBusinessInfoByLocationName(locationName: string) {
    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_API}/${locationName}?readMask=name,title,phoneNumbers,websiteUri,regularHours,specialHours`,
    )

    if (!response.ok) {
      console.error(
        "Failed to fetch business info by location name:",
        await response.text(),
      )
      return null
    }

    return await response.json()
  }

  // Get all reviews for all accessible locations
  async getAllReviews(): Promise<
    { location: BusinessLocation; reviews: Review[] }[]
  > {
    const locations = await this.getAllAccessibleLocations()
    const allReviews: { location: BusinessLocation; reviews: Review[] }[] = []

    for (const location of locations) {
      try {
        const reviews = await this.getReviewsByLocationName(location.name)
        allReviews.push({
          location,
          reviews,
        })
      } catch (error) {
        console.error(
          `Failed to fetch reviews for location ${location.name}:`,
          error,
        )
      }
    }

    return allReviews
  }

  // Get reviews using the most optimal approach based on available information
  async getReviewsOptimal(
    locationInfo: string | { accountId?: string; locationId: string },
  ): Promise<Review[]> {
    // If we get a string, parse it
    if (typeof locationInfo === "string") {
      return this.getReviewsByLocationName(locationInfo)
    }

    // If we have an object with IDs
    const { accountId, locationId } = locationInfo

    // Use the standard getReviews method which has fallback logic
    return this.getReviews(accountId || "-", locationId)
  }

  // Get detailed location information using wildcard API
  async getLocationDetailsWithWildcard(locationId: string) {
    const cleanLocationId = locationId.replace("locations/", "")

    try {
      // Use wildcard account with comprehensive readMask
      const readMask = [
        "name",
        "title",
        "storefrontAddress",
        "websiteUri",
        "phoneNumbers",
        "primaryPhone",
        "additionalPhones",
        "regularHours",
        "specialHours",
        "serviceArea",
        "locationKey",
        "labels",
        "adWordsLocationExtensions",
        "latlng",
        "openInfo",
        "metadata",
        "profile",
        "relationshipData",
        "moreHours",
      ].join(",")

      const response = await this.makeRequest(
        `${GOOGLE_MY_BUSINESS_API}/accounts/-/locations/${cleanLocationId}?readMask=${readMask}`,
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error(
          "Failed to fetch location details with wildcard:",
          errorText,
        )
        return null
      }

      return await response.json()
    } catch (error) {
      console.error("Error fetching location details:", error)
      return null
    }
  }

  // Check if user has access to a specific location
  async checkLocationAccess(
    locationId: string,
  ): Promise<{ hasAccess: boolean; accessType?: "direct" | "wildcard" }> {
    const cleanLocationId = locationId.replace("locations/", "")

    // First try wildcard approach as it's most permissive
    try {
      const response = await this.makeRequest(
        `${GOOGLE_MY_BUSINESS_API}/accounts/-/locations/${cleanLocationId}?readMask=name`,
      )

      if (response.ok) {
        return { hasAccess: true, accessType: "wildcard" }
      }
    } catch (error) {
      console.error("Error checking wildcard access:", error)
    }

    // If wildcard fails, check if we have direct access through accounts
    const accounts = await this.getAccounts()
    for (const account of accounts) {
      try {
        const locations = await this.getLocations(account.accountId)
        const hasLocation = locations.some(
          (loc) =>
            loc.locationId === cleanLocationId ||
            loc.name.endsWith(`/locations/${cleanLocationId}`),
        )

        if (hasLocation) {
          return { hasAccess: true, accessType: "direct" }
        }
      } catch (error) {
        console.error(`Error checking account ${account.accountId}:`, error)
      }
    }

    return { hasAccess: false }
  }
}
