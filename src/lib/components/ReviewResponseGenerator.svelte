<script lang="ts">
  import {
    DEFAULT_MODEL,
    VERTEX_AI_MODELS,
    type VertexAIModel,
  } from "$lib/services/ai/models-config"

  interface Review {
    rating: number
    comment: string
    customerName?: string
    businessType?: string
  }

  interface Props {
    review?: Review
    onResponseGenerated?: (response: string) => void
  }

  let { review = undefined, onResponseGenerated = undefined }: Props = $props()

  let reviewData = $state({
    rating: review?.rating || 5,
    text: review?.comment || "",
    authorName: review?.customerName || "",
  })

  let config = $state({
    businessName: "",
    businessType: review?.businessType || "",
    tone: "professional" as "professional" | "friendly" | "casual",
    customInstructions: "",
  })

  let model: VertexAIModel = $state(DEFAULT_MODEL)
  let generatedResponse = $state("")
  let isLoading = $state(false)
  let error = $state("")
  let useStreaming = $state(true)

  async function generateResponse() {
    if (!reviewData.text || !config.businessName) {
      error = "Please fill in required fields"
      return
    }

    isLoading = true
    error = ""
    generatedResponse = ""

    try {
      const response = await fetch("/account/api/reviews/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          review: reviewData,
          config,
          model,
          stream: useStreaming,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to generate response")
      }

      if (useStreaming) {
        const reader = response.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) throw new Error("No response body")

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split("\n")

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6)
              if (data === "[DONE]") continue
              try {
                const parsed = JSON.parse(data)
                generatedResponse += parsed.text || ""
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      } else {
        const data = await response.json()
        generatedResponse = data.response
      }

      // Call the callback if provided
      if (onResponseGenerated && generatedResponse) {
        onResponseGenerated(generatedResponse)
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "An error occurred"
    } finally {
      isLoading = false
    }
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(generatedResponse)
    } catch (err) {
      console.error("Failed to copy text: ", err)
    }
  }
</script>

<div class="max-w-4xl mx-auto">
  <div class="grid gap-6 md:grid-cols-2">
    <div class="space-y-4">
      <div>
        <label for="business-name" class="label">
          <span class="label-text">Business Name *</span>
        </label>
        <input
          id="business-name"
          type="text"
          bind:value={config.businessName}
          placeholder="Your Business Name"
          class="input input-bordered w-full"
        />
      </div>

      <div>
        <label for="business-type" class="label">
          <span class="label-text">Business Type</span>
        </label>
        <input
          id="business-type"
          type="text"
          bind:value={config.businessType}
          placeholder="e.g., restaurant, hotel, store"
          class="input input-bordered w-full"
        />
      </div>

      <div>
        <label for="tone" class="label">
          <span class="label-text">Response Tone</span>
        </label>
        <select
          id="tone"
          bind:value={config.tone}
          class="select select-bordered w-full"
        >
          <option value="professional">Professional</option>
          <option value="friendly">Friendly</option>
          <option value="casual">Casual</option>
        </select>
      </div>

      <div>
        <label for="model" class="label">
          <span class="label-text">AI Model</span>
        </label>
        <select
          id="model"
          bind:value={model}
          class="select select-bordered w-full"
        >
          {#each Object.entries(VERTEX_AI_MODELS) as [modelId, modelInfo] (modelId)}
            <option value={modelId}>
              {modelInfo.name}
              {#if modelInfo.costPerMillion}
                (${modelInfo.costPerMillion}/1M tokens)
              {/if}
            </option>
          {/each}
        </select>
      </div>

      <div class="form-control">
        <label class="label cursor-pointer">
          <span class="label-text">Use streaming</span>
          <input type="checkbox" bind:checked={useStreaming} class="checkbox" />
        </label>
      </div>
    </div>

    <div class="space-y-4">
      <div>
        <label for="customer-name" class="label">
          <span class="label-text">Customer Name</span>
        </label>
        <input
          id="customer-name"
          type="text"
          bind:value={reviewData.authorName}
          placeholder="John Doe"
          class="input input-bordered w-full"
        />
      </div>

      <div>
        <label for="rating" class="label">
          <span class="label-text">Rating *</span>
        </label>
        <input
          id="rating"
          type="number"
          bind:value={reviewData.rating}
          min="1"
          max="5"
          class="input input-bordered w-full"
        />
      </div>

      <div>
        <label for="review-text" class="label">
          <span class="label-text">Review Text *</span>
        </label>
        <textarea
          id="review-text"
          bind:value={reviewData.text}
          placeholder="Customer review text..."
          class="textarea textarea-bordered w-full h-24"
        ></textarea>
      </div>

      <div>
        <label for="custom-instructions" class="label">
          <span class="label-text">Custom Instructions</span>
        </label>
        <textarea
          id="custom-instructions"
          bind:value={config.customInstructions}
          placeholder="Any special instructions for the AI..."
          class="textarea textarea-bordered w-full h-16"
        ></textarea>
      </div>
    </div>
  </div>

  <div class="mt-6">
    <button
      onclick={generateResponse}
      disabled={isLoading}
      class="btn btn-primary"
      class:loading={isLoading}
    >
      {isLoading ? "Generating..." : "Generate Response"}
    </button>
  </div>

  {#if error}
    <div class="alert alert-error mt-4">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="stroke-current shrink-0 h-6 w-6"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{error}</span>
    </div>
  {/if}

  {#if generatedResponse}
    <div class="mt-6">
      <h3 class="text-lg font-semibold mb-2">Generated Response:</h3>
      <div class="mockup-code">
        <pre><code>{generatedResponse}</code></pre>
      </div>
      <button class="btn btn-sm btn-ghost mt-2" onclick={copyToClipboard}>
        Copy to Clipboard
      </button>
    </div>
  {/if}
</div>
