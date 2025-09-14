export function getAuthRedirectUrl(request: Request): string {
  const url = new URL(request.url)
  const origin = url.origin

  if (
    origin.includes("vercel.app") &&
    !origin.includes("reviews-dusky.vercel.app")
  ) {
    return `${origin}/auth/callback`
  }

  return `${origin}/auth/callback`
}

export function getRedirectUrlFromWindow(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/auth/callback`
  }

  return "/auth/callback"
}
