const USERNAME_KEY = 'username'
const DEVICE_ID_KEY = 'device_id'

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY)
}

export function setUsername(name: string): void {
  localStorage.setItem(USERNAME_KEY, name.trim().toLowerCase())
}

export function clearUsername(): void {
  localStorage.removeItem(USERNAME_KEY)
}

/** Returns the stable device ID for this browser, creating one if needed. */
export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}
