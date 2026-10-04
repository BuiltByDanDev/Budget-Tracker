import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type Transaction } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseDollars } from '@/lib/format'

/** Lets the User settle an Unconverted Amount: enter the converted value, or keep it. */
export function UnconvertedAmountForm({ transaction }: { transaction: Transaction }) {
  const queryClient = useQueryClient()
  const written = (Math.abs(transaction.imported_amount_cents) / 100).toFixed(2)
  const [text, setText] = useState(written)

  const cents = parseDollars(text)
  const valid = cents !== null && !Number.isNaN(cents) && cents >= 0
  // The User types a plain amount; money out stays money out.
  const sign = transaction.imported_amount_cents < 0 ? -1 : 1

  const settle = useMutation({
    mutationFn: (amountCents: number) => api.setAmount(transaction.id, amountCents),
    onSuccess: () => queryClient.invalidateQueries(),
  })

  return (
    <form
      className="space-y-3 rounded-lg border bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (valid) settle.mutate(sign * cents)
      }}
    >
      <p className="text-sm">
        <span className="font-medium">This amount is in another currency.</span>{' '}
        <span className="text-muted-foreground">
          Your file had no amount in the main column for this row, so {written} from the
          second column is being counted as written. Enter what it came to in your own
          currency, or keep it as it is.
        </span>
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`converted-${transaction.id}`}>Amount in your currency</Label>
          <Input
            id={`converted-${transaction.id}`}
            inputMode="decimal"
            className="w-36 text-right tabular-nums"
            aria-invalid={!valid}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" disabled={!valid || settle.isPending}>
          Use this amount
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={settle.isPending}
          onClick={() => settle.mutate(transaction.imported_amount_cents)}
        >
          Keep {written}
        </Button>
      </div>
      {settle.error && <p className="text-sm text-destructive">{settle.error.message}</p>}
    </form>
  )
}
