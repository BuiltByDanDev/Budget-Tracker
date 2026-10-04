import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { api, type CsvMapping } from '@/api/client'
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
import { mappingIsComplete } from '@/lib/csvMapping'

type Props = { file: File; mapping: CsvMapping }

/** Shows how the file's first rows will be read with the mapping, before anything is imported. */
export function CsvMappingResult({ file, mapping }: Props) {
  const complete = mappingIsComplete(mapping)
  const result = useQuery({
    queryKey: ['csv-preview', file.name, file.size, file.lastModified, mapping],
    queryFn: () => api.previewCsv(file, mapping),
    enabled: complete,
    placeholderData: keepPreviousData,
  })

  if (!complete) {
    return (
      <p className="text-sm text-muted-foreground">
        Answer every question above to see how your transactions will be read.
      </p>
    )
  }
  if (result.error) return <p className="text-sm text-destructive">{result.error.message}</p>
  if (!result.data) return <p className="text-sm text-muted-foreground">Reading…</p>

  if (result.data.error_count > 0) {
    return (
      <div className="text-sm" role="status">
        <p className="font-medium text-destructive">
          {result.data.error_count.toLocaleString()} of {result.data.total_rows.toLocaleString()}{' '}
          rows can't be read with these answers.
        </p>
        <ul className="mt-1 list-disc pl-5 text-muted-foreground">
          {result.data.row_errors.map((row) => (
            <li key={row.line}>
              Line {row.line}: {row.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        This is how your first transactions will be read. Check that purchases are under
        “Money out” and pay or refunds are under “Money in”.
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Money out</TableHead>
              <TableHead className="text-right">Money in</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.data.transactions.map((transaction, index) => (
              <TableRow key={index}>
                <TableCell className="whitespace-nowrap">
                  {formatDate(transaction.posted_on)}
                </TableCell>
                <TableCell>
                  {transaction.description}
                  {transaction.unconverted && (
                    <Badge variant="outline" className="ml-2">
                      Other currency
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {transaction.amount_cents < 0 && formatCents(-transaction.amount_cents)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {transaction.amount_cents >= 0 && formatCents(transaction.amount_cents)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
