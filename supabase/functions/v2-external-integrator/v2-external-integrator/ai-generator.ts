import { HarmBlockThreshold, HarmCategory, GoogleGenerativeAI } from "https://esm.sh/@google/generative-ai@0.21.0";
// Load AI configuration
async function loadAIConfiguration(tenantId, supabase) {
  try {
    // Try tenant-specific config first, then fall back to global config
    let { data: aiConfig } = await supabase.from("ai_model_config").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (!aiConfig) {
      // Fall back to global config (tenant_id is null)
      const { data: globalConfig, error: globalError } = await supabase.from("ai_model_config").select("*").is("tenant_id", null).maybeSingle();
      if (globalError) {
        throw new Error(`Failed to load AI configuration: ${globalError.message}`);
      }
      aiConfig = globalConfig;
    }
    if (!aiConfig) {
      throw new Error("No AI configuration found for tenant or globally");
    }
    const config = {
      authMethod: aiConfig?.auth_method || "default",
      apiVersion: aiConfig?.api_version || Deno.env.get("GOOGLE_GENAI_API_VERSION") || "v1beta",
      modelId: aiConfig?.primary_model || Deno.env.get("GOOGLE_VERTEX_MODEL") || "gemini-2.5-flash",
      temperature: Number(aiConfig?.temperature ?? Deno.env.get("GOOGLE_VERTEX_TEMPERATURE") ?? 0.7),
      maxTokens: Number(aiConfig?.max_tokens ?? Deno.env.get("GOOGLE_VERTEX_MAX_TOKENS") ?? 1024),
      safetyLevel: aiConfig?.settings?.safety_level || Deno.env.get("GOOGLE_VERTEX_SAFETY_LEVEL"),
      projectId: aiConfig?.settings?.google_cloud_project || Deno.env.get("GOOGLE_CLOUD_PROJECT"),
      location: aiConfig?.settings?.google_cloud_location || Deno.env.get("GOOGLE_CLOUD_LOCATION") || "us-central1"
    };
    // Validate location
    if (config.location === "global") {
      config.location = "us-central1";
    }
    // Auto-detect auth method
    if (config.authMethod === "default") {
      if (Deno.env.get("GEMINI_API_KEY")) {
        config.authMethod = "api_key";
      } else if (Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON")) {
        config.authMethod = "service_account";
      } else {
        throw new Error("No authentication credentials found");
      }
    }
    return config;
  } catch (error) {
    throw new Error(`AI configuration loading failed: ${error.message}`);
  }
}
// Get access token for service account
async function getServiceAccountToken(credentials, scopes) {
  const now = Math.floor(Date.now() / 1000);
  const expires = now + 3600; // 1 hour
  // Create JWT header
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  // Create JWT payload  
  const payload = {
    iss: credentials.client_email,
    scope: scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    exp: expires,
    iat: now
  };
  // Clean and decode the private key
  const cleanPrivateKey = credentials.private_key.replace(/\\n/g, '\n').replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s/g, '');
  const privateKeyBuffer = Uint8Array.from(atob(cleanPrivateKey), (c)=>c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey("pkcs8", privateKeyBuffer, {
    name: "RSASSA-PKCS1-v1_5",
    hash: "SHA-256"
  }, false, [
    "sign"
  ]);
  // Create JWT
  const encodedHeader = btoa(JSON.stringify(header)).replace(/[+/=]/g, (m)=>({
      '+': '-',
      '/': '_',
      '=': ''
    })[m]);
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/[+/=]/g, (m)=>({
      '+': '-',
      '/': '_',
      '=': ''
    })[m]);
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(unsignedToken));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/[+/=]/g, (m)=>({
      '+': '-',
      '/': '_',
      '=': ''
    })[m]);
  const jwt = `${unsignedToken}.${encodedSignature}`;
  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });
  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${error}`);
  }
  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}
// Initialize Google GenAI SDK
async function initializeGenAI(config) {
  if (config.authMethod === "service_account") {
    const serviceAccountJson = Deno.env.get("GOOGLE_APPLICATION_CREDENTIALS_JSON");
    if (serviceAccountJson) {
      try {
        const credentials = JSON.parse(serviceAccountJson);
        const accessToken = await getServiceAccountToken(credentials, [
          "https://www.googleapis.com/auth/cloud-platform"
        ]);
        // Return Vertex AI wrapper
        return {
          getGenerativeModel: (modelConfig)=>({
              generateContent: async (request)=>{
                const endpoint = `https://${config.location}-aiplatform.googleapis.com/v1/projects/${config.projectId || credentials.project_id}/locations/${config.location}/publishers/google/models/${modelConfig.model}:generateContent`;
                const response = await fetch(endpoint, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    contents: request.contents,
                    generationConfig: modelConfig.generationConfig,
                    safetySettings: request.safetySettings,
                    systemInstruction: typeof modelConfig.systemInstruction === 'string' ? {
                      parts: [
                        {
                          text: modelConfig.systemInstruction
                        }
                      ]
                    } : undefined
                  })
                });
                if (!response.ok) {
                  const error = await response.text();
                  throw new Error(`Vertex AI API error: ${response.status} - ${error}`);
                }
                const data = await response.json();
                return {
                  response: {
                    text: ()=>data.candidates?.[0]?.content?.parts?.[0]?.text || "",
                    usageMetadata: data.usageMetadata
                  }
                };
              }
            })
        };
      } catch (error) {
        throw new Error(`Service account authentication failed: ${error.message}`);
      }
    }
  }
  // Fallback to API key
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new Error("No authentication method available");
  }
  return new GoogleGenerativeAI(apiKey);
}
// Build prompt
function buildPrompt(businessGuidance, upsellItems, rating, reviewContent, tenant) {
  const sentiment = rating >= 4 ? "positive" : rating <= 2 ? "negative" : "neutral";
  const tone = businessGuidance?.response_tone?.[sentiment] || "professional";
  // Use the tenant name as the business name (simple and correct!)
  const businessName = tenant.name || "our business";
  // Build upsell section - simple list of all items
  let upsellSection = "";
  if (upsellItems?.length > 0) {
    const activeItems = upsellItems.filter((item)=>item.status === 'active');
    if (activeItems.length > 0) {
      const itemList = activeItems.sort((a, b)=>(b.priority || 50) - (a.priority || 50)).map((item)=>`- ${item.name}`).join('\n');
      upsellSection = `\n\nAVAILABLE UPSELL ITEMS (use naturally if highly relevant, max 1 item):\n${itemList}\n\nUPSELL GUIDANCE: Only mention an item if it directly relates to what the customer enjoyed. Keep it brief - just the item name. Most responses should focus on gratitude and connection rather than selling.`;
    }
  }
  // Build prohibited words section
  let prohibitedSection = "";
  if (Array.isArray(businessGuidance?.prohibited_words) && businessGuidance.prohibited_words.length > 0) {
    const prohibitedList = businessGuidance.prohibited_words.map((word)=>`- ${word}`).join('\n');
    prohibitedSection = `\n\nTHINGS TO AVOID:\n${prohibitedList}`;
  }
  const systemPrompt = `You are responding on behalf of ${businessName}. Create a personalized, authentic response.

CRITICAL: Reference specific details from the customer's review.

Tone: ${tone} (for ${sentiment} review)
Length: ${businessGuidance?.min_response_length || 50}-${businessGuidance?.max_response_length || 500} characters

BRAND IDENTITY:
${businessGuidance?.brand_voice || ""}

REQUIRED ELEMENTS:
${Array.isArray(businessGuidance?.key_messaging) ? businessGuidance.key_messaging.map((msg)=>`- ${msg}`).join('\n') : ''}${prohibitedSection}${upsellSection}

Create a unique response that addresses the customer's specific experience.`;
  const userPrompt = `Customer Review (${rating} stars):
"${reviewContent}"

Write a personalized response that directly addresses what the customer said.`;
  return {
    systemPrompt,
    userPrompt
  };
}
// Generate AI response
export async function generateAIResponse(reviewContent, rating, tenantSettings, supabase) {
  const tenantId = tenantSettings.tenant_id;
  try {
    // Debug logging
    await supabase.from("system_logs").insert({
      category: "ai_generator",
      log_level: "info",
      message: `Starting generateAIResponse`,
      metadata: {
        tenantId,
        reviewContent: reviewContent?.substring(0, 100),
        rating
      }
    });
    // Load configurations
    const aiConfig = await loadAIConfiguration(tenantId, supabase);
    // Get tenant name (the actual business name)
    const { data: tenant, error: tenantError } = await supabase.from("tenants").select("name").eq("id", tenantId).single();
    if (tenantError) {
      throw new Error(`Failed to load tenant: ${tenantError.message}`);
    }
    const { data: businessGuidance, error: guidanceError } = await supabase.from("business_guidance").select("*").eq("tenant_id", tenantId).maybeSingle();
    if (guidanceError) {
      throw new Error(`Failed to load business guidance: ${guidanceError.message}`);
    }
    // Load upsell items
    const now = new Date().toISOString();
    const { data: upsellItems, error: upsellError } = await supabase.from("upsell_items").select("*").eq("tenant_id", tenantId).eq("status", "active").lte("active_from", now).or(`active_until.is.null,active_until.gte.${now}`).order("priority", {
      ascending: false
    });
    if (upsellError) {
      throw new Error(`Failed to load upsell items: ${upsellError.message}`);
    }
    // Validate inputs
    if (!reviewContent?.trim()) {
      throw new Error("Invalid review content");
    }
    // Generate response
    const { systemPrompt, userPrompt } = buildPrompt(businessGuidance, upsellItems || [], rating, reviewContent, tenant);
    const genAI = await initializeGenAI(aiConfig);
    const modelConfig = {
      model: aiConfig.modelId,
      generationConfig: {
        temperature: aiConfig.temperature,
        maxOutputTokens: aiConfig.maxTokens,
        topP: 0.9,
        topK: 40
      },
      systemInstruction: systemPrompt
    };
    const model = genAI.getGenerativeModel(modelConfig);
    const requestPayload = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: userPrompt
            }
          ]
        }
      ],
      safetySettings: aiConfig.safetyLevel ? [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: mapSafetyLevel(aiConfig.safetyLevel)
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: mapSafetyLevel(aiConfig.safetyLevel)
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: mapSafetyLevel(aiConfig.safetyLevel)
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: mapSafetyLevel(aiConfig.safetyLevel)
        }
      ] : undefined
    };
    const startTime = Date.now();
    const result = await model.generateContent(requestPayload);
    const endTime = Date.now();
    const generationTimeMs = endTime - startTime;
    const response = result.response;
    const content = response.text();
    if (!content) {
      throw new Error("Empty response from AI model");
    }
    // Capture the full request and response data (simplified for JSONB compatibility)
    const fullRequestData = {
      model: aiConfig.modelId,
      systemPrompt: systemPrompt,
      userPrompt: userPrompt,
      modelConfig: {
        temperature: aiConfig.temperature,
        maxOutputTokens: aiConfig.maxTokens,
        topP: 0.9,
        topK: 40
      },
      aiConfig: {
        authMethod: aiConfig.authMethod,
        temperature: aiConfig.temperature,
        maxTokens: aiConfig.maxTokens,
        safetyLevel: aiConfig.safetyLevel,
        location: aiConfig.location,
        projectId: aiConfig.projectId
      },
      reviewContext: {
        rating: rating,
        reviewContent: reviewContent,
        tenantId: tenantId
      },
      businessContext: {
        hasBrandVoice: !!businessGuidance?.brand_voice,
        brandVoiceLength: businessGuidance?.brand_voice?.length || 0,
        keyMessagingCount: businessGuidance?.key_messaging?.length || 0,
        upsellItemsCount: upsellItems?.length || 0,
        upsellItems: upsellItems?.map((item)=>({
            name: item.name,
            promotion_text: item.promotion_text,
            priority: item.priority
          })) || []
      },
      requestPayload: {
        contentsCount: requestPayload.contents?.length || 0,
        safetySettingsCount: requestPayload.safetySettings?.length || 0,
        hasUserPrompt: !!requestPayload.contents?.[0]?.parts?.[0]?.text
      }
    };
    const fullResponseData = {
      responseText: content,
      usageMetadata: {
        promptTokenCount: response.usageMetadata?.promptTokenCount,
        candidatesTokenCount: response.usageMetadata?.candidatesTokenCount,
        totalTokenCount: response.usageMetadata?.totalTokenCount
      },
      generationTimeMs: generationTimeMs,
      finishReason: response.candidates?.[0]?.finishReason,
      safetyRatings: response.candidates?.[0]?.safetyRatings?.map((rating)=>({
          category: rating.category,
          probability: rating.probability
        })) || [],
      timestamp: new Date().toISOString(),
      modelUsed: aiConfig.modelId
    };
    const finalResult = {
      content: content.trim(),
      model: aiConfig.modelId,
      metadata: {
        temperature: aiConfig.temperature,
        maxTokens: aiConfig.maxTokens,
        generationTokens: response.usageMetadata?.totalTokenCount,
        generationTimeMs: generationTimeMs,
        generationCost: null,
        // Full capture of request and response (simplified)
        fullRequest: fullRequestData,
        fullResponse: fullResponseData
      }
    };
    // Debug log the result being returned
    await supabase.from("system_logs").insert({
      category: "ai_generator",
      log_level: "info",
      message: `AI generation completed, returning result`,
      metadata: {
        tenantId,
        hasMetadata: !!finalResult.metadata,
        metadataKeys: Object.keys(finalResult.metadata),
        contentLength: finalResult.content?.length,
        hasFullRequest: !!finalResult.metadata.fullRequest,
        hasFullResponse: !!finalResult.metadata.fullResponse
      }
    });
    return finalResult;
  } catch (error) {
    // Log the error
    await supabase.from("system_logs").insert({
      category: "ai_generator",
      log_level: "error",
      message: `AI generation failed: ${error.message}`,
      metadata: {
        tenantId,
        error: error.stack,
        reviewContent: reviewContent?.substring(0, 100)
      }
    });
    throw error;
  }
}
function mapSafetyLevel(level) {
  const safetyMap = {
    BLOCK_NONE: HarmBlockThreshold.BLOCK_NONE,
    BLOCK_ONLY_HIGH: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    BLOCK_MEDIUM_AND_ABOVE: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
    BLOCK_LOW_AND_ABOVE: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE
  };
  return safetyMap[level] || HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE;
}
