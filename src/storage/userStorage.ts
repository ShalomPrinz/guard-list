const USERNAME_KEY = 'username'
const DEVICE_ID_KEY = 'device_id'

// SECURITY: Username must not contain ':' (the KV namespace separator) or Redis glob
// characters that could be used to escape or enumerate other users' key namespaces.
// Hebrew and other Unicode characters are permitted so existing users are not locked out.
const INVALID_USERNAME_CHARS = /[:*?[\]^]/

/**
 * Returns true if the username is safe to use as a KV namespace prefix.
 * Called by the registration UI before invoking setUsername.
 */
export function isValidUsername(name: string): boolean {
  const normalized = name.trim().toLowerCase()
  return (
    normalized.length >= 2 &&
    normalized.length <= 64 &&
    // SECURITY: Reject characters that could inject glob patterns or escape the namespace separator.
    !INVALID_USERNAME_CHARS.test(normalized)
  )
}

export function getUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY)
}

export function setUsername(name: string): void {
  const normalized = name.trim().toLowerCase()
  // SECURITY: Enforce safe character set before persisting. Callers must handle this exception.
  if (!isValidUsername(normalized)) {
    throw new Error(
      'Invalid username: must be 2–64 characters and cannot contain : * ? [ ] ^'
    )
  }
  localStorage.setItem(USERNAME_KEY, normalized)
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
