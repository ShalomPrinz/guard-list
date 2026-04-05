import { createContext, useContext, useState, type ReactNode } from 'react'
import type { ShortListWizardSession } from '../types'

interface ShortListWizardContextValue {
  session: ShortListWizardSession | null
  setSession: (session: ShortListWizardSession | null) => void
  clearSession: () => void
}

const ShortListWizardContext = createContext<ShortListWizardContextValue | null>(null)

export function ShortListWizardProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ShortListWizardSession | null>(null)
  const clearSession = () => setSession(null)
  return (
    <ShortListWizardContext.Provider value={{ session, setSession, clearSession }}>
      {children}
    </ShortListWizardContext.Provider>
  )
}

export function useShortListWizard(): ShortListWizardContextValue {
  const ctx = useContext(ShortListWizardContext)
  if (!ctx) {
    // Return a default context when not inside the provider (for tests and other edge cases)
    return {
      session: null,
      setSession: () => {},
      clearSession: () => {},
    }
  }
  return ctx
}
