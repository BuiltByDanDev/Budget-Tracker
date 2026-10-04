// Typed access to the Python API. Names follow CONTEXT.md.

export type CsvMapping = {
  has_header: boolean
  date_column: number
  date_format: string
  description_columns: number[]
  amount_mode: 'single' | 'split'
  amount_column: number | null
  // Used for a row whose amount column is empty (CAD$ / USD$ columns).
  fallback_amount_column: number | null
  money_out_is_negative: boolean
  money_out_column: number | null
  money_in_column: number | null
}

export type Account = {
  id: number
  name: string
  csv_mapping: CsvMapping | null
}

export type CsvPreview = {
  rows: string[][]
  total_rows: number
  // With a mapping: how the first rows would be read, or which rows cannot be.
  transactions: {
    posted_on: string
    description: string
    amount_cents: number
    unconverted: boolean
  }[]
  row_errors: RowError[]
  error_count: number
}

export type ImportSummary = {
  id: number
  filename: string
  new_count: number
  skipped_count: number
  // How many of the new Transactions are Unconverted Amounts.
  unconverted_count: number
}

export type Kind = 'expense' | 'income' | 'transfer'

export type Importance =
  | 'essential'
  | 'have_to_have'
  | 'nice_to_have'
  | 'shouldnt_have'

export type Transaction = {
  id: number
  posted_on: string
  amount_cents: number
  // The amount as read from the CSV, before any correction by the User.
  imported_amount_cents: number
  // Read from the CSV's other-currency column and not yet converted or kept.
  amount_unconverted: boolean
  description: string
  kind: Kind
  account_id: number
  account_name: string
  category_id: number | null
  category_name: string | null
  importance: Importance | null
  merchant_name: string | null
}

export type TransactionPage = {
  items: Transaction[]
  total: number
  // Totals over every Transaction matching the filters, not just this page.
  spending_cents: number
  income_cents: number
}

export type TransactionFilters = {
  date_from?: string
  date_to?: string
  account_id?: number
  category_id?: number
  importance?: Importance
  kind?: Kind
  search?: string
  needs_review?: boolean
  amount_unconverted?: boolean
  limit?: number
  offset?: number
}

export type Category = {
  id: number
  name: string
  monthly_target_cents: number | null
  retired: boolean
}

export type Merchant = { id: number; name: string }

export type Classification = {
  kind: Kind
  category_id: number | null
  importance: Importance | null
  merchant_name: string | null
  // When set, also saves a Rule for Descriptions containing this text.
  rule_match_text: string | null
}

export type ClassifyResult = {
  transaction: Transaction
  also_classified: number
}

export type MonthFigures = {
  // "2026-03"
  month: string
  spending_cents: number
  income_cents: number
  // The share of Income left after Spending; null in a Month with no Income.
  savings_rate: number | null
  // A null category_id holds Expenses still in the Review Inbox.
  by_category: { category_id: number | null; spending_cents: number }[]
  by_importance: { importance: Importance | null; spending_cents: number }[]
}

export type MonthlyReport = {
  months: MonthFigures[]
  spending_limit_cents: number | null
}

export type DataRange = {
  first_month: string | null
  last_month: string | null
}

export type Settings = { spending_limit_cents: number | null }

export type CategoryChanges = {
  name?: string
  monthly_target_cents?: number | null
  retired?: boolean
}

export type RowError = { line: number; message: string }

export class ApiError extends Error {
  status: number
  rowErrors: RowError[]

  constructor(status: number, message: string, rowErrors: RowError[] = []) {
    super(message)
    this.status = status
    this.rowErrors = rowErrors
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, init)
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail =
      typeof body?.detail === 'string'
        ? body.detail
        : `Request failed (${response.status})`
    throw new ApiError(response.status, detail, body?.row_errors ?? [])
  }
  return response.json()
}

function queryString(params: object): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) {
      query.set(key, String(value))
    }
  }
  return query.toString()
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

function upload(file: File, fields: Record<string, string> = {}): RequestInit {
  const form = new FormData()
  form.append('file', file)
  for (const [name, value] of Object.entries(fields)) form.append(name, value)
  return { method: 'POST', body: form }
}

export const api = {
  listAccounts: () => request<Account[]>('/accounts'),
  createAccount: (name: string) =>
    request<Account>('/accounts', json('POST', { name })),
  setCsvMapping: (accountId: number, mapping: CsvMapping) =>
    request<Account>(`/accounts/${accountId}/csv-mapping`, json('PUT', mapping)),
  previewCsv: (file: File, mapping?: CsvMapping) =>
    request<CsvPreview>(
      '/csv-preview',
      upload(file, mapping ? { mapping: JSON.stringify(mapping) } : {}),
    ),
  importCsv: (accountId: number, file: File) =>
    request<ImportSummary>(`/accounts/${accountId}/imports`, upload(file)),
  listTransactions: (filters: TransactionFilters) =>
    request<TransactionPage>(`/transactions?${queryString(filters)}`),
  classify: (transactionId: number, classification: Classification) =>
    request<ClassifyResult>(
      `/transactions/${transactionId}/classification`,
      json('PUT', classification),
    ),
  setAmount: (transactionId: number, amountCents: number) =>
    request<Transaction>(
      `/transactions/${transactionId}/amount`,
      json('PUT', { amount_cents: amountCents }),
    ),
  listCategories: () => request<Category[]>('/categories'),
  listMerchants: () => request<Merchant[]>('/merchants'),
  createCategory: (name: string) =>
    request<Category>('/categories', json('POST', { name })),
  changeCategory: (categoryId: number, changes: CategoryChanges) =>
    request<Category>(`/categories/${categoryId}`, json('PATCH', changes)),
  getSettings: () => request<Settings>('/settings'),
  changeSettings: (settings: Settings) =>
    request<Settings>('/settings', json('PUT', settings)),
  monthlyReport: (firstMonth: string, lastMonth: string) =>
    request<MonthlyReport>(
      `/reports/monthly?${queryString({ first_month: firstMonth, last_month: lastMonth })}`,
    ),
  dataRange: () => request<DataRange>('/reports/data-range'),
}
