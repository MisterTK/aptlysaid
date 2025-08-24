<script lang="ts">
  export let size: "sm" | "md" | "lg" = "md"
  export let showText = true
  export let variant: "full" | "icon" = "full"

  const sizes = {
    sm: { height: "h-6", iconHeight: "h-6", textSize: "text-lg" },
    md: { height: "h-8", iconHeight: "h-8", textSize: "text-2xl" },
    lg: { height: "h-12", iconHeight: "h-12", textSize: "text-3xl" },
  }

  const currentSize = sizes[size]
</script>

{#if variant === "full" && showText}
  <!-- Full logo with text -->
  <div class="flex items-center space-x-2">
    <svg
      class="{currentSize.height} w-auto"
      viewBox="0 0 200 60"
      xmlns="http://www.w3.org/2000/svg"
    >
      <!-- Chat bubble with checkmark tail icon -->
      <g id="icon">
        <!-- Chat bubble -->
        <path
          d="M 10 15 Q 10 10 15 10 L 35 10 Q 40 10 40 15 L 40 30 Q 40 35 35 35 L 20 35 L 15 42 Q 14 43 13 42 L 13 35 Q 10 35 10 32 Z"
          fill="currentColor"
          class="text-primary"
        />
        <!-- Checkmark in tail -->
        <path
          d="M 16 32 L 19 35 L 24 28"
          stroke="currentColor"
          class="text-accent"
          stroke-width="2.5"
          fill="none"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>

      <!-- Wordmark -->
      <text
        x="55"
        y="35"
        font-family="Lora, Georgia, serif"
        font-size="24"
        font-weight="600"
        fill="currentColor"
        class="text-primary"
      >
        AptlySaid
      </text>
    </svg>
  </div>
{:else}
  <!-- Icon only -->
  <svg
    class="{currentSize.iconHeight} w-auto"
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
  >
    <!-- Chat bubble -->
    <path
      d="M 6 8 Q 6 5 9 5 L 23 5 Q 26 5 26 8 L 26 18 Q 26 21 23 21 L 12 21 L 8 26 Q 7 27 6 26 L 6 21 Q 6 21 6 18 Z"
      fill="currentColor"
      class="text-primary"
    />
    <!-- Checkmark -->
    <path
      d="M 10 16 L 13 19 L 19 13"
      stroke="currentColor"
      class="text-accent"
      stroke-width="2.5"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/if}
