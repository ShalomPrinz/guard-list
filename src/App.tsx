import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { WizardProvider } from './context/WizardContext'
import { syncFromCloud } from './storage/syncFromCloud'
import { getUsername } from './storage/userStorage'
import { getLocalIncomingRequest } from './storage/citationShare'
import { acceptShareRequest, declineShareRequest } from './storage/citationShare'
import UsernameGate from './components/UsernameGate'
import IncomingShareRequestModal from './components/IncomingShareRequestModal'
import Layout from './components/Layout'
import HomeScreen from './screens/HomeScreen'
import GroupEditScreen from './screens/GroupEditScreen'
import Step1_Stations from './screens/Step1_Stations'
import Step2_Time from './screens/Step2_Time'
import Step3_Order from './screens/Step3_Order'
import Step4_Review from './screens/Step4_Review'
import ResultScreen from './screens/ResultScreen'
import ContinueRoundScreen from './screens/ContinueRoundScreen'
import StatisticsScreen from './screens/StatisticsScreen'
import ParticipantHistoryScreen from './screens/ParticipantHistoryScreen'
import StandbyScreen from './screens/StandbyScreen'
import UniteScreen from './screens/UniteScreen'
import UniteListPickerScreen from './screens/UniteListPickerScreen'
import CitationsScreen from './screens/CitationsScreen'
import CommandersSelectScreen from './screens/CommandersSelectScreen'
import FallbackScreen from './screens/FallbackScreen'
import GuestCitationsScreen from './screens/GuestCitationsScreen'

function AuthenticatedApp() {
  const [hasUsername, setHasUsername] = useState(() => getUsername() !== null)
  const [incomingShareRequest, setIncomingShareRequest] = useState(() =>
    hasUsername ? getLocalIncomingRequest() : null
  )

  useEffect(() => {
    if (hasUsername) {
      void syncFromCloud().then(() => {
        setIncomingShareRequest(getLocalIncomingRequest())
      })
    }
  }, [hasUsername])

  useEffect(() => {
    if (!hasUsername) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void syncFromCloud().then(() => {
          setIncomingShareRequest(getLocalIncomingRequest())
        })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [hasUsername])

  if (!hasUsername) {
    return <UsernameGate onConfirmed={() => setHasUsername(true)} />
  }

  return (
    <>
      {incomingShareRequest && (
        <IncomingShareRequestModal
          fromUsername={incomingShareRequest.fromUsername}
          onAccept={async () => {
            await acceptShareRequest(incomingShareRequest.fromUsername)
            setIncomingShareRequest(null)
          }}
          onDecline={() => {
            declineShareRequest()
            setIncomingShareRequest(null)
          }}
        />
      )}
      <WizardProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/group/:groupId/edit" element={<GroupEditScreen />} />
            <Route path="/group/:groupId/commanders" element={<CommandersSelectScreen />} />
            <Route path="/schedule/new/step1" element={<Step1_Stations />} />
            <Route path="/schedule/new/step2" element={<Step2_Time />} />
            <Route path="/schedule/new/step3" element={<Step3_Order />} />
            <Route path="/schedule/new/step4" element={<Step4_Review />} />
            <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
            <Route path="/schedule/:scheduleId/continue" element={<ContinueRoundScreen />} />
            <Route path="/schedule/:scheduleId/unite-picker" element={<UniteListPickerScreen />} />
            <Route path="/schedule/:scheduleId/unite/:targetScheduleId" element={<UniteScreen />} />
            <Route path="/statistics" element={<StatisticsScreen />} />
            <Route path="/statistics/:participantName" element={<ParticipantHistoryScreen />} />
            <Route path="/standby" element={<StandbyScreen />} />
            <Route path="/citations" element={<CitationsScreen />} />
            <Route path="/fallback" element={<FallbackScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </WizardProvider>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/guest/:username" element={<GuestCitationsScreen />} />
        <Route path="*" element={<AuthenticatedApp />} />
      </Routes>
    </BrowserRouter>
  )
}
