import type { CsvMapping } from '@/api/client'

export const DATE_FORMATS = [
  { value: '%Y-%m-%d', example: '2026-03-31', pattern: /^\d{4}-\d{1,2}-\d{1,2}$/ },
  { value: '%m/%d/%Y', example: '3/31/2026 (month first)', pattern: /^\d{1,2}\/\d{1,2}\/\d{4}$/ },
  { value: '%d/%m/%Y', example: '31/3/2026 (day first)', pattern: /^\d{1,2}\/\d{1,2}\/\d{4}$/ },
  { value: '%Y/%m/%d', example: '2026/03/31', pattern: /^\d{4}\/\d{1,2}\/\d{1,2}$/ },
  { value: '%m/%d/%y', example: '3/31/26', pattern: /^\d{1,2}\/\d{1,2}\/\d{2}$/ },
  { value: '%d-%b-%Y', example: '31-Mar-2026', pattern: /^\d{1,2}-[A-Za-z]{3}-\d{4}$/ },
  { value: '%b %d, %Y', example: 'Mar 31, 2026', pattern: /^[A-Za-z]{3} \d{1,2}, \d{4}$/ },
  { value: '%Y%m%d', example: '20260331', pattern: /^\d{8}$/ },
]

function findColumn(header: string[], words: string[]): number | null {
  const index = header.findIndex((cell) =>
    words.some((word) => cell.toLowerCase().includes(word)),
  )
  return index === -1 ? null : index
}

// A cell that is only a number, an amount or a date, such as "-25.00" or "9/2/2026".
const DATA_CELL = /^[-+$(]?\d[\d,./-]*\)?$/

/** A header row has titles in it and no amounts or dates. */
function looksLikeHeader(row: string[]): boolean {
  return row.every((cell) => !DATA_CELL.test(cell.trim()))
}

/** A first guess at the mapping from the file's first rows, for the User to correct. */
export function guessMapping(rows: string[][]): CsvMapping {
  const first = rows[0] ?? []
  const hasHeader = looksLikeHeader(first)
  const header = hasHeader ? first : []
  const firstData = rows[hasHeader ? 1 : 0] ?? []

  const dateColumn = findColumn(header, ['date']) ?? 0
  const sampleDate = (firstData[dateColumn] ?? '').trim()
  const dateFormat = DATE_FORMATS.find((format) => format.pattern.test(sampleDate))

  const moneyOut = findColumn(header, ['debit', 'withdraw', 'money out'])
  const moneyIn = findColumn(header, ['credit', 'deposit', 'money in'])
  const split = moneyOut !== null && moneyIn !== null

  // Banks that list each currency in its own column, such as "CAD$" and "USD$".
  const cad = findColumn(header, ['cad'])
  const usd = findColumn(header, ['usd'])

  return {
    has_header: hasHeader,
    date_column: dateColumn,
    date_format: dateFormat?.value ?? '%Y-%m-%d',
    description_columns: header
      .map((cell, index) => (/description|memo|payee|details/i.test(cell) ? index : -1))
      .filter((index) => index !== -1),
    amount_mode: split ? 'split' : 'single',
    amount_column: cad ?? findColumn(header, ['amount']) ?? usd,
    fallback_amount_column: cad !== null ? usd : null,
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
