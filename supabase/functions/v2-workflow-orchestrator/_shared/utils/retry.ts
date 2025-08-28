// Retry configuration and utilities
export const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
}
export async function retryWithBackoff(
  operation,
  operationName,
  config = RETRY_CONFIG,
) {
  let lastError
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      // Don't retry on client errors (4xx)
      if (
        error &&
        typeof error === "object" &&
        "status" in error &&
        typeof error.status === "number" &&
        error.status >= 400 &&
        error.status < 500
      ) {
        throw error
      }
      if (attempt < config.maxRetries) {
        const delay = Math.min(
          config.initialDelay * Math.pow(config.backoffFactor, attempt - 1),
          config.maxDelay,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }
  }
  throw lastError
}
