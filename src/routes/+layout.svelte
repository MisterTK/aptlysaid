<script lang="ts">
  import "../app.css"
  import { navigating } from "$app/stores"
  import { expoOut } from "svelte/easing"
  import { slide } from "svelte/transition"
  import Header from "$lib/components/Header.svelte"
  import Footer from "$lib/components/Footer.svelte"

  interface Props {
    children?: import("svelte").Snippet
  }

  let { children }: Props = $props()
</script>

<svelte:head>
  <title>AptlySaid - Your brand's voice, perfected</title>
  <meta
    name="description"
    content="AI-powered review response management platform that generates professional, on-brand responses to customer reviews across all platforms."
  />
</svelte:head>

<div class="min-h-screen bg-base-100 flex flex-col">
  <Header />

  {#if $navigating}
    <!-- 
      Loading animation for next page since svelte doesn't show any indicator. 
       - delay 100ms because most page loads are instant, and we don't want to flash 
       - long 12s duration because we don't actually know how long it will take
       - exponential easing so fast loads (>100ms and <1s) still see enough progress,
         while slow networks see it moving for a full 12 seconds
    -->
    <div
      class="fixed w-full top-0 right-0 left-0 h-1 z-50 bg-accent"
      in:slide={{ delay: 100, duration: 12000, axis: "x", easing: expoOut }}
    ></div>
  {/if}

  <main class="flex-1">
    {@render children?.()}
  </main>

  <Footer />
</div>
