import { json } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { createAdminClient } from "$lib/server/supabase-admin"

// Get upsell items
export const GET: RequestHandler = async ({ url, locals }) => {
  const session = await locals.safeGetSession()
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const tenantId = url.searchParams.get("tenantId")
  if (!tenantId) {
    return json({ error: "Tenant ID is required" }, { status: 400 })
  }

  const adminClient = createAdminClient()

  try {
    // Verify user has access
    const { data: membership } = await adminClient
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", session.user!.id)
      .single()

    if (!membership) {
      return json({ error: "Access denied" }, { status: 403 })
    }

    // Get upsell items
    const { data: items, error } = await adminClient
      .from("upsell_items")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching upsell items:", error)
      return json({ error: "Failed to fetch upsell items" }, { status: 500 })
    }

    return json({ items: items || [] })
  } catch (error) {
    console.error("Error in GET handler:", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}

// Create upsell item
export const POST: RequestHandler = async ({ request, locals }) => {
  const session = await locals.safeGetSession()
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const adminClient = createAdminClient()

  try {
    const {
      tenantId,
      name,
      description,
      priority = 0,
      isActive = true, // eslint-disable-line @typescript-eslint/no-unused-vars
    } = await request.json()

    if (!tenantId || !name) {
      return json({ error: "Missing required fields" }, { status: 400 })
    }

    // Verify user has admin access
    const { data: membership } = await adminClient
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", tenantId)
      .eq("user_id", session.user!.id)
      .single()

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Create upsell item
    const { data: item, error } = await adminClient
      .from("upsell_items")
      .insert({
        name,
        description,
        priority,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating upsell item:", error)
      return json({ error: "Failed to create upsell item" }, { status: 500 })
    }

    return json({ item })
  } catch (error) {
    console.error("Error in POST handler:", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}

// Update upsell item
export const PATCH: RequestHandler = async ({ request, locals }) => {
  const session = await locals.safeGetSession()
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const adminClient = createAdminClient()

  try {
    const { id, name, description, priority, isActive } = await request.json()

    if (!id) {
      return json({ error: "Item ID is required" }, { status: 400 })
    }

    // Get the item to verify organization
    const { data: existingItem } = await adminClient
      .from("upsell_items")
      .select("tenant_id")
      .eq("id", id)
      .single()

    if (!existingItem) {
      return json({ error: "Item not found" }, { status: 404 })
    }

    // Verify user has admin access
    const { data: membership } = await adminClient
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", existingItem.tenant_id)
      .eq("user_id", session.user!.id)
      .single()

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Update upsell item
    const updateData: Record<string, string | number | boolean | null> = {
      updated_at: new Date().toISOString(),
    }

    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (priority !== undefined) updateData.priority = priority
    if (isActive !== undefined) updateData.is_active = isActive

    const { data: item, error } = await adminClient
      .from("upsell_items")
      .update(updateData)
      .eq("id", id)
      .select()
      .single()

    if (error) {
      console.error("Error updating upsell item:", error)
      return json({ error: "Failed to update upsell item" }, { status: 500 })
    }

    return json({ item })
  } catch (error) {
    console.error("Error in PATCH handler:", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}

// Delete upsell item
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const session = await locals.safeGetSession()
  if (!session) {
    return json({ error: "Unauthorized" }, { status: 401 })
  }

  const adminClient = createAdminClient()

  try {
    const { id } = await request.json()

    if (!id) {
      return json({ error: "Item ID is required" }, { status: 400 })
    }

    // Get the item to verify organization
    const { data: existingItem } = await adminClient
      .from("upsell_items")
      .select("tenant_id")
      .eq("id", id)
      .single()

    if (!existingItem) {
      return json({ error: "Item not found" }, { status: 404 })
    }

    // Verify user has admin access
    const { data: membership } = await adminClient
      .from("tenant_users")
      .select("role")
      .eq("tenant_id", existingItem.tenant_id)
      .eq("user_id", session.user!.id)
      .single()

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Delete upsell item
    const { error } = await adminClient
      .from("upsell_items")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("Error deleting upsell item:", error)
      return json({ error: "Failed to delete upsell item" }, { status: 500 })
    }

    return json({ success: true })
  } catch (error) {
    console.error("Error in DELETE handler:", error)
    return json({ error: "Internal server error" }, { status: 500 })
  }
}
