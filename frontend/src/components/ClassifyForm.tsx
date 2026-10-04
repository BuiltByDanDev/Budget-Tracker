import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type ClassifyResult, type Transaction } from '@/api/client'
import { ClassificationFields } from '@/components/ClassificationFields'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import { type ClassificationValue, isComplete } from '@/lib/classification'
import { formatCents, parseDollars } from '@/lib/format'
import { suggestMatchText } from '@/lib/labels'

// Which amounts a new Rule applies to.
type RuleAmount = 'any' | 'exact' | 'between'

type Props = {
  transaction: Transaction
  onSaved: (result: ClassifyResult) => void
  onCancel?: () => void
}

/** Lets the User classify one Transaction and optionally save a Rule from it. */
export function ClassifyForm({ transaction, onSaved, onCancel }: Props) {
  const queryClient = useQueryClient()
  const [fields, setFields] = useState<ClassificationValue>({
    kind: transaction.kind,
    categoryId: transaction.category_id,
    importance: transaction.importance,
    merchantName: transaction.merchant_name ?? '',
  })
  const [makeRule, setMakeRule] = useState(false)
  const [matchText, setMatchText] = useState(() =>
    suggestMatchText(transaction.description),
  )

  // The User types amounts without a sign; money out or in comes from the Transaction.
  const size = Math.abs(transaction.amount_cents)
  const [ruleAmount, setRuleAmount] = useState<RuleAmount>('any')
  const [lowText, setLowText] = useState((size / 100).toFixed(2))
  const [highText, setHighText] = useState((size / 100).toFixed(2))

  const low = ruleAmount === 'between' ? parseDollars(lowText) : size
  const high = ruleAmount === 'between' ? parseDollars(highText) : size
  const rangeIsValid =
    low !== null && high !== null && low >= 0 && low <= size && size <= high
  // Signed like amount_cents: for money out the larger figure is the minimum.
  const moneyOut = transaction.amount_cents < 0
  const amountRange =
    makeRule && ruleAmount !== 'any' && rangeIsValid
      ? { min: moneyOut ? -high : low, max: moneyOut ? -low : high }
      : null

  const save = useMutation({
    mutationFn: () =>
      api.classify(transaction.id, {
        kind: fields.kind,
        category_id: fields.kind === 'expense' ? fields.categoryId : null,
        importance: fields.kind === 'expense' ? fields.importance : null,
        merchant_name: fields.merchantName.trim() || null,
        rule_match_text: makeRule ? matchText : null,
        rule_amount_min_cents: amountRange?.min ?? null,
        rule_amount_max_cents: amountRange?.max ?? null,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      onSaved(result)
    },
  })

  const complete =
    isComplete(fields) && (!makeRule || ruleAmount === 'any' || rangeIsValid)
  const id = (name: string) => `${name}-${transaction.id}`

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <ClassificationFields
        idSuffix={transaction.id}
        value={fields}
        onChange={setFields}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={makeRule} onCheckedChange={setMakeRule} />
          Always do this when the description contains
        </Label>
        <Input
          aria-label="Rule text"
          className="w-64"
          disabled={!makeRule}
          value={matchText}
          onChange={(event) => setMatchText(event.target.value)}
        />
      </div>

      {makeRule && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pl-6 text-sm">
          <Label htmlFor={id('rule-amount')} className="font-normal">
            and the amount is
          </Label>
          <NativeSelect
            id={id('rule-amount')}
            value={ruleAmount}
            onChange={(event) => setRuleAmount(event.target.value as RuleAmount)}
          >
            <NativeSelectOption value="any">any amount</NativeSelectOption>
            <NativeSelectOption value="exact">
              exactly {formatCents(size)}
            </NativeSelectOption>
            <NativeSelectOption value="between">between</NativeSelectOption>
          </NativeSelect>
          {ruleAmount === 'between' && (
            <>
              <Input
                aria-label="Lowest amount"
                className="w-28 text-right tabular-nums"
                inputMode="decimal"
                aria-invalid={!rangeIsValid}
                value={lowText}
                onChange={(event) => setLowText(event.target.value)}
              />
              <span>and</span>
              <Input
                aria-label="Highest amount"
                className="w-28 text-right tabular-nums"
                inputMode="decimal"
                aria-invalid={!rangeIsValid}
                value={highText}
                onChange={(event) => setHighText(event.target.value)}
              />
              {!rangeIsValid && (
                <span className="text-destructive">
                  The range has to include this transaction's {formatCents(size)}.
                </span>
              )}
            </>
          )}
        </div>
      )}

      {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={!complete || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
