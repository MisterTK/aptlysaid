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
  accountId?: string
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
  name?: string
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
  fullName?: string
}

const GOOGLE_MY_BUSINESS_API =
  "https://mybusinessbusinessinformation.googleapis.com/v1"
const GOOGLE_MY_BUSINESS_ACCOUNT_MANAGEMENT_API =
  "https://mybusinessaccountmanagement.googleapis.com/v1"

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

  private parseLocationName(locationName: string): LocationIdentifiers {
    const parts = locationName.split("/")

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

    if (parts.length >= 2 && parts[0] === "locations") {
      return {
        locationId: parts[1],
        fullName: locationName,
      }
    }

    return {
      locationId: locationName
        .replace("locations/", "")
        .replace("accounts/", ""),
      fullName: undefined,
    }
  }

  private shouldUseWildcard(accountId?: string): boolean {
    return !accountId || accountId === "-" || accountId === "wildcard"
  }

  private async makeRequest(
    url: string,
    options: RequestInit = {},
    retryCount = 0,
  ): Promise<Response> {
    const maxRetries = 3
    const baseDelay = 1000

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

        await this.refreshAccessToken()

        return this.makeRequest(url, options, retryCount)
      }

      if (this.shouldRetry(response.status) && retryCount < maxRetries) {
        const delay = baseDelay * Math.pow(2, retryCount)
        const jitter = Math.random() * 1000

        console.warn(
          `Request failed with status ${response.status}, retrying in ${delay + jitter}ms (attempt ${retryCount + 1}/${maxRetries})`,
        )

        await new Promise((resolve) => setTimeout(resolve, delay + jitter))
        return this.makeRequest(url, options, retryCount + 1)
      }

      return response
    } catch (error) {

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

  private shouldRetry(status: number): boolean {
    return (
      status === 429 ||
      status === 502 ||
      status === 503 ||
      status === 504
    )
  }

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

        if (error.error === "invalid_grant") {

          throw new Error("REFRESH_TOKEN_INVALID")
        }

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

    return this.getLocations(accountId)
  }

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

    return locations.map((location: Record<string, unknown>) => {
      const identifiers = this.parseLocationName(String(location.name || ""))
      return {
        name: location.name,
        locationId: identifiers.locationId,
        title: location.title,
        accountId: identifiers.accountId,

        address: location.address,
        primaryPhone: location.primaryPhone,
        websiteUrl: location.websiteUrl,
      }
    })
  }

  async getInvitations(): Promise<Invitation[]> {

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

  async getAllAccessibleLocations(): Promise<BusinessLocation[]> {
    try {

      const wildcardLocations = await this.getAllLocationsWithWildcard()

      if (wildcardLocations.length > 0) {
        console.log(
          `Found ${wildcardLocations.length} locations using wildcard approach`,
        )
        return wildcardLocations
      }

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

  private async getAllAccessibleLocationsViaAccounts(): Promise<
    BusinessLocation[]
  > {
    const allLocations: BusinessLocation[] = []
    const locationIds = new Set<string>()

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

    const invitations = await this.getInvitations()
    if (invitations.length > 0) {
      console.log("Found pending invitations:", invitations)
    }

    return allLocations
  }

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

    const cleanLocationId = locationId.replace("locations/", "")

    if (this.shouldUseWildcard(accountId)) {
      return this.getReviewsWithWildcard(cleanLocationId)
    }

    const cleanAccountId = accountId.replace("accounts/", "")

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

    const errorText = await response.text()
    console.warn(
      `Direct reviews fetch failed for account ${accountId}, location ${locationId}: ${errorText}`,
    )
    console.log("Attempting wildcard approach as fallback...")

    return this.getReviewsWithWildcard(cleanLocationId)
  }

  async getReviewsByLocationName(locationName: string): Promise<Review[]> {
    const identifiers = this.parseLocationName(locationName)

    if (identifiers.fullName && identifiers.accountId) {
      const response = await this.makeRequest(
        `${GOOGLE_MY_BUSINESS_REVIEWS_API}/${identifiers.fullName}/reviews`,
      )

      if (response.ok) {
        const data = await response.json()
        const reviews = data.reviews || []

        return reviews.map((review: Review) => ({
          ...review,
          locationName,
        }))
      }

      const errorText = await response.text()
      console.warn(
        `Direct reviews fetch failed for ${locationName}: ${errorText}`,
      )

      if (response.status === 403 || errorText.includes("PERMISSION_DENIED")) {
        console.log(
          "Permission denied with direct access, trying wildcard approach...",
        )
      }
    }

    try {
      const reviews = await this.getReviewsWithWildcard(identifiers.locationId)

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

    const cleanLocationId = locationId.replace("locations/", "")
    const cleanReviewId = reviewId.replace("reviews/", "")

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

  async replyToReviewByName(
    reviewName: string,
    comment: string,
  ): Promise<boolean> {

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

    if (response.status === 403 || errorText.includes("PERMISSION_DENIED")) {

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

  async getReviewsOptimal(
    locationInfo: string | { accountId?: string; locationId: string },
  ): Promise<Review[]> {

    if (typeof locationInfo === "string") {
      return this.getReviewsByLocationName(locationInfo)
    }

    const { accountId, locationId } = locationInfo

    return this.getReviews(accountId || "-", locationId)
  }

  async getLocationDetailsWithWildcard(locationId: string) {
    const cleanLocationId = locationId.replace("locations/", "")

    try {

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

  async checkLocationAccess(
    locationId: string,
  ): Promise<{ hasAccess: boolean; accessType?: "direct" | "wildcard" }> {
    const cleanLocationId = locationId.replace("locations/", "")

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
