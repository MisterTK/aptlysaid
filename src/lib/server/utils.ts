import type { SupabaseClient } from "@supabase/supabase-js"

export async function getUserTenant(supabase: SupabaseClient, userId: string) {
  console.log("getUserTenant - Getting tenant for user:", userId)

  const { data, error } = await supabase
    .from("tenant_users")
    .select("tenant_id")
    .eq("user_id", userId)
    .limit(1)

  if (error) {
    console.error("getUserTenant - Error:", error)
    return null
  }

  if (!data || data.length === 0) {
    console.log("getUserTenant - No data returned")
    return null
  }

  console.log("getUserTenant - Found tenant:", data[0].tenant_id)
  return { id: data[0].tenant_id }
}

export const getUserOrganization = getUserTenant
