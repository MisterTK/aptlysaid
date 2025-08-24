/**
 * Sets up Google Cloud credentials from environment variables
 * This is needed for Vercel deployments where we can't use a credentials file
 */
export function setupGoogleCloudCredentials() {
  // Check if running in Vercel
  if (process.env.VERCEL && process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
    try {
      // Parse the credentials from environment variable
      const credentials = JSON.parse(
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON,
      )

      // Set up environment variables that Google Cloud SDK expects
      process.env.GOOGLE_CLOUD_PROJECT = credentials.project_id

      // For Vertex AI, we need to use ADC (Application Default Credentials)
      // In Vercel, we'll use the @google-cloud libraries which can accept credentials directly
      return credentials
    } catch (error) {
      console.error("Failed to parse Google Cloud credentials:", error)
      throw new Error(
        "Invalid GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable",
      )
    }
  }

  // In development or if using a file path
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    // Credentials will be loaded from file automatically by Google SDK
    return null
  }

  // No credentials configured
  console.warn(
    "No Google Cloud credentials configured. Vertex AI features will not work.",
  )
  return null
}
