<script lang="ts">
  import { createEventDispatcher } from "svelte"

  interface Props {
    currentStep?: number
    totalSteps?: number
    isLoading?: boolean
    workflow?: { status: string; current_step: string } | null
  }

  interface OnboardingStep {
    id: string
    title: string
    description: string
    icon: string
    status: "pending" | "in_progress" | "completed" | "failed"
    component?: unknown
  }

  let {
    currentStep = 1,
    totalSteps = 6,
    isLoading = false,
    workflow = null,
  }: Props = $props()

  const dispatch = createEventDispatcher()

  const steps: OnboardingStep[] = [
    {
      id: "welcome",
      title: "Welcome to AptlySaid",
      description: "Let's get your AI-powered review management system set up",
      icon: "👋",
      status: "pending",
    },
    {
      id: "setup_profile",
      title: "Complete Your Profile",
      description: "Add your business information and preferences",
      icon: "👤",
      status: "pending",
    },
    {
      id: "connect_integrations",
      title: "Connect Google My Business",
      description: "Link your Google account to sync reviews automatically",
      icon: "🔗",
      status: "pending",
    },
    {
      id: "discover_locations",
      title: "Discover Your Locations",
      description: "We'll find all your business locations and reviews",
      icon: "📍",
      status: "pending",
    },
    {
      id: "setup_ai_preferences",
      title: "Configure AI Settings",
      description: "Customize how AI responds to your reviews",
      icon: "🤖",
      status: "pending",
    },
    {
      id: "complete_onboarding",
      title: "You're All Set!",
      description: "Start managing your reviews with AI assistance",
      icon: "🎉",
      status: "pending",
    },
  ]

  // Update step statuses based on current progress
  const progressPercentage = $derived(
    Math.round((currentStep / totalSteps) * 100),
  )
  const updatedSteps = $derived(
    steps.map((step, index) => ({
      ...step,
      status:
        index + 1 < currentStep
          ? "completed"
          : index + 1 === currentStep
            ? "in_progress"
            : "pending",
    })),
  )

  function handleStepAction(stepId: string) {
    dispatch("step-action", { stepId, currentStep })
  }

  function handleSkipStep() {
    dispatch("skip-step", { currentStep })
  }

  function handleNextStep() {
    dispatch("next-step", { currentStep })
  }

  function getStepIconClass(status: string): string {
    switch (status) {
      case "completed":
        return "bg-success text-success-content"
      case "in_progress":
        return "bg-primary text-primary-content animate-pulse"
      case "failed":
        return "bg-error text-error-content"
      default:
        return "bg-base-300 text-base-content"
    }
  }

  function getStepConnectorClass(index: number): string {
    const step = updatedSteps[index]
    const nextStep = updatedSteps[index + 1]

    if (step.status === "completed") {
      return "bg-success"
    } else if (step.status === "in_progress" && nextStep) {
      return "bg-gradient-to-r from-primary to-base-300"
    }
    return "bg-base-300"
  }
</script>

