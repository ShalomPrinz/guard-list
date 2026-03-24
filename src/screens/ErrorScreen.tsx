import { useEffect } from 'react'

export default function ErrorScreen() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center cursor-pointer bg-white dark:bg-gray-900 px-8"
      onClick={() => { window.location.href = '/' }}
      dir="rtl"
    >
      <img src="/app-icon.png" alt="app icon" className="w-24 h-24 rounded-2xl mb-6" />
      <p className="text-center text-red-500 dark:text-red-400 text-2xl font-bold mb-4">
        שגיאה!
      </p>
      <p className="text-center text-gray-700 dark:text-gray-300 text-lg leading-relaxed">
        התקרית הזאת מדווחת ותטופל בהקדם, סליחה על הבלאגן 😢
        <br />
        לחיצה בכל מקום במסך תחזיר אותך למסך הבית
      </p>
    </div>
  )
}
