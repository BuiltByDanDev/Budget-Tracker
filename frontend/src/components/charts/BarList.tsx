import { ListFilter, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router'
import { formatCents, formatDollars } from '@/lib/format'

export type BarListRow = {
  key: string
  label: string
  valueCents: number
  // Draws a marker at this amount and flags the row when the value passes it.
  targetCents?: number | null
  // Where the Transactions behind this row are listed. Shows a filter icon
  // beside the label that goes there.
  transactionsTo?: string
}

/** Horizontal bars for comparing amounts, with the value written at the end of each row. */
export function BarList({ rows }: { rows: BarListRow[] }) {
  const scale = Math.max(1, ...rows.map((row) => Math.max(row.valueCents, row.targetCents ?? 0)))
  const share = (cents: number) => `${(Math.max(0, cents) / scale) * 100}%`

  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const over = row.targetCents != null && row.valueCents > row.targetCents
        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="flex items-center gap-1.5">
                {row.label}
                {row.transactionsTo && (
                  <Link
                    to={row.transactionsTo}
                    aria-label={`Show ${row.label} transactions`}
                    title="Show these transactions"
                    className="self-center rounded-sm text-muted-foreground hover:text-foreground"
                  >
                    <ListFilter className="size-3.5" aria-hidden="true" />
                  </Link>
                )}
              </span>
              <span className="tabular-nums">
                {formatCents(row.valueCents)}
                {row.targetCents != null && (
                  <span className="text-muted-foreground">
                    {' '}
                    of {formatDollars(row.targetCents)}
                  </span>
                )}
              </span>
            </div>
            <div className="relative mt-1 h-3">
              <div
                className="h-full min-w-px rounded-r-[4px] bg-(--viz-series)"
                style={{ width: share(row.valueCents) }}
              />
              {row.targetCents != null && (
                <div
                  className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-foreground"
                  style={{ left: share(row.targetCents) }}
                  aria-hidden="true"
                />
              )}
            </div>
            {over && (
              <p className="mt-1 flex items-center gap-1 text-xs">
                <TriangleAlert className="size-3.5 text-(--viz-critical)" aria-hidden="true" />
                Over target by {formatCents(row.valueCents - row.targetCents!)}
              </p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
