import { TriangleAlert } from 'lucide-react'
import type { Category, MonthFigures } from '@/api/client'
import { formatDollars } from '@/lib/format'
import { formatMonthShort } from '@/lib/months'

const STEPS = 5
// The two darkest steps need light text.
const FIRST_DARK_STEP = 4

type Props = { months: MonthFigures[]; categories: Category[] }

/** Spending per Category per Month: darker means more. Every value is written in its cell. */
export function CategoryHeatmap({ months, categories }: Props) {
  const spent = (month: MonthFigures, categoryId: number | null) =>
    month.by_category.find((entry) => entry.category_id === categoryId)?.spending_cents ?? 0

  const rows: { id: number | null; name: string; target: number | null; total: number }[] = [
    ...categories.map((category) => ({
      id: category.id as number | null,
      name: category.name,
      target: category.monthly_target_cents,
      total: 0,
    })),
    { id: null, name: 'Needs review', target: null, total: 0 },
  ]
    .map((row) => ({
      ...row,
      total: months.reduce((sum, month) => sum + spent(month, row.id), 0),
    }))
    .filter((row) => row.total !== 0)
    .sort((a, b) => b.total - a.total)

  const highest = Math.max(1, ...rows.flatMap((row) => months.map((month) => spent(month, row.id))))

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No spending in these months.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0.5 text-sm">
        <thead>
          <tr>
            <th className="text-left font-medium text-muted-foreground">Category</th>
            {months.map((month) => (
              <th
                key={month.month}
                className="px-2 text-right font-medium whitespace-nowrap text-muted-foreground"
              >
                {formatMonthShort(month.month)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id ?? 'review'}>
              <th className="pr-3 text-left font-normal whitespace-nowrap">
                {row.name}
                {row.target != null && (
                  <span className="text-muted-foreground"> · {formatDollars(row.target)}</span>
                )}
              </th>
              {months.map((month) => {
                const cents = spent(month, row.id)
                const step = cents <= 0 ? 0 : Math.max(1, Math.ceil((cents / highest) * STEPS))
                const over = row.target != null && cents > row.target
                return (
                  <td
                    key={month.month}
                    className="rounded-[4px] px-2 py-1.5 text-right whitespace-nowrap tabular-nums"
                    style={
                      step === 0
                        ? undefined
                        : {
                            background: `var(--viz-heat-${step})`,
                            color: step >= FIRST_DARK_STEP ? '#ffffff' : '#0b0b0b',
                          }
                    }
                  >
                    {over && (
                      <TriangleAlert
                        className="mr-1 inline size-3.5 align-text-bottom"
                        aria-label="Over target"
                      />
                    )}
                    {cents === 0 ? <span className="text-muted-foreground">–</span> : formatDollars(cents)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
