import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function FallbackScreen() {
  const navigate = useNavigate()

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center cursor-pointer bg-white dark:bg-gray-900 px-8"
      onClick={() => navigate('/')}
      dir="rtl"
    >
      <img src="/app-icon.png" alt="app icon" className="w-24 h-24 rounded-2xl mb-6" />
      <p className="text-center text-gray-700 dark:text-gray-300 text-lg leading-relaxed">
        לא ברור איך הגעת לפה, בוא נחזור לדף הבית ונמשיך משם. תלחץ איפה שבא לך בשביל לחזור למסך הבית
      </p>
    </div>
  )
}
