import { redirect, fail } from "@sveltejs/kit"
import type { PageServerLoad, Actions } from "./$types"

export const load: PageServerLoad = async ({
  locals: { safeGetSession, supabaseServiceRole },
  cookies,
}) => {
  const { user } = await safeGetSession()
  if (!user) {
    redirect(303, "/login/sign_in")
  }

  const orgId = cookies.get("current_tenant_id")
  if (!orgId) {
    redirect(303, "/account")
  }

  const { data: guidance } = await supabaseServiceRole
    .from("business_guidance")
    .select("*")
    .eq("tenant_id", orgId)
    .single()

  const { data: items } = await supabaseServiceRole
    .from("upsell_items")
    .select("*")
    .eq("tenant_id", orgId)
    .order("priority", { ascending: false })

  return {
    organizationId: orgId,
    guidance,
    items: items || [],
  }
}

export const actions: Actions = {
  saveGuidance: async ({
    request,
    locals: { safeGetSession, supabaseServiceRole },
    cookies,
  }) => {
    const { user } = await safeGetSession()
    if (!user) {
      return fail(401, { error: "Unauthorized" })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return fail(400, { error: "No organization selected" })
    }

    try {
      const formData = await request.formData()
      const guidanceText = formData.get("guidanceText")?.toString() || ""
      const tone = formData.get("tone")?.toString() || "professional"
      const maxResponseLength = parseInt(
        formData.get("maxResponseLength")?.toString() || "500",
      )

      let brandVoice = ""
      let keyMessaging: string[] = []
      let prohibitedWords: string[] = []

      try {
        const parsed = JSON.parse(guidanceText)
        brandVoice = parsed.brandIdentity || ""
        keyMessaging = parsed.responseGuidelines || []
        prohibitedWords = parsed.thingsToAvoid || []
      } catch {
        brandVoice = guidanceText
      }

      const responseTone = {
        neutral: tone,
        positive: tone,
        negative: tone === "professional" ? "empathetic" : tone,
      }

      const { data: existingGuidance, error: checkError } =
        await supabaseServiceRole
          .from("business_guidance")
          .select("id")
          .eq("tenant_id", orgId)
          .single()

      if (checkError && checkError.code !== "PGRST116") {
        return fail(500, { error: "Failed to check existing guidance" })
      }

      let data, error

      if (existingGuidance) {
        const updateData = {
          brand_voice: brandVoice,
          key_messaging: keyMessaging,
          prohibited_words: prohibitedWords.length > 0 ? prohibitedWords : null,
          response_tone: responseTone,
          max_response_length: maxResponseLength,
          updated_at: new Date().toISOString(),
        }

        const result = await supabaseServiceRole
          .from("business_guidance")
          .update(updateData)
          .eq("id", existingGuidance.id)
          .select()
          .single()

        data = result.data
        error = result.error
      } else {
        const insertData = {
          tenant_id: orgId,
          brand_voice: brandVoice,
          key_messaging: keyMessaging,
          prohibited_words: prohibitedWords.length > 0 ? prohibitedWords : null,
          response_tone: responseTone,
          max_response_length: maxResponseLength,
          settings: {},
          metadata: {},
        }

        const result = await supabaseServiceRole
          .from("business_guidance")
          .insert(insertData)
          .select()
          .single()

        data = result.data
        error = result.error
      }

      if (error) {
        console.error("Error saving business guidance:", error)
        return fail(500, { error: error.message })
      }

      return { success: true, guidance: data }
    } catch (error) {
      console.error("Error in saveGuidance:", error)
      return fail(500, { error: "Failed to save business guidance" })
    }
  },

  createUpsellItem: async ({
    request,
    locals: { safeGetSession, supabaseServiceRole },
    cookies,
  }) => {
    const { user } = await safeGetSession()
    if (!user) {
      return fail(401, { error: "Unauthorized" })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return fail(400, { error: "No organization selected" })
    }

    try {
      const formData = await request.formData()
      const name = formData.get("name")?.toString() || ""
      const description = formData.get("description")?.toString() || ""
      const priority = parseInt(formData.get("priority")?.toString() || "50")
      const isActive = formData.get("isActive")?.toString() === "true"

      const { data, error } = await supabaseServiceRole
        .from("upsell_items")
        .insert({
          tenant_id: orgId,
          name,
          description,
          priority,
          is_active: isActive,
          promotion_text: description || name,
          call_to_action: "Learn more",
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating upsell item:", error)
        return fail(500, { error: error.message })
      }

      return { success: true, item: data }
    } catch (error) {
      console.error("Error creating upsell item:", error)
      return fail(500, { error: "Failed to create upsell item" })
    }
  },

  updateUpsellItem: async ({
    request,
    locals: { safeGetSession, supabaseServiceRole },
    cookies,
  }) => {
    const { user } = await safeGetSession()
    if (!user) {
      return fail(401, { error: "Unauthorized" })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return fail(400, { error: "No organization selected" })
    }

    try {
      const formData = await request.formData()
      const id = formData.get("id")?.toString() || ""
      const name = formData.get("name")?.toString()
      const description = formData.get("description")?.toString()
      const priority = formData.get("priority")?.toString()
      const isActive = formData.get("isActive")?.toString()

      const dbUpdates: Record<string, unknown> = {}
      if (name !== undefined) {
        dbUpdates.name = name
        dbUpdates.promotion_text = name
      }
      if (description !== undefined) {
        dbUpdates.description = description

        if (description) {
          dbUpdates.promotion_text = description
        }
      }
      if (priority !== undefined) dbUpdates.priority = parseInt(priority)
      if (isActive !== undefined) dbUpdates.is_active = isActive === "true"

      if (!dbUpdates.call_to_action) {
        dbUpdates.call_to_action = "Learn more"
      }

      const { data, error } = await supabaseServiceRole
        .from("upsell_items")
        .update(dbUpdates)
        .eq("id", id)
        .eq("tenant_id", orgId)
        .select()
        .single()

      if (error) {
        console.error("Error updating upsell item:", error)
        return fail(500, { error: error.message })
      }

      return { success: true, item: data }
    } catch (error) {
      console.error("Error updating upsell item:", error)
      return fail(500, { error: "Failed to update upsell item" })
    }
  },

  deleteUpsellItem: async ({
    request,
    locals: { safeGetSession, supabaseServiceRole },
    cookies,
  }) => {
    const { user } = await safeGetSession()
    if (!user) {
      return fail(401, { error: "Unauthorized" })
    }

    const orgId = cookies.get("current_tenant_id")
    if (!orgId) {
      return fail(400, { error: "No organization selected" })
    }

    try {
      const formData = await request.formData()
      const id = formData.get("id")?.toString() || ""

      const { error } = await supabaseServiceRole
        .from("upsell_items")
        .delete()
        .eq("id", id)
        .eq("tenant_id", orgId)

      if (error) {
        console.error("Error deleting upsell item:", error)
        return fail(500, { error: error.message })
      }

      return { success: true }
    } catch (error) {
      console.error("Error deleting upsell item:", error)
      return fail(500, { error: "Failed to delete upsell item" })
    }
  },
}
