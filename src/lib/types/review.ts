export interface Review {
  id: string; // Unique ID from the reviews table
  platform_review_id: string;
  platform: string;
  location_id: string;
  tenant_id: string;
  
  // Reviewer Details
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
  reviewer_is_anonymous: boolean | null;

  // Review Content
  rating: number;
  review_text: string | null;
  review_date: string;
  review_updated_at: string | null;
  is_review_edited: boolean | null;
  review_url: string | null;

  // Response Details
  has_owner_reply: boolean | null;
  owner_reply_text: string | null;
  owner_reply_date: string | null;
  external_response_date: string | null;
  response_source: 'ai' | 'owner_external' | 'manual' | null;

  // AI & System Fields
  status: string | null;
  sentiment_label: string | null;
  sentiment_score: number | null;
  priority_score: number | null;
  
  // Relational data that might be joined
  ai_responses?: AIResponse[];
  locations?: { name: string; address: string | null };
}

export interface AIResponse {
  id: string;
  review_id: string;
  response_text: string;
  status: 'draft' | 'approved' | 'rejected' | 'published' | 'generating' | 'pending_review';
  created_at: string;
  approved_at?: string | null;
  approved_by?: string | null;
  published_at?: string | null;
  published_by?: string | null;
  rejected_at?: string | null;
  rejected_by?: string | null;
  rejection_reason?: string | null;
  rejection_feedback?: string | null;
  
  // AI Generation metadata
  ai_model: string;
  confidence_score?: number | null;
  quality_score?: number | null;
  
  // Queue relationship
  response_queue?: ResponseQueueItem[] | null;
}

export interface ResponseQueueItem {
  id: string;
  tenant_id: string;
  response_id: string; // Changed from ai_response_id to match schema
  location_id: string;
  status: 'pending' | 'processing' | 'published' | 'failed' | 'cancelled';
  priority: number | null;
  scheduled_for: string | null;
  platform: string;
  platform_rate_limit: number | null;
  last_platform_request_at: string | null;
  attempt_count: number | null;
  max_attempts: number | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  error_message: string | null;
  error_code: string | null;
  error_details: Record<string, unknown> | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  processed_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FilterState {
  status: string[]
  rating: number[]
  dateRange: string
  location?: string
  search?: string
}

export interface PublishingSettings {
  autoPublish: boolean
  minRating: number
  maxPerHour: number
  maxPerDay: number
  delaySeconds: number
  businessHoursOnly: boolean
  businessHours: {
    start: string
    end: string
    timezone: string
    days: string[]
  }
}

export interface QueueItem {
  id: string
  aiResponseId: string
  review: {
    id: string
    reviewer: {
      displayName: string
    }
    starRating: string
    locationName: string
    review_text?: string
    rating: number
    review_date: string
  }
  position: number
  scheduledTime: Date
  status: "pending" | "processing" | "completed" | "failed"
}

export interface AIGuidance {
  voice: string
  tone: string
  guidelines: string[]
  upsellItems: UpsellItem[]
}

export interface UpsellItem {
  id: string
  name: string
  description: string
  active: boolean
}
