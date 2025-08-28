import { generateText } from "ai"
import { createVertexAI } from "./vertex-config"
import type { Database } from "$lib/../DatabaseDefinitions"
import type { SupabaseClient } from "@supabase/supabase-js"
import modelsConfig from "$lib/config/gemini-models.json"

type Review = Database["public"]["Tables"]["reviews"]["Row"]
type BusinessGuidance = Database["public"]["Tables"]["business_guidance"]["Row"]
type UpsellItem = Database["public"]["Tables"]["upsell_items"]["Row"]

interface BatchReviewRequest {
  review: Review
  businessGuidance: BusinessGuidance
  upsellItems: UpsellItem[]
}

interface BatchGenerationResult {
  reviewId: string
  response?: string
  error?: string
}

export class BatchResponseGenerator {
  private vertex: ReturnType<typeof createVertexAI>
  private maxBatchSize = 100 // Gemini batch API limit
  private supabase?: SupabaseClient<Database>

  constructor(supabase?: SupabaseClient<Database>) {
    this.vertex = createVertexAI()
    this.supabase = supabase
  }

  /**
   * Generates the meta prompt that incorporates business guidance, upsell items, and rejection feedback
   */
  private async generateMetaPrompt(
    businessGuidance: BusinessGuidance,
    upsellItems: UpsellItem[],
    organizationId: string,
  ): Promise<string> {
    // Parse business guidance from V2 structure
    let brandIdentity = ""
    let responseGuidelines: string[] = []
    let thingsToAvoid: string[] = []

    // Check if business guidance has response guidelines in any available property
    const guidelinesProperty = 'review_response_guidelines' in businessGuidance 
      ? (businessGuidance as { review_response_guidelines: string }).review_response_guidelines 
      : null

    if (guidelinesProperty) {
      try {
        const parsed = JSON.parse(guidelinesProperty)
        brandIdentity = parsed.brandIdentity || ""
        responseGuidelines = parsed.responseGuidelines || []
        thingsToAvoid = parsed.thingsToAvoid || []
      } catch (error) {
        console.error("Error parsing business guidance:", error)
        throw new Error("Business guidance format is invalid")
      }
    }

    // Validate required fields
    if (!brandIdentity || responseGuidelines.length === 0) {
      throw new Error(
        "Business guidance must include Brand Identity and Response Guidelines",
      )
    }

    const activeUpsellItems = upsellItems
      .filter((item) => (item as { is_active: boolean }).is_active)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))

    // Get recent rejection feedback for learning
    let rejectionFeedback: string[] = []
    if (this.supabase) {
      const { data: rejectedResponses } = await this.supabase
        .from("ai_responses")
        .select("rejection_feedback")
        .eq("tenant_id", organizationId)
        .eq("status", "rejected")
        .not("rejection_feedback", "is", null)
        .order("rejected_at", { ascending: false })
        .limit(10)

      rejectionFeedback =
        rejectedResponses
          ?.map((r) => r.rejection_feedback)
          .filter((feedback): feedback is string => !!feedback) || []
    }

    let prompt = `You are responding to customer reviews for a business. Your responses should be ${(businessGuidance as { tone_of_voice?: string }).tone_of_voice || "professional"} and helpful.

BRAND IDENTITY:
${brandIdentity}

RESPONSE GUIDELINES:`
    responseGuidelines.forEach((guideline, index) => {
      prompt += `\n${index + 1}. ${guideline}`
    })

    if (thingsToAvoid.length > 0) {
      prompt += `\n\nTHINGS TO AVOID:`
      thingsToAvoid.forEach((avoid, index) => {
        prompt += `\n${index + 1}. ${avoid}`
      })
    }

    prompt += `\n\nTONE OF VOICE: ${(businessGuidance as { tone_of_voice?: string }).tone_of_voice || "professional"}
MAXIMUM RESPONSE LENGTH: 150 words.`

    if (rejectionFeedback.length > 0) {
      prompt += `\n\nRECENT FEEDBACK TO IMPROVE RESPONSES:`
      rejectionFeedback.forEach((feedback, index) => {
        prompt += `\n${index + 1}. ${feedback}`
      })
      prompt += `\n\nAvoid making similar mistakes in future responses.`
    }

    if (activeUpsellItems.length > 0) {
      prompt += `\n\nUPSELL ITEMS (mention when appropriate and natural):`
      activeUpsellItems.forEach((item) => {
        prompt += `\n- ${item.name}${item.description ? `: ${item.description}` : ""}`
      })
      prompt += `\n\nOnly mention offerings if they're relevant to the review content. Never force upsells into responses.`
    }

    prompt += `\n\nINSTRUCTIONS:
- Be authentic and personalized
- Address specific points in the review
- Thank the reviewer by name when provided
- For negative reviews, acknowledge concerns and offer to help
- For positive reviews, express gratitude and invite them back
- Keep responses concise and under the word limit
- Never use generic templates
- Follow the brand identity and response guidelines exactly`

    return prompt
  }

  /**
   * Generates a single review response using the standard API
   */
  private async generateSingleResponse(
    review: Review,
    metaPrompt: string,
    model: string = modelsConfig.defaultModel,
  ): Promise<string> {
    const reviewerName = (review as { author_name?: string }).author_name || "the reviewer"
    const rating = review.rating
    const reviewText = review.review_text || "No review text provided"

    const prompt = `${metaPrompt}

Review Details:
- Reviewer: ${reviewerName}
- Rating: ${rating}/5 stars
- Review: ${reviewText}
- Location: ${(review as { location_name?: string }).location_name}

Generate a personalized response to this review.`

    try {
      const { text } = await generateText({
        model: this.vertex(model),
        prompt,
      })

      return text.trim()
    } catch (error) {
      console.error("Error generating response:", error)
      throw error
    }
  }

  /**
   * Process a batch of reviews to generate AI responses
   * Note: Currently using sequential processing as Gemini Batch API
   * requires file upload to GCS which adds complexity.
   * This can be upgraded to true batch API when needed for scale.
   */
  async processBatch(
    requests: BatchReviewRequest[],
    model: string = modelsConfig.defaultModel,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchGenerationResult[]> {
    const results: BatchGenerationResult[] = []
    let processed = 0

    // Process in chunks to avoid rate limits
    const chunkSize = 5
    for (let i = 0; i < requests.length; i += chunkSize) {
      const chunk = requests.slice(i, i + chunkSize)

      // Process chunk in parallel
      const chunkResults = await Promise.all(
        chunk.map(async ({ review, businessGuidance, upsellItems }) => {
          try {
            const metaPrompt = await this.generateMetaPrompt(
              businessGuidance,
              upsellItems,
              review.tenant_id,
            )
            const response = await this.generateSingleResponse(
              review,
              metaPrompt,
              model,
            )

            processed++
            onProgress?.(processed, requests.length)

            return {
              reviewId: review.id,
              response,
            }
          } catch (error) {
            console.error(`Error processing review ${review.id}:`, error)
            return {
              reviewId: review.id,
              error: error instanceof Error ? error.message : "Unknown error",
            }
          }
        }),
      )

      results.push(...chunkResults)

      // Add delay between chunks to respect rate limits
      if (i + chunkSize < requests.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    return results
  }

  /**
   * Generate responses for all unanswered reviews in an organization
   */
  async generateForOrganization(
    organizationId: string,
    reviews: Review[],
    businessGuidance: BusinessGuidance,
    upsellItems: UpsellItem[],
    model: string = modelsConfig.defaultModel,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<BatchGenerationResult[]> {
    // Filter reviews that need responses
    const reviewsNeedingResponse = reviews.filter(
      (review) => !(review as { review_reply?: string }).review_reply && review.review_text,
    )

    if (reviewsNeedingResponse.length === 0) {
      return []
    }

    // Create batch requests
    const requests: BatchReviewRequest[] = reviewsNeedingResponse.map(
      (review) => ({
        review,
        businessGuidance,
        upsellItems,
      }),
    )

    // Process in batches if needed
    if (requests.length > this.maxBatchSize) {
      const allResults: BatchGenerationResult[] = []

      for (let i = 0; i < requests.length; i += this.maxBatchSize) {
        const batch = requests.slice(i, i + this.maxBatchSize)
        const batchResults = await this.processBatch(
          batch,
          model,
          (batchProcessed) => {
            const totalProcessed = i + batchProcessed
            onProgress?.(totalProcessed, requests.length)
          },
        )
        allResults.push(...batchResults)
      }

      return allResults
    }

    return this.processBatch(requests, model, onProgress)
  }

  /**
   * Generate AI responses for a batch job and save them to the database
   * This method is used by the API endpoint and handles database operations
   */
  async generateBatch(
    jobId: string,
    reviews: Review[],
    businessGuidance: BusinessGuidance,
    organizationId: string,
    model: string = modelsConfig.defaultModel,
  ): Promise<void> {
    if (!this.supabase) {
      throw new Error("Supabase client required for generateBatch method")
    }

    let processedCount = 0
    let successCount = 0
    let errorCount = 0

    try {
      // Get upsell items for the organization
      const { data: upsellItems } = await this.supabase
        .from("upsell_items")
        .select("*")
        .eq("tenant_id", organizationId)
        .eq("is_active", true)

      // Generate responses using existing method
      const results = await this.generateForOrganization(
        organizationId,
        reviews,
        businessGuidance,
        upsellItems || [],
        model,
        async (processed) => {
          processedCount = processed
          // Update job progress
          await this.supabase!.from("batch_generation_jobs")
            .update({ processed_reviews: processed })
            .eq("id", jobId)
        },
      )

      // Save results to database
      for (const result of results) {
        if (result.response) {
          // Save successful response using V2 schema
          const { error } = await this.supabase.from("ai_responses").insert({
            review_id: result.reviewId,
            tenant_id: organizationId,
            ai_model: model,
            response_text: result.response,
            status: "draft",
          })

          if (error) {
            console.error(
              `Error saving response for review ${result.reviewId}:`,
              error,
            )
            errorCount++
          } else {
            successCount++
          }
        } else {
          console.error(
            `Failed to generate response for review ${result.reviewId}:`,
            result.error,
          )
          errorCount++
        }
      }

      // Update final job status
      await this.supabase
        .from("batch_generation_jobs")
        .update({
          status: errorCount > 0 ? "completed_with_errors" : "completed",
          processed_reviews: processedCount,
          completed_at: new Date().toISOString(),
          success_count: successCount,
          error_count: errorCount,
        })
        .eq("id", jobId)
    } catch (error) {
      console.error("Batch generation failed:", error)

      // Mark job as failed
      await this.supabase
        .from("batch_generation_jobs")
        .update({
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "Unknown error",
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId)

      throw error
    }
  }
}
