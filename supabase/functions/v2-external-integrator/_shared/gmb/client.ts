// Google My Business API client
export class GMBClient {
  accessToken
  accountId
  constructor(accessToken, accountId) {
    this.accessToken = accessToken
    this.accountId = accountId
  }
  async getReviews(locationName, daysBack = 30, pageToken, lastReviewTime) {
    let reviewsPath
    if (locationName.startsWith("accounts/")) {
      reviewsPath = `${locationName}/reviews`
    } else if (this.accountId && this.accountId !== "-") {
      reviewsPath = `accounts/${this.accountId}/locations/${locationName}/reviews`
    } else {
      reviewsPath = `accounts/-/locations/${locationName}/reviews`
    }
    const url = new URL(`https://mybusiness.googleapis.com/v4/${reviewsPath}`)
    url.searchParams.append("pageSize", "50")
    if (pageToken) {
      url.searchParams.append("pageToken", pageToken)
    }
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    })
    if (!response.ok) {
      await response.text()
      // Try wildcard approach as fallback
      if (
        this.accountId &&
        this.accountId !== "-" &&
        !locationName.startsWith("accounts/")
      ) {
        const wildcardPath = `accounts/-/locations/${locationName}/reviews`
        const wildcardUrl = new URL(
          `https://mybusiness.googleapis.com/v4/${wildcardPath}`,
        )
        wildcardUrl.searchParams.append("pageSize", "50")
        if (pageToken) {
          wildcardUrl.searchParams.append("pageToken", pageToken)
        }
        const wildcardResponse = await fetch(wildcardUrl.toString(), {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
        })
        if (!wildcardResponse.ok) {
          throw new Error(`GMB API error: ${response.statusText}`)
        }
        const data = await wildcardResponse.json()
        return this.filterReviewsByDate(data, daysBack, lastReviewTime)
      }
      throw new Error(`GMB API error: ${response.statusText}`)
    }
    const data = await response.json()
    return this.filterReviewsByDate(data, daysBack, lastReviewTime)
  }
  filterReviewsByDate(data, daysBack, lastReviewTime) {
    if (!data.reviews) return data
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - daysBack)
    const effectiveCutoff = lastReviewTime
      ? new Date(
          Math.max(new Date(lastReviewTime).getTime(), cutoffDate.getTime()),
        )
      : cutoffDate
    data.reviews = data.reviews.filter((review) => {
      if (!review.createTime) return true
      const reviewDate = new Date(review.createTime)
      return reviewDate > effectiveCutoff
    })
    return data
  }
  async listLocations() {
    if (this.accountId && this.accountId !== "-") {
      try {
        const accountUrl = `https://mybusinessaccountmanagement.googleapis.com/v1/accounts/${this.accountId}/locations?readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,specialHours,serviceArea,labels,adWordsLocationExtensions,latlng,openInfo,metadata,profile,relationshipData,moreHours`
        const accountResponse = await fetch(accountUrl, {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
        })
        if (accountResponse.ok) {
          return await accountResponse.json()
        }
      } catch {
        // Fall through to wildcard approach
      }
    }
    // Wildcard approach for location-level access
    const wildcardUrl = `https://mybusinessaccountmanagement.googleapis.com/v1/accounts/-/locations?readMask=name,title,storefrontAddress,phoneNumbers,websiteUri,regularHours,specialHours,serviceArea,labels,adWordsLocationExtensions,latlng,openInfo,metadata,profile,relationshipData,moreHours`
    const wildcardResponse = await fetch(wildcardUrl, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    })
    if (!wildcardResponse.ok) {
      await wildcardResponse.text()
      throw new Error(
        `Business Profile API error: ${wildcardResponse.statusText}`,
      )
    }
    return await wildcardResponse.json()
  }
  async replyToReview(reviewName, comment) {
    // Ensure the review ID part of the name is properly URL-encoded.
    const reviewIdIndex = reviewName.lastIndexOf("/")
    const basePath = reviewName.substring(0, reviewIdIndex + 1)
    const reviewId = reviewName.substring(reviewIdIndex + 1)
    const encodedReviewName = basePath + encodeURIComponent(reviewId)
    const response = await fetch(
      `https://mybusiness.googleapis.com/v4/${encodedReviewName}/reply`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          comment,
        }),
      },
    )
    if (!response.ok) {
      const errorBody = await response.text()
      console.error("GMB API Error:", errorBody)
      throw new Error(
        `Failed to publish reply: ${response.statusText}. Google's response: ${errorBody}`,
      )
    }
  }
  async deleteReply(reviewName) {
    const response = await fetch(
      `https://mybusiness.googleapis.com/v4/${reviewName}/reply`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      },
    )
    if (!response.ok) {
      await response.text()
      throw new Error(`Failed to delete reply: ${response.statusText}`)
    }
  }
}
