// API route mapping for v1 migration
export const API_ROUTES = {
  // Reviews
  reviews: "/api/v1/reviews",
  reviewsGenerate: "/api/v1/reviews/generate",
  reviewsBatchGenerate: "/api/v1/reviews/batch-generate",
  reviewsBatchStatus: "/api/v1/reviews/batch-status",
  reviewsDashboard: "/api/v1/reviews/dashboard",
  reviewsQueue: "/api/v1/reviews/queue",
  reviewsQueueReorder: "/api/v1/reviews/queue/reorder",
  reviewsSettings: "/api/v1/reviews/settings",
  reviewsSync: "/api/v1/reviews/sync",

  // Responses
  responseFeedback: (id: string) => `/api/v1/responses/${id}/feedback`,

  // Workflows
  workflows: "/api/v1/workflows",

  // Team
  team: "/api/v1/team",
  teamInvite: "/api/v1/team/invite",
  teamTransferOwnership: "/api/v1/team/transfer-ownership",
  teamInvitation: (id: string) => `/api/v1/team/invitations/${id}`,
  teamMember: (userId: string) => `/api/v1/team/members/${userId}`,

  // Locations
  locationsSyncDetails: "/api/v1/locations/sync-details",

  // Google
  googleSync: "/api/v1/google-sync",

  // Onboarding
  onboardingComplete: "/api/v1/onboarding/complete",

  // Legacy routes (to be deprecated)
  legacyAiResponse: "/api/reviews/ai-response",
  legacyPublish: "/api/reviews/publish",
} as const

// Helper function to get API route
export function getApiRoute(
  key: keyof typeof API_ROUTES,
  ...args: string[]
): string {
  const route = API_ROUTES[key]
  if (typeof route === "function") {
    return route(...args)
  }
  return route
}
