// A Month is written "2026-03" everywhere in the UI and API.

export function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function addMonths(month: string, count: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + count, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function monthsBetween(first: string, last: string): number {
  const [firstYear, firstMonth] = first.split('-').map(Number)
  const [lastYear, lastMonth] = last.split('-').map(Number)
  return (lastYear - firstYear) * 12 + lastMonth - firstMonth + 1
}

const long = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})
const short = new Intl.DateTimeFormat(undefined, { month: 'short', timeZone: 'UTC' })
const shortWithYear = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
})

/** "March 2026" */
export function formatMonth(month: string): string {
  return long.format(new Date(`${month}-01T00:00:00Z`))
}

/** "Mar", or "Jan 26" for a January so the year change is visible on an axis. */
export function formatMonthShort(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`)
  return month.endsWith('-01') ? shortWithYear.format(date) : short.format(date)
}
