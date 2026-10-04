import { useQuery } from '@tanstack/react-query'
import { NavLink, Navigate, Route, Routes } from 'react-router'
import { api } from '@/api/client'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import DashboardPage from '@/pages/DashboardPage'
import ImportPage from '@/pages/ImportPage'
import ReviewPage from '@/pages/ReviewPage'
import SettingsPage from '@/pages/SettingsPage'
import TrendsPage from '@/pages/TrendsPage'
import TransactionsPage from '@/pages/TransactionsPage'

const NAV = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/trends', label: 'Trends' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/review', label: 'Review' },
  { to: '/import', label: 'Import' },
  { to: '/settings', label: 'Settings' },
]

function App() {
  const reviewInbox = useQuery({
    queryKey: ['transactions', { needs_review: true, limit: 1 }],
    queryFn: () => api.listTransactions({ needs_review: true, limit: 1 }),
  })
  const toReview = reviewInbox.data?.total ?? 0
  const mode = useQuery({ queryKey: ['mode'], queryFn: api.mode, staleTime: Infinity })

  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <span className="font-semibold">Budgeting</span>
          {mode.data?.demo && <Badge variant="outline">Demo data</Badge>}
          <nav className="flex gap-1">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground',
                    isActive && 'bg-muted text-foreground',
                  )
                }
              >
                {item.label}
                {item.to === '/review' && toReview > 0 && (
                  <Badge className="ml-1.5" variant="secondary">
                    {toReview}
                  </Badge>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/trends" element={<TrendsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/transactions" element={<TransactionsPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/import" element={<ImportPage />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
