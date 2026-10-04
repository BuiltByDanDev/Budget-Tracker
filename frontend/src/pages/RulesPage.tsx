import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { Link } from 'react-router'
import { api, type Rule } from '@/api/client'
import { ClassificationFields } from '@/components/ClassificationFields'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { type ClassificationValue, isComplete } from '@/lib/classification'
import { formatCents, formatDate } from '@/lib/format'
import { IMPORTANCE_LABELS, KIND_LABELS } from '@/lib/labels'
import {
  describeRuleAmount,
  type RuleAmountFields,
  type RuleAmountMode,
  ruleAmountFields,
  ruleAmountRange,
} from '@/lib/rules'
import { cn } from '@/lib/utils'

// How many of a Rule's Transactions are shown before "Show all".
const SUBSET = 5
// The most the API returns in one request.
const MOST = 200

function changedMessage(changed: number): string {
  if (changed === 0) return 'No transactions changed.'
  return `${changed} ${changed === 1 ? 'transaction' : 'transactions'} changed.`
}

function setsCell(rule: Rule) {
  if (rule.kind !== 'expense') {
    return <Badge variant="outline">{KIND_LABELS[rule.kind]}</Badge>
  }
  return (
    <span>
      {rule.category_name}
      {rule.importance && (
        <span className="text-muted-foreground">
          {' · '}
          {IMPORTANCE_LABELS[rule.importance]}
        </span>
      )}
    </span>
  )
}

/** The Transactions a Rule classifies: a few, with the option to see them all. */
function RuleTransactions({ rule }: { rule: Rule }) {
  const [showAll, setShowAll] = useState(false)
  const limit = showAll ? MOST : SUBSET
  const { data, error } = useQuery({
    queryKey: ['transactions', { rule_id: rule.id, limit }],
    queryFn: () => api.listTransactions({ rule_id: rule.id, limit }),
  })

  if (error) return <p className="text-sm text-destructive">{error.message}</p>
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (data.total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This rule does not apply to any transaction at the moment.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">
        Applies to {data.total.toLocaleString()}{' '}
        {data.total === 1 ? 'transaction' : 'transactions'}
      </h3>
      <Table>
        <TableBody>
          {data.items.map((transaction) => (
            <TableRow key={transaction.id} className="hover:bg-transparent">
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(transaction.posted_on)}
              </TableCell>
              <TableCell>{transaction.description}</TableCell>
              <TableCell className="text-muted-foreground">
                {transaction.account_name}
              </TableCell>
              <TableCell
                className={cn(
                  'text-right tabular-nums',
                  transaction.amount_cents > 0 && 'text-emerald-600 dark:text-emerald-400',
                )}
              >
                {formatCents(transaction.amount_cents)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.total > data.items.length && !showAll && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
          Show all {data.total.toLocaleString()}
        </Button>
      )}
      {data.total > data.items.length && showAll && (
        <p className="text-sm text-muted-foreground">Showing the latest {MOST}.</p>
      )}
      {showAll && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(false)}>
          Show fewer
        </Button>
      )}
    </div>
  )
}

type EditorProps = {
  rule: Rule
  onDone: (message: string) => void
  onCancel: () => void
}

