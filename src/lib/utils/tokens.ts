import { randomBytes } from "crypto"

export function generateInvitationToken(): string {
  return randomBytes(32).toString("hex")
}

export function generateShortToken(): string {
  return randomBytes(16).toString("hex")
}
