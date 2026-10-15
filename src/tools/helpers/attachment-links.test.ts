import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachmentLinksAvailable,
  clearAttachmentLinks,
  createAttachmentLink,
  handleAttachmentDownload,
  setAttachmentLinkBaseUrl
} from './attachment-links.js'

function fakeRes() {
  const res = { writeHead: vi.fn(), end: vi.fn() }
  return res as typeof res & ServerResponse
}

const file = { filename: 'cv.pdf', contentType: 'application/pdf', content: Buffer.from('%PDF') }

afterEach(() => {
  vi.useRealTimers()
  clearAttachmentLinks()
})

describe('attachment-links', () => {
  it('is unavailable until a base URL is set and refuses to create links', () => {
    expect(attachmentLinksAvailable()).toBe(false)
    expect(() => createAttachmentLink(file)).toThrow('HTTP mode')
  })

  it('serves the file for a valid token with download headers', () => {
    setAttachmentLinkBaseUrl('http://localhost:8082')
    const { download_url } = createAttachmentLink(file)
    const res = fakeRes()
    handleAttachmentDownload({ url: download_url.replace('http://localhost:8082', '') } as IncomingMessage, res)

    expect(res.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'Content-Type': 'application/pdf', 'Content-Length': 4, 'Cache-Control': 'no-store' })
    )
    expect(res.end).toHaveBeenCalledWith(file.content)
  })

  it('returns 404 for an unknown token', () => {
    setAttachmentLinkBaseUrl('http://localhost:8082')
    const res = fakeRes()
    handleAttachmentDownload({ url: '/attachments/download?token=nope' } as IncomingMessage, res)
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything())
  })

  it('returns 404 after the TTL', () => {
    vi.useFakeTimers()
    setAttachmentLinkBaseUrl('http://localhost:8082')
    const { download_url } = createAttachmentLink(file)
    vi.advanceTimersByTime(10 * 60 * 1000 + 1)
    const res = fakeRes()
    handleAttachmentDownload({ url: download_url.replace('http://localhost:8082', '') } as IncomingMessage, res)
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything())
  })

  it('evicts the oldest entry beyond the cap', () => {
    setAttachmentLinkBaseUrl('http://localhost:8082')
    const first = createAttachmentLink(file)
    for (let i = 0; i < 50; i++) createAttachmentLink(file)
    const res = fakeRes()
    handleAttachmentDownload({ url: first.download_url.replace('http://localhost:8082', '') } as IncomingMessage, res)
    expect(res.writeHead).toHaveBeenCalledWith(404, expect.anything())
  })
})
