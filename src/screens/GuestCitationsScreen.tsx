import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

export default function GuestCitationsScreen() {
  const { username } = useParams<{ username: string }>()
  const [text, setText] = useState('')
  const [author, setAuthor] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'rateLimit' | 'validation' | 'error'>('idle')

  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || !author.trim()) {
      setStatus('validation')
      return
    }
    setStatus('submitting')
    try {
      const res = await fetch('/api/kv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'guestSubmit', targetUsername: username, text: text.trim(), author: author.trim() }),
      })
      if (res.status === 429) {
        setStatus('rateLimit')
        return
      }
      if (!res.ok) {
        setStatus('error')
        return
      }
      setStatus('success')
      setText('')
      setAuthor('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-gray-50 dark:bg-gray-900" dir="rtl">
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="mb-6 text-xl font-bold text-gray-900 dark:text-gray-100">
          הוסף ציטוט לאוסף של {username}
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              טקסט הציטוט
            </label>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="כתוב את הציטוט כאן..."
              rows={4}
              className="w-full resize-none rounded-xl bg-white px-4 py-3 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-gray-600 dark:text-gray-400">
              מחבר
            </label>
            <input
              value={author}
              onChange={e => setAuthor(e.target.value)}
              placeholder="שם המחבר..."
              className="w-full rounded-xl bg-white px-4 py-3 text-sm text-gray-900 outline-none ring-1 ring-gray-300 focus:ring-blue-500 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500 dark:ring-gray-600"
            />
          </div>

          {status === 'validation' && (
            <p className="text-sm text-red-600 dark:text-red-400">נדרש טקסט וכותב</p>
          )}
          {status === 'rateLimit' && (
            <p className="text-sm text-red-600 dark:text-red-400">יותר מדי שליחות — נסה שוב בעוד דקה</p>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-600 dark:text-red-400">שגיאה בשליחה — נסה שוב</p>
          )}
          {status === 'success' && (
            <p className="text-sm font-medium text-green-600 dark:text-green-400">הציטוט נשלח בהצלחה!</p>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            className="min-h-[44px] w-full rounded-2xl bg-blue-600 text-sm font-semibold text-white active:bg-blue-700 disabled:opacity-50"
          >
            {status === 'submitting' ? 'שולח...' : 'שלח ציטוט'}
          </button>
        </form>
      </div>
    </div>
  )
}
