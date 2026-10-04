import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

// The same key is read by the script in index.html, before the page draws.
const STORAGE_KEY = 'theme'

/** Switches between the light and the dark theme, and remembers the choice in this browser. */
export function ThemeToggle() {
  // The "dark" class on <html> is what turns on the dark colours in index.css.
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )

  const toggle = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    } catch {
      // Storage can be blocked (private window); the theme still changes for this visit.
    }
    setDark(next)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={toggle}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}
