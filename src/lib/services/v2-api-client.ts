import type { SupabaseClient } from "@supabase/supabase-js"

export interface V2ApiOptions {
  supabase: SupabaseClient
}

export interface V2Review {
  id: string
  tenant_id: string
  location_id: string
  location_name?: string
  platform_review_id: string
  author_name: string
  author_avatar_url?: string
  rating: number
  review_text: string
  review_date: string
  response_text?: string
  sentiment?: string
  sentiment_score?: number
  keywords?: string[]
  language?: string
  priority_score?: number
  platform_data?: Record<string, unknown>
  created_at: string
  updated_at: string
  ai_responses?: V2AiResponse[]
}

export interface V2AiResponse {
  id: string
  review_id: string
  tenant_id: string
  content: string
  status: "draft" | "approved" | "rejected" | "published"
  confidence_score: number
  rejection_reason?: string
  published_at?: string
  created_at: string
  updated_at: string
}

export interface V2Location {
  id: string
  tenant_id: string
  gmb_location_id: string
  name: string
  address?: string
  phone?: string
  website?: string
  gmb_account_id?: string
  sync_status: "idle" | "syncing" | "error"
  last_synced_at?: string
  created_at: string
  updated_at: string
}

export interface V2Workflow {
  id: string
  tenant_id: string
  workflow_type: string
  status: "pending" | "running" | "completed" | "failed" | "compensating"
  current_step?: string
  context: Record<string, unknown>
  error_details?: Record<string, unknown>
  started_at?: string
  completed_at?: string
  created_at: string
  updated_at: string
}

export interface V2BusinessGuidance {
  id: string
  tenant_id: string
  brand_voice?: string
  response_tone?: string
  writing_style?: string
  key_messaging?: string
  max_response_length?: number
  review_response_guidelines?: string
  specific_instructions?: string
  example_responses?: Record<string, unknown>[]
  created_at: string
  updated_at: string
}

