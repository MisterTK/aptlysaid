<script lang="ts">
  import { Auth } from "@supabase/auth-ui-svelte"
  import { sharedAppearance, oauthProviders } from "../login_config"
  import { getRedirectUrlFromWindow } from "$lib/auth-redirect"
  import { page } from "$app/stores"

  let { data } = $props()

  // Get invitation details from server data - this is the reliable source
  let invitationDetails = $derived(data?.invitationDetails)
  let hasInvitation = $derived(!!invitationDetails)

  // Get invitation token from URL params (for URL generation)
  let invitationToken = $derived($page.url.searchParams.get("invitation") || "")

  // Include invitation token in redirect URL
  let redirectUrl = $derived(
    (() => {
      const baseUrl = getRedirectUrlFromWindow()
      if (invitationToken) {
        const url = new URL(baseUrl)
        url.searchParams.set("invitation", invitationToken)
        return url.toString()
      }
      return baseUrl
    })(),
  )

  let signInUrl = $derived(
    invitationToken
      ? `/login/sign_in?invitation=${invitationToken}`
      : "/login/sign_in",
  )
</script>

<svelte:head>
  <title>{hasInvitation ? "Join Team" : "Sign up"} - AptlySaid</title>
</svelte:head>

{#if hasInvitation}
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
        Create Account to Join Team
      </h1>
    </div>
    <p class="text-blue-800">
      You've been invited to join <span class="font-semibold"
        >{invitationDetails?.tenantName || "a team"}</span
      >
      as an
      <span class="font-semibold"
        >{invitationDetails?.role?.toUpperCase() || "team member"}</span
      > on AptlySaid. Create your account below to accept the invitation.
    </p>
  </div>
{/if}

<h1 class="text-2xl font-bold mb-6">
  {hasInvitation ? "Create Account" : "Sign Up for AptlySaid"}
</h1>
<p class="text-gray-600 mb-4">
  {hasInvitation
    ? `Create your account to join ${invitationDetails?.tenantName || "the team"} as ${invitationDetails?.role || "a team member"} and start managing reviews`
    : "Start managing and responding to customer reviews with AI-powered assistance"}
</p>
<Auth
  supabaseClient={data.supabase}
  view="sign_up"
  redirectTo={redirectUrl}
  showLinks={false}
  providers={oauthProviders}
  socialLayout="horizontal"
  appearance={sharedAppearance}
  additionalData={undefined}
/>
<div class="text-l text-slate-800 mt-4 mb-2">
  Already have an account? <a class="underline" href={signInUrl}>Sign in</a>
  > {hasInvitation
    ? `to join ${invitationDetails?.tenantName || "the team"}`
    : "to manage your reviews"}.
</div>
