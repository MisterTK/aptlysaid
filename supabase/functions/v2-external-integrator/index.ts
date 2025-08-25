import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS"
};

// Token encryption stubs
const decryptToken = (token) => token;
const encryptToken = (token) => token;

// GMB Client stub (implement with actual Google My Business API)
class GMBClient {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }
  
  async getLocations() {
    // Implement GMB API call
    return [];
  }
  
  async getReviews(locationId) {
    // Implement GMB API call
    return [];
  }
  
  async postReply(locationId, reviewId, replyText) {
    // Implement GMB API call
    return {};
  }
}

// Helper functions
const normalizeGoogleReviewId = (id) => id;
const syncReviewToDatabase = async (review, locationId, tenantId, supabase) => {
  // Implement review sync logic
  return { success: true };
};
const getSyncState = async (locationId, supabase) => {
  // Implement sync state retrieval
  return {};
};
const updateSyncState = async (locationId, state, supabase) => {
  // Implement sync state update
  return { success: true };
};
// OAuth token refresh
async function refreshGoogleToken(refreshToken) {
  const clientId = Deno.env.get("PUBLIC_GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error("Missing OAuth credentials");
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token"
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token refresh failed: ${response.statusText} - ${errorText}`);
  }
  return await response.json();
}
// Get OAuth token helper (for active, non-expired tokens)
async function getOAuthToken(supabase, tenantId) {
  const { data: oauthTokens, error } = await supabase.rpc("get_active_oauth_token", {
    p_tenant_id: tenantId,
    p_provider: "google",
    p_scope: "https://www.googleapis.com/auth/business.manage"
  });
  if (error || !oauthTokens?.length) {
    throw new Error("No active Google tokens found for tenant");
  }
  return oauthTokens[0];
}
// Get OAuth token for refresh (includes expired tokens with refresh tokens)
async function getOAuthTokenForRefresh(supabase, tenantId) {
  const { data: oauthTokens, error } = await supabase.rpc("get_oauth_token_for_refresh", {
    p_tenant_id: tenantId,
    p_provider: "google",
    p_scope: "https://www.googleapis.com/auth/business.manage"
  });
  if (error || !oauthTokens?.length) {
    throw new Error("No Google tokens available for refresh");
  }
  return oauthTokens[0];
}
// Endpoint handlers
const handlers = {
  async "unpublish-from-gmb" (req) {
    const { gmbReviewId } = await req.json();
    console.log("Unpublishing from GMB:", gmbReviewId);
    // This endpoint is a placeholder for future implementation
    // Currently just acknowledges the request
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  },
  async "generate-ai-response" (req, supabase) {
    const { reviewContent, tenantSettings } = await req.json();
    // Import AI generation module dynamically to reduce bundle size
    const { generateAIResponse } = await import("./ai-generator.ts");
    const aiResponse = await generateAIResponse(reviewContent, tenantSettings.rating || 5, tenantSettings, supabase);
    return new Response(JSON.stringify({
      content: aiResponse.content,
      model: aiResponse.model,
      ai_model: aiResponse.model,
      metadata: {
        ...aiResponse.metadata,
        tenantId: tenantSettings.tenant_id,
        reviewId: tenantSettings.reviewId,
        ai_model: aiResponse.model
      }
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  },
  async "publish-to-gmb" (req, supabase) {
    const { gmbReviewId, responseContent, tenantId } = await req.json();
    // Verify AI response is approved
    const { data: review } = await supabase.from("reviews").select("id, ai_responses!inner(id, status, response_text)").eq("platform_review_id", gmbReviewId).eq("tenant_id", tenantId).single();
    if (!review?.ai_responses?.[0] || review.ai_responses[0].status !== "approved") {
      throw new Error("Cannot publish unapproved AI response");
    }
    if (review.ai_responses[0].response_text !== responseContent) {
      throw new Error("Response content does not match approved AI response");
    }
    // Get token and publish
    const oauthToken = await getOAuthToken(supabase, tenantId);
    const accessToken = await decryptToken(oauthToken.encrypted_access_token);
    await supabase.rpc("mark_oauth_token_used", {
      p_token_id: oauthToken.id
    });
    const gmbClient = new GMBClient(accessToken);
    await gmbClient.replyToReview(gmbReviewId, responseContent);
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  },
  async "sync-locations" (req, supabase) {
    const { tenantId, tokenId } = await req.json();
    if (!tenantId || !tokenId) {
      throw new Error("Missing required parameters: tenantId and tokenId");
    }
    try {
      // Get the specific OAuth token
      const { data: oauthToken, error: tokenError } = await supabase.from("oauth_tokens").select("id, encrypted_access_token, encrypted_refresh_token").eq("id", tokenId).eq("tenant_id", tenantId).single();
      if (tokenError || !oauthToken) {
        throw new Error(`OAuth token not found or failed to fetch: ${tokenError?.message}`);
      }
      // Get the GMB Account ID from a sample location
      const { data: sampleLocation } = await supabase.from("locations").select("metadata").eq("tenant_id", tenantId).not("metadata", "is", null).limit(1).single();
      const accessToken = await decryptToken(oauthToken.encrypted_access_token);
      await supabase.rpc("mark_oauth_token_used", {
        p_token_id: oauthToken.id
      });
      const gmbAccountId = sampleLocation?.metadata?.gmb_account_id || null;
      const gmbClient = new GMBClient(accessToken, gmbAccountId);
      // Get all locations from GMB
      const gmbLocations = await gmbClient.listLocations();
      const discoveredPlaceIds = gmbLocations.locations?.map((l)=>l.name.replace("locations/", "")) || [];
      // Get all existing, non-deleted locations for the tenant from our DB
      const { data: existingLocationsData, error: existingLocationsError } = await supabase.from("locations").select("id, google_place_id").eq("tenant_id", tenantId).is("deleted_at", null);
      if (existingLocationsError) {
        throw new Error(`Failed to fetch existing locations: ${existingLocationsError.message}`);
      }
      const existingLocations = existingLocationsData || [];
      const existingPlaceIds = existingLocations.map((l)=>l.google_place_id);
      const results = {
        upserted: 0,
        deleted: 0,
        errors: []
      };
      // Upsert locations from GMB
      if (gmbLocations.locations?.length) {
        const upsertData = gmbLocations.locations.map((location)=>({
            tenant_id: tenantId,
            google_place_id: location.name.replace("locations/", ""),
            name: location.title || "Unknown Location",
            address: location.storefrontAddress?.addressLines?.join(", "),
            phone: location.phoneNumbers?.primaryPhone,
            website: location.websiteUri,
            oauth_token_id: oauthToken.id,
            metadata: {
              gmb_account_id: gmbAccountId,
              gmb_location_data: location
            },
            status: "active",
            deleted_at: null,
            last_sync_at: new Date().toISOString()
          }));
        const { count, error: upsertError } = await supabase.from("locations").upsert(upsertData, {
          onConflict: "google_place_id",
          ignoreDuplicates: false,
          count: 'exact'
        });
        if (upsertError) {
          results.errors.push(`Failed to upsert locations: ${upsertError.message}`);
        } else {
          results.upserted = count || 0;
        }
      }
      // Mark locations that are no longer in GMB as deleted
      const locationsToDelete = existingLocations.filter((loc)=>!discoveredPlaceIds.includes(loc.google_place_id));
      if (locationsToDelete.length > 0) {
        const idsToDelete = locationsToDelete.map((l)=>l.id);
        const { count, error: deleteError } = await supabase.from("locations").update({
          deleted_at: new Date().toISOString(),
          status: "disconnected"
        }).in("id", idsToDelete).select("id", {
          count: 'exact'
        });
        if (deleteError) {
          results.errors.push(`Failed to mark locations as deleted: ${deleteError.message}`);
        } else {
          results.deleted = count || 0;
        }
      }
      return new Response(JSON.stringify({
        success: true,
        ...results
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      console.error("Error in sync-locations handler:", error);
      return new Response(JSON.stringify({
        error: error.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
  },
  async "sync-gmb-reviews" (req, supabase) {
    const { locationId, tenantId } = await req.json();
    console.log("sync-gmb-reviews called with:", {
      locationId,
      tenantId
    });
    // Get location
    const { data: location, error: locationError } = await supabase.from("locations").select("id, tenant_id, google_place_id, metadata").eq("id", locationId).eq("tenant_id", tenantId).single();
    if (locationError || !location) {
      console.error("Location fetch error:", locationError);
      throw new Error(`Location not found: ${locationId} for tenant ${tenantId}`);
    }
    if (!location.google_place_id || location.google_place_id.startsWith("pending_")) {
      return new Response(JSON.stringify({
        error: "Location does not have a valid Google place ID",
        count: 0
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Get token
    const oauthToken = await getOAuthToken(supabase, location.tenant_id);
    const accessToken = await decryptToken(oauthToken.encrypted_access_token);
    await supabase.rpc("mark_oauth_token_used", {
      p_token_id: oauthToken.id
    });
    // Setup sync
    const gmbAccountId = location.metadata?.gmb_account_id || null;
    const gmbClient = new GMBClient(accessToken, gmbAccountId);
    const syncState = await getSyncState(supabase, tenantId, locationId);
    const daysToSync = syncState ? 30 : 5; // Initial sync: 5 days, regular: 30 days
    // Fetch and sync reviews
    let allReviews = [];
    let pageToken;
    let newestReviewTime = syncState?.lastReviewTime || null;
    do {
      const reviewsData = await gmbClient.getReviews(location.google_place_id, daysToSync, pageToken, syncState?.lastReviewTime);
      if (reviewsData.reviews) {
        allReviews = allReviews.concat(reviewsData.reviews);
        for (const review of reviewsData.reviews){
          if (review.createTime && (!newestReviewTime || review.createTime > newestReviewTime)) {
            newestReviewTime = review.createTime;
          }
        }
      }
      pageToken = reviewsData.nextPageToken;
    }while (pageToken && allReviews.length < 200)
    // Sync to database
    let syncedCount = 0;
    const processedIds = [];
    for (const review of allReviews){
      const normalizedId = normalizeGoogleReviewId(review.name);
      if (processedIds.includes(normalizedId) || syncState?.processedReviewIds?.includes(normalizedId)) {
        continue;
      }
      if (await syncReviewToDatabase(review, locationId, tenantId, supabase)) {
        syncedCount++;
        processedIds.push(normalizedId);
      }
    }
    // Update sync state
    await updateSyncState(supabase, locationId, {
      lastSyncTime: new Date().toISOString(),
      lastReviewTime: newestReviewTime,
      processedReviewIds: [
        ...syncState?.processedReviewIds || [],
        ...processedIds
      ].slice(-1000),
      syncCount: (syncState?.syncCount || 0) + syncedCount
    });
    return new Response(JSON.stringify({
      count: syncedCount,
      total: allReviews.length
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  },
  async "refresh-oauth-token" (req, supabase) {
    const { tenantId } = await req.json();
    const oauthToken = await getOAuthTokenForRefresh(supabase, tenantId);
    if (!oauthToken.encrypted_refresh_token) {
      throw new Error("No refresh token found");
    }
    const refreshToken = await decryptToken(oauthToken.encrypted_refresh_token);
    const newTokenData = await refreshGoogleToken(refreshToken);
    const encryptedAccessToken = await encryptToken(newTokenData.access_token);
    await supabase.from("oauth_tokens").update({
      encrypted_access_token: encryptedAccessToken,
      expires_at: new Date(Date.now() + newTokenData.expires_in * 1000).toISOString(),
      last_refresh_at: new Date().toISOString(),
      refresh_attempts: 0,
      updated_at: new Date().toISOString()
    }).eq("id", oauthToken.id);
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  },
  async "sync-all-locations" (req, supabase) {
    const { tenantId } = await req.json();
    if (!tenantId) throw new Error("Missing required parameter: tenantId");
    const oauthToken = await getOAuthToken(supabase, tenantId);
    const accessToken = await decryptToken(oauthToken.encrypted_access_token);
    await supabase.rpc("mark_oauth_token_used", {
      p_token_id: oauthToken.id
    });
    const { data: sampleLocation } = await supabase.from("locations").select("id, tenant_id, metadata").eq("tenant_id", tenantId).limit(1).single();
    const gmbAccountId = sampleLocation?.metadata?.gmb_account_id || null;
    const gmbClient = new GMBClient(accessToken, gmbAccountId);
    const results = {
      tenantId,
      locationsDiscovered: 0,
      locationsSynced: 0,
      reviewsSynced: 0,
      errors: []
    };
    try {
      // Discover locations
      const locations = await gmbClient.listLocations();
      if (!locations.locations?.length) {
        return new Response(JSON.stringify({
          success: true,
          message: "No locations found",
          ...results
        }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json"
          }
        });
      }
      results.locationsDiscovered = locations.locations.length;
      // Sync each location and its reviews
      for (const location of locations.locations){
        const locationId = location.name.replace("locations/", "");
        const businessName = location.title || "Unknown Location";
        // Store/update location
        const { data: dbLocation } = await supabase.from("locations").upsert({
          tenant_id: tenantId,
          google_place_id: locationId,
          name: businessName,
          address: location.storefrontAddress?.addressLines?.join(", "),
          phone: location.phoneNumbers?.primaryPhone,
          website: location.websiteUri,
          oauth_token_id: oauthToken.id,
          metadata: {
            gmb_account_id: gmbAccountId,
            gmb_location_data: location
          },
          status: "active",
          last_sync_at: new Date().toISOString()
        }, {
          onConflict: "tenant_id,google_place_id"
        }).select("id").single();
        if (dbLocation) {
          results.locationsSynced++;
          // Sync reviews for this location
          const syncState = await getSyncState(supabase, tenantId, dbLocation.id);
          const daysToSync = syncState ? 30 : 5;
          let pageToken;
          let reviewCount = 0;
          do {
            const reviewsData = await gmbClient.getReviews(locationId, daysToSync, pageToken);
            for (const review of reviewsData.reviews || []){
              if (await syncReviewToDatabase(review, dbLocation.id, tenantId, supabase)) {
                results.reviewsSynced++;
                reviewCount++;
              }
            }
            pageToken = reviewsData.nextPageToken;
          }while (pageToken && reviewCount < 200)
        }
      }
      return new Response(JSON.stringify({
        success: true,
        message: `Synced ${results.reviewsSynced} reviews from ${results.locationsSynced} locations`,
        ...results
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    } catch (error) {
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...results
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
  },
  async "fetch-account-info" (req, supabase) {
    const { tenantId, accessToken } = await req.json();
    if (!tenantId || !accessToken) {
      throw new Error("Missing required parameters");
    }
    const response = await fetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`Google API request failed: ${response.status}`);
    }
    const data = await response.json();
    const accounts = (data.accounts || []).map((account)=>({
        accountId: account.name?.split("/")[1] || account.accountId,
        name: account.name,
        accountName: account.accountName || account.name,
        type: account.type,
        role: account.role,
        state: account.state?.status,
        primaryOwner: account.primaryOwner?.name
      }));
    if (accounts.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        message: "No Google My Business accounts found",
        accounts: []
      }), {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Update locations with account info
    const primaryAccount = accounts[0];
    const { data: locations } = await supabase.from("locations").select("id, metadata").eq("tenant_id", tenantId).not("oauth_token_id", "is", null);
    for (const loc of locations || []){
      await supabase.from("locations").update({
        metadata: {
          ...loc.metadata,
          gmb_account_id: primaryAccount.accountId,
          gmb_account_name: primaryAccount.accountName,
          accounts,
          primary_account: primaryAccount,
          updated_at: new Date().toISOString()
        }
      }).eq("id", loc.id);
    }
    return new Response(JSON.stringify({
      success: true,
      accounts,
      primaryAccount
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
};
// Main handler with proper error boundaries and request validation
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  const url = new URL(req.url);
  const endpoint = url.pathname.split("/").pop() || "";
  // Verify authorization
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({
      error: "Unauthorized"
    }), {
      status: 401,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  // Create Supabase client with validation
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({
      error: "Missing environment configuration"
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  try {
    const handler = handlers[endpoint];
    if (!handler) {
      return new Response(JSON.stringify({
        error: "Unknown endpoint"
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    return await handler(req, supabase);
  } catch (error) {
    await supabase.from("system_logs").insert({
      category: "integration",
      log_level: "error",
      message: `External integrator error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      metadata: {
        endpoint,
        error: error.message,
        stack: error.stack
      }
    });
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
