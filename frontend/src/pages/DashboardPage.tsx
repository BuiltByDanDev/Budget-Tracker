import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { api } from '@/api/client'
import { BarList, type BarListRow } from '@/components/charts/BarList'
import { LimitMeter } from '@/components/charts/LimitMeter'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatCents, formatDollars, formatPercent } from '@/lib/format'
import { IMPORTANCE_LABELS, IMPORTANCES } from '@/lib/labels'
import { addMonths, currentMonth, formatMonth } from '@/lib/months'
import { cn } from '@/lib/utils'

function DashboardPage() {
  const range = useQuery({ queryKey: ['data-range'], queryFn: api.dataRange })
  const [chosenMonth, setChosenMonth] = useState<string | null>(null)
  // Until the User picks one, show the latest Month that has Transactions.
  const month = chosenMonth ?? range.data?.last_month ?? currentMonth()

  const categories = useQuery({ queryKey: ['categories'], queryFn: api.listCategories })
  const report = useQuery({
    queryKey: ['monthly-report', month, month],
    queryFn: () => api.monthlyReport(month, month),
    enabled: range.isSuccess,
    placeholderData: keepPreviousData,
  })

  if (report.error) return <p className="text-sm text-destructive">{report.error.message}</p>
  if (!report.data || !categories.data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  if (range.data?.last_month == null) {
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

  const figures = report.data.months[0]
  const limit = report.data.spending_limit_cents

  // Categories with spending this Month, plus current ones that have a target.
  const categoryRows = categories.data
    .map((category) => ({
      category,
      spent:
        figures.by_category.find((entry) => entry.category_id === category.id)
          ?.spending_cents ?? 0,
    }))
    .filter(
      ({ category, spent }) =>
        spent !== 0 || (category.monthly_target_cents != null && !category.retired),
    )
    .sort((a, b) => b.spent - a.spent)
    .map(
      ({ category, spent }): BarListRow => ({
        key: String(category.id),
        label: category.name,
        valueCents: spent,
        targetCents: category.monthly_target_cents,
      }),
    )

  const toReviewCents =
    figures.by_category.find((entry) => entry.category_id === null)?.spending_cents ?? 0

  const importanceRows: BarListRow[] = IMPORTANCES.map((importance) => ({
    key: importance,
    label: IMPORTANCE_LABELS[importance],
    valueCents:
      figures.by_importance.find((entry) => entry.importance === importance)
        ?.spending_cents ?? 0,
  }))

  return (
    <div className={cn('space-y-6', report.isPlaceholderData && 'opacity-60')}>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-xl font-semibold">{formatMonth(month)}</h1>
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => setChosenMonth(addMonths(month, -1))}
        >
          <ChevronLeft />
        </Button>
        <Input
          type="month"
          aria-label="Month"
          className="w-44"
          value={month}
          onChange={(event) => event.target.value && setChosenMonth(event.target.value)}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => setChosenMonth(addMonths(month, 1))}
        >
          <ChevronRight />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">Spending</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-5xl font-semibold">{formatDollars(figures.spending_cents)}</p>
            {limit != null ? (
              <LimitMeter spendingCents={figures.spending_cents} limitCents={limit} />
            ) : (
              <p className="text-sm text-muted-foreground">
                No spending limit set.{' '}
                <Link className="underline" to="/settings">
                  Set one
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">Income</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{formatDollars(figures.income_cents)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-normal text-muted-foreground">
                Savings rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">
                {figures.savings_rate === null ? '–' : formatPercent(figures.savings_rate)}
              </p>
              <p className="text-sm text-muted-foreground">
                {figures.savings_rate === null
                  ? 'No income this month'
                  : `${formatCents(figures.income_cents - figures.spending_cents)} left after spending`}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {toReviewCents !== 0 && (
        <p className="text-sm text-muted-foreground">
          {formatCents(toReviewCents)} of this month's spending has no category yet.{' '}
          <Link className="underline" to="/review">
            Review
          </Link>
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryRows.length > 0 ? (
              <BarList rows={categoryRows} />
            ) : (
              <p className="text-sm text-muted-foreground">No categorised spending this month.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Spending by importance</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList rows={importanceRows} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default DashboardPage
