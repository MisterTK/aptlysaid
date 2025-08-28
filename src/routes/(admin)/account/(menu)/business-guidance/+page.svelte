<script lang="ts">
  import { onMount, getContext } from "svelte"
  import { enhance } from "$app/forms"
  import type { PageData, ActionData } from "./$types"
  import type { Writable } from "svelte/store"
  import {
    Sparkles,
    Plus,
    Trash2,
    Edit2,
    CheckCircle,
    AlertCircle,
    Info,
  } from "lucide-svelte"

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const adminSection: Writable<string> = getContext("adminSection")
  adminSection.set("business-guidance")

  // Simplified business guidance state - 3 categories only
  let brandIdentity = $state("")
  let responseGuidelines = $state<string[]>([])
  let thingsToAvoid = $state<string[]>([])
  let tone = $state("professional")
  let maxResponseLength = $state(150)
  let isSaving = $state(false)

  // Form state for adding new items
  let newGuideline = $state("")
  let newAvoidItem = $state("")

  // Edit state
  let editingGuideline = $state<number | null>(null)
  let editingAvoidItem = $state<number | null>(null)
  let editGuidelineText = $state("")
  let editAvoidText = $state("")

  // Upsell items state (kept separate)
  let upsellItems = $state<
    Array<{
      id: string
      name: string
      description: string | null
      priority: number | null
      status: string | null
      isEditing?: boolean
      editName?: string
      editDescription?: string
      editPriority?: number
    }>
  >([])

  let newItemName = $state("")
  let newItemDescription = $state("")
  let newItemPriority = $state(50)
  let isAddingItem = $state(false)

  // UI state
  let activeTab = $state<"guidelines" | "upsells">("guidelines")
  let notification = $state<{
    type: "success" | "error" | "info"
    message: string
  } | null>(null)

  onMount(() => {
    loadDataFromServer()
  })

  // Reactive effect to reload data when form actions complete
  $effect(() => {
    if (form) {
      loadDataFromServer()
    }
  })

  function loadDataFromServer() {
    // Load business guidance from server data - V2 schema
    const guidance = data.guidance

    if (guidance) {
      // V2 schema uses separate fields instead of JSON
      brandIdentity = guidance.brand_voice || ""
      responseGuidelines = Array.isArray(guidance.key_messaging)
        ? guidance.key_messaging
        : []
      thingsToAvoid = Array.isArray(guidance.prohibited_words)
        ? guidance.prohibited_words
        : []

      // Load tone from response_tone JSONB field with fallback
      if (
        guidance.response_tone &&
        typeof guidance.response_tone === "object"
      ) {
        tone =
          guidance.response_tone.neutral ||
          guidance.response_tone.positive ||
          "professional"
      } else {
        tone = "professional"
      }

      maxResponseLength = Number(guidance.max_response_length) || 150
    } else {
      // No guidance data - initialize with defaults
      brandIdentity = ""
      responseGuidelines = []
      thingsToAvoid = []
      tone = "professional"
      maxResponseLength = 150
    }

    // Load upsell items from server data
    upsellItems = Array.isArray(data.items) ? data.items : []

    // Handle form feedback
    if (form?.success) {
      showNotification("success", "Changes saved successfully!")
    } else if (form?.error) {
      showNotification("error", form.error)
    }
  }

  function showNotification(
    type: "success" | "error" | "info",
    message: string,
  ) {
    notification = { type, message }
    setTimeout(() => (notification = null), 5000)
  }

  function saveGuidance() {
    // Validate required fields
    if (!brandIdentity.trim()) {
      showNotification("error", "Brand identity is required")
      return
    }

    isSaving = true

    const guidanceStructure = {
      brandIdentity: brandIdentity.trim(),
      responseGuidelines,
      thingsToAvoid,
    }

    // Create and submit a form dynamically (same pattern as upsell items)
    const form = document.createElement("form")
    form.method = "POST"
    form.action = "?/saveGuidance"

    const guidanceInput = document.createElement("input")
    guidanceInput.type = "hidden"
    guidanceInput.name = "guidanceText"
    guidanceInput.value = JSON.stringify(guidanceStructure)
    form.appendChild(guidanceInput)

    const toneInput = document.createElement("input")
    toneInput.type = "hidden"
    toneInput.name = "tone"
    toneInput.value = tone
    form.appendChild(toneInput)

    const lengthInput = document.createElement("input")
    lengthInput.type = "hidden"
    lengthInput.name = "maxResponseLength"
    lengthInput.value = maxResponseLength.toString()
    form.appendChild(lengthInput)

    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  }

  function addGuideline() {
    if (!newGuideline.trim()) {
      showNotification("error", "Please enter a response guideline")
      return
    }

    responseGuidelines = [...responseGuidelines, newGuideline.trim()]
    newGuideline = ""
    saveGuidance()
  }

  function addAvoidItem() {
    if (!newAvoidItem.trim()) {
      showNotification("error", "Please enter something to avoid")
      return
    }

    thingsToAvoid = [...thingsToAvoid, newAvoidItem.trim()]
    newAvoidItem = ""
    saveGuidance()
  }

  function removeGuideline(index: number) {
    responseGuidelines = responseGuidelines.filter((_, i) => i !== index)
    saveGuidance()
  }

  function removeAvoidItem(index: number) {
    thingsToAvoid = thingsToAvoid.filter((_, i) => i !== index)
    saveGuidance()
  }

  function startEditingGuideline(index: number) {
    editingGuideline = index
    editGuidelineText = responseGuidelines[index]
  }

  function startEditingAvoidItem(index: number) {
    editingAvoidItem = index
    editAvoidText = thingsToAvoid[index]
  }

  function saveGuidelineEdit() {
    if (editingGuideline === null) return
    if (!editGuidelineText.trim()) {
      showNotification("error", "Guideline cannot be empty")
      return
    }

    responseGuidelines[editingGuideline] = editGuidelineText.trim()
    editingGuideline = null
    editGuidelineText = ""
    saveGuidance()
  }

  function saveAvoidEdit() {
    if (editingAvoidItem === null) return
    if (!editAvoidText.trim()) {
      showNotification("error", "Item cannot be empty")
      return
    }

    thingsToAvoid[editingAvoidItem] = editAvoidText.trim()
    editingAvoidItem = null
    editAvoidText = ""
    saveGuidance()
  }

  function cancelEdit() {
    editingGuideline = null
    editingAvoidItem = null
    editGuidelineText = ""
    editAvoidText = ""
  }

  // Auto-save when brand identity changes
  function handleBrandIdentityChange() {
    if (brandIdentity.trim()) {
      saveGuidance()
    }
  }

  // Upsell item functions using form actions
  function addUpsellItem() {
    if (!newItemName.trim()) {
      showNotification("error", "Please provide an item name")
      return
    }

    isAddingItem = true

    // Submit using form action
    const formElement = document.getElementById(
      "add-upsell-form",
    ) as HTMLFormElement
    if (formElement) {
      formElement.requestSubmit()
    }
  }

  function toggleItemActive(item: (typeof upsellItems)[0]) {
    // Create and submit a form for updating item
    const form = document.createElement("form")
    form.method = "POST"
    form.action = "?/updateUpsellItem"

    const idInput = document.createElement("input")
    idInput.type = "hidden"
    idInput.name = "id"
    idInput.value = item.id
    form.appendChild(idInput)

    const isActiveInput = document.createElement("input")
    isActiveInput.type = "hidden"
    isActiveInput.name = "isActive"
    isActiveInput.value = (item.status !== "active").toString()
    form.appendChild(isActiveInput)

    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  }

  function deleteItem(itemId: string) {
    if (!confirm("Are you sure you want to delete this item?")) return

    // Create and submit a form for deleting item
    const form = document.createElement("form")
    form.method = "POST"
    form.action = "?/deleteUpsellItem"

    const idInput = document.createElement("input")
    idInput.type = "hidden"
    idInput.name = "id"
    idInput.value = itemId
    form.appendChild(idInput)

    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  }

  function startEditingItem(item: (typeof upsellItems)[0]) {
    upsellItems = upsellItems.map((i) => ({
      ...i,
      isEditing: i.id === item.id,
      editName: i.id === item.id ? i.name : undefined,
      editDescription: i.id === item.id ? i.description || "" : undefined,
      editPriority: i.id === item.id ? i.priority || 0 : undefined,
    }))
  }

  function saveEditedItem(item: (typeof upsellItems)[0]) {
    if (!item.editName?.trim()) {
      showNotification("error", "Item name cannot be empty")
      return
    }

    // Create and submit a form for updating item
    const form = document.createElement("form")
    form.method = "POST"
    form.action = "?/updateUpsellItem"

    const idInput = document.createElement("input")
    idInput.type = "hidden"
    idInput.name = "id"
    idInput.value = item.id
    form.appendChild(idInput)

    const nameInput = document.createElement("input")
    nameInput.type = "hidden"
    nameInput.name = "name"
    nameInput.value = item.editName || ""
    form.appendChild(nameInput)

    const descInput = document.createElement("input")
    descInput.type = "hidden"
    descInput.name = "description"
    descInput.value = item.editDescription || ""
    form.appendChild(descInput)

    const priorityInput = document.createElement("input")
    priorityInput.type = "hidden"
    priorityInput.name = "priority"
    priorityInput.value = (item.editPriority || 0).toString()
    form.appendChild(priorityInput)

    document.body.appendChild(form)
    form.submit()
    document.body.removeChild(form)
  }

  function cancelEditingItem() {
    upsellItems = upsellItems.map((i) => ({
      ...i,
      isEditing: false,
      editName: undefined,
      editDescription: undefined,
      editPriority: undefined,
    }))
  }
