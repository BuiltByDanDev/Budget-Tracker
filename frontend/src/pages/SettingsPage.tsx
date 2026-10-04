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

  const error = changeLimit.error ?? changeCategory.error ?? createCategory.error

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
