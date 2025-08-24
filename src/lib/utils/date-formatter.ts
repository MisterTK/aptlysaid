/**
 * Enhanced date formatting utility for reviews with timezone support
 */

interface DateFormatOptions {
  /** Show timezone information */
  showTimezone?: boolean
  /** User's timezone (optional, defaults to browser timezone) */
  userTimezone?: string
  /** Show absolute time for recent dates */
  showAbsoluteTime?: boolean
}

/**
 * Format a date string with proper timezone handling and relative time display
 */
export function formatReviewDate(
  dateString: string,
  options: DateFormatOptions = {},
): string {
  const {
    showTimezone = false,
    userTimezone,
    showAbsoluteTime = false,
  } = options

  try {
    // Parse the date (handles both ISO strings and timestamp formats)
    const reviewDate = new Date(dateString)

    // Validate the parsed date
    if (isNaN(reviewDate.getTime())) {
      console.warn("Invalid date string:", dateString)
      return "Invalid date"
    }

    const now = new Date()

    // Calculate the difference in milliseconds
    const diffMs = now.getTime() - reviewDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor(diffMs / (1000 * 60))

    // Handle future dates (edge case)
    if (diffMs < 0) {
      return formatAbsoluteDate(reviewDate, userTimezone, showTimezone)
    }

    // Recent time formatting
    if (diffMinutes < 1) {
      return showAbsoluteTime
        ? `Just now (${formatAbsoluteTime(reviewDate, userTimezone, showTimezone)})`
        : "Just now"
    }

    if (diffMinutes < 60) {
      return showAbsoluteTime
        ? `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago (${formatAbsoluteTime(reviewDate, userTimezone, showTimezone)})`
        : `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`
    }

    // If less than 24 hours, show hours regardless of day boundary
    if (diffHours < 24) {
      return showAbsoluteTime
        ? `${diffHours} hour${diffHours === 1 ? "" : "s"} ago (${formatAbsoluteTime(reviewDate, userTimezone, showTimezone)})`
        : diffHours === 0
          ? "Today"
          : `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
    }

    // Yesterday check (for dates 24+ hours ago on the previous calendar day)
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)

    if (isSameDay(reviewDate, yesterday)) {
      return showAbsoluteTime
        ? `Yesterday (${formatAbsoluteTime(reviewDate, userTimezone, showTimezone)})`
        : "Yesterday"
    }

    // Same week
    if (diffDays < 7) {
      return showAbsoluteTime
        ? `${diffDays} day${diffDays === 1 ? "" : "s"} ago (${formatAbsoluteTime(reviewDate, userTimezone, showTimezone)})`
        : `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
    }

    // Same month (approximately)
    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7)
      return showAbsoluteTime
        ? `${weeks} week${weeks === 1 ? "" : "s"} ago (${formatAbsoluteDate(reviewDate, userTimezone, showTimezone)})`
        : `${weeks} week${weeks === 1 ? "" : "s"} ago`
    }

    // Same year (approximately)
    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30)
      return showAbsoluteTime
        ? `${months} month${months === 1 ? "" : "s"} ago (${formatAbsoluteDate(reviewDate, userTimezone, showTimezone)})`
        : `${months} month${months === 1 ? "" : "s"} ago`
    }

    // Over a year ago
    const years = Math.floor(diffDays / 365)
    return showAbsoluteTime
      ? `${years} year${years === 1 ? "" : "s"} ago (${formatAbsoluteDate(reviewDate, userTimezone, showTimezone)})`
      : `${years} year${years === 1 ? "" : "s"} ago`
  } catch (error) {
    console.warn(
      "Error formatting review date:",
      error,
      "dateString:",
      dateString,
    )
    return "Invalid date"
  }
}

/**
 * Format absolute date with timezone support
 */
export function formatAbsoluteDate(
  date: Date,
  timezone?: string,
  showTimezone = false,
): string {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }

  if (showTimezone) {
    options.timeZoneName = "short"
  }

  return date.toLocaleDateString("en-US", options)
}

/**
 * Format absolute time with timezone support
 */
export function formatAbsoluteTime(
  date: Date,
  timezone?: string,
  showTimezone = false,
): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }

  if (showTimezone) {
    options.timeZoneName = "short"
  }

  return date.toLocaleTimeString("en-US", options)
}

/**
 * Format full date and time with timezone support
 */
export function formatFullDateTime(
  date: Date,
  timezone?: string,
  showTimezone = true,
): string {
  try {
    // Validate the input date
    if (!date || isNaN(date.getTime())) {
      return "Invalid date"
    }

    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    }

    if (showTimezone) {
      options.timeZoneName = "short"
    }

    return date.toLocaleString("en-US", options)
  } catch (error) {
    console.warn("Error formatting date:", error)
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`
  }
}

/**
 * Check if two dates are on the same day (ignoring time)
 */
function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString()
}

/**
 * Get the user's timezone (browser detected)
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * Parse Google My Business timestamp (handles Z format)
 */
export function parseGoogleTimestamp(timestamp: string): Date {
  // Google returns timestamps like "2025-06-25T19:08:22.984336Z"
  return new Date(timestamp)
}

/**
 * Legacy compatibility - simple relative date formatter
 */
export function formatDate(dateString: string): string {
  return formatReviewDate(dateString)
}
