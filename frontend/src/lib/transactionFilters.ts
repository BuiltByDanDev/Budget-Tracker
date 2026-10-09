import type { Importance, Kind, TransactionFilters } from '@/api/client'
import { IMPORTANCES, KINDS } from '@/lib/labels'

// The filters the Transactions page keeps in its address, so that another page
// can link straight to a filtered list: /transactions?category_id=3&date_from=...
export type PageFilters = Pick<
  TransactionFilters,
  | 'search'
  | 'date_from'
  | 'date_to'
  | 'account_id'
  | 'category_id'
  | 'importance'
  | 'kind'
  | 'money'
  | 'amount_unconverted'
>

/** Reads the filters from the address, ignoring anything it does not recognise. */
export function filtersFromParams(params: URLSearchParams): PageFilters {
  const text = (name: string) => params.get(name) || undefined
  const whole = (name: string) => {
    const value = Number(params.get(name))
    return Number.isInteger(value) && value > 0 ? value : undefined
  }
  const oneOf = <T extends string>(name: string, allowed: readonly T[]) => {
    const value = params.get(name) as T | null
    return value !== null && allowed.includes(value) ? value : undefined
  }
  return {
    search: text('search'),
    date_from: text('date_from'),
    date_to: text('date_to'),
    account_id: whole('account_id'),
    category_id: whole('category_id'),
    importance: oneOf<Importance>('importance', IMPORTANCES),
    kind: oneOf<Kind>('kind', KINDS),
    money: oneOf('money', ['in', 'out'] as const),
    amount_unconverted: params.get('amount_unconverted') === 'true' ? true : undefined,
  }
}

/** The filters as address parameters, leaving out the ones that are not set. */
export function paramsFromFilters(filters: PageFilters): URLSearchParams {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(name, String(value))
  }
  return params
}

/** A link to the Transactions page with these filters applied. */
export function transactionsLink(filters: PageFilters): string {
  return `/transactions?${paramsFromFilters(filters)}`
}
