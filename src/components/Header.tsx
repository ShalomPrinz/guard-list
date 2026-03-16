import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWizard } from '../context/WizardContext'

export default function Header() {
  const navigate = useNavigate()
  const { resetSession } = useWizard()
  const [isDark, setIsDark] = useState(() =>
    document.documentElement.classList.contains('dark'),
  )

  function handleHome() {
    resetSession()
    navigate('/')
  }

  function toggleTheme() {
    const newIsDark = !isDark
    document.documentElement.classList.toggle('dark', newIsDark)
    localStorage.setItem('theme', newIsDark ? 'dark' : 'light')
    setIsDark(newIsDark)
  }

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <div className="mx-auto flex w-full max-w-lg items-center px-4 py-3">
        <button
          onClick={handleHome}
          aria-label="חזרה לדף הבית"
          className="flex flex-1 items-center gap-2.5"
        >
          <img
            src="/app-icon.png"
            alt=""
            className="h-8 w-8 rounded-xl object-cover dark:brightness-0 dark:invert"
          />
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">רשימת שמירה</span>
        </button>
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'עבור למצב בהיר' : 'עבור למצב כהה'}
          className="min-h-[36px] min-w-[36px] rounded-xl p-2 text-xl active:bg-gray-100 dark:active:bg-gray-800"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>
    </header>
  )
}
