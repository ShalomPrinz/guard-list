import { kvSet } from './cloudStorage'

const THEME_KEY = 'theme'

export function getTheme(storage: Storage = window.localStorage): 'dark' | 'light' | null {
  const val = storage.getItem(THEME_KEY)
  if (val === 'dark' || val === 'light') return val
  return null
}

export function saveTheme(theme: 'dark' | 'light', storage: Storage = window.localStorage): void {
  storage.setItem(THEME_KEY, theme)
  void kvSet('prefs:global', { theme })
}
