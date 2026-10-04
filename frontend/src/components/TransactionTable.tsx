import { Fragment, useState } from 'react'
import type { ClassifyResult, Transaction } from '@/api/client'
import { ClassifyForm } from '@/components/ClassifyForm'
import { UnconvertedAmountForm } from '@/components/UnconvertedAmountForm'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCents, formatDate } from '@/lib/format'
import { formatMonth } from '@/lib/months'
import { IMPORTANCE_LABELS, KIND_LABELS } from '@/lib/labels'
import { cn } from '@/lib/utils'

type Props = {
  transactions: Transaction[]
  // Opens the first row for editing, for working through the Review Inbox.
  openFirst?: boolean
  onSaved?: (result: ClassifyResult) => void
}

function classificationCell(transaction: Transaction) {
  if (transaction.kind !== 'expense') {
    return <Badge variant="outline">{KIND_LABELS[transaction.kind]}</Badge>
  }
  if (!transaction.category_name) {
    return <span className="text-muted-foreground">Needs review</span>
  }
  return (
    <span>
      {transaction.category_name}
      {transaction.importance && (
        <span className="text-muted-foreground">
          {' · '}
          {IMPORTANCE_LABELS[transaction.importance]}
        </span>
      )}
    </span>
  )
}

/** Transactions as rows; clicking one opens it for classifying. */
export function TransactionTable({ transactions, openFirst, onSaved }: Props) {
  const [chosenId, setChosenId] = useState<number | null>(null)
  const [closed, setClosed] = useState(false)
  const chosenIsListed = transactions.some((t) => t.id === chosenId)
  const openId = chosenIsListed
    ? chosenId
    : openFirst && !closed
      ? (transactions[0]?.id ?? null)
      : null

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Description</TableHead>
          <TableHead>Account</TableHead>
          <TableHead>Category</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((transaction) => {
          const open = transaction.id === openId
          return (
            <Fragment key={transaction.id}>
              <TableRow
                className={cn('cursor-pointer', open && 'bg-muted/50')}
                aria-expanded={open}
                tabIndex={0}
                onClick={() => {
                  setChosenId(open ? null : transaction.id)
                  setClosed(open)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.target === event.currentTarget) {
                    setChosenId(open ? null : transaction.id)
                    setClosed(open)
                  }
                }}
              >
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(transaction.posted_on)}
                  {transaction.counts_in_month && (
                    <div className="text-xs">
                      Counts in {formatMonth(transaction.counts_in_month)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {transaction.merchant_name ? (
                    <>
                      <div>{transaction.merchant_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {transaction.description}
                      </div>
                    </>
                  ) : (
                    transaction.description
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {transaction.account_name}
                </TableCell>
                <TableCell>{classificationCell(transaction)}</TableCell>
                <TableCell
                  className={cn(
                    'text-right tabular-nums',
                    transaction.amount_cents > 0 && 'text-emerald-600',
                  )}
                >
                  {transaction.amount_unconverted && (
                    <Badge variant="outline" className="mr-2 text-foreground">
                      Other currency
                    </Badge>
                  )}
                  {formatCents(transaction.amount_cents)}
                </TableCell>
              </TableRow>
              {open && (
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={5} className="space-y-4 p-4 whitespace-normal">
                    {transaction.amount_unconverted && (
                      <UnconvertedAmountForm transaction={transaction} />
                    )}
                    <ClassifyForm
                      key={transaction.id}
                      transaction={transaction}
                      onSaved={(result) => {
                        setChosenId(null)
                        setClosed(false)
                        onSaved?.(result)
                      }}
                      onCancel={() => {
                        setChosenId(null)
                        setClosed(true)
                      }}
                    />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
