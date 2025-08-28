import { json, error } from "@sveltejs/kit"
import type { RequestHandler } from "./$types"
import { GoogleMyBusinessWrapperV3 } from "$lib/services/google-my-business-wrapper-v2"
import { env as privateEnv } from "$env/dynamic/private"
import { env as publicEnv } from "$env/dynamic/public"

interface AccountInfo {
  name: string
  accountId: string
  accountNumber: string
  type: string
}

interface AccountsResponse {
  accounts: AccountInfo[]
}

export const POST: RequestHandler = async ({
  locals: { supabaseServiceRole },
  request,
}) => {
  const body = await request.json()
  const { adminSecret } = body

  if (adminSecret !== "update-account-info-2025") {
    return error(401, "Unauthorized")
  }

  if (!supabaseServiceRole) {
    return error(500, "Service role client not available")
  }

  const { data: tokensToUpdate, error: selectError } = await supabaseServiceRole
    .from("oauth_tokens")
    .select("tenant_id, encrypted_access_token, encrypted_refresh_token")
    .eq("provider", "google")
    .eq("status", "active")
    .is("token_metadata->account_id", null)

  if (selectError) {
    console.error("Error fetching tokens to update:", selectError)
    return error(500, "Failed to fetch tokens")
  }

  if (!tokensToUpdate || tokensToUpdate.length === 0) {
    return json({
      success: true,
      message: "No tokens need updating",
      updated: 0,
    })
  }

  console.log(
    `Found ${tokensToUpdate.length} organizations to update with account info`,
  )

  const gmb = new GoogleMyBusinessWrapperV3(supabaseServiceRole, {
    clientId: publicEnv.PUBLIC_GOOGLE_CLIENT_ID,
    clientSecret: privateEnv.GOOGLE_CLIENT_SECRET,
    encryptionKey: privateEnv.TOKEN_ENCRYPTION_KEY,
  })

  let updatedCount = 0
  const results = []

  for (const tokenData of tokensToUpdate) {
    try {
      console.log(`Processing organization: ${tokenData.tenant_id}`)

      console.log(`Getting fresh token for organization ${tokenData.tenant_id}`)

      const service = await gmb.createService(tokenData.tenant_id)
      if (!service) {
        console.error(
          `Cannot create GMB service for organization ${tokenData.tenant_id}`,
        )
        continue
      }

      let freshAccessToken: string
      try {

        await service.getAccounts()
        const freshTokens = await gmb.getTokens(tokenData.tenant_id)
        if (!freshTokens) {
          console.error(
            `Cannot get fresh tokens for organization ${tokenData.tenant_id}`,
          )
          continue
        }
        freshAccessToken = freshTokens.access_token
      } catch (error) {
        console.error(
          `Error getting fresh token for org ${tokenData.tenant_id}:`,
          error,
        )
        continue
      }

      const accountsUrl =
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts"
      const accountsResponse = await fetch(accountsUrl, {
        headers: {
          Authorization: `Bearer ${freshAccessToken}`,
          "Content-Type": "application/json",
        },
      })

      let accountId: string | null = null
      let accessLevel: string = "unknown"

      if (accountsResponse.ok) {
        const accountsData: AccountsResponse = await accountsResponse.json()
        console.log(
          `Accounts API response for org ${tokenData.tenant_id}:`,
          accountsData,
        )

        if (accountsData.accounts && accountsData.accounts.length > 0) {

          accountId = accountsData.accounts[0].name.replace("accounts/", "")
          accessLevel = "account"
          console.log(`Account-level access detected. Account ID: ${accountId}`)
        } else {

          accessLevel = "location"
          console.log("No accounts found - likely location-level access only")
        }
      } else {
        console.log(
          `Accounts API failed with status: ${accountsResponse.status} for org ${tokenData.tenant_id}`,
        )

        if (accountsResponse.status === 403) {

          accessLevel = "location"
          console.log("403 Forbidden - confirmed location-level access only")
        } else {
          console.error(
            "Unexpected error from Accounts API:",
            await accountsResponse.text(),
          )
          accessLevel = "unknown"
        }
      }

      const { error: updateError } = await supabaseServiceRole
        .from("oauth_tokens")
        .update({
          token_metadata: {
            account_id: accountId,
            access_level: accessLevel,
            updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("tenant_id", tokenData.tenant_id!)

      if (updateError) {
        console.error(
          `Error updating oauth_tokens for org ${tokenData.tenant_id}:`,
          updateError,
        )
        results.push({
          tenant_id: tokenData.tenant_id,
          success: false,
          error: updateError.message,
        })
      } else {
        console.log(
          `Successfully updated organization ${tokenData.tenant_id} with account_id: ${accountId}, access_level: ${accessLevel}`,
        )
        updatedCount++
        results.push({
          tenant_id: tokenData.tenant_id,
          success: true,
          account_id: accountId,
          access_level: accessLevel,
        })
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (error) {
      console.error(
        `Error processing organization ${tokenData.tenant_id}:`,
        error,
      )
      results.push({
        tenant_id: tokenData.tenant_id,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  return json({
    success: true,
    message: `Updated ${updatedCount} of ${tokensToUpdate.length} organizations`,
    updated: updatedCount,
    total: tokensToUpdate.length,
    results,
  })
}
