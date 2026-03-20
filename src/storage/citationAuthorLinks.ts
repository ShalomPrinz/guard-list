/**
 * Persists the mapping from citation author strings to member IDs.
 * A value of 'skip' means the user dismissed the prompt and never wants to be asked again.
 */

const KEY = 'citationAuthorLinks'

export function getCitationAuthorLinks(storage: Storage = window.localStorage): Record<string, string> {
  const raw = storage.getItem(KEY)
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

export function saveCitationAuthorLink(
  author: string,
  memberId: string,
  storage: Storage = window.localStorage,
): void {
  const links = getCitationAuthorLinks(storage)
  links[author] = memberId
  storage.setItem(KEY, JSON.stringify(links))
}

export function skipCitationAuthorLink(
  author: string,
  storage: Storage = window.localStorage,
): void {
  const links = getCitationAuthorLinks(storage)
  links[author] = 'skip'
  storage.setItem(KEY, JSON.stringify(links))
}

export function clearCitationAuthorLink(
  author: string,
  storage: Storage = window.localStorage,
): void {
  const links = getCitationAuthorLinks(storage)
  delete links[author]
  storage.setItem(KEY, JSON.stringify(links))
}
