import type Stripe from "stripe"

export interface StripeErrorInfo {
  type: string
  message: string
  userFriendlyMessage: string
  code?: string
  statusCode?: number
  shouldRetry: boolean
  logLevel: "error" | "warn" | "info"
}

export function handleStripeError(error: unknown): StripeErrorInfo {

  if (!error?.type?.startsWith?.("Stripe")) {
    return {
      type: "UnknownError",
      message: error.message || "Unknown error occurred",
      userFriendlyMessage: "An unexpected error occurred. Please try again.",
      shouldRetry: false,
      logLevel: "error",
    }
  }

  const stripeError = error as Stripe.StripeError

  switch (stripeError.type) {
    case "StripeCardError":
      return {
        type: stripeError.type,
        message: stripeError.message,
        userFriendlyMessage: getCardErrorMessage(stripeError),
        code: stripeError.code,
        shouldRetry: isRetryableCardError(stripeError.code),
        logLevel: "warn",
      }

    case "StripeRateLimitError":
      return {
        type: stripeError.type,
        message: stripeError.message,
        userFriendlyMessage:
          "Too many requests. Please wait a moment and try again.",
        shouldRetry: true,
        logLevel: "warn",
      }

    case "StripeInvalidRequestError":
      return {
        type: stripeError.type,
        message: stripeError.message,
        userFriendlyMessage:
          "Invalid request. Please check your information and try again.",
        code: stripeError.code,
        shouldRetry: false,
        logLevel: "error",
      }

    case "StripeAPIError":
      return {
        type: stripeError.type,
        message: stripeError.message,
        userFriendlyMessage:
          "Payment service temporarily unavailable. Please try again in a few minutes.",
        shouldRetry: true,
        logLevel: "error",
      }

    case "StripeConnectionError":
      return {
        type: stripeError.type,
        message: stripeError.message,
        userFriendlyMessage:
          "Network connection error. Please check your internet connection and try again.",
        shouldRetry: true,
        logLevel: "warn",
      }

    case "StripeAuthenticationError":
      return {
        type: stripeError.type,
        message: stripeError.message,
        userFriendlyMessage: "Authentication error. Please contact support.",
        shouldRetry: false,
        logLevel: "error",
      }

    case "StripePermissionError":
      return {
        type: stripeError.type,
        message: stripeError.message,
        userFriendlyMessage: "Permission denied. Please contact support.",
        shouldRetry: false,
        logLevel: "error",
      }

    case "StripeIdempotencyError":
      return {
        type: stripeError.type,
        message: stripeError.message,
        userFriendlyMessage:
          "Duplicate request detected. Please refresh and try again.",
        shouldRetry: false,
        logLevel: "warn",
      }

    default:
      return {
        type: stripeError.type || "StripeError",
        message: stripeError.message,
        userFriendlyMessage:
          "Payment processing error. Please try again or contact support.",
        shouldRetry: false,
        logLevel: "error",
      }
  }
}

function getCardErrorMessage(error: Stripe.StripeCardError): string {
  switch (error.code) {
    case "card_declined":
      return "Your card was declined. Please try a different payment method."

    case "expired_card":
      return "Your card has expired. Please use a different payment method."

    case "incorrect_cvc":
      return "Your card's security code is incorrect. Please check and try again."

    case "incorrect_number":
      return "Your card number is incorrect. Please check and try again."

    case "processing_error":
      return "An error occurred processing your card. Please try again."

    case "insufficient_funds":
      return "Your card has insufficient funds. Please try a different payment method."

    case "invalid_expiry_month":
    case "invalid_expiry_year":
      return "Your card's expiration date is invalid. Please check and try again."

    case "invalid_number":
      return "Your card number is invalid. Please check and try again."

    case "invalid_cvc":
      return "Your card's security code is invalid. Please check and try again."

    case "currency_not_supported":
      return "Your card's currency is not supported. Please use a different payment method."

    case "duplicate_transaction":
      return "A charge with identical amount and payment information was submitted very recently. Please try again in a few minutes."

    case "fraudulent":
      return "This payment was flagged as potentially fraudulent. Please contact your bank or try a different payment method."

    case "generic_decline":
      return "Your card was declined. Please contact your bank or try a different payment method."

    case "invalid_account":
      return "The card or account details are invalid. Please check your information."

    case "lost_card":
      return "Your card has been reported as lost. Please use a different payment method."

    case "merchant_blacklist":
      return "Your card cannot be used with this merchant. Please try a different payment method."

    case "new_account_information_available":
      return "Your card has updated information available. Please contact your bank."

    case "no_action_taken":
      return "The requested payment could not be completed. Please try again."

    case "not_permitted":
      return "This type of transaction is not permitted on your card. Please try a different payment method."

    case "pickup_card":
      return "Your card cannot be used. Please contact your bank or try a different payment method."

    case "pin_try_exceeded":
      return "Too many PIN attempts. Please contact your bank or try a different payment method."

    case "restricted_card":
      return "Your card has restrictions that prevent this payment. Please try a different payment method."

    case "revocation_of_all_authorizations":
      return "Your card authorizations have been revoked. Please contact your bank."

    case "revocation_of_authorization":
      return "This authorization has been revoked. Please try again or contact your bank."

    case "security_violation":
      return "A security violation was detected. Please contact your bank."

    case "service_not_allowed":
      return "This service is not allowed on your card. Please try a different payment method."

    case "stolen_card":
      return "Your card has been reported as stolen. Please contact your bank."

    case "stop_payment_order":
      return "A stop payment order is in place for this card. Please contact your bank."

    case "testmode_decline":
      return "Test card declined (test mode)."

    case "transaction_not_allowed":
      return "This transaction is not allowed on your card. Please try a different payment method."

    case "try_again_later":
      return "Your card issuer is temporarily unavailable. Please try again later."

    case "withdrawal_count_limit_exceeded":
      return "Your card has exceeded its withdrawal limit. Please try a different payment method."

    default:
      return (
        error.message ||
        "There was an issue with your payment method. Please try again or use a different card."
      )
  }
}

function isRetryableCardError(code?: string): boolean {
  const retryableCodes = [
    "processing_error",
    "try_again_later",
    "issuer_not_available",
    "temporary_hold",
  ]

  return code ? retryableCodes.includes(code) : false
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000,
): Promise<T> {
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      const errorInfo = handleStripeError(error)

      if (!errorInfo.shouldRetry || attempt === maxRetries) {
        throw error
      }

      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000

      console.warn(
        `Attempt ${attempt + 1} failed, retrying in ${delay}ms:`,
        errorInfo.message,
      )

      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}

export function logStripeError(
  error: unknown,
  context: Record<string, unknown> = {},
  customMessage?: string,
) {
  const errorInfo = handleStripeError(error)

  const logData = {
    message: customMessage || "Stripe error occurred",
    error: {
      type: errorInfo.type,
      message: errorInfo.message,
      code: errorInfo.code,
      shouldRetry: errorInfo.shouldRetry,
    },
    context,
    timestamp: new Date().toISOString(),
  }

  switch (errorInfo.logLevel) {
    case "error":
      console.error(logData)
      break
    case "warn":
      console.warn(logData)
      break
    case "info":
      console.info(logData)
      break
  }
}

export interface StripeOperationResult<T = unknown> {
  success: boolean
  data?: T
  error?: StripeErrorInfo
}

export function createStripeResult<T>(
  data?: T,
  error?: unknown,
): StripeOperationResult<T> {
  if (error) {
    return {
      success: false,
      error: handleStripeError(error),
    }
  }

  return {
    success: true,
    data,
  }
}
