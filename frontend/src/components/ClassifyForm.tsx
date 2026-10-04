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
import {
  IMPORTANCE_HINTS,
  IMPORTANCE_LABELS,
  IMPORTANCES,
  KIND_LABELS,
  KINDS,
  suggestMatchText,
} from '@/lib/labels'

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

  const save = useMutation({
    mutationFn: () =>
      api.classify(transaction.id, {
        kind,
        category_id: kind === 'expense' ? categoryId : null,
        importance: kind === 'expense' ? importance : null,
        merchant_name: merchantName.trim() || null,
        rule_match_text: makeRule ? matchText : null,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      onSaved(result)
    },
  })

  const complete = kind !== 'expense' || (categoryId !== null && importance !== null)
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
