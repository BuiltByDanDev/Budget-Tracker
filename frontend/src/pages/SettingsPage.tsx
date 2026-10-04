import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type Category, type CategoryChanges } from '@/api/client'
import { MoneyInput } from '@/components/MoneyInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

function CategoryNameInput({
  category,
  onRename,
}: {
  category: Category
  onRename: (name: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    const name = draft?.trim()
    if (name && name !== category.name) onRename(name)
    setDraft(null)
  }
  return (
    <Input
      aria-label={`Name of ${category.name}`}
      className="w-56"
      value={draft ?? category.name}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}

/** "1, 16" -> [1, 16]. Returns null when something is not a day from 1 to 31. */
function parsePayDays(text: string): number[] | null {
  const days = text
    .split(/[\s,]+/)
    .filter((part) => part !== '')
    .map(Number)
  return days.every((day) => Number.isInteger(day) && day >= 1 && day <= 31) ? days : null
}

function PayDaysInput({
  payDays,
  onCommit,
}: {
  payDays: number[]
  onCommit: (payDays: number[]) => void
}) {
  const saved = payDays.join(', ')
  // null while the field shows the saved value; text while the User is editing.
  const [draft, setDraft] = useState<string | null>(null)
  const parsed = draft === null ? payDays : parsePayDays(draft)
  const commit = () => {
    if (draft === null || parsed === null) return
    if (parsed.join(', ') !== saved) onCommit(parsed)
    setDraft(null)
  }
  return (
    <Input
      id="pay-days"
      className="w-40"
      placeholder="None"
      inputMode="numeric"
      aria-invalid={parsed === null}
      value={draft ?? saved}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}

function SettingsPage() {
  const queryClient = useQueryClient()
  const settings = useQuery({ queryKey: ['settings'], queryFn: api.getSettings })
  const categories = useQuery({ queryKey: ['categories'], queryFn: api.listCategories })
  const [newCategory, setNewCategory] = useState('')

  const refresh = () => queryClient.invalidateQueries()

  const changeLimit = useMutation({
    mutationFn: (cents: number | null) => api.changeSettings({ spending_limit_cents: cents }),
    onSuccess: refresh,
  })
  const changePayDays = useMutation({
    mutationFn: (payDays: number[]) => api.changeSettings({ pay_days: payDays }),
    onSuccess: refresh,
  })
  const changeCategory = useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: CategoryChanges }) =>
      api.changeCategory(id, changes),
    onSuccess: refresh,
  })
  const createCategory = useMutation({
    mutationFn: api.createCategory,
    onSuccess: () => {
      setNewCategory('')
      return refresh()
    },
  })

  if (!settings.data || !categories.data) {
    return <p className="text-sm text-muted-foreground">Loading…</p>
  }

  const error =
    changeLimit.error ?? changePayDays.error ?? changeCategory.error ?? createCategory.error

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Spending limit</CardTitle>
          <CardDescription>
            The most you intend to spend in total in a month. Leave blank for none.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Label htmlFor="spending-limit">$</Label>
          <MoneyInput
            id="spending-limit"
            placeholder="None"
            valueCents={settings.data.spending_limit_cents}
            onCommit={(cents) => changeLimit.mutate(cents)}
          />
          <span className="text-sm text-muted-foreground">per month</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pay days</CardTitle>
          <CardDescription>
            The days of the month you are due to be paid, such as 1, 16. Pay that arrives
            early or late because of a weekend or holiday then counts in the month of its
            nearest pay day, not the month it landed in. Use 31 for the last day of the
            month. Leave blank to count pay in the month it arrives.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2">
          <Label htmlFor="pay-days">Days</Label>
          <PayDaysInput
            payDays={settings.data.pay_days}
            onCommit={(payDays) => changePayDays.mutate(payDays)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categories</CardTitle>
          <CardDescription>
            A target is the most you intend to spend in that category in a month. A retired
            category keeps its past transactions but is no longer offered.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Monthly target ($)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.data.map((category) => (
                <TableRow key={category.id} className={category.retired ? 'opacity-60' : undefined}>
                  <TableCell>
                    <CategoryNameInput
                      category={category}
                      onRename={(name) =>
                        changeCategory.mutate({ id: category.id, changes: { name } })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <MoneyInput
                      aria-label={`Monthly target for ${category.name}`}
                      placeholder="None"
                      valueCents={category.monthly_target_cents}
                      onCommit={(cents) =>
                        changeCategory.mutate({
                          id: category.id,
                          changes: { monthly_target_cents: cents },
                        })
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        changeCategory.mutate({
                          id: category.id,
                          changes: { retired: !category.retired },
                        })
                      }
                    >
                      {category.retired ? 'Restore' : 'Retire'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              createCategory.mutate(newCategory)
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-category">Add a category</Label>
              <Input
                id="new-category"
                className="w-56"
                value={newCategory}
                onChange={(event) => setNewCategory(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={!newCategory.trim() || createCategory.isPending}
            >
              Add
            </Button>
          </form>

          {error && <p className="text-sm text-destructive">{error.message}</p>}
        </CardContent>
      </Card>
    </div>
  )
}

export default SettingsPage
