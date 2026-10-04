import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, type ClassifyResult } from '@/api/client'
import { TransactionTable } from '@/components/TransactionTable'

function ReviewPage() {
  const [lastResult, setLastResult] = useState<ClassifyResult | null>(null)
  const { data, error, isPending } = useQuery({
    queryKey: ['transactions', { needs_review: true }],
    queryFn: () => api.listTransactions({ needs_review: true, limit: 50 }),
    placeholderData: keepPreviousData,
  })

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Review</h1>
        <span className="text-sm text-muted-foreground">
          {data.total.toLocaleString()} to review
        </span>
      </div>

      {lastResult && lastResult.also_classified > 0 && (
        <p className="mb-4 text-sm text-muted-foreground" role="status">
          Saved. The rule also classified {lastResult.also_classified} other{' '}
          {lastResult.also_classified === 1 ? 'transaction' : 'transactions'}.
        </p>
      )}

      {data.total === 0 ? (
        <div className="py-16 text-center">
          <h2 className="text-lg font-medium">Nothing to review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every expense has a category.{' '}
            <Link className="underline" to="/import">
              Import another CSV
            </Link>
          </p>
        </div>
      ) : (
        <TransactionTable transactions={data.items} openFirst onSaved={setLastResult} />
      )}
    </div>
  )
}

export default ReviewPage
