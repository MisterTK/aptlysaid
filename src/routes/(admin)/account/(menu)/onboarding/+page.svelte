<script lang="ts">
  import { onMount } from "svelte"
  import { goto } from "$app/navigation"
  // import { page } from '$app/stores'  // Removed unused import
  import OnboardingWizard from "$lib/components/onboarding/OnboardingWizard.svelte"
  import WorkflowStatusIndicator from "$lib/components/onboarding/WorkflowStatusIndicator.svelte"
  import { setContext } from "svelte"

  interface Props {
    data: {
      onboardingStatus?: unknown
      workflowExecution?: unknown
    }
  }

  let { data }: Props = $props()

  setContext("adminSection", "onboarding")

  let currentStep = $state(1)
  let totalSteps = $state(6)
  let isLoading = $state(false)
  let workflowExecution = $state(data.workflowExecution)
  let error = $state("")

  // Determine current step based on onboarding status
  onMount(() => {
    if (data.onboardingStatus) {
      currentStep = determineCurrentStep(data.onboardingStatus)
    }
  })

  function determineCurrentStep(status: unknown): number {
    if (!status) return 1

    // Logic to determine step based on completion status
    if (
      status.profile_completed &&
      status.integrations_connected &&
      status.locations_discovered &&
      status.ai_configured
    ) {
      return 6 // Complete
    } else if (
      status.profile_completed &&
      status.integrations_connected &&
      status.locations_discovered
    ) {
      return 5 // AI Setup
    } else if (status.profile_completed && status.integrations_connected) {
      return 4 // Location Discovery
    } else if (status.profile_completed) {
      return 3 // Integrations
    } else if (status.welcome_completed) {
      return 2 // Profile Setup
    }

    return 1 // Welcome
  }

  async function handleStepAction(event: CustomEvent) {
    const { stepId } = event.detail
    isLoading = true
    error = ""

    try {
      switch (stepId) {
        case "setup_profile":
          await goto("/account/settings")
          break

        case "connect_integrations":
          await goto("/account/integrations")
          break

        case "discover_locations":
          await startWorkflow("gmb_sync")
          break

        case "setup_ai_preferences":
          await goto("/account/business-guidance")
          break

        case "complete_onboarding":
          await completeOnboarding()
          break

        default:
          currentStep++
      }
    } catch (err: unknown) {
      error = err instanceof Error ? err.message : "An error occurred"
    } finally {
      isLoading = false
    }
  }

  async function startWorkflow(workflowType: string) {
    try {
      const response = await fetch("/account/api/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflow_type: workflowType,
          context: { onboarding: true },
          priority: 1,
        }),
      })

      if (!response.ok) {
        throw new Error("Failed to start workflow")
      }

      const result = await response.json()
      workflowExecution = result

      // Auto-advance step when workflow starts
      currentStep++
    } catch (err: unknown) {
      throw new Error(
        `Failed to start ${workflowType}: ${err instanceof Error ? err.message : "Unknown error"}`,
      )
    }
  }

  async function completeOnboarding() {
    try {
      // Mark onboarding as complete
      const response = await fetch("/account/api/onboarding/complete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      if (!response.ok) {
        throw new Error("Failed to complete onboarding")
      }

      // Redirect to main dashboard
      await goto("/account")
    } catch (err: unknown) {
      throw new Error(
        `Failed to complete onboarding: ${err instanceof Error ? err.message : "Unknown error"}`,
      )
    }
  }

  function handleNextStep() {
    if (currentStep < totalSteps) {
      currentStep++
    }
  }

  function handlePreviousStep() {
    if (currentStep > 1) {
      currentStep--
    }
  }

  function handleSkipStep() {
    if (currentStep < totalSteps) {
      currentStep++
    }
  }
</script>

<svelte:head>
  <title>Getting Started - AptlySaid</title>
  <meta
    name="description"
    content="Set up your AI-powered review management system"
  />
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-primary/5 to-secondary/5">
  <div class="container mx-auto px-4 py-8">
    <!-- Header -->
    <div class="text-center mb-8">
      <div class="flex items-center justify-center gap-3 mb-4">
        <div
          class="w-12 h-12 bg-primary rounded-full flex items-center justify-center"
        >
          <svg
            class="w-6 h-6 text-primary-content"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1
          class="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent"
        >
          Welcome to AptlySaid
        </h1>
      </div>
      <p class="text-xl text-base-content/70 max-w-2xl mx-auto">
        Let's get your AI-powered review management system set up in just a few
        simple steps
      </p>
    </div>

    <!-- Error Alert -->
    {#if error}
      <div class="alert alert-error mb-6 max-w-4xl mx-auto">
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
            clip-rule="evenodd"
          />
        </svg>
        <span>{error}</span>
        <div>
          <button class="btn btn-sm btn-ghost" onclick={() => (error = "")}
            >Dismiss</button
          >
        </div>
      </div>
    {/if}

    <!-- Active Workflow Status -->
    {#if workflowExecution && workflowExecution.status !== "completed"}
      <div class="max-w-4xl mx-auto mb-6">
        <WorkflowStatusIndicator
          workflowId={workflowExecution.id}
          status={workflowExecution.status}
          currentStep={workflowExecution.current_step}
          errorDetails={workflowExecution.error_details}
          showDetails={true}
        />
      </div>
    {/if}

    <!-- Main Onboarding Wizard -->
    <OnboardingWizard
      {currentStep}
      {totalSteps}
      {isLoading}
      workflow={workflowExecution}
      on:step-action={handleStepAction}
      on:next-step={handleNextStep}
      on:previous-step={handlePreviousStep}
      on:skip-step={handleSkipStep}
    />

    <!-- Help Section -->
    <div class="max-w-4xl mx-auto mt-12">
      <div class="card bg-base-100/50 border border-base-300">
        <div class="card-body p-6">
          <h3 class="card-title text-lg mb-4">Need Help?</h3>
          <div class="grid md:grid-cols-3 gap-4">
            <div class="flex items-start gap-3">
              <div class="text-2xl">📚</div>
              <div>
                <h4 class="font-semibold">Documentation</h4>
                <p class="text-sm text-base-content/70">
                  Step-by-step guides and tutorials
                </p>
                <a href="/docs" class="link link-primary text-sm">View Docs</a>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <div class="text-2xl">💬</div>
              <div>
                <h4 class="font-semibold">Support Chat</h4>
                <p class="text-sm text-base-content/70">
                  Get help from our support team
                </p>
                <button class="link link-primary text-sm">Start Chat</button>
              </div>
            </div>

            <div class="flex items-start gap-3">
              <div class="text-2xl">🎥</div>
              <div>
                <h4 class="font-semibold">Video Tutorials</h4>
                <p class="text-sm text-base-content/70">
                  Watch setup walkthroughs
                </p>
                <a href="/tutorials" class="link link-primary text-sm"
                  >Watch Videos</a
                >
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Skip Onboarding Option -->
    <div class="text-center mt-8">
      <p class="text-sm text-base-content/60">
        Already familiar with the platform?
        <a href="/account" class="link link-primary">Skip to Dashboard</a>
      </p>
    </div>
  </div>
</div>

<style>
  .bg-clip-text {
    -webkit-background-clip: text;
    background-clip: text;
  }
</style>
