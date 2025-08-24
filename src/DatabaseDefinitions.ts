export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      ai_model_config: {
        Row: {
          api_version: string | null
          auth_method: string | null
          created_at: string
          id: string
          max_tokens: number | null
          metadata: Json
          primary_model: string
          settings: Json
          temperature: number | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          api_version?: string | null
          auth_method?: string | null
          created_at?: string
          id?: string
          max_tokens?: number | null
          metadata?: Json
          primary_model?: string
          settings?: Json
          temperature?: number | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          api_version?: string | null
          auth_method?: string | null
          created_at?: string
          id?: string
          max_tokens?: number | null
          metadata?: Json
          primary_model?: string
          settings?: Json
          temperature?: number | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_model_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_model_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      ai_responses: {
        Row: {
          ai_model: string
          ai_model_version: string | null
          approved_at: string | null
          approved_by: string | null
          business_context: Json | null
          confidence_score: number | null
          created_at: string
          deleted_at: string | null
          generation_cost: number | null
          generation_prompt: string | null
          generation_time_ms: number | null
          generation_tokens: number | null
          id: string
          metadata: Json
          personalization_data: Json | null
          platform_response_id: string | null
          published_at: string | null
          published_by: string | null
          quality_score: number | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_feedback: string | null
          rejection_reason: string | null
          response_language: string | null
          response_text: string
          review_id: string
          status: string | null
          template_id: string | null
          tenant_id: string
          tone: string | null
          updated_at: string
          version: number | null
        }
        Insert: {
          ai_model: string
          ai_model_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_context?: Json | null
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          generation_cost?: number | null
          generation_prompt?: string | null
          generation_time_ms?: number | null
          generation_tokens?: number | null
          id?: string
          metadata?: Json
          personalization_data?: Json | null
          platform_response_id?: string | null
          published_at?: string | null
          published_by?: string | null
          quality_score?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_feedback?: string | null
          rejection_reason?: string | null
          response_language?: string | null
          response_text: string
          review_id: string
          status?: string | null
          template_id?: string | null
          tenant_id: string
          tone?: string | null
          updated_at?: string
          version?: number | null
        }
        Update: {
          ai_model?: string
          ai_model_version?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_context?: Json | null
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          generation_cost?: number | null
          generation_prompt?: string | null
          generation_time_ms?: number | null
          generation_tokens?: number | null
          id?: string
          metadata?: Json
          personalization_data?: Json | null
          platform_response_id?: string | null
          published_at?: string | null
          published_by?: string | null
          quality_score?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_feedback?: string | null
          rejection_reason?: string | null
          response_language?: string | null
          response_text?: string
          review_id?: string
          status?: string | null
          template_id?: string | null
          tenant_id?: string
          tone?: string | null
          updated_at?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
          {
            foreignKeyName: "fk_ai_responses_template_id"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "response_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_notifications: {
        Row: {
          acknowledged_at: string | null
          alert_type: string
          created_at: string | null
          id: string
          message: string
          metadata: Json | null
          sent_at: string | null
          severity: string
          status: string
          tenant_id: string | null
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          alert_type: string
          created_at?: string | null
          id?: string
          message: string
          metadata?: Json | null
          sent_at?: string | null
          severity: string
          status?: string
          tenant_id?: string | null
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          alert_type?: string
          created_at?: string | null
          id?: string
          message?: string
          metadata?: Json | null
          sent_at?: string | null
          severity?: string
          status?: string
          tenant_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: unknown | null
          metadata: Json
          new_values: Json | null
          old_values: Json | null
          resource_id: string | null
          resource_type: string
          session_id: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          resource_id?: string | null
          resource_type: string
          session_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: unknown | null
          metadata?: Json
          new_values?: Json | null
          old_values?: Json | null
          resource_id?: string | null
          resource_type?: string
          session_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      batch_generation_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          error_details: Json | null
          error_message: string | null
          estimated_completion_at: string | null
          failed_generations: number | null
          filter_criteria: Json
          generation_settings: Json | null
          id: string
          metadata: Json
          name: string
          processed_reviews: number | null
          progress: number | null
          started_at: string | null
          status: string | null
          successful_generations: number | null
          template_id: string | null
          tenant_id: string
          total_reviews: number | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          error_details?: Json | null
          error_message?: string | null
          estimated_completion_at?: string | null
          failed_generations?: number | null
          filter_criteria: Json
          generation_settings?: Json | null
          id?: string
          metadata?: Json
          name: string
          processed_reviews?: number | null
          progress?: number | null
          started_at?: string | null
          status?: string | null
          successful_generations?: number | null
          template_id?: string | null
          tenant_id: string
          total_reviews?: number | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          error_details?: Json | null
          error_message?: string | null
          estimated_completion_at?: string | null
          failed_generations?: number | null
          filter_criteria?: Json
          generation_settings?: Json | null
          id?: string
          metadata?: Json
          name?: string
          processed_reviews?: number | null
          progress?: number | null
          started_at?: string | null
          status?: string | null
          successful_generations?: number | null
          template_id?: string | null
          tenant_id?: string
          total_reviews?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_generation_jobs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "response_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_generation_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_generation_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      billing_usage: {
        Row: {
          ai_generation_cost: number | null
          ai_generations: number | null
          api_cost: number | null
          api_requests: number | null
          billing_period_end: string
          billing_period_start: string
          created_at: string
          id: string
          metadata: Json
          overage_ai_generations: number | null
          overage_api_requests: number | null
          overage_cost: number | null
          overage_reviews: number | null
          overage_storage_gb: number | null
          plan_ai_generation_limit: number | null
          plan_api_limit: number | null
          plan_review_limit: number | null
          plan_storage_limit_gb: number | null
          reviews_processed: number | null
          storage_cost: number | null
          storage_used_gb: number | null
          tenant_id: string
          total_cost: number | null
          updated_at: string
        }
        Insert: {
          ai_generation_cost?: number | null
          ai_generations?: number | null
          api_cost?: number | null
          api_requests?: number | null
          billing_period_end: string
          billing_period_start: string
          created_at?: string
          id?: string
          metadata?: Json
          overage_ai_generations?: number | null
          overage_api_requests?: number | null
          overage_cost?: number | null
          overage_reviews?: number | null
          overage_storage_gb?: number | null
          plan_ai_generation_limit?: number | null
          plan_api_limit?: number | null
          plan_review_limit?: number | null
          plan_storage_limit_gb?: number | null
          reviews_processed?: number | null
          storage_cost?: number | null
          storage_used_gb?: number | null
          tenant_id: string
          total_cost?: number | null
          updated_at?: string
        }
        Update: {
          ai_generation_cost?: number | null
          ai_generations?: number | null
          api_cost?: number | null
          api_requests?: number | null
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          id?: string
          metadata?: Json
          overage_ai_generations?: number | null
          overage_api_requests?: number | null
          overage_cost?: number | null
          overage_reviews?: number | null
          overage_storage_gb?: number | null
          plan_ai_generation_limit?: number | null
          plan_api_limit?: number | null
          plan_review_limit?: number | null
          plan_storage_limit_gb?: number | null
          reviews_processed?: number | null
          storage_cost?: number | null
          storage_used_gb?: number | null
          tenant_id?: string
          total_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      business_guidance: {
        Row: {
          auto_respond_negative: boolean | null
          auto_respond_neutral: boolean | null
          auto_respond_positive: boolean | null
          auto_translate: boolean | null
          brand_voice: string | null
          business_hours: Json | null
          compliance_requirements: string[] | null
          contact_information: Json | null
          created_at: string
          default_call_to_action: string | null
          id: string
          include_business_name: boolean | null
          include_call_to_action: boolean | null
          industry_guidelines: Json | null
          key_messaging: string[] | null
          max_response_length: number | null
          metadata: Json
          min_response_length: number | null
          primary_language: string | null
          prohibited_words: string[] | null
          regulatory_compliance: Json | null
          required_phrases: string[] | null
          response_tone: Json | null
          review_threshold_for_auto_response: number | null
          services_offered: string[] | null
          settings: Json
          supported_languages: string[] | null
          tenant_id: string
          unique_selling_points: string[] | null
          updated_at: string
          writing_style: string | null
        }
        Insert: {
          auto_respond_negative?: boolean | null
          auto_respond_neutral?: boolean | null
          auto_respond_positive?: boolean | null
          auto_translate?: boolean | null
          brand_voice?: string | null
          business_hours?: Json | null
          compliance_requirements?: string[] | null
          contact_information?: Json | null
          created_at?: string
          default_call_to_action?: string | null
          id?: string
          include_business_name?: boolean | null
          include_call_to_action?: boolean | null
          industry_guidelines?: Json | null
          key_messaging?: string[] | null
          max_response_length?: number | null
          metadata?: Json
          min_response_length?: number | null
          primary_language?: string | null
          prohibited_words?: string[] | null
          regulatory_compliance?: Json | null
          required_phrases?: string[] | null
          response_tone?: Json | null
          review_threshold_for_auto_response?: number | null
          services_offered?: string[] | null
          settings?: Json
          supported_languages?: string[] | null
          tenant_id: string
          unique_selling_points?: string[] | null
          updated_at?: string
          writing_style?: string | null
        }
        Update: {
          auto_respond_negative?: boolean | null
          auto_respond_neutral?: boolean | null
          auto_respond_positive?: boolean | null
          auto_translate?: boolean | null
          brand_voice?: string | null
          business_hours?: Json | null
          compliance_requirements?: string[] | null
          contact_information?: Json | null
          created_at?: string
          default_call_to_action?: string | null
          id?: string
          include_business_name?: boolean | null
          include_call_to_action?: boolean | null
          industry_guidelines?: Json | null
          key_messaging?: string[] | null
          max_response_length?: number | null
          metadata?: Json
          min_response_length?: number | null
          primary_language?: string | null
          prohibited_words?: string[] | null
          regulatory_compliance?: Json | null
          required_phrases?: string[] | null
          response_tone?: Json | null
          review_threshold_for_auto_response?: number | null
          services_offered?: string[] | null
          settings?: Json
          supported_languages?: string[] | null
          tenant_id?: string
          unique_selling_points?: string[] | null
          updated_at?: string
          writing_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_guidance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_guidance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      context_caches: {
        Row: {
          cache_id: string
          context_hash: string
          created_at: string | null
          estimated_cost_savings: number | null
          expires_at: string
          id: string
          last_used_at: string | null
          tenant_id: string
          token_count: number
          usage_count: number | null
        }
        Insert: {
          cache_id: string
          context_hash: string
          created_at?: string | null
          estimated_cost_savings?: number | null
          expires_at: string
          id?: string
          last_used_at?: string | null
          tenant_id: string
          token_count: number
          usage_count?: number | null
        }
        Update: {
          cache_id?: string
          context_hash?: string
          created_at?: string | null
          estimated_cost_savings?: number | null
          expires_at?: string
          id?: string
          last_used_at?: string | null
          tenant_id?: string
          token_count?: number
          usage_count?: number | null
        }
        Relationships: []
      }
      cron_job_executions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_details: Json | null
          id: string
          job_name: string
          metadata: Json | null
          started_at: string | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_details?: Json | null
          id?: string
          job_name: string
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_details?: Json | null
          id?: string
          job_name?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      locations: {
        Row: {
          address: string | null
          auto_sync_frequency: unknown | null
          business_type: string | null
          created_at: string
          deleted_at: string | null
          facebook_page_id: string | null
          google_place_id: string | null
          id: string
          industry: string | null
          last_sync_at: string | null
          latitude: number | null
          longitude: number | null
          metadata: Json
          name: string
          next_sync_at: string | null
          oauth_token_id: string | null
          phone: string | null
          platform_data: Json
          platform_tokens: Json | null
          price_level: number | null
          rating: number | null
          review_count: number | null
          settings: Json
          status: string | null
          sync_enabled: boolean | null
          tenant_id: string
          timezone: string | null
          tripadvisor_location_id: string | null
          trustpilot_business_id: string | null
          updated_at: string
          website: string | null
          yelp_business_id: string | null
        }
        Insert: {
          address?: string | null
          auto_sync_frequency?: unknown | null
          business_type?: string | null
          created_at?: string
          deleted_at?: string | null
          facebook_page_id?: string | null
          google_place_id?: string | null
          id?: string
          industry?: string | null
          last_sync_at?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json
          name: string
          next_sync_at?: string | null
          oauth_token_id?: string | null
          phone?: string | null
          platform_data?: Json
          platform_tokens?: Json | null
          price_level?: number | null
          rating?: number | null
          review_count?: number | null
          settings?: Json
          status?: string | null
          sync_enabled?: boolean | null
          tenant_id: string
          timezone?: string | null
          tripadvisor_location_id?: string | null
          trustpilot_business_id?: string | null
          updated_at?: string
          website?: string | null
          yelp_business_id?: string | null
        }
        Update: {
          address?: string | null
          auto_sync_frequency?: unknown | null
          business_type?: string | null
          created_at?: string
          deleted_at?: string | null
          facebook_page_id?: string | null
          google_place_id?: string | null
          id?: string
          industry?: string | null
          last_sync_at?: string | null
          latitude?: number | null
          longitude?: number | null
          metadata?: Json
          name?: string
          next_sync_at?: string | null
          oauth_token_id?: string | null
          phone?: string | null
          platform_data?: Json
          platform_tokens?: Json | null
          price_level?: number | null
          rating?: number | null
          review_count?: number | null
          settings?: Json
          status?: string | null
          sync_enabled?: boolean | null
          tenant_id?: string
          timezone?: string | null
          tripadvisor_location_id?: string | null
          trustpilot_business_id?: string | null
          updated_at?: string
          website?: string | null
          yelp_business_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_oauth_token_id_fkey"
            columns: ["oauth_token_id"]
            isOneToOne: false
            referencedRelation: "oauth_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          email_daily_summary: boolean | null
          email_new_reviews: boolean | null
          email_response_approved: boolean | null
          email_response_rejected: boolean | null
          id: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_daily_summary?: boolean | null
          email_new_reviews?: boolean | null
          email_response_approved?: boolean | null
          email_response_rejected?: boolean | null
          id?: string
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_daily_summary?: boolean | null
          email_new_reviews?: boolean | null
          email_response_approved?: boolean | null
          email_response_rejected?: boolean | null
          id?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      oauth_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          encrypted_access_token: string
          encrypted_refresh_token: string | null
          expires_at: string
          id: string
          last_refresh_at: string | null
          last_refresh_error: string | null
          last_used_at: string | null
          provider: string
          provider_scope: string
          provider_user_email: string | null
          provider_user_id: string | null
          refresh_attempts: number
          status: string
          tenant_id: string
          token_metadata: Json
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          encrypted_access_token: string
          encrypted_refresh_token?: string | null
          expires_at: string
          id?: string
          last_refresh_at?: string | null
          last_refresh_error?: string | null
          last_used_at?: string | null
          provider: string
          provider_scope: string
          provider_user_email?: string | null
          provider_user_id?: string | null
          refresh_attempts?: number
          status?: string
          tenant_id: string
          token_metadata?: Json
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          encrypted_access_token?: string
          encrypted_refresh_token?: string | null
          expires_at?: string
          id?: string
          last_refresh_at?: string | null
          last_refresh_error?: string | null
          last_used_at?: string | null
          provider?: string
          provider_scope?: string
          provider_user_email?: string | null
          provider_user_id?: string | null
          refresh_attempts?: number
          status?: string
          tenant_id?: string
          token_metadata?: Json
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_tokens_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      performance_metrics: {
        Row: {
          avg_value: number | null
          created_at: string
          endpoint: string | null
          id: string
          max_value: number | null
          metadata: Json
          method: string | null
          metric_name: string
          metric_type: string
          min_value: number | null
          p50_value: number | null
          p95_value: number | null
          p99_value: number | null
          period_end: string
          period_start: string
          sample_count: number | null
          service: string | null
          status_code: number | null
          tags: Json | null
          tenant_id: string | null
          unit: string | null
          value: number
        }
        Insert: {
          avg_value?: number | null
          created_at?: string
          endpoint?: string | null
          id?: string
          max_value?: number | null
          metadata?: Json
          method?: string | null
          metric_name: string
          metric_type: string
          min_value?: number | null
          p50_value?: number | null
          p95_value?: number | null
          p99_value?: number | null
          period_end: string
          period_start: string
          sample_count?: number | null
          service?: string | null
          status_code?: number | null
          tags?: Json | null
          tenant_id?: string | null
          unit?: string | null
          value: number
        }
        Update: {
          avg_value?: number | null
          created_at?: string
          endpoint?: string | null
          id?: string
          max_value?: number | null
          metadata?: Json
          method?: string | null
          metric_name?: string
          metric_type?: string
          min_value?: number | null
          p50_value?: number | null
          p95_value?: number | null
          p99_value?: number | null
          period_end?: string
          period_start?: string
          sample_count?: number | null
          service?: string | null
          status_code?: number | null
          tags?: Json | null
          tenant_id?: string | null
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          email: string
          full_name: string | null
          id: string
          last_active_at: string
          metadata: Json
          notification_preferences: Json
          phone: string | null
          preferred_language: string | null
          settings: Json
          timezone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          full_name?: string | null
          id: string
          last_active_at?: string
          metadata?: Json
          notification_preferences?: Json
          phone?: string | null
          preferred_language?: string | null
          settings?: Json
          timezone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          last_active_at?: string
          metadata?: Json
          notification_preferences?: Json
          phone?: string | null
          preferred_language?: string | null
          settings?: Json
          timezone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      response_analytics: {
        Row: {
          approval_rate: number | null
          avg_confidence_score: number | null
          avg_generation_cost: number | null
          avg_generation_time: unknown | null
          avg_quality_score: number | null
          avg_response_time: unknown | null
          avg_sentiment_score: number | null
          created_at: string
          id: string
          location_id: string | null
          metadata: Json
          negative_reviews: number | null
          neutral_reviews: number | null
          period_end: string
          period_start: string
          period_type: string
          platform_metrics: Json | null
          positive_reviews: number | null
          rejection_rate: number | null
          response_rate: number | null
          tenant_id: string
          total_generation_cost: number | null
          total_responses: number | null
          total_reviews: number | null
          total_tokens: number | null
          updated_at: string
        }
        Insert: {
          approval_rate?: number | null
          avg_confidence_score?: number | null
          avg_generation_cost?: number | null
          avg_generation_time?: unknown | null
          avg_quality_score?: number | null
          avg_response_time?: unknown | null
          avg_sentiment_score?: number | null
          created_at?: string
          id?: string
          location_id?: string | null
          metadata?: Json
          negative_reviews?: number | null
          neutral_reviews?: number | null
          period_end: string
          period_start: string
          period_type: string
          platform_metrics?: Json | null
          positive_reviews?: number | null
          rejection_rate?: number | null
          response_rate?: number | null
          tenant_id: string
          total_generation_cost?: number | null
          total_responses?: number | null
          total_reviews?: number | null
          total_tokens?: number | null
          updated_at?: string
        }
        Update: {
          approval_rate?: number | null
          avg_confidence_score?: number | null
          avg_generation_cost?: number | null
          avg_generation_time?: unknown | null
          avg_quality_score?: number | null
          avg_response_time?: unknown | null
          avg_sentiment_score?: number | null
          created_at?: string
          id?: string
          location_id?: string | null
          metadata?: Json
          negative_reviews?: number | null
          neutral_reviews?: number | null
          period_end?: string
          period_start?: string
          period_type?: string
          platform_metrics?: Json | null
          positive_reviews?: number | null
          rejection_rate?: number | null
          response_rate?: number | null
          tenant_id?: string
          total_generation_cost?: number | null
          total_responses?: number | null
          total_reviews?: number | null
          total_tokens?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_analytics_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_analytics_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations_with_oauth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      response_queue: {
        Row: {
          attempt_count: number | null
          created_at: string
          error_code: string | null
          error_details: Json | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          last_platform_request_at: string | null
          location_id: string
          max_attempts: number | null
          metadata: Json
          next_retry_at: string | null
          platform: string
          platform_rate_limit: number | null
          priority: number | null
          processed_by: string | null
          processing_completed_at: string | null
          processing_started_at: string | null
          response_id: string
          scheduled_for: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number | null
          created_at?: string
          error_code?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          last_platform_request_at?: string | null
          location_id: string
          max_attempts?: number | null
          metadata?: Json
          next_retry_at?: string | null
          platform: string
          platform_rate_limit?: number | null
          priority?: number | null
          processed_by?: string | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          response_id: string
          scheduled_for?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number | null
          created_at?: string
          error_code?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          last_platform_request_at?: string | null
          location_id?: string
          max_attempts?: number | null
          metadata?: Json
          next_retry_at?: string | null
          platform?: string
          platform_rate_limit?: number | null
          priority?: number | null
          processed_by?: string | null
          processing_completed_at?: string | null
          processing_started_at?: string | null
          response_id?: string
          scheduled_for?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_queue_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_queue_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations_with_oauth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_queue_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "ai_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      response_settings: {
        Row: {
          auto_publish_enabled: boolean | null
          auto_publish_negative: boolean | null
          auto_publish_neutral: boolean | null
          auto_publish_positive: boolean | null
          created_at: string
          excluded_keywords: string[] | null
          id: string
          include_business_name: boolean | null
          include_upsell: boolean | null
          location_id: string | null
          max_response_length: number | null
          metadata: Json
          min_confidence_score: number | null
          min_quality_score: number | null
          notification_recipients: string[] | null
          notify_on_auto_publish: boolean | null
          notify_on_review_threshold: boolean | null
          platform_settings: Json | null
          rate_limits: Json | null
          require_human_review_below_threshold: boolean | null
          require_personalization: boolean | null
          settings: Json
          tenant_id: string
          updated_at: string
          working_hours: Json | null
          working_hours_only: boolean | null
        }
        Insert: {
          auto_publish_enabled?: boolean | null
          auto_publish_negative?: boolean | null
          auto_publish_neutral?: boolean | null
          auto_publish_positive?: boolean | null
          created_at?: string
          excluded_keywords?: string[] | null
          id?: string
          include_business_name?: boolean | null
          include_upsell?: boolean | null
          location_id?: string | null
          max_response_length?: number | null
          metadata?: Json
          min_confidence_score?: number | null
          min_quality_score?: number | null
          notification_recipients?: string[] | null
          notify_on_auto_publish?: boolean | null
          notify_on_review_threshold?: boolean | null
          platform_settings?: Json | null
          rate_limits?: Json | null
          require_human_review_below_threshold?: boolean | null
          require_personalization?: boolean | null
          settings?: Json
          tenant_id: string
          updated_at?: string
          working_hours?: Json | null
          working_hours_only?: boolean | null
        }
        Update: {
          auto_publish_enabled?: boolean | null
          auto_publish_negative?: boolean | null
          auto_publish_neutral?: boolean | null
          auto_publish_positive?: boolean | null
          created_at?: string
          excluded_keywords?: string[] | null
          id?: string
          include_business_name?: boolean | null
          include_upsell?: boolean | null
          location_id?: string | null
          max_response_length?: number | null
          metadata?: Json
          min_confidence_score?: number | null
          min_quality_score?: number | null
          notification_recipients?: string[] | null
          notify_on_auto_publish?: boolean | null
          notify_on_review_threshold?: boolean | null
          platform_settings?: Json | null
          rate_limits?: Json | null
          require_human_review_below_threshold?: boolean | null
          require_personalization?: boolean | null
          settings?: Json
          tenant_id?: string
          updated_at?: string
          working_hours?: Json | null
          working_hours_only?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "response_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_settings_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations_with_oauth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      response_templates: {
        Row: {
          avg_response_time: unknown | null
          category: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          keywords: string[] | null
          last_modified_by: string | null
          metadata: Json
          name: string
          platforms: string[] | null
          priority: number | null
          rating_range: unknown | null
          sentiment_range: unknown | null
          settings: Json
          status: string | null
          success_rate: number | null
          template_language: string | null
          template_text: string
          tenant_id: string
          updated_at: string
          usage_count: number | null
          variables: Json | null
        }
        Insert: {
          avg_response_time?: unknown | null
          category?: string | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          keywords?: string[] | null
          last_modified_by?: string | null
          metadata?: Json
          name: string
          platforms?: string[] | null
          priority?: number | null
          rating_range?: unknown | null
          sentiment_range?: unknown | null
          settings?: Json
          status?: string | null
          success_rate?: number | null
          template_language?: string | null
          template_text: string
          tenant_id: string
          updated_at?: string
          usage_count?: number | null
          variables?: Json | null
        }
        Update: {
          avg_response_time?: unknown | null
          category?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          keywords?: string[] | null
          last_modified_by?: string | null
          metadata?: Json
          name?: string
          platforms?: string[] | null
          priority?: number | null
          rating_range?: unknown | null
          sentiment_range?: unknown | null
          settings?: Json
          status?: string | null
          success_rate?: number | null
          template_language?: string | null
          template_text?: string
          tenant_id?: string
          updated_at?: string
          usage_count?: number | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "response_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      reviews: {
        Row: {
          confidence_score: number | null
          created_at: string
          deleted_at: string | null
          external_response_date: string | null
          flagged_reason: string | null
          has_owner_reply: boolean | null
          id: string
          is_flagged: boolean | null
          is_local_guide: boolean | null
          is_review_edited: boolean | null
          is_verified: boolean | null
          keywords: string[] | null
          location_id: string
          metadata: Json
          needs_response: boolean | null
          owner_reply_date: string | null
          owner_reply_text: string | null
          platform: string
          platform_data: Json
          platform_review_id: string
          platform_reviewer_id: string | null
          priority_score: number | null
          rating: number
          response_deadline: string | null
          response_source: string | null
          review_date: string
          review_language: string | null
          review_text: string | null
          review_updated_at: string | null
          review_url: string | null
          reviewer_avatar_url: string | null
          reviewer_is_anonymous: boolean | null
          reviewer_name: string | null
          reviewer_review_count: number | null
          sentiment_label: string | null
          sentiment_score: number | null
          status: string | null
          tenant_id: string
          topics: string[] | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          external_response_date?: string | null
          flagged_reason?: string | null
          has_owner_reply?: boolean | null
          id?: string
          is_flagged?: boolean | null
          is_local_guide?: boolean | null
          is_review_edited?: boolean | null
          is_verified?: boolean | null
          keywords?: string[] | null
          location_id: string
          metadata?: Json
          needs_response?: boolean | null
          owner_reply_date?: string | null
          owner_reply_text?: string | null
          platform: string
          platform_data?: Json
          platform_review_id: string
          platform_reviewer_id?: string | null
          priority_score?: number | null
          rating: number
          response_deadline?: string | null
          response_source?: string | null
          review_date: string
          review_language?: string | null
          review_text?: string | null
          review_updated_at?: string | null
          review_url?: string | null
          reviewer_avatar_url?: string | null
          reviewer_is_anonymous?: boolean | null
          reviewer_name?: string | null
          reviewer_review_count?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          status?: string | null
          tenant_id: string
          topics?: string[] | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          deleted_at?: string | null
          external_response_date?: string | null
          flagged_reason?: string | null
          has_owner_reply?: boolean | null
          id?: string
          is_flagged?: boolean | null
          is_local_guide?: boolean | null
          is_review_edited?: boolean | null
          is_verified?: boolean | null
          keywords?: string[] | null
          location_id?: string
          metadata?: Json
          needs_response?: boolean | null
          owner_reply_date?: string | null
          owner_reply_text?: string | null
          platform?: string
          platform_data?: Json
          platform_review_id?: string
          platform_reviewer_id?: string | null
          priority_score?: number | null
          rating?: number
          response_deadline?: string | null
          response_source?: string | null
          review_date?: string
          review_language?: string | null
          review_text?: string | null
          review_updated_at?: string | null
          review_url?: string | null
          reviewer_avatar_url?: string | null
          reviewer_is_anonymous?: boolean | null
          reviewer_name?: string | null
          reviewer_review_count?: number | null
          sentiment_label?: string | null
          sentiment_score?: number | null
          status?: string | null
          tenant_id?: string
          topics?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations_with_oauth"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      system_config: {
        Row: {
          created_at: string | null
          id: number
          key_name: string
          key_value: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          key_name: string
          key_value: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          key_name?: string
          key_value?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_health: {
        Row: {
          active_connections: number | null
          component: string
          cpu_usage_percent: number | null
          created_at: string
          disk_usage_percent: number | null
          error_message: string | null
          error_rate: number | null
          health_check_data: Json | null
          id: string
          instance_id: string | null
          last_check_at: string
          last_restart_at: string | null
          memory_usage_percent: number | null
          metadata: Json
          queue_length: number | null
          region: string | null
          response_time_ms: number | null
          status: string
          throughput: number | null
          updated_at: string
          uptime_seconds: number | null
        }
        Insert: {
          active_connections?: number | null
          component: string
          cpu_usage_percent?: number | null
          created_at?: string
          disk_usage_percent?: number | null
          error_message?: string | null
          error_rate?: number | null
          health_check_data?: Json | null
          id?: string
          instance_id?: string | null
          last_check_at?: string
          last_restart_at?: string | null
          memory_usage_percent?: number | null
          metadata?: Json
          queue_length?: number | null
          region?: string | null
          response_time_ms?: number | null
          status: string
          throughput?: number | null
          updated_at?: string
          uptime_seconds?: number | null
        }
        Update: {
          active_connections?: number | null
          component?: string
          cpu_usage_percent?: number | null
          created_at?: string
          disk_usage_percent?: number | null
          error_message?: string | null
          error_rate?: number | null
          health_check_data?: Json | null
          id?: string
          instance_id?: string | null
          last_check_at?: string
          last_restart_at?: string | null
          memory_usage_percent?: number | null
          metadata?: Json
          queue_length?: number | null
          region?: string | null
          response_time_ms?: number | null
          status?: string
          throughput?: number | null
          updated_at?: string
          uptime_seconds?: number | null
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          category: string
          correlation_id: string | null
          created_at: string
          details: Json | null
          duration_ms: number | null
          environment: string | null
          error_code: string | null
          id: string
          log_level: string
          memory_usage_mb: number | null
          message: string
          metadata: Json
          request_id: string | null
          session_id: string | null
          source: string | null
          stack_trace: string | null
          tenant_id: string | null
          user_id: string | null
          version: string | null
        }
        Insert: {
          category: string
          correlation_id?: string | null
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          environment?: string | null
          error_code?: string | null
          id?: string
          log_level: string
          memory_usage_mb?: number | null
          message: string
          metadata?: Json
          request_id?: string | null
          session_id?: string | null
          source?: string | null
          stack_trace?: string | null
          tenant_id?: string | null
          user_id?: string | null
          version?: string | null
        }
        Update: {
          category?: string
          correlation_id?: string | null
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          environment?: string | null
          error_code?: string | null
          id?: string
          log_level?: string
          memory_usage_mb?: number | null
          message?: string
          metadata?: Json
          request_id?: string | null
          session_id?: string | null
          source?: string | null
          stack_trace?: string | null
          tenant_id?: string | null
          user_id?: string | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          assigned_locations: string[] | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invitation_token: string
          invited_by: string
          message: string | null
          permissions: Json | null
          role: string
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_locations?: string[] | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invitation_token?: string
          invited_by: string
          message?: string | null
          permissions?: Json | null
          role: string
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          assigned_locations?: string[] | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invitation_token?: string
          invited_by?: string
          message?: string | null
          permissions?: Json | null
          role?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          metadata: Json
          permissions: Json
          role: string
          settings: Json
          status: string | null
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          metadata?: Json
          permissions?: Json
          role?: string
          settings?: Json
          status?: string | null
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          metadata?: Json
          permissions?: Json
          role?: string
          settings?: Json
          status?: string | null
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      tenants: {
        Row: {
          annual_revenue: unknown | null
          business_type: string | null
          country_code: string | null
          created_at: string
          deleted_at: string | null
          employee_count: unknown | null
          features: Json
          id: string
          industry: string | null
          locations_limit: number | null
          metadata: Json
          monthly_ai_generation_limit: number | null
          monthly_review_limit: number | null
          name: string
          onboarding_completed: boolean | null
          onboarding_data: Json | null
          onboarding_step: string | null
          settings: Json
          slug: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_ends_at: string | null
          subscription_plan: string
          subscription_status: string
          team_members_limit: number | null
          timezone: string | null
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          annual_revenue?: unknown | null
          business_type?: string | null
          country_code?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_count?: unknown | null
          features?: Json
          id?: string
          industry?: string | null
          locations_limit?: number | null
          metadata?: Json
          monthly_ai_generation_limit?: number | null
          monthly_review_limit?: number | null
          name: string
          onboarding_completed?: boolean | null
          onboarding_data?: Json | null
          onboarding_step?: string | null
          settings?: Json
          slug: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_plan?: string
          subscription_status?: string
          team_members_limit?: number | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          annual_revenue?: unknown | null
          business_type?: string | null
          country_code?: string | null
          created_at?: string
          deleted_at?: string | null
          employee_count?: unknown | null
          features?: Json
          id?: string
          industry?: string | null
          locations_limit?: number | null
          metadata?: Json
          monthly_ai_generation_limit?: number | null
          monthly_review_limit?: number | null
          name?: string
          onboarding_completed?: boolean | null
          onboarding_data?: Json | null
          onboarding_step?: string | null
          settings?: Json
          slug?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_ends_at?: string | null
          subscription_plan?: string
          subscription_status?: string
          team_members_limit?: number | null
          timezone?: string | null
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      upsell_items: {
        Row: {
          active_from: string | null
          active_until: string | null
          call_to_action: string
          category: string | null
          clicks: number | null
          conversion_goal: string | null
          conversion_rate: number | null
          conversions: number | null
          created_at: string
          description: string | null
          id: string
          impressions: number | null
          link_url: string | null
          metadata: Json
          name: string
          offer_code: string | null
          priority: number | null
          promotion_text: string
          status: string | null
          target_keywords: string[] | null
          target_platforms: string[] | null
          target_rating_range: unknown | null
          target_sentiment: string[] | null
          tenant_id: string
          test_group: string | null
          updated_at: string
          variant_name: string | null
        }
        Insert: {
          active_from?: string | null
          active_until?: string | null
          call_to_action: string
          category?: string | null
          clicks?: number | null
          conversion_goal?: string | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string
          description?: string | null
          id?: string
          impressions?: number | null
          link_url?: string | null
          metadata?: Json
          name: string
          offer_code?: string | null
          priority?: number | null
          promotion_text: string
          status?: string | null
          target_keywords?: string[] | null
          target_platforms?: string[] | null
          target_rating_range?: unknown | null
          target_sentiment?: string[] | null
          tenant_id: string
          test_group?: string | null
          updated_at?: string
          variant_name?: string | null
        }
        Update: {
          active_from?: string | null
          active_until?: string | null
          call_to_action?: string
          category?: string | null
          clicks?: number | null
          conversion_goal?: string | null
          conversion_rate?: number | null
          conversions?: number | null
          created_at?: string
          description?: string | null
          id?: string
          impressions?: number | null
          link_url?: string | null
          metadata?: Json
          name?: string
          offer_code?: string | null
          priority?: number | null
          promotion_text?: string
          status?: string | null
          target_keywords?: string[] | null
          target_platforms?: string[] | null
          target_rating_range?: unknown | null
          target_sentiment?: string[] | null
          tenant_id?: string
          test_group?: string | null
          updated_at?: string
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upsell_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upsell_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      workflow_events: {
        Row: {
          causation_id: string | null
          correlation_id: string | null
          created_at: string
          event_data: Json
          event_source: string
          event_timestamp: string
          event_type: string
          id: string
          metadata: Json
          processed: boolean | null
          processed_at: string | null
          processing_error: string | null
          workflow_id: string
        }
        Insert: {
          causation_id?: string | null
          correlation_id?: string | null
          created_at?: string
          event_data?: Json
          event_source: string
          event_timestamp?: string
          event_type: string
          id?: string
          metadata?: Json
          processed?: boolean | null
          processed_at?: string | null
          processing_error?: string | null
          workflow_id: string
        }
        Update: {
          causation_id?: string | null
          correlation_id?: string | null
          created_at?: string
          event_data?: Json
          event_source?: string
          event_timestamp?: string
          event_type?: string
          id?: string
          metadata?: Json
          processed?: boolean | null
          processed_at?: string | null
          processing_error?: string | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_events_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          attempts: number | null
          compensated_at: string | null
          compensation_action: string | null
          compensation_data: Json | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          input_data: Json
          max_attempts: number | null
          metadata: Json
          next_retry_at: string | null
          output_data: Json
          retry_count: number | null
          started_at: string | null
          status: string | null
          step_index: number
          step_name: string
          step_type: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          attempts?: number | null
          compensated_at?: string | null
          compensation_action?: string | null
          compensation_data?: Json | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          input_data?: Json
          max_attempts?: number | null
          metadata?: Json
          next_retry_at?: string | null
          output_data?: Json
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          step_index: number
          step_name: string
          step_type: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          attempts?: number | null
          compensated_at?: string | null
          compensation_action?: string | null
          compensation_data?: Json | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          input_data?: Json
          max_attempts?: number | null
          metadata?: Json
          next_retry_at?: string | null
          output_data?: Json
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          step_index?: number
          step_name?: string
          step_type?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          avg_duration: unknown | null
          category: string | null
          created_at: string
          created_by: string | null
          default_input: Json | null
          description: string | null
          id: string
          is_system_template: boolean | null
          last_modified_by: string | null
          metadata: Json
          name: string
          retry_policy: Json | null
          status: string | null
          step_definitions: Json
          success_rate: number | null
          tags: string[] | null
          tenant_id: string | null
          timeout_minutes: number | null
          updated_at: string
          usage_count: number | null
          version: string | null
          workflow_type: string
        }
        Insert: {
          avg_duration?: unknown | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_input?: Json | null
          description?: string | null
          id?: string
          is_system_template?: boolean | null
          last_modified_by?: string | null
          metadata?: Json
          name: string
          retry_policy?: Json | null
          status?: string | null
          step_definitions: Json
          success_rate?: number | null
          tags?: string[] | null
          tenant_id?: string | null
          timeout_minutes?: number | null
          updated_at?: string
          usage_count?: number | null
          version?: string | null
          workflow_type: string
        }
        Update: {
          avg_duration?: unknown | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          default_input?: Json | null
          description?: string | null
          id?: string
          is_system_template?: boolean | null
          last_modified_by?: string | null
          metadata?: Json
          name?: string
          retry_policy?: Json | null
          status?: string | null
          step_definitions?: Json
          success_rate?: number | null
          tags?: string[] | null
          tenant_id?: string | null
          timeout_minutes?: number | null
          updated_at?: string
          usage_count?: number | null
          version?: string | null
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      workflows: {
        Row: {
          blocks: string[] | null
          compensation_data: Json | null
          completed_at: string | null
          completed_steps: number | null
          context_data: Json
          correlation_id: string | null
          created_at: string
          current_step: string | null
          depends_on: string[] | null
          error_details: Json | null
          error_message: string | null
          estimated_completion_at: string | null
          id: string
          input_data: Json
          metadata: Json
          output_data: Json
          parent_workflow_id: string | null
          priority: number | null
          progress_percentage: number | null
          retry_count: number | null
          started_at: string | null
          status: string | null
          step_index: number | null
          tags: string[] | null
          tenant_id: string
          total_steps: number | null
          updated_at: string
          workflow_name: string
          workflow_type: string
        }
        Insert: {
          blocks?: string[] | null
          compensation_data?: Json | null
          completed_at?: string | null
          completed_steps?: number | null
          context_data?: Json
          correlation_id?: string | null
          created_at?: string
          current_step?: string | null
          depends_on?: string[] | null
          error_details?: Json | null
          error_message?: string | null
          estimated_completion_at?: string | null
          id?: string
          input_data?: Json
          metadata?: Json
          output_data?: Json
          parent_workflow_id?: string | null
          priority?: number | null
          progress_percentage?: number | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          step_index?: number | null
          tags?: string[] | null
          tenant_id: string
          total_steps?: number | null
          updated_at?: string
          workflow_name: string
          workflow_type: string
        }
        Update: {
          blocks?: string[] | null
          compensation_data?: Json | null
          completed_at?: string | null
          completed_steps?: number | null
          context_data?: Json
          correlation_id?: string | null
          created_at?: string
          current_step?: string | null
          depends_on?: string[] | null
          error_details?: Json | null
          error_message?: string | null
          estimated_completion_at?: string | null
          id?: string
          input_data?: Json
          metadata?: Json
          output_data?: Json
          parent_workflow_id?: string | null
          priority?: number | null
          progress_percentage?: number | null
          retry_count?: number | null
          started_at?: string | null
          status?: string | null
          step_index?: number | null
          tags?: string[] | null
          tenant_id?: string
          total_steps?: number | null
          updated_at?: string
          workflow_name?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflows_parent_workflow_id_fkey"
            columns: ["parent_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
    }
    Views: {
      cron_job_health: {
        Row: {
          avg_duration_seconds: number | null
          failed_24h: number | null
          job_name: string | null
          last_run: string | null
          successful_24h: number | null
        }
        Relationships: []
      }
      locations_with_oauth: {
        Row: {
          address: string | null
          auto_sync_frequency: unknown | null
          business_type: string | null
          created_at: string | null
          deleted_at: string | null
          facebook_page_id: string | null
          google_place_id: string | null
          id: string | null
          industry: string | null
          last_sync_at: string | null
          latitude: number | null
          longitude: number | null
          metadata: Json | null
          name: string | null
          next_sync_at: string | null
          oauth_status: string | null
          oauth_token_id: string | null
          phone: string | null
          platform_data: Json | null
          platform_tokens: Json | null
          price_level: number | null
          rating: number | null
          review_count: number | null
          settings: Json | null
          status: string | null
          sync_enabled: boolean | null
          tenant_id: string | null
          timezone: string | null
          token_expires_at: string | null
          token_last_refreshed: string | null
          token_last_used: string | null
          tripadvisor_location_id: string | null
          trustpilot_business_id: string | null
          updated_at: string | null
          website: string | null
          yelp_business_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_oauth_token_id_fkey"
            columns: ["oauth_token_id"]
            isOneToOne: false
            referencedRelation: "oauth_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
      v_dashboard_overview: {
        Row: {
          active_workflows: number | null
          average_rating: number | null
          pending_responses: number | null
          published_responses: number | null
          tenant_id: string | null
          tenant_name: string | null
          total_locations: number | null
          total_reviews: number | null
        }
        Relationships: []
      }
      v_response_performance: {
        Row: {
          approved: number | null
          avg_confidence: number | null
          date: string | null
          published: number | null
          rejected: number | null
          tenant_id: string | null
          total_cost: number | null
          total_generated: number | null
          total_tokens: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_dashboard_overview"
            referencedColumns: ["tenant_id"]
          },
        ]
      }
    }
    Functions: {
      acknowledge_alert: {
        Args: { acknowledged_by: string; alert_id: string }
        Returns: boolean
      }
      add_approved_responses_to_queue: {
        Args: { tenant_id: string }
        Returns: number
      }
      add_selected_responses_to_queue: {
        Args: { response_ids: string[]; tenant_id: string }
        Returns: number
      }
      advance_onboarding_step: {
        Args: {
          p_completed_step: string
          p_event_data?: Json
          p_organization_id: string
        }
        Returns: boolean
      }
      advance_workflow: {
        Args: { p_execution_id: string; p_result_context?: Json }
        Returns: boolean
      }
      api_start_workflow: {
        Args: {
          p_context?: Json
          p_organization_id: string
          p_priority?: number
          p_workflow_type: string
        }
        Returns: Json
      }
      build_gmb_path: {
        Args: {
          account_id?: string
          location_id: string
          resource_type?: string
        }
        Returns: string
      }
      call_edge_function: {
        Args: {
          p_function_name: string
          p_payload?: Json
          p_timeout_ms?: number
        }
        Returns: number
      }
      check_auto_sync_circuit_breaker: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      check_auto_sync_health: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      check_cron_health: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      check_queue_alerts: {
        Args: Record<PropertyKey, never>
        Returns: {
          alert_type: string
          message: string
          queue_name: string
          severity: string
        }[]
      }
      check_queue_health: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      check_system_health: {
        Args: Record<PropertyKey, never>
        Returns: {
          check_name: string
          details: Json
          status: string
        }[]
      }
      cleanup_expired_context_caches: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      cleanup_legacy_response_queue: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      clear_old_unread_messages: {
        Args: { p_max_age_minutes?: number; p_queue_name: string }
        Returns: Json
      }
      clear_stuck_queue_messages: {
        Args: {
          p_max_age_minutes?: number
          p_max_retries?: number
          p_queue_name: string
        }
        Returns: Json
      }
      count_unqueued_approved_responses: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      detect_poison_message: {
        Args: { p_error: string; p_message: Json; p_queue_name: string }
        Returns: string
      }
      disable_v2_cron_jobs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      enable_v2_cron_jobs: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      execute_alert_rules: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      execute_synthetic_test: {
        Args: { p_test_name: string }
        Returns: {
          error_message: string
          execution_id: string
          execution_time_ms: number
          status: string
          test_name: string
        }[]
      }
      extract_location_id: {
        Args: { full_path: string }
        Returns: string
      }
      fail_workflow_step: {
        Args: {
          p_error_details: Json
          p_execution_id: string
          p_should_retry?: boolean
        }
        Returns: boolean
      }
      generate_ai_response_direct: {
        Args: { p_workflow_id: string }
        Returns: undefined
      }
      get_active_oauth_token: {
        Args: { p_provider: string; p_scope?: string; p_tenant_id: string }
        Returns: {
          encrypted_access_token: string
          encrypted_refresh_token: string
          expires_at: string
          id: string
          last_used_at: string
          status: string
        }[]
      }
      get_cron_secret: {
        Args: { secret_key: string }
        Returns: string
      }
      get_effective_ai_config: {
        Args: { p_tenant_id: string }
        Returns: {
          api_version: string
          auth_method: string
          created_at: string
          id: string
          max_tokens: number
          metadata: Json
          primary_model: string
          settings: Json
          temperature: number
          tenant_id: string
          updated_at: string
        }[]
      }
      get_failed_workflows_for_recovery: {
        Args: Record<PropertyKey, never>
        Returns: {
          failure_count: number
          last_failure: string
          organization_id: string
        }[]
      }
      get_locations_for_oauth_token: {
        Args: { p_token_id: string }
        Returns: {
          google_place_id: string
          location_id: string
          location_name: string
          status: string
        }[]
      }
      get_next_message_fair: {
        Args: { p_batch_size?: number; p_queue_name: string }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
        }[]
      }
      get_next_queue_item: {
        Args: { p_tenant_id: string }
        Returns: {
          ai_response_id: string
          queue_id: string
          review_id: string
        }[]
      }
      get_next_response_to_process: {
        Args: { tenant_id: string }
        Returns: {
          ai_response_id: string
          location_id: string
          platform_review_id: string
          queue_id: string
          response_text: string
          review_id: string
        }[]
      }
      get_onboarding_progress: {
        Args: { p_tenant_id: string }
        Returns: {
          completed: boolean
          completed_at: string
          step: string
        }[]
      }
      get_prioritized_sync_candidates: {
        Args: { max_candidates?: number }
        Returns: {
          last_sync_hours_ago: number
          organization_id: string
          organization_name: string
          priority_score: number
          reason: string
        }[]
      }
      get_queue_processor_mapping: {
        Args: Record<PropertyKey, never>
        Returns: {
          edge_function_url: string
          is_active: boolean
          processor_name: string
          queue_name: string
          step_name: string
          workflow_type: string
        }[]
      }
      get_review_ui_status: {
        Args: {
          ai_response_status: string
          has_ai_response: boolean
          queue_status: string
          response_source: string
          review_status: string
        }
        Returns: string
      }
      get_service_role_key: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_synthetic_test_health: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_system_health: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_system_health_check: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_tenant_batch: {
        Args: { batch_offset?: number; batch_size?: number }
        Returns: {
          tenant_id: string
        }[]
      }
      get_user_tenant_ids: {
        Args: { user_id: string }
        Returns: string[]
      }
      get_user_tenant_role: {
        Args: { tenant_id: string; user_id: string }
        Returns: string
      }
      gtrgm_compress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_decompress: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_in: {
        Args: { "": unknown }
        Returns: unknown
      }
      gtrgm_options: {
        Args: { "": unknown }
        Returns: undefined
      }
      gtrgm_out: {
        Args: { "": unknown }
        Returns: unknown
      }
      is_tenant_admin: {
        Args: { tenant_id: string; user_id: string }
        Returns: boolean
      }
      link_location_to_oauth_token: {
        Args: { p_location_id: string; p_token_id: string }
        Returns: boolean
      }
      location_has_oauth_token: {
        Args: { p_location_id: string }
        Returns: boolean
      }
      log_cron_execution: {
        Args: {
          p_error_details?: Json
          p_job_name: string
          p_metadata?: Json
          p_status: string
        }
        Returns: string
      }
      mark_oauth_token_used: {
        Args: { p_token_id: string }
        Returns: undefined
      }
      migrate_all_google_tokens: {
        Args: Record<PropertyKey, never>
        Returns: {
          error_message: string
          locations_count: number
          migrated_tenant_id: string
          oauth_token_id: string
          success: boolean
        }[]
      }
      migrate_tenant_google_tokens: {
        Args: { p_tenant_id: string }
        Returns: {
          error_message: string
          locations_count: number
          migrated_tenant_id: string
          oauth_token_id: string
          success: boolean
        }[]
      }
      move_to_dead_letter_queue: {
        Args: { p_error_details: Json; p_execution_id: string }
        Returns: undefined
      }
      pgmq_delete_message: {
        Args: { p_msg_id: number; p_queue_name: string }
        Returns: boolean
      }
      pgmq_read_ai_generation: {
        Args: { p_qty?: number; p_vt?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_read_customer_onboarding: {
        Args: { p_qty?: number; p_vt?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_read_location_discovery: {
        Args: { p_qty: number; p_vt: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_read_location_sync: {
        Args: { p_qty: number; p_vt: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_read_oauth_validation: {
        Args: { p_qty?: number; p_vt?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_read_response_approval: {
        Args: { p_qty?: number; p_vt?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_read_response_publishing: {
        Args: { p_qty?: number; p_vt?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_read_review_sync: {
        Args: { p_qty?: number; p_vt?: number }
        Returns: {
          enqueued_at: string
          message: Json
          msg_id: number
          read_ct: number
          vt: string
        }[]
      }
      pgmq_send_message: {
        Args: {
          p_delay_seconds?: number
          p_message: Json
          p_queue_name: string
        }
        Returns: number
      }
      pgmq_send_response_publishing: {
        Args: { p_message: Json }
        Returns: number
      }
      process_ai_workflows_batch: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_pending_workflows: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      process_pending_workflows_simple: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_stuck_workflows: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      process_workflows_flexible: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      process_workflows_with_logging: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      quarantine_message: {
        Args: {
          p_error_details: Json
          p_message: Json
          p_message_id: number
          p_poison_signature?: string
          p_queue_name: string
        }
        Returns: undefined
      }
      queue_missing_approved_responses: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      record_performance_metric: {
        Args: {
          p_labels?: Json
          p_measurement_name: string
          p_measurement_unit: string
          p_measurement_value: number
          p_metric_type: string
          p_organization_id: string
        }
        Returns: undefined
      }
      record_queue_metric: {
        Args:
          | {
              p_metric_type: string
              p_organization_id: string
              p_processing_time_ms?: number
              p_queue_name: string
            }
          | {
              p_metric_type: string
              p_organization_id: string
              p_processing_time_ms?: number
              p_queue_name: string
            }
        Returns: boolean
      }
      refresh_oauth_tokens_manually: {
        Args: Record<PropertyKey, never>
        Returns: {
          message: string
          status: string
          tenant_id: string
        }[]
      }
      refresh_workflow_dashboard: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      remove_google_token_columns_safely: {
        Args: Record<PropertyKey, never>
        Returns: {
          action: string
          details: string
          status: string
        }[]
      }
      requeue_from_dead_letter: {
        Args: { p_execution_id: string }
        Returns: Json
      }
      reset_stuck_workflows: {
        Args: Record<PropertyKey, never>
        Returns: {
          error_message: string
          new_status: string
          previous_status: string
          workflow_id: string
        }[]
      }
      resolve_alert: {
        Args: { alert_id: string; resolved_by?: string }
        Returns: boolean
      }
      run_all_synthetic_tests: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      run_auto_generate_ai_responses: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_cleanup_and_monitoring: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_process_pending_workflows: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_process_response_queue: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_refresh_oauth_tokens: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_sync_locations_batch_1: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_sync_locations_batch_2: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_sync_reviews_afternoon: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_sync_reviews_evening: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      run_sync_reviews_morning: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      send_alert_notification: {
        Args: { alert_id: string; channel_id: string }
        Returns: boolean
      }
      set_cron_secret: {
        Args: { secret_key: string; secret_value: string }
        Returns: undefined
      }
      set_limit: {
        Args: { "": number }
        Returns: number
      }
      show_limit: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      show_trgm: {
        Args: { "": string }
        Returns: string[]
      }
      start_prioritized_workflows: {
        Args: { max_workflows?: number }
        Returns: Json
      }
      start_workflow: {
        Args: {
          p_context?: Json
          p_organization_id: string
          p_priority?: number
          p_scheduled_at?: string
          p_workflow_id: string
          p_workflow_type: string
        }
        Returns: string
      }
      test_edge_function_auth: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      test_flexible_orchestrator: {
        Args: { p_workflow_id?: string }
        Returns: string
      }
      test_gmb_sync: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      test_review_sync_workflow: {
        Args: { workflow_id_param: string }
        Returns: Json
      }
      test_workflow_with_auth: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      trigger_workflow_execution: {
        Args: { workflow_id_param: string }
        Returns: Json
      }
      user_can_assign_role: {
        Args: { role_to_assign: string; target_org_id: string }
        Returns: boolean
      }
      user_can_manage_member: {
        Args: { target_org_id: string; target_user_id: string }
        Returns: boolean
      }
      verify_token_migration: {
        Args: Record<PropertyKey, never>
        Returns: {
          count: number
          details: Json
          summary_type: string
        }[]
      }
      verify_token_migration_complete: {
        Args: Record<PropertyKey, never>
        Returns: {
          check_name: string
          count: number
          description: string
          status: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
