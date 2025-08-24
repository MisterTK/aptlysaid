<script lang="ts">
  import { page } from "$app/stores"

  let { data } = $props()

  // Get invitation details from server data - this is the reliable source
  let invitationDetails = $derived(data?.invitationDetails)
  let hasInvitation = $derived(!!invitationDetails)

  // Get invitation token from URL params (for URL generation)
  let invitationToken = $derived($page.url.searchParams.get("invitation") || "")

  let signUpUrl = $derived(
    invitationToken
      ? `/login/sign_up?invitation=${invitationToken}`
      : "/login/sign_up",
  )
  let signInUrl = $derived(
    invitationToken
      ? `/login/sign_in?invitation=${invitationToken}`
      : "/login/sign_in",
  )
</script>

<svelte:head>
  <title>{hasInvitation ? "Join Team" : "Get Started"} - AptlySaid</title>
</svelte:head>

<div>
  {#if hasInvitation}
    <!-- Invitation Flow -->
    <div class="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div class="flex items-center gap-2 mb-2">
        <svg
          class="w-5 h-5 text-blue-600"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h1 class="text-lg font-semibold text-blue-900">
          You've been invited!
        </h1>
      </div>
      <p class="text-blue-800 mb-3">
        You've been invited to join <span class="font-semibold"
          >{invitationDetails?.tenantName || "a tenant"}</span
        >
        as an
        <span class="font-semibold"
          >{invitationDetails?.role?.toUpperCase() || "team member"}</span
        > on AptlySaid. To accept this invitation, you'll need to create an account
        or sign in.
      </p>
    </div>
  {:else}
    <h1 class="text-2xl font-bold mb-2">Welcome to AptlySaid</h1>
    <p class="text-base-content/70 mb-6">
      AI-powered review management for your business
    </p>
  {/if}

  <h2 class="text-xl font-bold">
    {hasInvitation ? "Create Account" : "Get Started"}
  </h2>
  <p class="text-base-content/70 mb-3">
    {hasInvitation
      ? `Create your account to join ${invitationDetails?.tenantName || "the team"} as ${invitationDetails?.role || "a team member"}`
      : "Create your account and start managing reviews efficiently"}
  </p>
  <a href={signUpUrl}>
    <button class="btn btn-primary mt-3 btn-wide">
      {hasInvitation
        ? `Join ${invitationDetails?.tenantName || "Team"}`
        : "Sign Up"}
    </button>
  </a>

  <h2 class="text-xl mt-6">Already have an account?</h2>
  <p class="text-base-content/70 mb-3">
    {hasInvitation
      ? `Sign in to join ${invitationDetails?.tenantName || "the team"} as ${invitationDetails?.role || "a team member"}`
      : "Access your review management dashboard"}
  </p>
  <a href={signInUrl}>
    <button class="btn btn-outline btn-primary mt-3 btn-wide">
      {hasInvitation ? "Sign In & Join" : "Sign In"}
    </button>
  </a>
</div>
