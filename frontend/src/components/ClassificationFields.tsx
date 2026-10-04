import { useQuery } from '@tanstack/react-query'
import { api, type Importance, type Kind } from '@/api/client'
import type { ClassificationValue } from '@/lib/classification'
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
} from '@/lib/labels'

type Props = {
  // Makes the field ids unique when several forms are on one page.
  idSuffix: string | number
  value: ClassificationValue
  onChange: (value: ClassificationValue) => void
}

/** The Kind, Category, Importance and Merchant fields, shared by Transactions and Rules. */
export function ClassificationFields({ idSuffix, value, onChange }: Props) {
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.listCategories })
  const merchants = useQuery({ queryKey: ['merchants'], queryFn: api.listMerchants })
  const { kind, categoryId, importance, merchantName } = value
  const id = (name: string) => `${name}-${idSuffix}`

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor={id('kind')}>Kind</Label>
          <NativeSelect
            id={id('kind')}
            className="w-full"
            value={kind}
            onChange={(event) => onChange({ ...value, kind: event.target.value as Kind })}
          >
            {KINDS.map((option) => (
              <NativeSelectOption key={option} value={option}>
                {KIND_LABELS[option]}
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
                  onChange({
                    ...value,
                    categoryId: event.target.value ? Number(event.target.value) : null,
                  })
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
                  onChange({
                    ...value,
                    importance: (event.target.value || null) as Importance | null,
                  })
                }
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {IMPORTANCES.map((option) => (
                  <NativeSelectOption key={option} value={option}>
                    {IMPORTANCE_LABELS[option]}
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
            onChange={(event) => onChange({ ...value, merchantName: event.target.value })}
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
    </>
  )
}
