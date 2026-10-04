import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { parseDollars } from '@/lib/format'

type Props = {
  valueCents: number | null
  // Called when the User leaves the field or presses Enter with a changed, valid amount.
  onCommit: (cents: number | null) => void
  placeholder?: string
  'aria-label'?: string
  id?: string
}

/** A dollar amount field. Blank means "none". */
export function MoneyInput({ valueCents, onCommit, ...props }: Props) {
  const saved = valueCents === null ? '' : (valueCents / 100).toFixed(2)
  // null while the field shows the saved value; text while the User is editing.
  const [draft, setDraft] = useState<string | null>(null)
  const parsed = draft === null ? valueCents : parseDollars(draft)
  const invalid = parsed !== null && (Number.isNaN(parsed) || parsed < 0)

  const commit = () => {
    if (draft === null || invalid) return
    if (parsed !== valueCents) onCommit(parsed)
    setDraft(null)
  }

  return (
    <Input
      {...props}
      inputMode="decimal"
      className="w-32 text-right tabular-nums"
      aria-invalid={invalid}
      value={draft ?? saved}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}
