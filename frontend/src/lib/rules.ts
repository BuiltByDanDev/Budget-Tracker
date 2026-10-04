import type { Rule } from '@/api/client'
import { formatCents, parseDollars } from '@/lib/format'

// Which amounts a Rule applies to, as the User chooses it in a form.
export type RuleAmountMode = 'any' | 'exact' | 'between'

/**
 * A Rule's amount condition as form fields. The User types amounts without a
 * sign and chooses money out or money in separately.
 */
export type RuleAmountFields = {
  mode: RuleAmountMode
  moneyOut: boolean
  // "exact" uses lowText only.
  lowText: string
  highText: string
}

type Range = { min: number | null; max: number | null }

export function ruleAmountFields(rule: Rule): RuleAmountFields {
  if (rule.amount_min_cents === null || rule.amount_max_cents === null) {
    return { mode: 'any', moneyOut: true, lowText: '', highText: '' }
  }
  const sizes = [Math.abs(rule.amount_min_cents), Math.abs(rule.amount_max_cents)]
  const low = Math.min(...sizes)
  const high = Math.max(...sizes)
  return {
    mode: low === high ? 'exact' : 'between',
    moneyOut: rule.amount_max_cents <= 0,
    lowText: (low / 100).toFixed(2),
    highText: (high / 100).toFixed(2),
  }
}

/** The signed range to send to the API, or null if the fields are not valid yet. */
export function ruleAmountRange(fields: RuleAmountFields): Range | null {
  if (fields.mode === 'any') return { min: null, max: null }
  const low = parseDollars(fields.lowText)
  const high = fields.mode === 'exact' ? low : parseDollars(fields.highText)
  // A comparison with NaN (nonsense text) is false, so this rejects it too.
  if (low === null || high === null || !(low >= 0 && low <= high)) return null
  // Signed like amount_cents: for money out the larger figure is the minimum.
  return fields.moneyOut ? { min: -high, max: -low } : { min: low, max: high }
}

/** "Any amount", "Exactly $62.00 out", "$40.00 to $150.00 out". */
export function describeRuleAmount(rule: Rule): string {
  const fields = ruleAmountFields(rule)
  if (fields.mode === 'any') return 'Any amount'
  const direction = fields.moneyOut ? 'out' : 'in'
  const low = formatCents(Math.round(Number(fields.lowText) * 100))
  if (fields.mode === 'exact') return `Exactly ${low} ${direction}`
  const high = formatCents(Math.round(Number(fields.highText) * 100))
  return `${low} to ${high} ${direction}`
}
