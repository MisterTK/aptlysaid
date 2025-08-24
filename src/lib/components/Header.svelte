<script lang="ts">
  import Logo from "./Logo.svelte"
</script>

<header class="bg-base-100 shadow-sm border-b border-base-300">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between items-center h-16">
      <a href="/" class="flex items-center hover:opacity-80 transition-opacity">
        <Logo size="md" showText={true} variant="full" />
      </a>
      <nav class="flex items-center space-x-4">
        <a
          href="/"
          class="text-neutral hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
        >
          Home
        </a>
        <a
          href="/account"
          class="text-neutral hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
        >
          Dashboard
        </a>
        <a
          href="/pricing"
          class="text-neutral hover:text-primary px-3 py-2 rounded-md text-sm font-medium transition-colors"
        >
          Pricing
        </a>
        <button class="btn btn-accent btn-sm normal-case"> Get Started </button>
      </nav>
    </div>
  </div>
</header>
