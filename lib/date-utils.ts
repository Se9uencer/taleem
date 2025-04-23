/**
 * Formats a date string to display in Pacific Time (Los Angeles)
 */
export function formatDatePST(dateString: string, options: Intl.DateTimeFormatOptions = {}): string {
  const date = new Date(dateString)

  // Default options for date formatting
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  }

  return new Date(date).toLocaleString("en-US", defaultOptions)
}

/**
 * Formats a date string to display in Pacific Time (Los Angeles) with time
 */
export function formatDateTimePST(dateString: string): string {
  return formatDatePST(dateString, {
    hour: "numeric",
    minute: "numeric",
  })
}

/**
 * Checks if a date is in the past (in Pacific Time)
 */
export function isPastDuePST(dateString: string): boolean {
  const date = new Date(dateString)
  const now = new Date()

  // Convert both dates to PST for comparison
  const datePST = new Date(date.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
  const nowPST = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))

  return datePST < nowPST
}

/**
 * Gets the current date in PST as an ISO string
 */
export function getCurrentDatePST(): string {
  const now = new Date()
  const nowPST = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
  return nowPST.toISOString().split("T")[0]
}

/**
 * Gets tomorrow's date in PST as an ISO string
 */
export function getTomorrowDatePST(): string {
  const now = new Date()
  const nowPST = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }))
  nowPST.setDate(nowPST.getDate() + 1)
  return nowPST.toISOString().split("T")[0]
}
