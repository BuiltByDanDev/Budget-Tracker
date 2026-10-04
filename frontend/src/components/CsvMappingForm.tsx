import type { ReactNode } from 'react'
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
import { DATE_FORMATS } from '@/lib/csvMapping'
import { cn } from '@/lib/utils'

type Props = {
  rows: string[][]
  mapping: CsvMapping
  onChange: (mapping: CsvMapping) => void
}

function Question({
  title,
  help,
  children,
}: {
  title: string
  help?: string
  children: ReactNode
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{title}</legend>
      {help && <p className="text-sm text-muted-foreground">{help}</p>}
      {children}
    </fieldset>
  )
}

function Choice({
  name,
  checked,
  onChoose,
  title,
  example,
}: {
  name: string
  checked: boolean
  onChoose: () => void
  title: string
  example: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm',
        checked && 'border-primary bg-muted/50',
      )}
    >
      <input
        type="radio"
        name={name}
        className="mt-0.5 accent-primary"
        checked={checked}
        onChange={onChoose}
      />
      <span>
        <span className="font-medium">{title}</span>
        <span className="block text-muted-foreground">{example}</span>
      </span>
    </label>
  )
}

/** Asks the User, in plain questions, how to read their bank's CSV. */
export function CsvMappingForm({ rows, mapping, onChange }: Props) {
  const columnCount = Math.max(...rows.map((row) => row.length))
  const columns = Array.from({ length: columnCount }, (_, index) => index)
  const bodyRows = mapping.has_header ? rows.slice(1) : rows

  const columnName = (index: number) =>
    (mapping.has_header && rows[0]?.[index]) || `Column ${index + 1}`
  // The first value found in a column, so the User can recognise it.
  const sample = (index: number) =>
    bodyRows.map((row) => row[index]?.trim()).find((cell) => cell) ?? ''
  const columnLabel = (index: number) =>
    sample(index) ? `${columnName(index)} (e.g. ${sample(index)})` : columnName(index)

  const set = (changes: Partial<CsvMapping>) => onChange({ ...mapping, ...changes })

  const columnSelect = (
    label: string,
    value: number | null,
    onPick: (column: number | null) => void,
    emptyOption = 'Choose…',
  ) => (
    <NativeSelect
      aria-label={label}
      value={value ?? ''}
      onChange={(event) => onPick(event.target.value === '' ? null : Number(event.target.value))}
    >
      <NativeSelectOption value="">{emptyOption}</NativeSelectOption>
      {columns.map((index) => (
        <NativeSelectOption key={index} value={index}>
          {columnLabel(index)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">
          The start of your file. Answer the questions below so each transaction's date,
          description and amount are read from the right columns.
        </p>
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
              {bodyRows.slice(0, 4).map((row, rowIndex) => (
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
        <Label className="mt-3 flex items-center gap-2 font-normal">
          <Checkbox
            checked={mapping.has_header}
            onCheckedChange={(checked) => set({ has_header: checked })}
          />
          The first row of the file is column titles, not a transaction
        </Label>
      </div>

      <Question title="1. Which column has the date?">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {columnSelect('Date column', mapping.date_column, (column) =>
            set({ date_column: column ?? 0 }),
          )}
          <span className="text-muted-foreground">written like</span>
          <NativeSelect
            aria-label="Date format"
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
      </Question>

      <Question
        title="2. Which column says what the transaction was?"
        help="The text your bank wrote, such as the shop's name. This is what you will see in your transaction list and what rules match on. If your bank spreads it over two columns, tick both and they are joined together."
      >
        <div className="grid gap-2 sm:grid-cols-2">
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
              <span className="truncate">{columnLabel(index)}</span>
            </Label>
          ))}
        </div>
      </Question>

      <Question title="3. How does this file show the amount of each transaction?">
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            name="amount-mode"
            checked={mapping.amount_mode === 'single'}
            onChoose={() => set({ amount_mode: 'single' })}
            title="In one column"
            example="Spending and money received are in the same column, e.g. -25.00 and 1,200.00."
          />
          <Choice
            name="amount-mode"
            checked={mapping.amount_mode === 'split'}
            onChoose={() => set({ amount_mode: 'split' })}
            title="In two columns"
            example="One column for money leaving the account and another for money arriving, e.g. Withdrawals and Deposits."
          />
        </div>
      </Question>

      {mapping.amount_mode === 'single' ? (
        <>
          <Question title="4. Which column has the amount?">
            {columnSelect('Amount column', mapping.amount_column, (column) =>
              set({ amount_column: column }),
            )}
            <div className="space-y-2 pt-2">
              <p className="text-sm text-muted-foreground">
                If that column is empty on some rows, read the amount from this column
                instead. Use it when your bank has a separate column per currency, such as
                CAD$ and USD$. Those transactions are imported with the amount as written
                and marked “Other currency”, so you can convert or keep each one later.
              </p>
              {columnSelect(
                'Second amount column',
                mapping.fallback_amount_column,
                (column) => set({ fallback_amount_column: column }),
                'No second column',
              )}
            </div>
          </Question>

          <Question
            title="5. What does a purchase look like in this file?"
            help="Find a row above where you spent money and look at its amount."
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice
                name="amount-sign"
                checked={mapping.money_out_is_negative}
                onChoose={() => set({ money_out_is_negative: true })}
                title="It has a minus sign"
                example="A $25 purchase is -25.00. Usual for chequing and savings accounts."
              />
              <Choice
                name="amount-sign"
                checked={!mapping.money_out_is_negative}
                onChoose={() => set({ money_out_is_negative: false })}
                title="It has no minus sign"
                example="A $25 purchase is 25.00, and payments or refunds are -25.00. Common on credit cards."
              />
            </div>
          </Question>
        </>
      ) : (
        <Question title="4. Which columns are they?">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <p className="text-sm">Money leaving the account</p>
              {columnSelect('Money out column', mapping.money_out_column, (column) =>
                set({ money_out_column: column }),
              )}
            </div>
            <div className="space-y-1.5">
              <p className="text-sm">Money arriving in the account</p>
              {columnSelect('Money in column', mapping.money_in_column, (column) =>
                set({ money_in_column: column }),
              )}
            </div>
          </div>
        </Question>
      )}
    </div>
  )
}