</script>

<svelte:head>
  <title>Business Guidelines - AptlySaid</title>
</svelte:head>

<!-- Hidden forms for server actions -->

<form
  id="add-upsell-form"
  method="POST"
  action="?/createUpsellItem"
  use:enhance={() => {
    return async ({ result }) => {
      isAddingItem = false
      if (result.type === "success") {
        if (result.data?.item) {
          upsellItems = [...upsellItems, result.data.item].sort(
            (a, b) => (b.priority || 0) - (a.priority || 0),
          )
        }
        newItemName = ""
        newItemDescription = ""
        newItemPriority = 50
        showNotification("success", "Upsell item added successfully!")
      } else if (result.type === "failure") {
        showNotification("error", result.data?.error || "Failed to add item")
      }
    }
  }}
  style="display: none;"
>
  <input type="hidden" name="name" bind:value={newItemName} />
  <input type="hidden" name="description" bind:value={newItemDescription} />
  <input type="hidden" name="priority" bind:value={newItemPriority} />
  <input type="hidden" name="isActive" value="true" />
</form>

<!-- Notification Toast -->
{#if notification}
  <div class="toast toast-top toast-end z-50">
    <div
      class="alert alert-{notification.type === 'error'
        ? 'error'
        : notification.type === 'success'
          ? 'success'
          : 'info'} shadow-lg"
    >
      {#if notification.type === "success"}
        <CheckCircle class="w-5 h-5" />
      {:else if notification.type === "error"}
        <AlertCircle class="w-5 h-5" />
      {:else}
        <Info class="w-5 h-5" />
      {/if}
      <span>{notification.message}</span>
    </div>
  </div>
{/if}

<div class="max-w-6xl mx-auto">
  <!-- Header -->
  <div class="flex items-center justify-between mb-8">
    <div>
      <h1 class="text-3xl font-bold flex items-center gap-2">
        <Sparkles class="w-8 h-8 text-primary" />
        Business Guidelines
      </h1>
      <p class="text-base-content/70 mt-2">
        Define how AI responds to your business reviews
      </p>
    </div>
    <a href="/account/reviews" class="btn btn-ghost"> ← Back to Reviews </a>
  </div>

  <!-- Tabs -->
  <div class="tabs tabs-boxed mb-6">
    <button
      class="tab {activeTab === 'guidelines' ? 'tab-active' : ''}"
      onclick={() => (activeTab = "guidelines")}
    >
      Business Guidelines
    </button>
    <button
      class="tab {activeTab === 'upsells' ? 'tab-active' : ''}"
      onclick={() => (activeTab = "upsells")}
    >
      Upsell Items
    </button>
  </div>

  {#if activeTab === "guidelines"}
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Brand Identity Card -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h3 class="card-title text-lg">
            Brand Identity
            <span class="badge badge-error badge-sm">Required</span>
          </h3>
          <p class="text-sm text-base-content/70 mb-4">
            Describe your business, values, and what makes you unique
          </p>

          <textarea
            bind:value={brandIdentity}
            onblur={handleBrandIdentityChange}
            placeholder="We are a family-owned restaurant that has been serving authentic Italian cuisine for over 20 years. We pride ourselves on using fresh, locally-sourced ingredients and providing exceptional customer service..."
            class="textarea textarea-bordered textarea-lg w-full"
            rows="6"
          ></textarea>

          <div class="text-xs text-base-content/60 mt-2">
            This helps AI understand your business context and voice
          </div>
        </div>
      </div>

      <!-- Response Guidelines Card -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h3 class="card-title text-lg">
            Response Guidelines
            <span class="badge badge-error badge-sm">Required</span>
          </h3>
          <p class="text-sm text-base-content/70 mb-4">
            Positive instructions for how to respond
          </p>

          <!-- Add new guideline -->
          <div class="join mb-4">
            <input
              bind:value={newGuideline}
              placeholder="Always thank customers by name"
              class="input input-bordered input-sm join-item flex-1"
              onkeydown={(e) => e.key === "Enter" && addGuideline()}
            />
            <button
              onclick={addGuideline}
              disabled={!newGuideline.trim()}
              class="btn btn-primary btn-sm join-item"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>

          <!-- Guidelines list -->
          {#if responseGuidelines.length === 0}
            <div class="text-center py-4 text-base-content/50">
              <p class="text-sm">No guidelines yet</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each responseGuidelines as guideline, index (index)}
                {#if editingGuideline === index}
                  <div class="space-y-2">
                    <input
                      bind:value={editGuidelineText}
                      class="input input-bordered input-sm w-full"
                      onkeydown={(e) =>
                        e.key === "Enter" && saveGuidelineEdit()}
                    />
                    <div class="flex gap-1">
                      <button
                        onclick={saveGuidelineEdit}
                        class="btn btn-success btn-xs flex-1"
                      >
                        Save
                      </button>
                      <button
                        onclick={cancelEdit}
                        class="btn btn-ghost btn-xs flex-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="flex items-center gap-2 p-2 bg-base-50 rounded">
                    <span class="flex-1 text-sm">{guideline}</span>
                    <button
                      onclick={() => startEditingGuideline(index)}
                      class="btn btn-ghost btn-xs"
                    >
                      <Edit2 class="w-3 h-3" />
                    </button>
                    <button
                      onclick={() => removeGuideline(index)}
                      class="btn btn-ghost btn-xs text-error"
                    >
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>

      <!-- Things to Avoid Card -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h3 class="card-title text-lg">
            Things to Avoid
            <span class="badge badge-outline badge-sm">Optional</span>
          </h3>
          <p class="text-sm text-base-content/70 mb-4">
            What not to include in responses
          </p>

          <!-- Add new avoid item -->
          <div class="join mb-4">
            <input
              bind:value={newAvoidItem}
              placeholder="Don't make excuses"
              class="input input-bordered input-sm join-item flex-1"
              onkeydown={(e) => e.key === "Enter" && addAvoidItem()}
            />
            <button
              onclick={addAvoidItem}
              disabled={!newAvoidItem.trim()}
              class="btn btn-primary btn-sm join-item"
            >
              <Plus class="w-4 h-4" />
            </button>
          </div>

          <!-- Avoid items list -->
          {#if thingsToAvoid.length === 0}
            <div class="text-center py-4 text-base-content/50">
              <p class="text-sm">No restrictions set</p>
            </div>
          {:else}
            <div class="space-y-2">
              {#each thingsToAvoid as avoidItem, index (index)}
                {#if editingAvoidItem === index}
                  <div class="space-y-2">
                    <input
                      bind:value={editAvoidText}
                      class="input input-bordered input-sm w-full"
                      onkeydown={(e) => e.key === "Enter" && saveAvoidEdit()}
                    />
                    <div class="flex gap-1">
                      <button
                        onclick={saveAvoidEdit}
                        class="btn btn-success btn-xs flex-1"
                      >
                        Save
                      </button>
                      <button
                        onclick={cancelEdit}
                        class="btn btn-ghost btn-xs flex-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                {:else}
                  <div class="flex items-center gap-2 p-2 bg-base-50 rounded">
                    <span class="flex-1 text-sm">{avoidItem}</span>
                    <button
                      onclick={() => startEditingAvoidItem(index)}
                      class="btn btn-ghost btn-xs"
                    >
                      <Edit2 class="w-3 h-3" />
                    </button>
                    <button
                      onclick={() => removeAvoidItem(index)}
                      class="btn btn-ghost btn-xs text-error"
                    >
                      <Trash2 class="w-3 h-3" />
                    </button>
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>

    <!-- Additional Settings -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <!-- Tone Setting -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h3 class="card-title text-lg">Tone of Voice</h3>
          <p class="text-sm text-base-content/70 mb-4">
            Set the overall tone for AI responses
          </p>

          <select
            bind:value={tone}
            onchange={handleBrandIdentityChange}
            class="select select-bordered w-full"
          >
            <option value="professional">Professional</option>
            <option value="friendly">Friendly</option>
            <option value="casual">Casual</option>
            <option value="formal">Formal</option>
            <option value="enthusiastic">Enthusiastic</option>
          </select>
        </div>
      </div>

      <!-- Max Response Length -->
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body">
          <h3 class="card-title text-lg">Max Response Length</h3>
          <p class="text-sm text-base-content/70 mb-4">
            Maximum words in AI responses
          </p>

          <div class="space-y-2">
            <input
              type="range"
              bind:value={maxResponseLength}
              onchange={handleBrandIdentityChange}
              min="50"
              max="300"
              step="25"
              class="range range-primary"
            />
            <div class="flex justify-between text-xs px-2">
              <span>50</span>
              <span class="font-semibold">{maxResponseLength} words</span>
              <span>300</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Save Status -->
    {#if isSaving}
      <div class="alert alert-info mt-6">
        <span class="loading loading-spinner loading-sm"></span>
        <span>Saving changes...</span>
      </div>
    {:else}
      <div class="text-center mt-6">
        <div class="text-sm text-base-content/60">
          💾 Changes are saved automatically when you add or edit items
        </div>
      </div>
    {/if}
  {:else}
    <!-- Upsell Items Tab (unchanged) -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Add New Item -->
      <div class="card bg-primary/10 border-2 border-dashed border-primary/30">
        <div class="card-body">
          <h3 class="font-semibold mb-4 flex items-center gap-2">
            <Plus class="w-5 h-5" />
            Add New Upsell Item
          </h3>

          <div class="space-y-3">
            <input
              type="text"
              bind:value={newItemName}
              placeholder="Item name (e.g., Happy Hour)"
              class="input input-bordered input-sm w-full"
            />

            <textarea
              bind:value={newItemDescription}
              placeholder="Brief description (optional)"
              class="textarea textarea-bordered textarea-sm w-full"
              rows="2"
            ></textarea>

            <div>
              <label class="label" for="new-item-priority">
                <span class="label-text text-xs">Priority (0-100)</span>
              </label>
              <input
                id="new-item-priority"
                type="range"
                bind:value={newItemPriority}
                min="0"
                max="100"
                class="range range-primary range-xs"
              />
              <div class="flex justify-between text-xs px-2">
                <span>Low</span>
                <span class="font-semibold">{newItemPriority}</span>
                <span>High</span>
              </div>
            </div>

            <button
              onclick={addUpsellItem}
              disabled={isAddingItem || !newItemName.trim()}
              class="btn btn-primary btn-sm btn-block"
            >
              {#if isAddingItem}
                <span class="loading loading-spinner loading-xs"></span>
              {:else}
                <Plus class="w-4 h-4" />
              {/if}
              Add Item
            </button>
          </div>
        </div>
      </div>

      <!-- Existing Items -->
      {#each upsellItems as item (item.title)}
        <div
          class="card bg-white shadow-sm {item.status !== 'active'
            ? 'opacity-60'
            : ''}"
        >
          <div class="card-body">
            {#if item.isEditing}
              <!-- Edit Mode -->
              <div class="space-y-3">
                <input
                  type="text"
                  bind:value={item.editName}
                  class="input input-bordered input-sm w-full"
                />
                <textarea
                  bind:value={item.editDescription}
                  class="textarea textarea-bordered textarea-sm w-full"
                  rows="2"
                ></textarea>
                <div>
                  <label class="label" for="edit-priority-{item.id}">
                    <span class="label-text text-xs">Priority</span>
                  </label>
                  <input
                    id="edit-priority-{item.id}"
                    type="range"
                    bind:value={item.editPriority}
                    min="0"
                    max="100"
                    class="range range-primary range-xs"
                  />
                  <div class="text-center text-xs">{item.editPriority}</div>
                </div>
                <div class="flex gap-2">
                  <button
                    onclick={() => saveEditedItem(item)}
                    class="btn btn-success btn-sm flex-1"
                  >
                    Save
                  </button>
                  <button
                    onclick={() => cancelEditingItem()}
                    class="btn btn-ghost btn-sm flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            {:else}
              <!-- View Mode -->
              <div class="flex items-start justify-between mb-2">
                <h4 class="font-semibold">{item.name}</h4>
                <div class="flex items-center gap-1">
                  <span class="badge badge-sm">{item.priority || 0}</span>
                  {#if item.status !== "active"}
                    <span class="badge badge-ghost badge-sm">Inactive</span>
                  {/if}
                </div>
              </div>

              {#if item.description}
                <p class="text-sm text-gray-600 mb-3">
                  {item.description}
                </p>
              {/if}

              <div class="card-actions justify-end">
                <button
                  onclick={() => startEditingItem(item)}
                  class="btn btn-ghost btn-xs"
                >
                  <Edit2 class="w-3 h-3" />
                </button>
                <button
                  onclick={() => toggleItemActive(item)}
                  class="btn btn-ghost btn-xs"
                >
                  {item.status === "active" ? "Disable" : "Enable"}
                </button>
                <button
                  onclick={() => deleteItem(item.id)}
                  class="btn btn-ghost btn-xs text-error"
                >
                  <Trash2 class="w-3 h-3" />
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/each}

      {#if upsellItems.length === 0}
        <div class="col-span-2 text-center py-8">
          <p class="text-gray-500">
            No upsell items yet. Add your first item to get started!
          </p>
        </div>
      {/if}
    </div>
  {/if}
</div>
