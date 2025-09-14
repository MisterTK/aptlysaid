import { createVertex } from "@ai-sdk/google-vertex"
import { setupGoogleCloudCredentials } from "./setup-credentials"

export interface VertexAIConfig {
  projectId?: string
  location?: string
  googleAuthOptions?: {
    credentials?: {
      client_email: string
      private_key: string
    }
    credentialsFilePath?: string
  }
}

export function createVertexAI(config: VertexAIConfig = {}) {
  const credentials = setupGoogleCloudCredentials()

  let googleAuthOptions = config.googleAuthOptions
  if (!googleAuthOptions && credentials) {
    googleAuthOptions = {
      credentials: {
        client_email: credentials.client_email,
        private_key: credentials.private_key,
      },
    }
  }

  const projectId =
    config.projectId ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    credentials?.project_id

  if (!projectId) {
    throw new Error(
      "Google Cloud Project ID is required. Set GOOGLE_CLOUD_PROJECT or provide projectId in config.",
    )
  }

  return createVertex({
    project: projectId,
    location:
      config.location || process.env.GOOGLE_CLOUD_LOCATION || "us-central1",
    googleAuthOptions,
  })
}

export const DEFAULT_LOCATION = "us-central1"

export {
  DEFAULT_MODEL,
  VERTEX_AI_MODELS,
  type VertexAIModel,
} from "./models-config"
