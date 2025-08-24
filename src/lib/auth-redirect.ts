// Helper to get the correct redirect URL for auth flows
export function getAuthRedirectUrl(request: Request): string {
  const url = new URL(request.url)
  const origin = url.origin

  // For preview deployments, use the current origin
  // For production, use the configured site URL if available
  if (
    origin.includes("vercel.app") &&
    !origin.includes("reviews-dusky.vercel.app")
  ) {
    // This is a preview deployment
    return `${origin}/auth/callback`
  }

  // Production or local development
  return `${origin}/auth/callback`
}

// Helper to preserve the current domain during auth flows
export function getRedirectUrlFromWindow(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`
  }
  // Fallback for SSR
  return "/auth/callback"
}
