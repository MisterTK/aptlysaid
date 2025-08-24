import fetch from "node-fetch"
import type { RequestInit as NodeFetchRequestInit } from "node-fetch"

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

const GOOGLE_MY_BUSINESS_API =
  "https://mybusinessbusinessinformation.googleapis.com/v1"
const GOOGLE_MY_BUSINESS_ACCOUNT_MANAGEMENT_API =
  "https://mybusinessaccountmanagement.googleapis.com/v1"

export class GoogleMyBusinessServiceAlt {
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

  private async makeRequest(url: string, options: NodeFetchRequestInit = {}) {
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

      // Retry the request with new token
      return fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...options.headers,
        },
      })
    }

    return response
  }

  private async refreshAccessToken() {
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
      throw new Error("Failed to refresh access token")
    }

    const tokens = (await tokenResponse.json()) as {
      access_token: string
      expires_in: number
    }
    this.accessToken = tokens.access_token

    if (this.onTokenRefresh) {
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000)
      await this.onTokenRefresh({
        access_token: tokens.access_token,
        expires_at: expiresAt.toISOString(),
      })
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

    const data = (await response.json()) as { accounts?: BusinessAccount[] }
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

    const data = (await response.json()) as { locations?: BusinessLocation[] }
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

    const data = (await response.json()) as { locations?: BusinessLocation[] }
    const locations = data.locations || []

    // Process locations to ensure they have the expected structure
    return locations.map((location: BusinessLocation) => ({
      name: location.name,
      locationId: location.name.split("/").pop() || "",
      title: location.title,
      // These fields won't be available with the limited readMask, but we keep them for compatibility
      address: location.address,
      primaryPhone: location.primaryPhone,
      websiteUrl: location.websiteUrl,
    }))
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
            const data = (await response.json()) as {
              invitations?: Invitation[]
            }
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

  async getReviews(accountId: string, locationId: string): Promise<Review[]> {
    // Remove prefixes if present
    const cleanAccountId = accountId.replace("accounts/", "")
    const cleanLocationId = locationId.replace("locations/", "")

    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_API}/accounts/${cleanAccountId}/locations/${cleanLocationId}/reviews`,
    )

    if (!response.ok) {
      console.error("Failed to fetch reviews:", await response.text())
      return []
    }

    const data = (await response.json()) as { reviews?: Review[] }
    return data.reviews || []
  }

  // Get reviews using the full location name (e.g., "accounts/123/locations/456")
  async getReviewsByLocationName(locationName: string): Promise<Review[]> {
    // The location name should be in the format "accounts/123/locations/456"
    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_API}/${locationName}/reviews`,
    )

    if (!response.ok) {
      console.error(
        "Failed to fetch reviews by location name:",
        await response.text(),
      )
      return []
    }

    const data = (await response.json()) as { reviews?: Review[] }
    const reviews = data.reviews || []

    // Add the location name to each review for context
    return reviews.map((review: Review) => ({
      ...review,
      locationName,
    }))
  }

  async replyToReview(
    accountId: string,
    locationId: string,
    reviewId: string,
    comment: string,
  ): Promise<boolean> {
    // Remove prefixes if present
    const cleanAccountId = accountId.replace("accounts/", "")
    const cleanLocationId = locationId.replace("locations/", "")
    const cleanReviewId = reviewId.replace("reviews/", "")

    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_API}/accounts/${cleanAccountId}/locations/${cleanLocationId}/reviews/${cleanReviewId}/reply`,
      {
        method: "PUT",
        body: JSON.stringify({ comment }),
      },
    )

    if (!response.ok) {
      console.error("Failed to reply to review:", await response.text())
      return false
    }

    return true
  }

  // Reply to a review using the full review name (e.g., "accounts/123/locations/456/reviews/789")
  async replyToReviewByName(
    reviewName: string,
    comment: string,
  ): Promise<boolean> {
    const response = await this.makeRequest(
      `${GOOGLE_MY_BUSINESS_API}/${reviewName}/reply`,
      {
        method: "PUT",
        body: JSON.stringify({ comment }),
      },
    )

    if (!response.ok) {
      console.error("Failed to reply to review by name:", await response.text())
      return false
    }

    return true
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
      `${GOOGLE_MY_BUSINESS_API}/accounts/${cleanAccountId}/locations/${cleanLocationId}/reviews/${cleanReviewId}/reply`,
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
      `${GOOGLE_MY_BUSINESS_API}/${reviewName}/reply`,
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
}