/** Edits or deletes one Rule. Saving runs the Rules over the Transactions again. */
function RuleEditor({ rule, onDone, onCancel }: EditorProps) {
  const queryClient = useQueryClient()
  const [matchText, setMatchText] = useState(rule.match_text)
  const [amount, setAmount] = useState<RuleAmountFields>(() => ruleAmountFields(rule))
  const [fields, setFields] = useState<ClassificationValue>({
    kind: rule.kind,
    categoryId: rule.category_id,
    importance: rule.importance,
    merchantName: rule.merchant_name ?? '',
  })
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const range = ruleAmountRange(amount)
  const complete = isComplete(fields) && range !== null && matchText.trim().length >= 3

  const save = useMutation({
    mutationFn: () =>
      api.changeRule(rule.id, {
        match_text: matchText,
        amount_min_cents: range?.min ?? null,
        amount_max_cents: range?.max ?? null,
        kind: fields.kind,
        category_id: fields.kind === 'expense' ? fields.categoryId : null,
        importance: fields.kind === 'expense' ? fields.importance : null,
        merchant_name: fields.merchantName.trim() || null,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      onDone(`Saved. ${changedMessage(result.changed)}`)
    },
  })
  const remove = useMutation({
    mutationFn: () => api.deleteRule(rule.id),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries()
      onDone(`Rule deleted. ${changedMessage(result.changed)}`)
    },
  })
  const failure = save.error ?? remove.error
  const id = (name: string) => `${name}-${rule.id}`

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="space-y-1.5">
          <Label htmlFor={id('match-text')}>When the description contains</Label>
          <Input
            id={id('match-text')}
            className="w-64"
            value={matchText}
            onChange={(event) => setMatchText(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={id('amount-mode')}>and the amount is</Label>
          <NativeSelect
            id={id('amount-mode')}
            value={amount.mode}
            onChange={(event) =>
              setAmount({ ...amount, mode: event.target.value as RuleAmountMode })
            }
          >
            <NativeSelectOption value="any">any amount</NativeSelectOption>
            <NativeSelectOption value="exact">exactly</NativeSelectOption>
            <NativeSelectOption value="between">between</NativeSelectOption>
          </NativeSelect>
        </div>
        {amount.mode !== 'any' && (
          <>
            <Input
              aria-label={amount.mode === 'exact' ? 'Amount' : 'Lowest amount'}
              className="w-28 text-right tabular-nums"
              inputMode="decimal"
              aria-invalid={range === null}
              value={amount.lowText}
              onChange={(event) => setAmount({ ...amount, lowText: event.target.value })}
            />
            {amount.mode === 'between' && (
              <>
                <span className="pb-2 text-sm">and</span>
                <Input
                  aria-label="Highest amount"
                  className="w-28 text-right tabular-nums"
                  inputMode="decimal"
                  aria-invalid={range === null}
                  value={amount.highText}
                  onChange={(event) =>
                    setAmount({ ...amount, highText: event.target.value })
                  }
                />
              </>
            )}
            <NativeSelect
              aria-label="Money out or money in"
              value={amount.moneyOut ? 'out' : 'in'}
              onChange={(event) =>
                setAmount({ ...amount, moneyOut: event.target.value === 'out' })
              }
            >
              <NativeSelectOption value="out">money out</NativeSelectOption>
              <NativeSelectOption value="in">money in</NativeSelectOption>
            </NativeSelect>
          </>
        )}
      </div>

      <ClassificationFields idSuffix={`rule-${rule.id}`} value={fields} onChange={setFields} />

      {failure && <p className="text-sm text-destructive">{failure.message}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={!complete || save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span className="grow" />
        {confirmingDelete ? (
          <>
            <span className="text-sm text-muted-foreground">
              Delete this rule? Its transactions pass to another matching rule, or back
              to unclassified.
            </span>
            <Button
              type="button"
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Yes, delete
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" onClick={() => setConfirmingDelete(true)}>
            Delete rule
          </Button>
        )}
      </div>

      <RuleTransactions rule={rule} />
    </form>
  )
}

function RulesPage() {
  const [openId, setOpenId] = useState<number | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const { data, error, isPending } = useQuery({
    queryKey: ['rules'],
    queryFn: api.listRules,
  })

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Rules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A rule classifies every matching transaction you have not set by hand. When
          more than one matches, a rule with an amount wins, then the longest text.
        </p>
      </div>

      {message && (
        <p className="text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}

      {data.length === 0 ? (
        <div className="py-16 text-center">
          <h2 className="text-lg font-medium">No rules yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tick "Always do this" when you classify a transaction in{' '}
            <Link className="underline" to="/review">
              Review
            </Link>{' '}
            to save one.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description contains</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Sets</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((rule) => {
              const open = rule.id === openId
              const toggle = () => {
                setOpenId(open ? null : rule.id)
                setMessage(null)
              }
              return (
                <Fragment key={rule.id}>
                  <TableRow
                    className={cn('cursor-pointer', open && 'bg-muted/50')}
                    aria-expanded={open}
                    tabIndex={0}
                    onClick={toggle}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && event.target === event.currentTarget) {
                        toggle()
                      }
                    }}
                  >
                    <TableCell className="font-medium">{rule.match_text}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {describeRuleAmount(rule)}
                    </TableCell>
                    <TableCell>{setsCell(rule)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {rule.merchant_name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rule.transaction_count.toLocaleString()}
                    </TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={5} className="p-4 whitespace-normal">
                        <RuleEditor
                          key={rule.id}
                          rule={rule}
                          onDone={(text) => {
                            setOpenId(null)
                            setMessage(text)
                          }}
                          onCancel={() => setOpenId(null)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

export default RulesPage
