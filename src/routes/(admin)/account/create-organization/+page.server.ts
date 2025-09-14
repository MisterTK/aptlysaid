import { fail, redirect } from "@sveltejs/kit"
import type { PageServerLoad, Actions } from "./$types"
import type { Database } from "../../../../DatabaseDefinitions"

type TenantInsert = Database["public"]["Tables"]["tenants"]["Insert"]
type BusinessGuidanceInsert =
  Database["public"]["Tables"]["business_guidance"]["Insert"]

export const load: PageServerLoad = async ({ locals: { safeGetSession } }) => {
  const { user } = await safeGetSession()
  if (!user) {
    redirect(303, "/login/sign_in")
  }
}

interface FormErrors {
  name?: string
  businessType?: string
  _?: string
}

export const actions: Actions = {
  default: async ({
    request,
    locals: { safeGetSession, supabaseServiceRole },
    cookies,
  }) => {
    const { user } = await safeGetSession()
    if (!user) {
      return fail(401, { errors: { _: "Unauthorized" } as FormErrors })
    }

    const formData = await request.formData()
    const name = formData.get("name") as string
    const businessType = formData.get("businessType") as string
    const industry = formData.get("industry") as string
    const timezone = (formData.get("timezone") as string) || "UTC"
    const employeeCount = formData.get("employeeCount") as string
    const annualRevenue = formData.get("annualRevenue") as string
    const brandVoice = formData.get("brandVoice") as string
    const writingStyle =
      (formData.get("writingStyle") as string) || "professional"

    const errors: FormErrors = {}

    if (!name || name.trim().length < 2) {
      errors.name = "Organization name must be at least 2 characters"
    }

    if (!businessType) {
      errors.businessType = "Business type is required"
    }

    if (Object.keys(errors).length > 0) {
      return fail(400, { errors })
    }

    const baseSlug = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
    const timestamp = Date.now().toString(36)
    const slug = `${baseSlug}-${timestamp}`

    const parseEmployeeRange = (range: string) => {
      switch (range) {
        case "1-10":
          return "[1,10]"
        case "11-50":
          return "[11,50]"
        case "51-200":
          return "[51,200]"
        case "201-500":
          return "[201,500]"
        case "501-1000":
          return "[501,1000]"
        case "1001+":
          return "[1001,]"
        default:
          return null
      }
    }

    const parseRevenueRange = (range: string) => {
      switch (range) {
        case "0-100k":
          return "[0,100000]"
        case "100k-500k":
          return "[100000,500000]"
        case "500k-1m":
          return "[500000,1000000]"
        case "1m-5m":
          return "[1000000,5000000]"
        case "5m-10m":
          return "[5000000,10000000]"
        case "10m+":
          return "[10000000,]"
        default:
          return null
      }
    }

    const trialEndDate = new Date()
    trialEndDate.setDate(trialEndDate.getDate() + 14)

    const tenantInsertData: TenantInsert = {
      name: name.trim(),
      slug: slug.toLowerCase(),
      subscription_status: "trial",
      subscription_plan: "trial",
      business_type: businessType,
      timezone,
      trial_ends_at: trialEndDate.toISOString(),

      locations_limit: 1,
      team_members_limit: 5,
      monthly_review_limit: 100,
      monthly_ai_generation_limit: 50,
      settings: {
        auto_publish: false,
        notifications_enabled: true,
      },
      features: {
        ai_responses: true,
        batch_generation: false,
        api_access: false,
        custom_templates: true,
      },
    }

    if (industry) tenantInsertData.industry = industry
    if (employeeCount) {
      const range = parseEmployeeRange(employeeCount)
      if (range) tenantInsertData.employee_count = range
    }
    if (annualRevenue) {
      const range = parseRevenueRange(annualRevenue)
      if (range) tenantInsertData.annual_revenue = range
    }

    const { data: newTenantData, error: tenantError } =
      await supabaseServiceRole
        .from("tenants")
        .insert(tenantInsertData)
        .select()
        .limit(1)

    const newTenant =
      newTenantData && newTenantData.length > 0 ? newTenantData[0] : null

    if (tenantError || !newTenant) {
      console.error("Error creating tenant:", tenantError)
      return fail(500, {
        errors: { _: "Failed to create organization" } as FormErrors,
      })
    }

    const { error: memberError } = await supabaseServiceRole
      .from("tenant_users")
      .insert({
        tenant_id: newTenant.id,
        user_id: user.id,
        role: "owner",
        status: "active",
        joined_at: new Date().toISOString(),
        permissions: {
          manage_billing: true,
          manage_team: true,
          manage_settings: true,
          manage_integrations: true,
        },
      })

    if (memberError) {
      console.error("Error adding tenant member:", memberError)

      await supabaseServiceRole.from("tenants").delete().eq("id", newTenant.id)

      return fail(500, {
        errors: { _: "Failed to set up organization membership" } as FormErrors,
      })
    }

    if (newTenant) {
      const businessGuidanceData: BusinessGuidanceInsert = {
        tenant_id: newTenant.id,
        brand_voice: brandVoice || "Professional and friendly",
        writing_style: writingStyle,
        response_tone: {
          positive: "grateful",
          neutral: "professional",
          negative: "empathetic",
        },
        min_response_length: 50,
        max_response_length: 500,
        include_business_name: true,
        include_call_to_action: true,
        auto_respond_positive: true,
        auto_respond_neutral: false,
        auto_respond_negative: false,
        review_threshold_for_auto_response: 4,
        primary_language: "en",
        supported_languages: ["en"],
        settings: {
          personalization_level: "medium",
          emoji_usage: "minimal",
        },
      }

      const { error: guidanceError } = await supabaseServiceRole
        .from("business_guidance")
        .insert(businessGuidanceData)

      if (guidanceError) {
        console.error("Error creating business guidance:", guidanceError)
      }

      const { error: aiConfigError } = await supabaseServiceRole
        .from("ai_model_config")
        .insert({
          tenant_id: newTenant.id,
          model_provider: "google",
          model_name: "gemini-1.5-flash",
          temperature: 0.7,
          max_tokens: 500,
          is_active: true,
          settings: {
            use_context_caching: true,
            fallback_model: "gemini-1.5-flash-8b",
          },
        })

      if (aiConfigError) {
        console.error("Error creating AI model config:", aiConfigError)
      }
    }

    cookies.set("current_tenant_id", newTenant.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    })

    redirect(303, "/account")
  },
}
