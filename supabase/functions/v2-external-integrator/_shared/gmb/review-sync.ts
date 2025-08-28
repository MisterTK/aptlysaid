// Review sync utilities
export function normalizeGoogleReviewId(reviewName) {
  if (!reviewName) return ""
  // Normalize account ID format: accounts/123/locations/456/reviews/789 -> accounts/-/locations/456/reviews/789
  return reviewName.replace(/^accounts\/[^/]+\//, "accounts/-/")
}
export function parseGoogleReviewId(reviewName) {
  const match = reviewName?.match(
    /^accounts\/([^/]+)\/locations\/([^/]+)\/reviews\/([^/]+)$/,
  )
  if (!match) {
    return {
      accountId: null,
      locationId: null,
      reviewId: null,
      normalized: normalizeGoogleReviewId(reviewName),
    }
  }
  return {
    accountId: match[1],
    locationId: match[2],
    reviewId: match[3],
    normalized: normalizeGoogleReviewId(reviewName),
  }
}
function generateReviewUrl(review, platform) {
  if (platform === "google" && review.name) {
    const locationMatch = review.name.match(/locations\/(\d+)/)
    if (locationMatch) {
      const locationId = locationMatch[1]
      // Google My Business review URL format
      return `https://www.google.com/maps/place/?cid=${locationId}`
    }
  }
  return null
}
export async function syncReviewToDatabase(
  review,
  locationId,
  tenantId,
  supabase,
) {
  const normalizedReviewId = normalizeGoogleReviewId(review.name)
  const reviewParts = parseGoogleReviewId(review.name)
  if (!review.name) {
    return false
  }
  // Enhanced owner reply detection
  const hasOwnerReply = !!review.reviewReply?.comment
  const ownerReplyText = review.reviewReply?.comment || null
  const ownerReplyTime = review.reviewReply?.updateTime || null
  // Enhanced reviewer information
  const reviewerIsAnonymous = review.reviewer?.isAnonymous || false
  const reviewerProfileId = review.reviewer?.reviewerId || null
  // Review update detection
  const reviewCreatedAt = review.createTime
  const reviewUpdatedAt = review.updateTime
  const isReviewEdited = reviewCreatedAt !== reviewUpdatedAt
  // Generate direct review URL
  const reviewUrl = generateReviewUrl(review, "google")
  // Determine response source
  const responseSource = hasOwnerReply ? "owner_external" : null
  const { error } = await supabase.from("reviews").upsert(
    {
      location_id: locationId,
      tenant_id: tenantId,
      platform: "google",
      platform_review_id: normalizedReviewId,
      platform_reviewer_id: reviewerProfileId,
      reviewer_name: review.reviewer?.displayName || "Anonymous",
      reviewer_avatar_url: review.reviewer?.profilePhotoUrl || null,
      reviewer_is_anonymous: reviewerIsAnonymous,
      rating:
        review.starRating === "FIVE"
          ? 5
          : review.starRating === "FOUR"
            ? 4
            : review.starRating === "THREE"
              ? 3
              : review.starRating === "TWO"
                ? 2
                : 1,
      review_text: review.comment || "",
      review_date: reviewCreatedAt,
      review_updated_at: isReviewEdited ? reviewUpdatedAt : null,
      is_review_edited: isReviewEdited,
      review_url: reviewUrl,
      response_source: responseSource,
      external_response_date: ownerReplyTime,
      has_owner_reply: hasOwnerReply,
      owner_reply_text: ownerReplyText,
      owner_reply_date: ownerReplyTime,
      // Mark as responded and no need for response if owner already replied
      status: hasOwnerReply ? "responded" : "new",
      needs_response: !hasOwnerReply,
      platform_data: {
        gmb_create_time: reviewCreatedAt,
        gmb_update_time: reviewUpdatedAt,
        star_rating: review.starRating,
        reviewer: {
          ...review.reviewer,
          isAnonymous: reviewerIsAnonymous,
        },
        original_review_id: review.name,
        review_parts: reviewParts,
        reviewReply: review.reviewReply || null,
        // Keep legacy fields for backward compatibility
        has_owner_reply: hasOwnerReply,
        owner_reply_text: ownerReplyText,
        owner_reply_time: ownerReplyTime,
      },
      metadata: {
        sync_timestamp: new Date().toISOString(),
        normalized_from:
          review.name !== normalizedReviewId ? review.name : null,
        owner_replied_externally: hasOwnerReply,
        review_was_edited: isReviewEdited,
      },
    },
    {
      onConflict: "platform,platform_review_id,location_id",
    },
  )
  return !error
}
export async function getSyncState(supabase, tenantId, locationId) {
  const { data: location } = await supabase
    .from("locations")
    .select("metadata")
    .eq("id", locationId)
    .single()
  return location?.metadata?.sync_state || null
}
export async function updateSyncState(supabase, locationId, state) {
  const { data: location } = await supabase
    .from("locations")
    .select("metadata")
    .eq("id", locationId)
    .single()
  await supabase
    .from("locations")
    .update({
      metadata: {
        ...(location?.metadata || {}),
        sync_state: state,
      },
      last_sync_at: new Date().toISOString(),
    })
    .eq("id", locationId)
}
