import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  ApiError,
  api,
  type CsvMapping,
  type CsvPreview,
  type ImportSummary,
} from '@/api/client'
import { CsvMappingForm } from '@/components/CsvMappingForm'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select'
import { guessMapping, mappingIsComplete } from '@/lib/csvMapping'

function ImportPage() {
  const queryClient = useQueryClient()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.listAccounts })

  const [accountId, setAccountId] = useState<number | null>(null)
  const [newAccountName, setNewAccountName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  // Set while the User is creating or changing the Account's CSV Mapping.
  const [draftMapping, setDraftMapping] = useState<CsvMapping | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const account = accounts.data?.find((a) => a.id === accountId) ?? null

  const createAccount = useMutation({
    mutationFn: api.createAccount,
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      setAccountId(created.id)
      setNewAccountName('')
    },
  })

  const loadPreview = useMutation({
    mutationFn: api.previewCsv,
    onSuccess: (result) => {
      setPreview(result)
      if (account && !account.csv_mapping) setDraftMapping(guessMapping(result.rows))
    },
  })

  const runImport = useMutation({
    mutationFn: async () => {
      if (!account || !file) throw new Error('Choose an account and a file')
      if (draftMapping) await api.setCsvMapping(account.id, draftMapping)
      return api.importCsv(account.id, file)
    },
    onSuccess: async (result) => {
      setSummary(result)
      setFile(null)
      setPreview(null)
      setDraftMapping(null)
      await queryClient.invalidateQueries()
    },
    // The mapping may have been saved even though the import failed.
    onError: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  })

  const chooseAccount = (id: number | null) => {
    setAccountId(id)
    setSummary(null)
    setDraftMapping(null)
    runImport.reset()
    const chosen = accounts.data?.find((a) => a.id === id)
    if (chosen && !chosen.csv_mapping && preview) {
      setDraftMapping(guessMapping(preview.rows))
    }
  }

  const chooseFile = (chosen: File | null) => {
    setFile(chosen)
    setPreview(null)
    setSummary(null)
    runImport.reset()
    if (chosen) loadPreview.mutate(chosen)
  }

  const canImport =
    account !== null &&
    file !== null &&
    preview !== null &&
    (draftMapping ? mappingIsComplete(draftMapping) : account.csv_mapping !== null)

  const importError = runImport.error instanceof ApiError ? runImport.error : null

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Import a CSV</h1>

      <Card>
        <CardHeader>
          <CardTitle>1. Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {accounts.data && accounts.data.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="account">Which account is this export from?</Label>
              <NativeSelect
                id="account"
                value={accountId ?? ''}
                onChange={(event) =>
                  chooseAccount(event.target.value ? Number(event.target.value) : null)
                }
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {accounts.data.map((a) => (
                  <NativeSelectOption key={a.id} value={a.id}>
                    {a.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              createAccount.mutate(newAccountName)
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="new-account">Add an account</Label>
              <Input
                id="new-account"
                placeholder="e.g. TD Chequing, Amex"
                value={newAccountName}
                onChange={(event) => setNewAccountName(event.target.value)}
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={!newAccountName.trim() || createAccount.isPending}
            >
              Add
            </Button>
          </form>
          {createAccount.error && (
            <p className="text-sm text-destructive">{createAccount.error.message}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. File</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input
            // Remounting clears the chosen file after a successful import.
            key={summary?.id ?? 'file'}
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
          />
          {preview && (
            <p className="text-sm text-muted-foreground">
              {preview.total_rows.toLocaleString()} rows in this file.
            </p>
          )}
          {loadPreview.error && (
            <p className="text-sm text-destructive">{loadPreview.error.message}</p>
          )}
        </CardContent>
      </Card>

      {account && preview && (
        <Card>
          <CardHeader>
            <CardTitle>3. Columns</CardTitle>
          </CardHeader>
          <CardContent>
            {draftMapping ? (
              <CsvMappingForm
                rows={preview.rows}
                mapping={draftMapping}
                onChange={setDraftMapping}
              />
            ) : (
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">
                  Using the column mapping saved for {account.name}.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDraftMapping(account.csv_mapping)}
                >
                  Change mapping
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {runImport.error && (
        <Alert variant="destructive">
          <AlertTitle>Nothing was imported</AlertTitle>
          <AlertDescription>
            <p>{runImport.error.message}</p>
            {importError && importError.rowErrors.length > 0 && (
              <ul className="mt-2 list-disc pl-5">
                {importError.rowErrors.map((row) => (
                  <li key={row.line}>
                    Line {row.line}: {row.message}
                  </li>
                ))}
              </ul>
            )}
            {importError && importError.rowErrors.length > 0 && !draftMapping && (
              <p className="mt-2">
                If the bank changed its export layout, use “Change mapping” above.
              </p>
            )}
          </AlertDescription>
        </Alert>
      )}

      {summary && (
        <Alert>
          <AlertTitle>Imported {summary.filename}</AlertTitle>
          <AlertDescription>
            {summary.new_count} new, {summary.skipped_count} skipped as duplicates.{' '}
            <Link to="/transactions">View transactions</Link>
          </AlertDescription>
        </Alert>
      )}

      <Button disabled={!canImport || runImport.isPending} onClick={() => runImport.mutate()}>
        {runImport.isPending ? 'Importing…' : 'Import'}
      </Button>
    </div>
  )
}

export default ImportPage
