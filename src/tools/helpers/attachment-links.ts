/**
 * Short-lived download links for email attachments
 */

import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

export const ATTACHMENT_LINK_PATH = '/attachments/download'

const TTL_MS = 10 * 60 * 1000
const MAX_ENTRIES = 50

interface LinkEntry {
  filename: string
  contentType: string
  content: Buffer
  expiresAt: number
}

const entries = new Map<string, LinkEntry>()
let baseUrl: string | null = null

/** Set once the HTTP server knows its externally reachable origin. */
export function setAttachmentLinkBaseUrl(url: string | null): void {
  baseUrl = url ? url.replace(/\/$/, '') : null
}

/** True when HTTP mode is up and links can be handed to a client. */
export function attachmentLinksAvailable(): boolean {
  return baseUrl !== null
}

function prune(now: number): void {
  for (const [token, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(token)
  }

  // Map iterates in insertion order, so the oldest entries go first.
  // We don't want to keep more than MAX_ENTRIES in memory, so delete the oldest ones.
  while (entries.size >= MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }
}

export interface AttachmentLink {
  file_id: string
  download_url: string
  expires_in_seconds: number
}

export function createAttachmentLink(file: { filename: string; contentType: string; content: Buffer }): AttachmentLink {
  // If HTTP mode is not available, throw an error. This should be checked before calling this function.
  if (!baseUrl) {
    throw new Error('Attachment links require HTTP mode')
  }

  // Get the current time and prune expired entries
  const now = Date.now()
  prune(now)

  // Create a random token and store the entry with the expiration time
  const token = randomBytes(32).toString('hex')
  entries.set(token, { ...file, expiresAt: now + TTL_MS })

  return {
    file_id: token.slice(0, 16),
    download_url: `${baseUrl}${ATTACHMENT_LINK_PATH}?token=${token}`,
    expires_in_seconds: TTL_MS / 1000
  }
}

/** RFC 5987 Content-Disposition with an ASCII fallback for odd filenames. */
function contentDisposition(filename: string): string {
  // Replace non-ASCII characters and quotes/backslashes with underscores for the ASCII fallback
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')

  // Return the Content-Disposition header value with both the ASCII fallback and the UTF-8 encoded filename
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

/**
 * GET /attachments/download?token=... handler: serves a parked attachment if the token is valid.
 * The link is not single-use; it can be fetched repeatedly until it expires.
 */
export function handleAttachmentDownload(req: IncomingMessage, res: ServerResponse): void {
  // req.url is relative (path + query), so give URL a dummy origin just to parse the query string
  const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token') ?? ''
  const entry = entries.get(token)

  // Unknown and expired tokens get the same 404 so a caller cannot tell them apart
  if (!entry || entry.expiresAt <= Date.now()) {
    // Free the memory right away instead of waiting for the next prune()
    if (entry) entries.delete(token)

    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found or expired')
    return
  }

  res.writeHead(200, {
    // Original MIME type and exact size, so the client can show progress and detect truncated downloads
    'Content-Type': entry.contentType,
    'Content-Length': entry.content.length,
    // Force a download under the original filename (see contentDisposition)
    'Content-Disposition': contentDisposition(entry.filename),
    // For personal data: keep browsers and proxies from caching a copy
    'Cache-Control': 'no-store',
    // Stop the browser from sniffing the content into another type (e.g. HTML disguised as a PDF)
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(entry.content)
}

/** Test helper. */
export function clearAttachmentLinks(): void {
  entries.clear()
  baseUrl = null
}
