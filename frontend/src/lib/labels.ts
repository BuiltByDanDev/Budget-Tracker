import type { Importance, Kind } from '@/api/client'

export const KIND_LABELS: Record<Kind, string> = {
  expense: 'Expense',
  money_back: 'Money Back',
  pay: 'Pay',
  other_income: 'Other Income',
  transfer: 'Transfer',
}

// In order, from most to least necessary.
export const IMPORTANCE_LABELS: Record<Importance, string> = {
  essential: 'Essential',
  have_to_have: 'Have to Have',
  nice_to_have: 'Nice to Have',
  shouldnt_have: "Shouldn't Have",
}

export const IMPORTANCE_HINTS: Record<Importance, string> = {
  essential: 'Survival and legal obligations',
  have_to_have: 'Committed, or sorely missed if cut',
  nice_to_have: 'Chosen and enjoyed',
  shouldnt_have: 'Wish I had not',
}

export const KINDS = Object.keys(KIND_LABELS) as Kind[]
export const IMPORTANCES = Object.keys(IMPORTANCE_LABELS) as Importance[]

/**
 * The stable part of a bank Description, as a starting point for a Rule:
 * "AMZN Mktp CA*2K4L81" -> "AMZN Mktp", "NETFLIX.COM 4471" -> "NETFLIX.COM".
 */
export function suggestMatchText(description: string): string {
  const words = description.split(/\s+/)
  const stable: string[] = []
  for (const word of words) {
    if (/\d/.test(word)) break
    stable.push(word)
  }
  return stable.join(' ') || description
}
