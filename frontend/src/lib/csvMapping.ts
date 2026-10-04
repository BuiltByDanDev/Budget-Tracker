import type { CsvMapping } from '@/api/client'

function findColumn(header: string[], words: string[]): number | null {
  const index = header.findIndex((cell) =>
    words.some((word) => cell.toLowerCase().includes(word)),
  )
  return index === -1 ? null : index
}

function looksLikeHeader(row: string[]): boolean {
  return row.every((cell) => !/\d/.test(cell))
}

/** A first guess at the mapping from the file's first row, for the User to correct. */
export function guessMapping(rows: string[][]): CsvMapping {
  const first = rows[0] ?? []
  const hasHeader = looksLikeHeader(first)
  const header = hasHeader ? first : []
  const moneyOut = findColumn(header, ['debit', 'withdraw', 'money out'])
  const moneyIn = findColumn(header, ['credit', 'deposit', 'money in'])
  const split = moneyOut !== null && moneyIn !== null
  return {
    has_header: hasHeader,
    date_column: findColumn(header, ['date']) ?? 0,
    date_format: '%Y-%m-%d',
    description_columns: [
      findColumn(header, ['description', 'memo', 'payee', 'details']) ?? 1,
    ],
    amount_mode: split ? 'split' : 'single',
    amount_column: findColumn(header, ['amount']) ?? 2,
    money_out_is_negative: true,
    money_out_column: moneyOut,
    money_in_column: moneyIn,
  }
}

export function mappingIsComplete(mapping: CsvMapping): boolean {
  if (mapping.description_columns.length === 0) return false
  return mapping.amount_mode === 'single'
    ? mapping.amount_column !== null
    : mapping.money_out_column !== null && mapping.money_in_column !== null
}
