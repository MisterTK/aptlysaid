<script lang="ts">
  import PricingModule from "./pricing_module.svelte"
  import { WebsiteName } from "./../../../config"

  type PlanFeatureRow = {
    name: string
    freeIncluded?: boolean
    proIncluded?: boolean
    freeString?: string
    proString?: string
    header?: boolean
  }

  const planFeatures: PlanFeatureRow[] = [
    {
      name: "AI Response Generation",
      header: true,
    },
    {
      name: "Monthly AI Responses",
      freeString: "10",
      proString: "Unlimited",
    },
    {
      name: "Response Quality",
      freeString: "Basic",
      proString: "Advanced AI",
    },
    {
      name: "Brand Voice Training",
      freeIncluded: false,
      proIncluded: true,
    },
    {
      name: "Platform Integrations",
      header: true,
    },
    {
      name: "Review Platforms",
      freeString: "1 platform",
      proString: "All platforms",
    },
    {
      name: "Google Business",
      freeIncluded: true,
      proIncluded: true,
    },
    {
      name: "Yelp, TripAdvisor, Facebook",
      freeIncluded: false,
      proIncluded: true,
    },
    {
      name: "Features & Support",
      header: true,
    },
    {
      name: "Response Analytics",
      freeIncluded: false,
      proIncluded: true,
    },
    {
      name: "Response Templates",
      freeString: "Basic",
      proString: "Custom",
    },
    {
      name: "Team Members",
      freeString: "1 user",
      proString: "Unlimited",
    },
    {
      name: "API Access",
      freeIncluded: false,
      proIncluded: false,
    },
    {
      name: "Support",
      freeString: "Email",
      proString: "Priority",
    },
  ]
</script>

<svelte:head>
  <title>Pricing</title>
  <meta name="description" content="Pricing - {WebsiteName}" />
</svelte:head>

<div class="min-h-[70vh] pb-8 pt-[5vh] px-4">
  <h1 class="text-3xl font-bold text-center">Simple, Transparent Pricing</h1>
  <h2 class="text-xl text-center text-base-content/70 mt-1 pb-3">
    Choose the plan that fits your business needs
  </h2>

  <div class="w-full my-8">
    <PricingModule callToAction="Get Started" highlightedPlanId="pro" />
    <h1 class="text-2xl font-bold text-center mt-24">Pricing FAQ</h1>
    <div class="flex place-content-center">
      <div class="join join-vertical max-w-xl py-6 mx-auto">
        <div class="collapse collapse-arrow join-item border border-primary">
          <input type="radio" name="faq-accordion" />
          <div class="collapse-title text-lg font-medium">
            Can I try AptlySaid before paying?
          </div>
          <div class="collapse-content">
            <p>
              Yes! Our Free plan includes 10 AI-generated responses per month,
              so you can test the quality of our AI before upgrading.
            </p>
          </div>
        </div>
        <div class="collapse collapse-arrow join-item border border-primary">
          <input type="radio" name="faq-accordion" />
          <div class="collapse-title text-lg font-medium">
            What review platforms do you support?
          </div>
          <div class="collapse-content">
            <p>
              We support all major review platforms including Google Business,
              Yelp, TripAdvisor, Facebook, Trustpilot, and more. The Free plan
              includes 1 platform integration, while Professional and Enterprise
              plans include all platforms.
            </p>
          </div>
        </div>
        <div class="collapse collapse-arrow join-item border border-primary">
          <input type="radio" name="faq-accordion" />
          <div class="collapse-title text-lg font-medium">
            Can I cancel or change my plan anytime?
          </div>
          <div class="collapse-content">
            <p>
              Absolutely! You can upgrade, downgrade, or cancel your
              subscription at any time from your account dashboard. Changes take
              effect at the next billing cycle.
            </p>
          </div>
        </div>
        <div class="collapse collapse-arrow join-item border border-primary">
          <input type="radio" name="faq-accordion" />
          <div class="collapse-title text-lg font-medium">
            How does the AI learn my brand voice?
          </div>
          <div class="collapse-content">
            <p>
              Our AI analyzes your past responses and brand guidelines to
              understand your unique tone and style.
            </p>
            <p class="mt-4">
              Professional plans include brand voice training, ensuring all
              responses sound authentically like your business.
            </p>
          </div>
        </div>
      </div>
    </div>

    <svg style="display:none" version="2.0">
      <defs>
        <symbol
          id="checkcircle"
          viewBox="0 0 24 24"
          stroke-width="2"
          fill="currentColor"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M16.417 10.283A7.917 7.917 0 1 1 8.5 2.366a7.916 7.916 0 0 1 7.917 7.917zm-4.105-4.498a.791.791 0 0 0-1.082.29l-3.828 6.63-1.733-2.08a.791.791 0 1 0-1.216 1.014l2.459 2.952a.792.792 0 0 0 .608.285.83.83 0 0 0 .068-.003.791.791 0 0 0 .618-.393L12.6 6.866a.791.791 0 0 0-.29-1.081z"
          />
        </symbol>
      </defs>
    </svg>

    <svg style="display:none" version="2.0">
      <defs>
        <symbol id="nocircle" viewBox="0 0 24 24" fill="currentColor">
          <path
            d="M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm4,11H8a1,1,0,0,1,0-2h8a1,1,0,0,1,0,2Z"
          />
        </symbol>
      </defs>
    </svg>

    <h1 class="text-2xl font-bold text-center mt-16">Plan Features</h1>
    <h2 class="text-xl text-center text-base-content/70 mt-1 pb-3">
      Example feature table
    </h2>

    <div class="overflow-visible mx-auto max-w-xl mt-4">
      <table class="table">
        <thead
          class="text-lg sticky top-0 bg-base-100 bg-opacity-50 z-10 backdrop-blur-sm"
        >
          <tr>
            <th></th>
            <th class="text-center">Free</th>
            <th class="text-center">Pro</th>
          </tr>
        </thead>
        <tbody>
          {#each planFeatures as feature}
            {#if feature.header}
              <tr class="bg-base-200 font-bold">
                <td colspan="3">{feature.name} </td>
              </tr>
            {:else}
              <tr class="relative">
                <td>{feature.name} </td>
                <td class="text-center">
                  {#if feature.freeString}
                    {feature.freeString}
                  {:else if feature.freeIncluded}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-8 h-8 ml-2 inline text-success"
                    >
                      <use href="#checkcircle" />
                    </svg>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-[26px] h-[26px] inline text-base-200"
                    >
                      <use href="#nocircle" />
                    </svg>
                  {/if}
                </td>
                <td class="text-center">
                  {#if feature.proString}
                    {feature.proString}
                  {:else if feature.proIncluded}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-8 h-8 ml-2 inline text-success"
                    >
                      <use href="#checkcircle" />
                    </svg>
                  {:else}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-[26px] h-[26px] inline text-base-200"
                    >
                      <use href="#nocircle" />
                    </svg>
                  {/if}
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>
