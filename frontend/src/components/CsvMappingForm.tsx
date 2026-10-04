import type { CsvMapping } from '@/api/client'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const DATE_FORMATS = [
  { value: '%Y-%m-%d', example: '2026-03-31' },
  { value: '%m/%d/%Y', example: '03/31/2026' },
  { value: '%d/%m/%Y', example: '31/03/2026' },
  { value: '%Y/%m/%d', example: '2026/03/31' },
  { value: '%m/%d/%y', example: '03/31/26' },
  { value: '%d-%b-%Y', example: '31-Mar-2026' },
  { value: '%b %d, %Y', example: 'Mar 31, 2026' },
  { value: '%Y%m%d', example: '20260331' },
]

type Props = {
  rows: string[][]
  mapping: CsvMapping
  onChange: (mapping: CsvMapping) => void
}

export function CsvMappingForm({ rows, mapping, onChange }: Props) {
  const columnCount = Math.max(...rows.map((row) => row.length))
  const columns = Array.from({ length: columnCount }, (_, index) => index)
  const columnName = (index: number) =>
    (mapping.has_header && rows[0]?.[index]) || `Column ${index + 1}`
  const bodyRows = mapping.has_header ? rows.slice(1) : rows

  const set = (changes: Partial<CsvMapping>) => onChange({ ...mapping, ...changes })

  const columnSelect = (
    id: string,
    value: number | null,
    onPick: (column: number) => void,
  ) => (
    <NativeSelect
      id={id}
      value={value ?? ''}
      onChange={(event) => onPick(Number(event.target.value))}
    >
      {value === null && <NativeSelectOption value="">Choose…</NativeSelectOption>}
      {columns.map((index) => (
        <NativeSelectOption key={index} value={index}>
          {columnName(index)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((index) => (
                <TableHead key={index}>{columnName(index)}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {bodyRows.slice(0, 5).map((row, rowIndex) => (
              <TableRow key={rowIndex}>
                {columns.map((index) => (
                  <TableCell key={index} className="whitespace-nowrap">
                    {row[index]}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Label className="flex items-center gap-2">
        <Checkbox
          checked={mapping.has_header}
          onCheckedChange={(checked) => set({ has_header: checked })}
        />
        The first row is a header
      </Label>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="date-column">Date column</Label>
          {columnSelect('date-column', mapping.date_column, (column) =>
            set({ date_column: column }),
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="date-format">Dates look like</Label>
          <NativeSelect
            id="date-format"
            value={mapping.date_format}
            onChange={(event) => set({ date_format: event.target.value })}
          >
            {DATE_FORMATS.map((format) => (
              <NativeSelectOption key={format.value} value={format.value}>
                {format.example}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Description column(s)</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {columns.map((index) => (
            <Label key={index} className="flex items-center gap-2 font-normal">
              <Checkbox
                checked={mapping.description_columns.includes(index)}
                onCheckedChange={(checked) =>
                  set({
                    description_columns: checked
                      ? [...mapping.description_columns, index].sort((a, b) => a - b)
                      : mapping.description_columns.filter((c) => c !== index),
                  })
                }
              />
              {columnName(index)}
            </Label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="amount-mode">Amounts are in</Label>
        <NativeSelect
          id="amount-mode"
          value={mapping.amount_mode}
          onChange={(event) =>
            set({ amount_mode: event.target.value as CsvMapping['amount_mode'] })
          }
        >
          <NativeSelectOption value="single">One column</NativeSelectOption>
          <NativeSelectOption value="split">
            Separate money out and money in columns
          </NativeSelectOption>
        </NativeSelect>
      </div>

      {mapping.amount_mode === 'single' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="amount-column">Amount column</Label>
            {columnSelect('amount-column', mapping.amount_column, (column) =>
              set({ amount_column: column }),
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount-sign">Money out is shown as</Label>
            <NativeSelect
              id="amount-sign"
              value={mapping.money_out_is_negative ? 'negative' : 'positive'}
              onChange={(event) =>
                set({ money_out_is_negative: event.target.value === 'negative' })
              }
            >
              <NativeSelectOption value="negative">
                Negative (-25.00)
              </NativeSelectOption>
              <NativeSelectOption value="positive">
                Positive (25.00), common on credit cards
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="money-out-column">Money out column</Label>
            {columnSelect('money-out-column', mapping.money_out_column, (column) =>
              set({ money_out_column: column }),
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="money-in-column">Money in column</Label>
            {columnSelect('money-in-column', mapping.money_in_column, (column) =>
              set({ money_in_column: column }),
            )}
          </div>
        </div>
      )}
    </div>
  )
}
