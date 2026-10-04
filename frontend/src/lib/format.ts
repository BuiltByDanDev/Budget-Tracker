const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'CAD',
  currencyDisplay: 'narrowSymbol',
})

export function formatCents(cents: number): string {
  return money.format(cents / 100)
}

const day = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

/** Formats an ISO date ("2026-03-31") without shifting it across time zones. */
export function formatDate(isoDate: string): string {
  return day.format(new Date(`${isoDate}T00:00:00Z`))
}

const wholeDollars = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'CAD',
  currencyDisplay: 'narrowSymbol',
  maximumFractionDigits: 0,
})

/** For headline figures and chart axes, where cents are noise. */
export function formatDollars(cents: number): string {
  return wholeDollars.format(Math.round(cents / 100))
}

const percent = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 0,
})

export function formatPercent(ratio: number): string {
  return percent.format(ratio)
}

/** "1,234.50" or "$1234.5" -> 123450. Returns null for blank, NaN for nonsense. */
export function parseDollars(text: string): number | null {
  const cleaned = text.replace(/[$,\s]/g, '')
  if (cleaned === '') return null
  return Math.round(Number(cleaned) * 100)
}
