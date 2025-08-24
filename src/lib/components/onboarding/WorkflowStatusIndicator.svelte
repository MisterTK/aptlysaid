<script lang="ts">
  import { onMount, onDestroy } from "svelte"

  interface Props {
    workflowId?: string
    status?: "pending" | "processing" | "completed" | "failed" | "retrying"
    currentStep?: string
    errorDetails?: unknown
    showDetails?: boolean
    compact?: boolean
  }

  let {
    workflowId = "",
    status = "pending",
    currentStep = "",
    errorDetails = null,
    showDetails = true,
    compact = false,
  }: Props = $props()

  let polling = $state(false)
  let pollInterval: ReturnType<typeof setInterval> | null = $state(null)

  onMount(() => {
    if (
      workflowId &&
      (status === "pending" || status === "processing" || status === "retrying")
    ) {
      startPolling()
    }
  })

  onDestroy(() => {
    stopPolling()
  })

  function startPolling() {
    if (polling) return

    polling = true
    pollInterval = setInterval(async () => {
      if (!workflowId) return

      try {
        const response = await fetch(
          `/account/api/workflows?execution_id=${workflowId}`,
        )
        if (response.ok) {
          const data = await response.json()
          if (data.workflow) {
            status = data.workflow.status
            currentStep = data.workflow.current_step
            errorDetails = data.workflow.error_details

            // Stop polling if workflow is complete
            if (status === "completed" || status === "failed") {
              stopPolling()
            }
          }
        }
      } catch (error) {
        console.error("Error polling workflow status:", error)
      }
    }, 2000) // Poll every 2 seconds
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
    polling = false
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "completed":
        return "text-success"
      case "failed":
        return "text-error"
      case "processing":
      case "retrying":
        return "text-warning"
      default:
        return "text-base-content/60"
    }
  }

  function getStatusIcon(status: string): string {
    switch (status) {
      case "completed":
        return "✓"
      case "failed":
        return "✗"
      case "processing":
        return "⚡"
      case "retrying":
        return "🔄"
      default:
        return "⏳"
    }
  }

  function getStatusMessage(status: string, step: string): string {
    switch (status) {
      case "pending":
        return "Workflow queued and waiting to start"
      case "processing":
        return `Processing: ${step || "Initializing..."}`
      case "retrying":
        return `Retrying: ${step || "Previous step failed"}`
      case "completed":
        return "Workflow completed successfully"
      case "failed":
        return `Workflow failed${step ? ` at: ${step}` : ""}`
      default:
        return "Unknown status"
    }
  }

  function formatStepName(step: string): string {
    if (!step) return ""
    return step.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
  }
</script>

{#if compact}
  <!-- Compact Version -->
  <div class="flex items-center gap-2 text-sm">
    <span
      class="text-lg {getStatusColor(status)}"
      class:animate-spin={status === "processing" || status === "retrying"}
    >
      {getStatusIcon(status)}
    </span>
    <span class={getStatusColor(status)}>
      {status === "processing" || status === "retrying"
        ? formatStepName(currentStep)
        : status}
    </span>
    {#if status === "processing" || status === "retrying"}
      <div
        class="loading loading-dots loading-xs {getStatusColor(status)}"
      ></div>
    {/if}
  </div>
{:else}
  <!-- Full Version -->
  <div class="card bg-base-100 border border-base-300 shadow-sm">
    <div class="card-body p-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div
            class="text-2xl {getStatusColor(status)}"
            class:animate-spin={status === "processing" ||
              status === "retrying"}
            class:animate-pulse={status === "pending"}
          >
            {getStatusIcon(status)}
          </div>

          <div>
            <div class="font-semibold {getStatusColor(status)}">
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </div>
            {#if showDetails}
              <div class="text-sm text-base-content/70">
                {getStatusMessage(status, currentStep)}
              </div>
            {/if}
          </div>
        </div>

        {#if status === "processing" || status === "retrying"}
          <div
            class="loading loading-spinner loading-md {getStatusColor(status)}"
          ></div>
        {/if}
      </div>

      {#if showDetails && currentStep && (status === "processing" || status === "retrying")}
        <div class="mt-3">
          <div
            class="text-xs font-medium text-base-content/50 uppercase tracking-wider mb-1"
          >
            Current Step
          </div>
          <div class="text-sm font-medium">
            {formatStepName(currentStep)}
          </div>

          <!-- Progress bar for processing -->
          <div class="w-full bg-base-300 rounded-full h-1 mt-2">
            <div
              class="bg-primary h-1 rounded-full animate-pulse"
              style="width: 60%"
            ></div>
          </div>
        </div>
      {/if}

      {#if errorDetails && status === "failed"}
        <div
          class="mt-3 collapse collapse-arrow bg-error/10 border border-error/20"
        >
          <input type="checkbox" />
          <div class="collapse-title text-sm font-medium text-error">
            View Error Details
          </div>
          <div class="collapse-content text-xs">
            <div class="bg-base-100 p-3 rounded border">
              <div class="font-mono text-error whitespace-pre-wrap">
                {typeof errorDetails === "string"
                  ? errorDetails
                  : JSON.stringify(errorDetails, null, 2)}
              </div>
            </div>
          </div>
        </div>
      {/if}

      {#if workflowId && showDetails}
        <div class="mt-3 pt-3 border-t border-base-300">
          <div
            class="text-xs text-base-content/50 flex justify-between items-center"
          >
            <span>Workflow ID: {workflowId}</span>
            {#if polling}
              <div class="flex items-center gap-1">
                <div
                  class="w-2 h-2 bg-primary rounded-full animate-pulse"
                ></div>
                <span>Live</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .animate-spin {
    animation: spin 2s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
