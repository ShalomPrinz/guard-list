import { useNavigate } from 'react-router-dom'
import { useWizard } from '../context/WizardContext'

export default function Header() {
  const navigate = useNavigate()
  const { resetSession } = useWizard()

  function handleHome() {
    resetSession()
    navigate('/')
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-700 bg-gray-900">
      <button
        onClick={handleHome}
        aria-label="חזרה לדף הבית"
        className="mx-auto flex w-full max-w-lg items-center gap-2.5 px-4 py-3"
      >
        <img src="/app-icon.png" alt="" className="h-8 w-8 rounded-xl object-cover" />
        <span className="text-base font-bold text-gray-100">רשימת שמירה</span>
      </button>
    </header>
  )
}
