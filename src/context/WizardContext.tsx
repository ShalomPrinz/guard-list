import { createContext, useContext, useState, type ReactNode } from 'react'
import type { WizardSession, TimeConfig } from '../types'

export const DEFAULT_TIME_CONFIG: TimeConfig = {
  startTime: '20:00',
  roundingAlgorithm: 'round-up-10',
  unevenMode: 'equal-duration',
}

interface WizardContextValue {
  session: WizardSession | null
  /** Replace the entire session (used in Step 1 to bootstrap or re-initialize). */
  initSession: (session: WizardSession) => void
  updateStations: (stations: WizardSession['stations']) => void
  updateTimeConfig: (timeConfig: TimeConfig) => void
  updateSession: (patch: Partial<WizardSession>) => void
  resetSession: () => void
}

const WizardContext = createContext<WizardContextValue | null>(null)

export function WizardProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WizardSession | null>(null)

  const initSession = (s: WizardSession) => setSession(s)

  const updateStations = (stations: WizardSession['stations']) =>
    setSession(prev => (prev ? { ...prev, stations } : prev))

  const updateTimeConfig = (timeConfig: TimeConfig) =>
    setSession(prev => (prev ? { ...prev, timeConfig } : prev))

  const updateSession = (patch: Partial<WizardSession>) =>
    setSession(prev => (prev ? { ...prev, ...patch } : prev))

  const resetSession = () => setSession(null)

  return (
    <WizardContext.Provider
      value={{ session, initSession, updateStations, updateTimeConfig, updateSession, resetSession }}
    >
      {children}
    </WizardContext.Provider>
  )
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error('useWizard must be used inside WizardProvider')
  return ctx
}
