import { createContext, useContext, useState, type ReactNode } from 'react'
import type { ShortListWizardSession } from '../types'

interface ShortListWizardContextValue {
  session: ShortListWizardSession | null
  setSession: (session: ShortListWizardSession | null) => void
  clearSession: () => void
  setStartTime: (hour: number, minute: number) => void
  setMinutesPerWarrior: (minutes: number) => void
  setNumberOfWarriors: (count: number) => void
}

const ShortListWizardContext = createContext<ShortListWizardContextValue | null>(null)

export function ShortListWizardProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ShortListWizardSession | null>(null)
  const clearSession = () => setSession(null)

  const setStartTime = (hour: number, minute: number) => {
    if (session) {
      setSession({ ...session, startHour: hour, startMinute: minute })
    }
  }

  const setMinutesPerWarrior = (minutes: number) => {
    if (session) {
      setSession({ ...session, minutesPerWarrior: minutes })
    }
  }

  const setNumberOfWarriors = (count: number) => {
    if (session) {
      setSession({ ...session, numberOfWarriors: count })
    }
  }

  return (
    <ShortListWizardContext.Provider value={{ session, setSession, clearSession, setStartTime, setMinutesPerWarrior, setNumberOfWarriors }}>
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
      setStartTime: () => {},
      setMinutesPerWarrior: () => {},
      setNumberOfWarriors: () => {},
    }
  }
  return ctx
}
