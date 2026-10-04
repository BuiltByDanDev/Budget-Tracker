import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '@/api/client'
import { CategoryHeatmap } from '@/components/charts/CategoryHeatmap'
import { MonthlyChart } from '@/components/charts/MonthlyChart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCents, formatDollars, formatPercent } from '@/lib/format'
import { IMPORTANCE_LABELS, IMPORTANCES } from '@/lib/labels'
import { addMonths, currentMonth, formatMonth, monthsBetween } from '@/lib/months'
import { cn } from '@/lib/utils'

const RANGES = [
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
  { value: 'all', label: 'All time' },
]

function TrendsPage() {
  const [range, setRange] = useState('12')
  const dataRange = useQuery({ queryKey: ['data-range'], queryFn: api.dataRange })
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.listCategories })

  // Ranges end at the latest Month that has Transactions.
  const lastMonth = dataRange.data?.last_month ?? currentMonth()
  const firstDataMonth = dataRange.data?.first_month ?? lastMonth
  const rangeStart = range === 'all' ? firstDataMonth : addMonths(lastMonth, 1 - Number(range))
  // Never start before the first Month that has Transactions.
  const firstMonth = rangeStart < firstDataMonth ? firstDataMonth : rangeStart

  const report = useQuery({
    queryKey: ['monthly-report', firstMonth, lastMonth],
    queryFn: () => api.monthlyReport(firstMonth, lastMonth),
    enabled: dataRange.isSuccess,
    placeholderData: keepPreviousData,
  })

  if (report.error) return <p className="text-sm text-destructive">{report.error.message}</p>
  if (!report.data || !categories.data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  const months = report.data.months
  const limit = report.data.spending_limit_cents
  const importanceSpending = (index: number, importance: string) =>
    months[index].by_importance.find((entry) => entry.importance === importance)
      ?.spending_cents ?? 0
  const highestImportance = Math.max(
    0,
    ...months.flatMap((_, index) => IMPORTANCES.map((i) => importanceSpending(index, i))),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Trends</h1>
          <p className="text-sm text-muted-foreground">
            {formatMonth(firstMonth)} to {formatMonth(lastMonth)} (
            {monthsBetween(firstMonth, lastMonth)} months)
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="range">Range</Label>
          <NativeSelect id="range" value={range} onChange={(event) => setRange(event.target.value)}>
            {RANGES.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className={cn('space-y-6', report.isPlaceholderData && 'opacity-60')}>
        <Card>
          <CardHeader>
            <CardTitle>Spending per month</CardTitle>
            <CardDescription>
              {limit == null
                ? 'Set a spending limit in Settings to see it here.'
                : `The line marks your ${formatDollars(limit)} spending limit.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyChart
              name="Spending"
              form="columns"
              points={months.map((m) => ({ month: m.month, value: m.spending_cents }))}
              formatValue={formatDollars}
              reference={
                limit != null ? { value: limit, label: 'Limit' } : undefined
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Savings rate per month</CardTitle>
            <CardDescription>The share of pay left after spending.</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyChart
              name="Savings rate"
              form="line"
              points={months.map((m) => ({ month: m.month, value: m.savings_rate }))}
              formatValue={formatPercent}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending by importance</CardTitle>
            <CardDescription>All four charts share one scale.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 sm:grid-cols-2">
            {IMPORTANCES.map((importance) => (
              <div key={importance}>
                <h3 className="mb-2 text-sm font-medium">{IMPORTANCE_LABELS[importance]}</h3>
                <MonthlyChart
                  name={IMPORTANCE_LABELS[importance]}
                  form="columns"
                  height={160}
                  maxValue={highestImportance}
                  points={months.map((m, index) => ({
                    month: m.month,
                    value: importanceSpending(index, importance),
                  }))}
                  formatValue={formatDollars}
                />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>
              Darker means more. A category's monthly target is shown beside its name, and a
              warning sign marks months over it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryHeatmap months={months} categories={categories.data} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly figures</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Spending</TableHead>
                  <TableHead className="text-right">Pay</TableHead>
                  <TableHead className="text-right">Other income</TableHead>
                  <TableHead className="text-right">Savings rate</TableHead>
                  {limit != null && <TableHead className="text-right">Against limit</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...months].reverse().map((m) => (
                  <TableRow key={m.month}>
                    <TableCell>{formatMonth(m.month)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(m.spending_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(m.pay_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCents(m.other_income_cents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.savings_rate === null ? '–' : formatPercent(m.savings_rate)}
                    </TableCell>
                    {limit != null && (
                      <TableCell className="text-right tabular-nums">
                        {m.spending_cents > limit
                          ? `Over by ${formatCents(m.spending_cents - limit)}`
                          : `Under by ${formatCents(limit - m.spending_cents)}`}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default TrendsPage
