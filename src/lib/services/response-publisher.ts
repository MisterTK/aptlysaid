import { GoogleMyBusinessService } from "./google-my-business"
import type { Database } from "../../DatabaseDefinitions"
import type { SupabaseClient } from "@supabase/supabase-js"

type PublishResult = {
  success: boolean
  error?: string
  processedCount: number
  failedCount: number
}

export class ResponsePublisherService {
  constructor(
    private supabase: SupabaseClient<Database>,
    private googleService: GoogleMyBusinessService,
  ) {}

  async publishSingleResponse(responseId: string, publishedBy?: string): Promise<PublishResult> {
    try {
      const { data: aiResponse, error: fetchError } = await this.supabase
        .from("ai_responses")
        .select("*, review:reviews(*)")
        .eq("id", responseId)
        .single()

      if (fetchError || !aiResponse || !aiResponse.review) {
        throw new Error("AI response or associated review not found")
      }

      if (aiResponse.status !== "approved") {
        throw new Error("Only approved responses can be published")
      }

      const reviewResourceName = `accounts/-/locations/${aiResponse.review.location_id}/reviews/${aiResponse.review.platform_review_id}`

      await this.googleService.replyToReviewByName(
        reviewResourceName,
        aiResponse.response_text,
      )

      const { error: updateError } = await this.supabase
        .from("ai_responses")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
          published_by: publishedBy,
        })
        .eq("id", responseId)

      if (updateError) throw updateError

      const { error: reviewUpdateError } = await this.supabase
        .from("reviews")
        .update({
          has_owner_reply: true,
          owner_reply_text: aiResponse.response_text,
          owner_reply_date: new Date().toISOString(),
          response_source: 'ai',
        })
        .eq("id", aiResponse.review.id)

      if (reviewUpdateError) throw reviewUpdateError

      return {
        success: true,
        processedCount: 1,
        failedCount: 0,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        processedCount: 0,
        failedCount: 1,
      }
    }
  }

  async queueApprovedResponses(tenantId: string): Promise<number> {
    const { data: approvedResponses, error: fetchError } = await this.supabase
      .from("ai_responses")
      .select("id, review:review_id(location_id)")
      .eq("tenant_id", tenantId)
      .eq("status", "approved")

    if (fetchError) throw fetchError
    if (!approvedResponses || approvedResponses.length === 0) return 0

    const queueItems = approvedResponses.map((response) => ({
      tenant_id: tenantId,
      response_id: response.id,
      location_id: response.review.location_id,
      platform: "google",
      status: "pending" as const,
    }))

    const { error: insertError } = await this.supabase.from("response_queue").insert(queueItems)
    if (insertError) throw insertError

    return approvedResponses.length
  }

  async processNextQueuedResponse(tenantId: string, publishedBy?: string): Promise<PublishResult> {
    try {
      const { data: queueItem, error: fetchError } = await this.supabase
        .from("response_queue")
        .select("*, ai_response:response_id(*, review:review_id(*, location:location_id(*)))")
        .eq("tenant_id", tenantId)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .single()

      if (fetchError) throw fetchError
      if (!queueItem) return { success: true, processedCount: 0, failedCount: 0 }

      await this.supabase.from("response_queue").update({ status: "processing" }).eq("id", queueItem.id)

      try {
        const { ai_response } = queueItem
        const { review } = ai_response
        const { location } = review

        const reviewResourceName = `accounts/-/locations/${location.google_place_id}/reviews/${review.platform_review_id}`

        await this.googleService.replyToReviewByName(reviewResourceName, ai_response.response_text)

        await this.supabase.from("response_queue").update({ status: "published", published_at: new Date().toISOString() }).eq("id", queueItem.id)
        await this.supabase.from("ai_responses").update({ status: "published", published_at: new Date().toISOString(), published_by: publishedBy }).eq("id", ai_response.id)
        await this.supabase.from("reviews").update({ has_owner_reply: true, owner_reply_text: ai_response.response_text, owner_reply_date: new Date().toISOString(), response_source: 'ai' }).eq("id", review.id)

        return { success: true, processedCount: 1, failedCount: 0 }
      } catch (error) {
        await this.supabase.from("response_queue").update({ status: "failed", error_message: error instanceof Error ? error.message : "Unknown error" }).eq("id", queueItem.id)
        throw error
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        processedCount: 0,
        failedCount: 1,
      }
    }
  }
}
