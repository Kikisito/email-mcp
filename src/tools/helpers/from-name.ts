/**
 * Sender display name helpers.
 * The name travels inside an EMAIL_CREDENTIALS entry as a trailing `name=<value>` segment.
 */

export const FROM_NAME_PREFIX = 'name='

/** Trim and drop control characters (CR/LF would allow header injection). */
export function normalizeFromName(name: string | undefined): string | undefined {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the point
  const clean = (name ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  return clean || undefined
}

/**
 * Encode a sender display name as the trailing `name=<value>` segment of a
 * credential entry. The value is percent-encoded so `:` and `,` in a name
 * cannot be mistaken for entry/segment separators. Returns '' for a blank name.
 */
export function encodeFromNameSegment(name: string | undefined): string {
  const clean = normalizeFromName(name)
  return clean ? `${FROM_NAME_PREFIX}${encodeURIComponent(clean)}` : ''
}
