import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import {
  api,
  type ClassifyResult,
  type Importance,
  type Kind,
  type Transaction,
} from '@/api/client'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import { formatCents, parseDollars } from '@/lib/format'
import {
  IMPORTANCE_HINTS,
  IMPORTANCE_LABELS,
  IMPORTANCES,
  KIND_LABELS,
  KINDS,
  suggestMatchText,
} from '@/lib/labels'

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
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.listCategories })
  const merchants = useQuery({ queryKey: ['merchants'], queryFn: api.listMerchants })

  const [kind, setKind] = useState<Kind>(transaction.kind)
  const [categoryId, setCategoryId] = useState<number | null>(transaction.category_id)
  const [importance, setImportance] = useState<Importance | null>(transaction.importance)
  const [merchantName, setMerchantName] = useState(transaction.merchant_name ?? '')
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
        kind,
        category_id: kind === 'expense' ? categoryId : null,
        importance: kind === 'expense' ? importance : null,
        merchant_name: merchantName.trim() || null,
        rule_match_text: makeRule ? matchText : null,
        rule_amount_min_cents: amountRange?.min ?? null,
        rule_amount_max_cents: amountRange?.max ?? null,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      onSaved(result)
    },
  })

  const classified = kind !== 'expense' || (categoryId !== null && importance !== null)
  const complete = classified && (!makeRule || ruleAmount === 'any' || rangeIsValid)
  const id = (name: string) => `${name}-${transaction.id}`

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={id('kind')}>Kind</Label>
          <NativeSelect
            id={id('kind')}
            className="w-full"
            value={kind}
            onChange={(event) => setKind(event.target.value as Kind)}
          >
            {KINDS.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {KIND_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>

        {kind === 'expense' && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={id('category')}>Category</Label>
              <NativeSelect
                id={id('category')}
                className="w-full"
                value={categoryId ?? ''}
                onChange={(event) =>
                  setCategoryId(event.target.value ? Number(event.target.value) : null)
                }
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {categories.data
                  ?.filter((category) => !category.retired || category.id === categoryId)
                  .map((category) => (
                    <NativeSelectOption key={category.id} value={category.id}>
                      {category.name}
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id('importance')}>Importance</Label>
              <NativeSelect
                id={id('importance')}
                className="w-full"
                value={importance ?? ''}
                onChange={(event) =>
                  setImportance((event.target.value || null) as Importance | null)
                }
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {IMPORTANCES.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {IMPORTANCE_LABELS[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {importance && (
                <p className="text-xs text-muted-foreground">
                  {IMPORTANCE_HINTS[importance]}
                </p>
              )}
            </div>
          </>
        )}

        <div className="space-y-1.5">
          <Label htmlFor={id('merchant')}>Merchant (optional)</Label>
          <Input
            id={id('merchant')}
            list={id('merchants')}
            placeholder="e.g. Amazon"
            value={merchantName}
            onChange={(event) => setMerchantName(event.target.value)}
          />
          <datalist id={id('merchants')}>
            {merchants.data?.map((merchant) => (
              <option key={merchant.id} value={merchant.name} />
            ))}
          </datalist>
        </div>
      </div>

      {kind === 'transfer' && (
        <p className="text-sm text-muted-foreground">
          A transfer is money moved between your own accounts, such as a credit card
          payment. It is left out of spending and income.
        </p>
      )}

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
