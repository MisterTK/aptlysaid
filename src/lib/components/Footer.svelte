<script lang="ts">
  import Logo from "./Logo.svelte"
  import { WebsiteName } from "../../config"
  const currentYear = new Date().getFullYear()
</script>

<footer class="bg-base-200 border-t border-base-300 mt-auto">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
      <!-- Logo and tagline -->
      <div class="col-span-1 md:col-span-2">
        <Logo size="md" showText={true} variant="full" />
        <p class="mt-4 text-neutral text-sm max-w-md">
          Your brand's voice, perfected. Professional AI-powered review response
          management that saves time and improves customer satisfaction.
        </p>
      </div>

      <!-- Quick Links -->
      <div>
        <h3 class="text-primary font-semibold mb-4">Quick Links</h3>
        <ul class="space-y-2 text-sm">
          <li>
            <a
              href="/"
              class="text-neutral hover:text-primary transition-colors">Home</a
            >
          </li>
          <li>
            <a
              href="/#features"
              class="text-neutral hover:text-primary transition-colors"
              >Features</a
            >
          </li>
          <li>
            <a
              href="/pricing"
              class="text-neutral hover:text-primary transition-colors"
              >Pricing</a
            >
          </li>
          <li>
            <a
              href="/#about"
              class="text-neutral hover:text-primary transition-colors">About</a
            >
          </li>
        </ul>
      </div>

      <!-- Support -->
      <div>
        <h3 class="text-primary font-semibold mb-4">Support</h3>
        <ul class="space-y-2 text-sm">
          <li>
            <a
              href="/contact_us"
              class="text-neutral hover:text-primary transition-colors"
              >Help Center</a
            >
          </li>
          <li>
            <a
              href="/contact_us"
              class="text-neutral hover:text-primary transition-colors"
              >Contact Us</a
            >
          </li>
          <li>
            <a
              href="/#privacy"
              class="text-neutral hover:text-primary transition-colors"
              >Privacy Policy</a
            >
          </li>
          <li>
            <a
              href="/#terms"
              class="text-neutral hover:text-primary transition-colors"
              >Terms of Service</a
            >
          </li>
        </ul>
      </div>
    </div>

    <!-- Bottom section -->
    <div class="mt-8 pt-8 border-t border-base-300">
      <div class="flex flex-col sm:flex-row justify-between items-center">
        <p class="text-sm text-neutral">
          © {currentYear}
          {WebsiteName}. All rights reserved.
        </p>
        <div class="flex items-center space-x-6 mt-4 sm:mt-0">
          <a
            href="https://twitter.com/aptlysaid"
            target="_blank"
            rel="noopener noreferrer"
            class="text-neutral hover:text-primary transition-colors"
            aria-label="Follow us on Twitter"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path
                d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"
              />
            </svg>
          </a>
          <a
            href="https://linkedin.com/company/aptlysaid"
            target="_blank"
            rel="noopener noreferrer"
            class="text-neutral hover:text-primary transition-colors"
            aria-label="Follow us on LinkedIn"
          >
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path
                d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  </div>
</footer>
