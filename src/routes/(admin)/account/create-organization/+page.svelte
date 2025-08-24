<script lang="ts">
  import { enhance } from "$app/forms"
  import type { ActionData } from "./$types"

  let { form }: { form: ActionData } = $props()
</script>

<svelte:head>
  <title>Create Organization</title>
</svelte:head>

<div class="max-w-2xl mx-auto">
  <h1 class="text-3xl font-bold mb-2">
    Welcome! Let's set up your organization
  </h1>
  <p class="text-gray-600 mb-8">
    Create your organization to start managing reviews with AI
  </p>

  <form method="POST" use:enhance class="space-y-6">
    <div class="form-control">
      <label for="name" class="label">
        <span class="label-text">Organization Name *</span>
      </label>
      <input
        type="text"
        name="name"
        id="name"
        required
        placeholder="Acme Corporation"
        class="input input-bordered w-full"
        class:input-error={form?.errors?.name}
      />
      {#if form?.errors?.name}
        <div class="label">
          <span class="label-text-alt text-error">{form.errors.name}</span>
        </div>
      {/if}
    </div>

    <div class="form-control">
      <label for="businessType" class="label">
        <span class="label-text">Business Type *</span>
      </label>
      <select
        name="businessType"
        id="businessType"
        required
        class="select select-bordered w-full"
        class:select-error={form?.errors?.businessType}
      >
        <option value="">Select your business type</option>
        <option value="restaurant">Restaurant</option>
        <option value="hotel">Hotel</option>
        <option value="retail">Retail Store</option>
        <option value="service">Service Business</option>
        <option value="healthcare">Healthcare</option>
        <option value="professional">Professional Services</option>
        <option value="ecommerce">E-commerce</option>
        <option value="automotive">Automotive</option>
        <option value="fitness">Fitness & Wellness</option>
        <option value="beauty">Beauty & Spa</option>
        <option value="real_estate">Real Estate</option>
        <option value="education">Education</option>
        <option value="entertainment">Entertainment</option>
        <option value="other">Other</option>
      </select>
      {#if form?.errors?.businessType}
        <div class="label">
          <span class="label-text-alt text-error"
            >{form.errors.businessType}</span
          >
        </div>
      {/if}
    </div>

    <div class="form-control">
      <label for="industry" class="label">
        <span class="label-text">Industry</span>
      </label>
      <input
        type="text"
        name="industry"
        id="industry"
        placeholder="e.g., Fine Dining, Boutique Hotel, etc."
        class="input input-bordered w-full"
      />
    </div>

    <div class="form-control">
      <label for="timezone" class="label">
        <span class="label-text">Time Zone</span>
      </label>
      <select
        name="timezone"
        id="timezone"
        class="select select-bordered w-full"
      >
        <option value="UTC">UTC</option>
        <option value="America/New_York">Eastern Time (US)</option>
        <option value="America/Chicago">Central Time (US)</option>
        <option value="America/Denver">Mountain Time (US)</option>
        <option value="America/Los_Angeles">Pacific Time (US)</option>
        <option value="Europe/London">London</option>
        <option value="Europe/Paris">Paris</option>
        <option value="Europe/Berlin">Berlin</option>
        <option value="Asia/Tokyo">Tokyo</option>
        <option value="Asia/Shanghai">Shanghai</option>
        <option value="Australia/Sydney">Sydney</option>
      </select>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div class="form-control">
        <label for="employeeCount" class="label">
          <span class="label-text">Number of Employees</span>
        </label>
        <select
          name="employeeCount"
          id="employeeCount"
          class="select select-bordered w-full"
        >
          <option value="">Select range</option>
          <option value="1-10">1-10</option>
          <option value="11-50">11-50</option>
          <option value="51-200">51-200</option>
          <option value="201-500">201-500</option>
          <option value="501-1000">501-1,000</option>
          <option value="1001+">1,001+</option>
        </select>
      </div>

      <div class="form-control">
        <label for="annualRevenue" class="label">
          <span class="label-text">Annual Revenue</span>
        </label>
        <select
          name="annualRevenue"
          id="annualRevenue"
          class="select select-bordered w-full"
        >
          <option value="">Select range</option>
          <option value="0-100k">$0 - $100k</option>
          <option value="100k-500k">$100k - $500k</option>
          <option value="500k-1m">$500k - $1M</option>
          <option value="1m-5m">$1M - $5M</option>
          <option value="5m-10m">$5M - $10M</option>
          <option value="10m+">$10M+</option>
        </select>
      </div>
    </div>

    {#if form?.errors?._}
      <div class="alert alert-error">
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
        <span>{form.errors._}</span>
      </div>
    {/if}

    <div class="divider">AI Configuration</div>

    <div class="form-control">
      <label for="brandVoice" class="label">
        <span class="label-text">Brand Voice</span>
        <span class="label-text-alt">How should AI represent your brand?</span>
      </label>
      <textarea
        name="brandVoice"
        id="brandVoice"
        placeholder="e.g., Professional yet friendly, warm and welcoming, etc."
        class="textarea textarea-bordered h-20"
      ></textarea>
    </div>

    <div class="form-control">
      <label for="writingStyle" class="label">
        <span class="label-text">Writing Style</span>
      </label>
      <select
        name="writingStyle"
        id="writingStyle"
        class="select select-bordered w-full"
      >
        <option value="conversational">Conversational</option>
        <option value="professional">Professional</option>
        <option value="formal">Formal</option>
        <option value="casual">Casual</option>
        <option value="enthusiastic">Enthusiastic</option>
      </select>
    </div>

    <button type="submit" class="btn btn-primary w-full">
      Create Organization
    </button>
  </form>
</div>