<div class="max-w-4xl mx-auto p-6">
  <!-- Header with Progress -->
  <div class="text-center mb-8">
    <h1 class="text-3xl font-bold text-primary mb-2">Getting Started</h1>
    <p class="text-base-content/70 mb-6">
      Let's set up your AI-powered review management system in just a few steps
    </p>

    <!-- Progress Bar -->
    <div class="w-full bg-base-300 rounded-full h-3 mb-4">
      <div
        class="bg-gradient-to-r from-primary to-secondary h-3 rounded-full transition-all duration-500 ease-out"
        style="width: {progressPercentage}%"
      ></div>
    </div>
    <div class="text-sm text-base-content/60">
      Step {currentStep} of {totalSteps} ({progressPercentage}% complete)
    </div>
  </div>

  <!-- Steps Timeline -->
  <div class="relative mb-8">
    <div class="flex items-center justify-between">
      {#each updatedSteps as step, index (step.id)}
        <div class="flex flex-col items-center relative z-10">
          <!-- Step Icon -->
          <div
            class="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold transition-all duration-300 {getStepIconClass(
              step.status,
            )}"
            class:ring-4={step.status === "in_progress"}
            class:ring-primary={step.status === "in_progress"}
            class:ring-opacity-30={step.status === "in_progress"}
          >
            {#if step.status === "completed"}
              <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            {:else if step.status === "failed"}
              <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clip-rule="evenodd"
                />
              </svg>
            {:else}
              <span>{step.icon}</span>
            {/if}
          </div>

          <!-- Step Info -->
          <div class="text-center mt-3 max-w-32">
            <div
              class="font-semibold text-sm"
              class:text-primary={step.status === "in_progress"}
            >
              {step.title}
            </div>
            <div class="text-xs text-base-content/60 mt-1 hidden sm:block">
              {step.description}
            </div>
          </div>
        </div>

        <!-- Connector Line -->
        {#if index < updatedSteps.length - 1}
          <div
            class="flex-1 h-1 mx-4 rounded-full transition-all duration-500 {getStepConnectorClass(
              index,
            )}"
          ></div>
        {/if}
      {/each}
    </div>
  </div>

  <!-- Current Step Content -->
  <div class="card bg-base-100 shadow-xl border border-base-300">
    <div class="card-body">
      {#if currentStep <= totalSteps}
        {@const step = updatedSteps[currentStep - 1]}

        <div>
          <div class="flex items-center gap-4 mb-6">
            <div class="text-6xl">{step.icon}</div>
            <div>
              <h2 class="card-title text-2xl text-primary">{step.title}</h2>
              <p class="text-base-content/70">{step.description}</p>
            </div>
          </div>

          <!-- Step-specific content -->
          <div class="space-y-6">
            {#if step.id === "welcome"}
              <div class="prose max-w-none">
                <p>
                  Welcome to AptlySaid! We're excited to help you transform how
                  you manage and respond to customer reviews using the power of
                  AI.
                </p>

                <div class="grid md:grid-cols-3 gap-4 mt-6">
                  <div class="card bg-primary/5 border border-primary/20">
                    <div class="card-body text-center p-4">
                      <div class="text-3xl mb-2">🤖</div>
                      <h3 class="font-semibold">AI-Powered Responses</h3>
                      <p class="text-sm">
                        Generate personalized, professional responses to all
                        your reviews
                      </p>
                    </div>
                  </div>

                  <div class="card bg-secondary/5 border border-secondary/20">
                    <div class="card-body text-center p-4">
                      <div class="text-3xl mb-2">⚡</div>
                      <h3 class="font-semibold">Automated Workflows</h3>
                      <p class="text-sm">
                        Set up automated publishing and response management
                      </p>
                    </div>
                  </div>

                  <div class="card bg-accent/5 border border-accent/20">
                    <div class="card-body text-center p-4">
                      <div class="text-3xl mb-2">📊</div>
                      <h3 class="font-semibold">Analytics & Insights</h3>
                      <p class="text-sm">
                        Track performance and gain insights into customer
                        sentiment
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            {:else if step.id === "setup_profile"}
              <div class="space-y-4">
                <div class="alert alert-info">
                  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span
                    >Complete your profile information to personalize your AI
                    responses and get better results.</span
                  >
                </div>

                <div
                  class="btn btn-primary btn-block"
                  onclick={() => handleStepAction("setup_profile")}
                >
                  Complete Profile Setup
                </div>
              </div>
            {:else if step.id === "connect_integrations"}
              <div class="space-y-4">
                <div class="alert alert-warning">
                  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span
                    >Connect your Google My Business account to sync reviews and
                    enable automated responses.</span
                  >
                </div>

                <div
                  class="btn btn-primary btn-block"
                  onclick={() => handleStepAction("connect_integrations")}
                >
                  <svg
                    class="w-5 h-5 mr-2"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                  >
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Connect Google My Business
                </div>
              </div>
            {:else if step.id === "discover_locations"}
              <div class="space-y-4">
                {#if isLoading}
                  <div class="flex items-center justify-center py-8">
                    <div
                      class="loading loading-spinner loading-lg text-primary"
                    ></div>
                    <span class="ml-4"
                      >Discovering your business locations...</span
                    >
                  </div>
                {:else}
                  <div class="alert alert-success">
                    <svg
                      class="w-6 h-6"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fill-rule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clip-rule="evenodd"
                      />
                    </svg>
                    <span
                      >We'll automatically discover and sync all your business
                      locations and their reviews.</span
                    >
                  </div>

                  <div
                    class="btn btn-primary btn-block"
                    onclick={() => handleStepAction("discover_locations")}
                  >
                    Discover My Locations
                  </div>
                {/if}
              </div>
            {:else if step.id === "setup_ai_preferences"}
              <div class="space-y-4">
                <div class="alert alert-info">
                  <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span
                    >Configure how AI should respond to reviews based on your
                    business voice and values.</span
                  >
                </div>

                <div
                  class="btn btn-primary btn-block"
                  onclick={() => handleStepAction("setup_ai_preferences")}
                >
                  Configure AI Settings
                </div>
              </div>
            {:else if step.id === "complete_onboarding"}
              <div class="text-center space-y-6">
                <div class="text-6xl mb-4">🎉</div>
                <div class="prose max-w-none">
                  <h3>Congratulations! You're all set up!</h3>
                  <p>
                    Your AI-powered review management system is ready to go. You
                    can now:
                  </p>
                </div>

                <div class="grid md:grid-cols-2 gap-4">
                  <div class="card bg-primary/5 border border-primary/20">
                    <div class="card-body p-4">
                      <h4 class="font-semibold flex items-center gap-2">
                        <span>📝</span> Generate AI Responses
                      </h4>
                      <p class="text-sm">
                        Create personalized responses to customer reviews
                      </p>
                    </div>
                  </div>

                  <div class="card bg-secondary/5 border border-secondary/20">
                    <div class="card-body p-4">
                      <h4 class="font-semibold flex items-center gap-2">
                        <span>⚡</span> Automate Publishing
                      </h4>
                      <p class="text-sm">
                        Set up automated response publishing workflows
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  class="btn btn-primary btn-lg btn-block"
                  onclick={() => handleStepAction("complete_onboarding")}
                >
                  Go to Dashboard
                </div>
              </div>
            {/if}
          </div>

          <!-- Navigation -->
          {#if step.id !== "complete_onboarding"}
            <div class="card-actions justify-between mt-8">
              {#if currentStep > 1}
                <button
                  class="btn btn-ghost"
                  onclick={() => dispatch("previous-step", { currentStep })}
                >
                  ← Previous
                </button>
              {:else}
                <div></div>
              {/if}

              <div class="flex gap-2">
                {#if step.id !== "welcome"}
                  <button class="btn btn-ghost btn-sm" onclick={handleSkipStep}>
                    Skip for now
                  </button>
                {/if}

                <button
                  class="btn btn-primary"
                  onclick={handleNextStep}
                  class:loading={isLoading}
                  disabled={isLoading}
                >
                  {isLoading ? "" : "Continue →"}
                </button>
              </div>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- Workflow Status (if available) -->
  {#if workflow}
    <div class="mt-6" transition:fade>
      <div class="alert alert-info">
        <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
          <path
            fill-rule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clip-rule="evenodd"
          />
        </svg>
        <div>
          <div class="font-semibold">Workflow Status: {workflow.status}</div>
          <div class="text-sm">Current Step: {workflow.current_step}</div>
        </div>
      </div>
    </div>
  {/if}
</div>
