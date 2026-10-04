import type { Importance, Kind } from '@/api/client'

/** What a Transaction is classified as, or what a Rule sets, as form fields. */
export type ClassificationValue = {
  kind: Kind
  categoryId: number | null
  importance: Importance | null
  merchantName: string
}

/** Only an Expense has a Category and an Importance. */
export function isComplete(value: ClassificationValue): boolean {
  return (
    value.kind !== 'expense' || (value.categoryId !== null && value.importance !== null)
  )
}
