import { generateText, streamText } from "ai"
import {
  createVertexAI,
  DEFAULT_MODEL,
  type VertexAIConfig,
  type VertexAIModel,
} from "./vertex-config"

export interface ReviewResponseConfig {
  businessName: string
  businessType?: string
  tone?: "professional" | "friendly" | "casual"
  customInstructions?: string
}

export interface GenerateResponseOptions {
  review: {
    rating: number
    text: string
    authorName?: string
  }
  config: ReviewResponseConfig
  model?: VertexAIModel
  stream?: boolean
}

export class ReviewResponseGenerator {
  private vertex

  constructor(private vertexConfig: VertexAIConfig) {
    this.vertex = createVertexAI(vertexConfig)
  }

  private buildPrompt(options: GenerateResponseOptions): string {
    const { review, config } = options
    const toneMap = {
      professional: "professional and courteous",
      friendly: "warm and friendly",
      casual: "casual and conversational",
    }

    const tone = toneMap[config.tone || "professional"]

    return `You are responding to a customer review for ${config.businessName}${config.businessType ? `, a ${config.businessType}` : ""}.

Review Details:
- Rating: ${review.rating}/5 stars
- Customer: ${review.authorName || "Anonymous"}
- Review: "${review.text}"

Instructions:
- Write a ${tone} response
- Acknowledge their feedback appropriately
- If the rating is low (1-3 stars), apologize and offer to make things right
- If the rating is high (4-5 stars), thank them enthusiastically
- Keep the response concise (2-3 sentences)
- Make it personal by referencing specific points from their review
${config.customInstructions ? `- Additional instructions: ${config.customInstructions}` : ""}

Generate a response:`
  }

  async generateResponse(options: GenerateResponseOptions): Promise<string> {
    const prompt = this.buildPrompt(options)
    const model = this.vertex(options.model || DEFAULT_MODEL)

    const { text } = await generateText({
      model,
      prompt,
      maxTokens: 500,
      temperature: 0.7,
    })

    return text
  }

  async streamResponse(options: GenerateResponseOptions) {
    const prompt = this.buildPrompt(options)
    const model = this.vertex(options.model || DEFAULT_MODEL)

    return streamText({
      model,
      prompt,
      maxTokens: 500,
      temperature: 0.7,
    })
  }
}
