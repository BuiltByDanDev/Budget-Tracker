import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatMonth, formatMonthShort } from '@/lib/months'

export type MonthlyPoint = { month: string; value: number | null }

type Props = {
  points: MonthlyPoint[]
  // What the value is, for the tooltip: "Spending".
  name: string
  form: 'columns' | 'line'
  formatValue: (value: number) => string
  // Keeps several charts on one scale so they can be compared.
  maxValue?: number
  // A labelled horizontal line, such as the Spending Limit.
  reference?: { value: number; label: string }
  height?: number
}

/** Evenly spaced round tick values covering low to high: 0, 1,000, 2,000, ... */
function roundTicks(low: number, high: number, target = 4): number[] {
  const span = high - low || 1
  const magnitude = 10 ** Math.floor(Math.log10(span / target))
  const step =
    [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((s) => span / s <= target) ??
    10 * magnitude
  const ticks: number[] = []
  for (let tick = Math.floor(low / step) * step; tick < high + step; tick += step) {
    ticks.push(Number(tick.toPrecision(12)))
  }
  return ticks
}

const AXIS_TICK = { fill: 'var(--viz-muted)', fontSize: 12 }

/** One value per Month, as columns or a line. */
export function MonthlyChart({
  points,
  name,
  form,
  formatValue,
  maxValue,
  reference,
  height = 240,
}: Props) {
  const top = Math.max(maxValue ?? 0, reference?.value ?? 0)
  const values = points.flatMap((point) => (point.value === null ? [] : [point.value]))
  const ticks = roundTicks(Math.min(0, ...values), Math.max(top, ...values))

  const shared = (
    <>
      <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
      <XAxis
        dataKey="month"
        tickFormatter={formatMonthShort}
        tick={AXIS_TICK}
        tickLine={false}
        axisLine={{ stroke: 'var(--viz-axis)' }}
        minTickGap={12}
        padding={form === 'line' ? { left: 16, right: 16 } : undefined}
      />
      <YAxis
        domain={[ticks[0], ticks[ticks.length - 1]]}
        ticks={ticks}
        tickFormatter={formatValue}
        tick={{ ...AXIS_TICK, style: { fontVariantNumeric: 'tabular-nums' } }}
        tickLine={false}
        axisLine={false}
        width={64}
      />
      <Tooltip
        cursor={form === 'columns' ? { fill: 'var(--muted)' } : { stroke: 'var(--viz-axis)' }}
        content={({ active, payload }) => {
          const point = payload?.[0]?.payload as MonthlyPoint | undefined
          if (!active || !point || point.value === null) return null
          return (
            <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-sm">
              <div className="font-semibold tabular-nums">{formatValue(point.value)}</div>
              <div className="text-muted-foreground">
                {name}, {formatMonth(point.month)}
              </div>
            </div>
          )
        }}
      />
      {reference && (
        <ReferenceLine
          y={reference.value}
          stroke="var(--foreground)"
          strokeWidth={1}
          label={{
            value: reference.label,
            position: 'right',
            fill: 'var(--foreground)',
            fontSize: 12,
          }}
        />
      )}
    </>
  )

  // Room on the right for the reference line's label.
  const margin = { top: 16, right: reference ? 48 : 8, bottom: 0, left: 0 }

  return (
    <ResponsiveContainer width="100%" height={height}>
      {form === 'columns' ? (
        <BarChart data={points} margin={margin}>
          {shared}
          <Bar
            dataKey="value"
            fill="var(--viz-series)"
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        </BarChart>
      ) : (
        <LineChart data={points} margin={margin}>
          {shared}
          <ReferenceLine y={0} stroke="var(--viz-axis)" />
          <Line
            dataKey="value"
            stroke="var(--viz-series)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            dot={{ r: 4, fill: 'var(--viz-series)', stroke: 'var(--card)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: 'var(--viz-series)', stroke: 'var(--card)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      )}
    </ResponsiveContainer>
  )
}
