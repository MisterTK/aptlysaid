import { randomBytes } from "crypto"

/**
 * Generate a secure random token for invitations
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("hex")
}

/**
 * Generate a shorter token for internal use
 */
export function generateShortToken(): string {
  return randomBytes(16).toString("hex")
}
