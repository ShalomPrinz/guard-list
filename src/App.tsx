import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { WizardProvider } from './context/WizardContext'
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
import RecalculateScreen from './screens/RecalculateScreen'

export default function App() {
  return (
    <WizardProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomeScreen />} />
            <Route path="/group/:groupId/edit" element={<GroupEditScreen />} />
            <Route path="/schedule/new/step1" element={<Step1_Stations />} />
            <Route path="/schedule/new/step2" element={<Step2_Time />} />
            <Route path="/schedule/new/step3" element={<Step3_Order />} />
            <Route path="/schedule/new/step4" element={<Step4_Review />} />
            <Route path="/schedule/new/recalculate" element={<RecalculateScreen />} />
            <Route path="/schedule/:scheduleId/result" element={<ResultScreen />} />
            <Route path="/schedule/:scheduleId/continue" element={<ContinueRoundScreen />} />
            <Route path="/statistics" element={<StatisticsScreen />} />
            <Route path="/statistics/:participantName" element={<ParticipantHistoryScreen />} />
            <Route path="/standby" element={<StandbyScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </WizardProvider>
  )
}
