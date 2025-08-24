<script lang="ts">
  import { Auth } from "@supabase/auth-ui-svelte"
  import { sharedAppearance, oauthProviders } from "../login_config"
  import { goto } from "$app/navigation"
  import { onMount } from "svelte"
  import { page } from "$app/stores"
  import { getRedirectUrlFromWindow } from "$lib/auth-redirect"

  let { data } = $props()
  let { supabase } = data

  // Get invitation details from server data - this is the reliable source
  let invitationDetails = $derived(data?.invitationDetails)
  let hasInvitation = $derived(!!invitationDetails)

  // Get invitation token from URL params (for URL generation)
  let invitationToken = $derived($page.url.searchParams.get("invitation") || "")

  onMount(() => {
    supabase.auth.onAuthStateChange((event) => {
      // Redirect to account after successful login
      if (event == "SIGNED_IN") {
        // Delay needed because order of callback not guaranteed.
        // Give the layout callback priority to update state or
        // we'll just bounch back to login when /account tries to load
        setTimeout(() => {
          if (invitationToken) {
            // Redirect back to invitation page to complete acceptance
            goto(`/invitation/${invitationToken}`)
          } else {
            goto("/account")
          }
        }, 1)
      }
    })
  })

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

  let signUpUrl = $derived(
    invitationToken
      ? `/login/sign_up?invitation=${invitationToken}`
      : "/login/sign_up",
  )
</script>

<svelte:head>
  <title>Sign in - AptlySaid</title>
</svelte:head>

{#if $page.url.searchParams.get("verified") == "true"}
  <div role="alert" class="alert alert-success mb-5">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="stroke-current shrink-0 h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      ><path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      /></svg
    >
    <span
      >Email verified! Please sign in {hasInvitation
        ? "to join the team"
        : "to start managing your reviews"}.</span
    >
  </div>
{/if}

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
      <h1 class="text-lg font-semibold text-blue-900">Sign In to Join Team</h1>
    </div>
    <p class="text-blue-800">
      You've been invited to join <span class="font-semibold"
        >{invitationDetails?.tenantName || "a team"}</span
      >
      as an
      <span class="font-semibold"
        >{invitationDetails?.role?.toUpperCase() || "team member"}</span
      > on AptlySaid. Sign in below to accept the invitation.
    </p>
  </div>
{/if}

<h1 class="text-2xl font-bold mb-6">
  {hasInvitation ? "Sign In to Join Team" : "Sign In to AptlySaid"}
</h1>
<p class="text-gray-600 mb-4">
  {hasInvitation
    ? `Sign in to your account to join ${invitationDetails?.tenantName || "the team"} as ${invitationDetails?.role || "a team member"}`
    : "Access your AI-powered review management dashboard"}
</p>
<Auth
  supabaseClient={data.supabase}
  view="sign_in"
  redirectTo={redirectUrl}
  providers={oauthProviders}
  socialLayout="horizontal"
  showLinks={false}
  appearance={sharedAppearance}
  additionalData={undefined}
/>
<div class="text-l text-slate-800 mt-4">
  <a class="underline" href="/login/forgot_password">Forgot password?</a>
</div>
<div class="text-l text-slate-800 mt-3">
  Don't have an account? <a class="underline" href={signUpUrl}>Sign up</a>
  {hasInvitation
    ? `to join ${invitationDetails?.tenantName || "the team"}`
    : "to start responding to reviews with AI"}.
</div>
