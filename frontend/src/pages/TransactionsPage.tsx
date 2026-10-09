import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api, type Importance, type Kind, type TransactionFilters } from '@/api/client'
import { TransactionTable } from '@/components/TransactionTable'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import { formatCents } from '@/lib/format'
import { IMPORTANCE_LABELS, IMPORTANCES, KIND_LABELS, KINDS } from '@/lib/labels'
import {
  filtersFromParams,
  paramsFromFilters,
  type PageFilters,
} from '@/lib/transactionFilters'

const PAGE_SIZE = 50

function TransactionsPage() {
  // The filters live in the address (?category_id=3&date_from=...), so the
  // Dashboard can link to a filtered list and the back button returns to it.
  const [searchParams, setSearchParams] = useSearchParams()
  const filters = filtersFromParams(searchParams)
  const [page, setPage] = useState(0)

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.listAccounts })
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.listCategories })
  const { data, error, isPending } = useQuery({
    queryKey: ['transactions', filters, page],
    queryFn: () =>
      api.listTransactions({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const setFilters = (next: PageFilters) => {
    // replace: changing a filter should not add a step for the back button.
    setSearchParams(paramsFromFilters(next), { replace: true })
    setPage(0)
  }
  const setFilter = (changes: PageFilters) => setFilters({ ...filters, ...changes })
  const filtered = Object.values(filters).some((value) => value !== undefined && value !== '')

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  if (data.total === 0 && !filtered) {
    return (
      <div className="py-16 text-center">
        <h1 className="text-lg font-medium">No transactions yet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Import a CSV from one of your accounts to get started.
        </p>
        <Button className="mt-4" render={<Link to="/import" />}>
          Import a CSV
        </Button>
      </div>
    )
  }

  const pageCount = Math.ceil(data.total / PAGE_SIZE)

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Transactions</h1>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            className="w-48"
            placeholder="Description or merchant"
            value={filters.search ?? ''}
            onChange={(event) => setFilter({ search: event.target.value || undefined })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date-from">From</Label>
          <Input
            id="date-from"
            type="date"
            value={filters.date_from ?? ''}
            onChange={(event) => setFilter({ date_from: event.target.value || undefined })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date-to">To</Label>
          <Input
            id="date-to"
            type="date"
            value={filters.date_to ?? ''}
            onChange={(event) => setFilter({ date_to: event.target.value || undefined })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-account">Account</Label>
          <NativeSelect
            id="filter-account"
            value={filters.account_id ?? ''}
            onChange={(event) =>
              setFilter({ account_id: Number(event.target.value) || undefined })
            }
          >
            <NativeSelectOption value="">All</NativeSelectOption>
            {accounts.data?.map((account) => (
              <NativeSelectOption key={account.id} value={account.id}>
                {account.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-kind">Kind</Label>
          <NativeSelect
            id="filter-kind"
            value={filters.kind ?? ''}
            onChange={(event) =>
              setFilter({ kind: (event.target.value || undefined) as Kind | undefined })
            }
          >
            <NativeSelectOption value="">All</NativeSelectOption>
            {KINDS.map((kind) => (
              <NativeSelectOption key={kind} value={kind}>
                {KIND_LABELS[kind]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-money">Money</Label>
          <NativeSelect
            id="filter-money"
            value={filters.money ?? ''}
            onChange={(event) =>
              setFilter({
                money: (event.target.value || undefined) as TransactionFilters['money'],
              })
            }
          >
            <NativeSelectOption value="">In and out</NativeSelectOption>
            <NativeSelectOption value="in">Money in</NativeSelectOption>
            <NativeSelectOption value="out">Money out</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-category">Category</Label>
          <NativeSelect
            id="filter-category"
            value={filters.category_id ?? ''}
            onChange={(event) =>
              setFilter({ category_id: Number(event.target.value) || undefined })
            }
          >
            <NativeSelectOption value="">All</NativeSelectOption>
            {categories.data?.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>
                {category.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-importance">Importance</Label>
          <NativeSelect
            id="filter-importance"
            value={filters.importance ?? ''}
            onChange={(event) =>
              setFilter({
                importance: (event.target.value || undefined) as Importance | undefined,
              })
            }
          >
            <NativeSelectOption value="">All</NativeSelectOption>
            {IMPORTANCES.map((importance) => (
              <NativeSelectOption key={importance} value={importance}>
                {IMPORTANCE_LABELS[importance]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-amount">Amount</Label>
          <NativeSelect
            id="filter-amount"
            value={filters.amount_unconverted ? 'unconverted' : ''}
            onChange={(event) =>
              setFilter({ amount_unconverted: event.target.value ? true : undefined })
            }
          >
            <NativeSelectOption value="">All</NativeSelectOption>
            <NativeSelectOption value="unconverted">Other currency, not settled</NativeSelectOption>
          </NativeSelect>
        </div>
        {filtered && (
          <Button variant="ghost" onClick={() => setFilters({})}>
            Clear
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 md:grid-cols-4">
        <div>
          <dt className="text-sm text-muted-foreground">Spending</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {formatCents(data.spending_cents)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Pay</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {formatCents(data.pay_cents)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Other income</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {formatCents(data.other_income_cents)}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Transactions</dt>
          <dd className="text-xl font-semibold tabular-nums">
            {data.total.toLocaleString()}
          </dd>
        </div>
      </dl>

      {data.total === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No transactions match these filters.
        </p>
      ) : (
        <TransactionTable transactions={data.items} />
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">
            Page {page + 1} of {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

export default TransactionsPage
