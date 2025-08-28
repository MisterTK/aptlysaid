
export const API_ROUTES = {

  reviews: "/api/v1/reviews",
  reviewsGenerate: "/api/v1/reviews/generate",
  reviewsBatchGenerate: "/api/v1/reviews/batch-generate",
  reviewsBatchStatus: "/api/v1/reviews/batch-status",
  reviewsDashboard: "/api/v1/reviews/dashboard",
  reviewsQueue: "/api/v1/reviews/queue",
  reviewsQueueReorder: "/api/v1/reviews/queue/reorder",
  reviewsSettings: "/api/v1/reviews/settings",
  reviewsSync: "/api/v1/reviews/sync",

  responseFeedback: (id: string) => `/api/v1/responses/${id}/feedback`,

  workflows: "/api/v1/workflows",

  team: "/api/v1/team",
  teamInvite: "/api/v1/team/invite",
  teamTransferOwnership: "/api/v1/team/transfer-ownership",
  teamInvitation: (id: string) => `/api/v1/team/invitations/${id}`,
  teamMember: (userId: string) => `/api/v1/team/members/${userId}`,

  locationsSyncDetails: "/api/v1/locations/sync-details",

  googleSync: "/api/v1/google-sync",

  onboardingComplete: "/api/v1/onboarding/complete",

  legacyAiResponse: "/api/reviews/ai-response",
  legacyPublish: "/api/reviews/publish",
} as const

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