export interface V2UpsellItem {
  id: string
  tenant_id: string
  name: string
  description?: string
  priority?: number
  is_active: boolean
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface V2ResponseSettings {
  id: string
  tenant_id: string
  auto_publish_enabled: boolean
  auto_publish_delay_hours: number
  publish_rate_limit_per_hour: number
  require_approval_below_rating: number
  include_upsells: boolean
  response_templates?: Record<string, unknown>
  ai_model_preferences?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface V2TeamMember {
  user_id: string
  tenant_id: string
  role: "owner" | "admin" | "member" | "viewer"
  created_at: string
  user?: {
    id: string
    full_name?: string
    email?: string
    avatar_url?: string
  }
}

export interface V2OnboardingProgress {
  total_steps: number
  completed_steps: number
  progress_percentage: number
  current_step: string
  is_complete: boolean
}

export class V2ApiClient {
  private supabase: SupabaseClient

  constructor(options: V2ApiOptions) {
    this.supabase = options.supabase
  }

  private async fetchV2Api(endpoint: string, options: RequestInit = {}) {
    const {
      data: { session },
    } = await this.supabase.auth.getSession()

    if (!session) {
      throw new Error("No authentication session")
    }

    const v2ApiUrl = `${this.supabase.supabaseUrl}/functions/v1/v2-api`

    const response = await fetch(`${v2ApiUrl}${endpoint}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `V2 API error: ${response.statusText}`)
    }

    return response.json()
  }

  // Review methods
  async getReviews(locationId?: string): Promise<{ reviews: V2Review[] }> {
    const params = locationId ? `?location_id=${locationId}` : ""
    return this.fetchV2Api(`/reviews${params}`)
  }

  async getPendingResponses(): Promise<{ responses: V2AiResponse[] }> {
    return this.fetchV2Api("/pending-responses")
  }

  // Location methods
  async getLocations(): Promise<{ locations: V2Location[] }> {
    return this.fetchV2Api("/locations")
  }

  async syncLocation(locationId: string): Promise<{ workflowId: string }> {
    return this.fetchV2Api("/sync-location", {
      method: "POST",
      body: JSON.stringify({ locationId }),
    })
  }

  // Workflow methods
  async getWorkflows(status?: string): Promise<{ workflows: V2Workflow[] }> {
    const params = status ? `?status=${status}` : ""
    return this.fetchV2Api(`/workflows${params}`)
  }

  async createWorkflow(
    workflowType: string,
    context: Record<string, unknown>,
  ): Promise<{ workflowId: string }> {
    return this.fetchV2Api("/workflows", {
      method: "POST",
      body: JSON.stringify({ workflowType, context }),
    })
  }

  // AI Response methods
  async generateAiResponse(reviewId: string): Promise<{ workflowId: string }> {
    return this.fetchV2Api("/generate-response", {
      method: "POST",
      body: JSON.stringify({ review_id: reviewId }),
    })
  }

  async batchGenerateResponses(
    reviewIds: string[],
  ): Promise<{ workflowIds: string[] }> {
    return this.fetchV2Api("/batch-generate", {
      method: "POST",
      body: JSON.stringify({ reviewIds }),
    })
  }

  async approveResponse(
    responseId: string,
    reviewId: string,
  ): Promise<{ success: boolean }> {
    return this.fetchV2Api("/approve-response", {
      method: "POST",
      body: JSON.stringify({ response_id: responseId, review_id: reviewId }),
    })
  }

  async rejectResponse(
    responseId: string,
    reviewId: string,
    reason: string,
  ): Promise<{ success: boolean }> {
    return this.fetchV2Api("/reject-response", {
      method: "POST",
      body: JSON.stringify({
        response_id: responseId,
        review_id: reviewId,
        feedback: reason,
      }),
    })
  }

  // Business configuration methods
  async getBusinessGuidance(): Promise<{
    guidance: V2BusinessGuidance | null
  }> {
    return this.fetchV2Api("/business-guidance")
  }

  async saveBusinessGuidance(payload: {
    guidanceText: string
    tone: string
    maxResponseLength: number
  }): Promise<{ guidance: V2BusinessGuidance }> {
    return this.fetchV2Api("/business-guidance", {
      method: "POST",
      body: JSON.stringify({
        review_response_guidelines: payload.guidanceText,
        response_tone: payload.tone,
        max_response_length: payload.maxResponseLength,
      }),
    })
  }

  async getUpsellItems(): Promise<{ items: V2UpsellItem[] }> {
    return this.fetchV2Api("/upsell-items")
  }

  async createUpsellItem(item: {
    name: string
    description?: string
    priority?: number
    isActive?: boolean
  }): Promise<{ item: V2UpsellItem }> {
    return this.fetchV2Api("/upsell-items", {
      method: "POST",
      body: JSON.stringify({
        name: item.name,
        description: item.description,
        priority: item.priority,
        is_active: item.isActive ?? true,
      }),
    })
  }

  async updateUpsellItem(
    id: string,
    updates: {
      name?: string
      description?: string
      priority?: number
      isActive?: boolean
    },
  ): Promise<{ item: V2UpsellItem }> {
    const payload: Record<string, unknown> = { id }
    if (updates.name !== undefined) payload.name = updates.name
    if (updates.description !== undefined)
      payload.description = updates.description
    if (updates.priority !== undefined) payload.priority = updates.priority
    if (updates.isActive !== undefined) payload.is_active = updates.isActive

    return this.fetchV2Api("/upsell-items", {
      method: "PATCH",
      body: JSON.stringify(payload),
    })
  }

  async deleteUpsellItem(id: string): Promise<{ success: boolean }> {
    return this.fetchV2Api(`/upsell-items/${id}`, {
      method: "DELETE",
    })
  }

  async getResponseSettings(): Promise<{
    settings: V2ResponseSettings | null
  }> {
    return this.fetchV2Api("/response-settings")
  }

  async saveResponseSettings(
    settings: Partial<V2ResponseSettings>,
  ): Promise<{ settings: V2ResponseSettings }> {
    return this.fetchV2Api("/response-settings", {
      method: "POST",
      body: JSON.stringify(settings),
    })
  }

  // Team management methods
  async getTeamMembers(): Promise<{ members: V2TeamMember[] }> {
    return this.fetchV2Api("/team-members")
  }

  async inviteMember(
    email: string,
    role: "owner" | "admin" | "member" | "viewer",
  ): Promise<{ invitation: Record<string, unknown> }> {
    return this.fetchV2Api("/invite-member", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    })
  }

  async getInvitations(): Promise<{ invitations: Record<string, unknown>[] }> {
    return this.fetchV2Api("/invitations")
  }

  // Onboarding methods
  async getOnboardingProgress(): Promise<{ progress: V2OnboardingProgress }> {
    return this.fetchV2Api("/onboarding-progress")
  }

  async advanceOnboarding(
    eventType: string,
    eventData?: Record<string, unknown>,
  ): Promise<{ progress: V2OnboardingProgress }> {
    return this.fetchV2Api("/advance-onboarding", {
      method: "POST",
      body: JSON.stringify({ event_type: eventType, event_data: eventData }),
    })
  }

  // Queue management
  async getResponseQueue(): Promise<{ queue: Record<string, unknown>[] }> {
    return this.fetchV2Api("/response-queue")
  }

  async queueApprovedResponses(
    delayHours?: number,
  ): Promise<{ result: { queued_count: number; already_queued: number } }> {
    return this.fetchV2Api("/queue-approved-responses", {
      method: "POST",
      body: JSON.stringify({ delay_hours: delayHours }),
    })
  }

  // Metrics
  async getResponseMetrics(): Promise<{ metrics: Record<string, unknown>[] }> {
    return this.fetchV2Api("/response-metrics")
  }

  // Profile
  async getProfile(): Promise<{ profile: Record<string, unknown> }> {
    return this.fetchV2Api("/profile")
  }

  async updateProfile(profile: Record<string, unknown>): Promise<{ profile: Record<string, unknown> }> {
    return this.fetchV2Api("/profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    })
  }

  // Get AI Response
  async getAiResponse(responseId: string): Promise<V2AiResponse | null> {
    try {
      const response = await this.fetchV2Api(`/ai-responses/${responseId}`)
      return response.ai_response
    } catch (error) {
      console.error("Error getting AI response:", error)
      return null
    }
  }

  // Helper to create client from Supabase and organization
  static async create(supabase: SupabaseClient): Promise<V2ApiClient | null> {
    // Check if we have a session
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      return null
    }

    return new V2ApiClient({ supabase })
  }
}
