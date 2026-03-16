import { createContext, useContext, useState, type ReactNode } from 'react'
import type { WizardSession, TimeConfig } from '../types'

interface WizardContextValue {
  session: WizardSession | null
  startNewSession: (groupId: string, groupName: string, date: string) => void
  updateStations: (stations: WizardSession['stations']) => void
  updateTimeConfig: (timeConfig: TimeConfig) => void
  updateSession: (patch: Partial<WizardSession>) => void
  resetSession: () => void
}

const WizardContext = createContext<WizardContextValue | null>(null)

const DEFAULT_TIME_CONFIG: TimeConfig = {
  startTime: '00:00',
  roundingAlgorithm: 'round-up-10',
  unevenMode: 'equal-duration',
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<WizardSession | null>(null)

  const startNewSession = (groupId: string, groupName: string, date: string) => {
    setSession({
      mode: 'new',
      groupId,
      groupName,
      stations: [],
      timeConfig: { ...DEFAULT_TIME_CONFIG },
      scheduleName: '',
      date,
    })
  }

  const updateStations = (stations: WizardSession['stations']) => {
    setSession(prev => prev ? { ...prev, stations } : prev)
  }

  const updateTimeConfig = (timeConfig: TimeConfig) => {
    setSession(prev => prev ? { ...prev, timeConfig } : prev)
  }

  const updateSession = (patch: Partial<WizardSession>) => {
    setSession(prev => prev ? { ...prev, ...patch } : prev)
  }

  const resetSession = () => setSession(null)

  return (
    <WizardContext.Provider value={{ session, startNewSession, updateStations, updateTimeConfig, updateSession, resetSession }}>
      {children}
    </WizardContext.Provider>
  )
}

export function useWizard(): WizardContextValue {
  const ctx = useContext(WizardContext)
  if (!ctx) throw new Error('useWizard must be used inside WizardProvider')
  return ctx
}
