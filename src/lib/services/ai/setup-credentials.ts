
export function setupGoogleCloudCredentials() {

  if (process.env.VERCEL && process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {

      const credentials = JSON.parse(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
      )

      process.env.GOOGLE_CLOUD_PROJECT = credentials.project_id

      return credentials
    } catch (error) {
      console.error("Failed to parse Google Cloud credentials:", error)
      throw new Error(
        "Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable",
      )
    }
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {

    return null
  }

  console.warn(
    "No Google Cloud credentials configured. Vertex AI features will not work.",
  )
  return null
}
