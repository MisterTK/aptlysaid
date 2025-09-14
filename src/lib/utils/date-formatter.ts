interface DateFormatOptions {
  showTimezone?: boolean

  userTimezone?: string

  showAbsoluteTime?: boolean
}

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
    const reviewDate = new Date(dateString)

    if (isNaN(reviewDate.getTime())) {
      console.warn("Invalid date string:", dateString)
      return "Invalid date"
    }

    const now = new Date()

    const diffMs = now.getTime() - reviewDate.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor(diffMs / (1000 * 60))

    if (diffMs < 0) {
      return formatAbsoluteDate(reviewDate, userTimezone, showTimezone)
    }

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

    if (diffHours < 24) {
      return showAbsoluteTime
        ? `${diffHours} hour${diffHours === 1 ? "" : "s"} ago (${formatAbsoluteTime(reviewDate, userTimezone, showTimezone)})`
        : diffHours === 0
          ? "Today"
          : `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`
    }

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)

    if (isSameDay(reviewDate, yesterday)) {
      return showAbsoluteTime
        ? `Yesterday (${formatAbsoluteTime(reviewDate, userTimezone, showTimezone)})`
        : "Yesterday"
    }

    if (diffDays < 7) {
      return showAbsoluteTime
        ? `${diffDays} day${diffDays === 1 ? "" : "s"} ago (${formatAbsoluteTime(reviewDate, userTimezone, showTimezone)})`
        : `${diffDays} day${diffDays === 1 ? "" : "s"} ago`
    }

    if (diffDays < 30) {
      const weeks = Math.floor(diffDays / 7)
      return showAbsoluteTime
        ? `${weeks} week${weeks === 1 ? "" : "s"} ago (${formatAbsoluteDate(reviewDate, userTimezone, showTimezone)})`
        : `${weeks} week${weeks === 1 ? "" : "s"} ago`
    }

    if (diffDays < 365) {
      const months = Math.floor(diffDays / 30)
      return showAbsoluteTime
        ? `${months} month${months === 1 ? "" : "s"} ago (${formatAbsoluteDate(reviewDate, userTimezone, showTimezone)})`
        : `${months} month${months === 1 ? "" : "s"} ago`
    }

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

export function formatFullDateTime(
  date: Date,
  timezone?: string,
  showTimezone = true,
): string {
  try {
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

function isSameDay(date1: Date, date2: Date): boolean {
  return date1.toDateString() === date2.toDateString()
}

export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export function parseGoogleTimestamp(timestamp: string): Date {
  return new Date(timestamp)
}

export function formatDate(dateString: string): string {
  return formatReviewDate(dateString)
}
