import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ToastContainer } from 'react-toastify'
import { WizardProvider } from './context/WizardContext'
import { ShortListWizardProvider } from './context/ShortListWizardContext'
import { syncFromCloud } from './storage/syncFromCloud'
import { getUsername } from './storage/userStorage'
import UsernameGate from './components/UsernameGate'
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
import SharingCenterScreen from './screens/SharingCenterScreen'
import CommandersSelectScreen from './screens/CommandersSelectScreen'
import ShortListStep2 from './screens/ShortListStep2'
import FallbackScreen from './screens/FallbackScreen'
import GuestCitationsScreen from './screens/GuestCitationsScreen'

function AuthenticatedApp() {
  const [hasUsername, setHasUsername] = useState(() => getUsername() !== null)

  useEffect(() => {
    if (hasUsername) {
      void syncFromCloud()
    }
  }, [hasUsername])

  if (!hasUsername) {
    return <UsernameGate onConfirmed={() => setHasUsername(true)} />
  }

  return (
    <>
      <ToastContainer position="bottom-center" rtl={true} theme="colored" />
      <WizardProvider>
        <ShortListWizardProvider>
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
              <Route path="/sharing-center" element={<SharingCenterScreen />} />
              <Route path="/short-list/step1/:groupId" element={<Step1_Stations />} />
              <Route path="/short-list/step2" element={<ShortListStep2 />} />
              <Route path="/fallback" element={<FallbackScreen />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ShortListWizardProvider>
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
