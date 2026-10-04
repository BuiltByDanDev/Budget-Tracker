import { TriangleAlert } from 'lucide-react'
import { formatCents, formatDollars } from '@/lib/format'

/** A Month's Spending against the Spending Limit. */
export function LimitMeter({ spendingCents, limitCents }: { spendingCents: number; limitCents: number }) {
  const over = spendingCents > limitCents
  const filled = limitCents > 0 ? Math.min(1, Math.max(0, spendingCents / limitCents)) : 1

  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full"
        style={{ background: over ? 'var(--viz-critical-track)' : 'var(--viz-track)' }}
        role="meter"
        aria-label="Spending against the spending limit"
        aria-valuemin={0}
        aria-valuemax={limitCents}
        aria-valuenow={Math.max(0, spendingCents)}
        aria-valuetext={`${formatCents(spendingCents)} of ${formatCents(limitCents)}`}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${filled * 100}%`,
            background: over ? 'var(--viz-critical)' : 'var(--viz-series)',
          }}
        />
      </div>
      <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground">
        {over ? (
          <>
            <TriangleAlert className="size-4 text-(--viz-critical)" aria-hidden="true" />
            <span className="text-foreground">
              Over the {formatDollars(limitCents)} limit by{' '}
              {formatCents(spendingCents - limitCents)}
            </span>
          </>
        ) : (
          <>
            {formatCents(limitCents - spendingCents)} left of the {formatDollars(limitCents)}{' '}
            limit
          </>
        )}
      </p>
    </div>
  )
}
