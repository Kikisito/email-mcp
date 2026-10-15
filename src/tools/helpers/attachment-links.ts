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
  if (!baseUrl) {
    throw new Error('Attachment links require HTTP mode')
  }
  const now = Date.now()
  prune(now)
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
  const ascii = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export function handleAttachmentDownload(req: IncomingMessage, res: ServerResponse): void {
  const token = new URL(req.url ?? '', 'http://localhost').searchParams.get('token') ?? ''
  const entry = entries.get(token)
  if (!entry || entry.expiresAt <= Date.now()) {
    if (entry) entries.delete(token)
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not found or expired')
    return
  }
  res.writeHead(200, {
    'Content-Type': entry.contentType,
    'Content-Length': entry.content.length,
    'Content-Disposition': contentDisposition(entry.filename),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  })
  res.end(entry.content)
}

/** Test helper. */
export function clearAttachmentLinks(): void {
  entries.clear()
  baseUrl = null
}
