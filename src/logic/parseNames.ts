/**
 * Parse a raw text blob (comma or newline separated) into a deduplicated
 * list of trimmed names. Deduplication is case-insensitive; original casing
 * of the first occurrence is preserved.
 */
export function parseNames(raw: string): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  raw.split(/[\n,]/).forEach(part => {
    const name = part.trim()
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      result.push(name)
    }
  })
  return result
}
