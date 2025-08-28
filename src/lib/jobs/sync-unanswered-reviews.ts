import { createClient } from "@supabase/supabase-js"
import { GoogleMyBusinessWrapperV3 } from "../services/google-my-business-wrapper-v2"
// Removed unused BatchResponseGenerator import
import type { Database } from "../../DatabaseDefinitions"

// Helper to convert star rating string to number
const starRatingToNumber = (rating: string): number => {
  const ratingMap: Record<string, number> = {
    ONE: 1,
    TWO: 2,
    THREE: 3,
    FOUR: 4,
    FIVE: 5,
  }
  return ratingMap[rating] || 0
}

export async function syncUnansweredReviews() {
  const supabaseServiceRole = createClient<Database>(
    process.env.PUBLIC_SUPABASE_URL!,
    process.env.PRIVATE_SUPABASE_SERVICE_ROLE!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )

  const { data: organizations, error: orgError } = await supabaseServiceRole
    .from("oauth_tokens")
    .select("tenant_id")
    .eq("provider", "google")
    .eq("status", "active")
    .not("encrypted_refresh_token", "is", null)

  if (orgError) {
    console.error("Error fetching organizations:", orgError)
    return { error: orgError }
  }

  const results = []

  for (const org of organizations || []) {
    try {
      const gmb = new GoogleMyBusinessWrapperV3(supabaseServiceRole, {
        clientId: process.env.PUBLIC_GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        encryptionKey: process.env.TOKEN_ENCRYPTION_KEY!,
      })

      // Get all accounts and then all locations for each account
      const accounts = await gmb.listAccounts(org.tenant_id!)
      let locations: any[] = []
      for (const account of accounts) {
        const accountLocations = await gmb.listLocations(org.tenant_id!, account.name)
        locations.push(...accountLocations)
      }

      let totalNewReviews = 0
      let totalUnanswered = 0

      for (const location of locations) {
        const accountId = location.name.split("/")[1]
        const locationId = location.name.split("/")[3] || location.locationId

        try {
          const reviews = await gmb.getReviews(
            org.tenant_id!,
            accountId,
            locationId,
          )

          for (const review of reviews) {
            const reviewId = review.reviewId || review.name?.split("/").pop() || ""

            const { data: existingReview } = await supabaseServiceRole
              .from("reviews")
              .select("id, owner_reply_text")
              .eq("tenant_id", org.tenant_id!)
              .eq("platform", "google")
              .eq("platform_review_id", reviewId)
              .single()

            if (!existingReview) {
              const { error } = await supabaseServiceRole.from("reviews").insert({
                tenant_id: org.tenant_id!,
                platform: "google",
                platform_review_id: reviewId,
                location_id: locationId,
                reviewer_name: review.reviewer?.displayName || "Anonymous",
                reviewer_avatar_url: review.reviewer?.profilePhotoUrl,
                rating: starRatingToNumber(review.starRating),
                review_text: review.comment,
                review_date: review.createTime,
                has_owner_reply: !!review.reviewReply,
                owner_reply_text: review.reviewReply?.comment,
                owner_reply_date: review.reviewReply?.updateTime,
                review_updated_at: review.updateTime,
                is_review_edited: review.updateTime > review.createTime,
              })

              if (!error) {
                totalNewReviews++
                if (!review.reviewReply) {
                  totalUnanswered++
                }
              } else {
                console.error(`Error inserting review ${reviewId}:`, error)
              }
            } else {
              const updateData: Partial<Database["public"]["Tables"]["reviews"]["Row"]> = {}

              if (existingReview.owner_reply_text !== review.reviewReply?.comment) {
                updateData.owner_reply_text = review.reviewReply?.comment
                updateData.owner_reply_date = review.reviewReply?.updateTime
                updateData.has_owner_reply = !!review.reviewReply
                updateData.review_updated_at = review.updateTime
                updateData.is_review_edited = review.updateTime > review.createTime
              }

              if (Object.keys(updateData).length > 0) {
                await supabaseServiceRole
                  .from("reviews")
                  .update(updateData)
                  .eq("id", existingReview.id)
              }

              if (!review.reviewReply) {
                totalUnanswered++
              }
            }
          }
        } catch (error) {
          console.error(`Error syncing location ${location.name}:`, error)
        }
      }

      results.push({
        tenant_id: org.tenant_id,
        success: true,
        newReviews: totalNewReviews,
        unansweredReviews: totalUnanswered,
      })
    } catch (error) {
      console.error(`Error syncing org ${org.tenant_id}:`, error)
      results.push({
        tenant_id: org.tenant_id,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return {
    success: true,
    synced: results.length,
    results,
  }
}
