/**
 * Attachments Mega Tool
 * List and download email attachments
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { attachmentLinksAvailable, createAttachmentLink } from '../helpers/attachment-links.js'
import type { AccountConfig } from '../helpers/config.js'
import { resolveSingleAccount } from '../helpers/config.js'
import { createUnknownActionError, EmailMCPError, withErrorHandling } from '../helpers/errors.js'
import { getAttachment, readEmail } from '../helpers/imap-client.js'

export interface AttachmentsInput {
  action: 'list' | 'download'

  // Required
  account: string
  uid: number

  // Optional
  folder?: string
  filename?: string
  /** base64 (default): content inline. file: a file reference (download_url in HTTP mode, local path in stdio). */
  mode?: 'base64' | 'file'
}

/**
 * Unified attachments tool - handles attachment operations
 */
export async function attachments(accounts: AccountConfig[], input: AttachmentsInput): Promise<any> {
  return withErrorHandling(async () => {
    if (!input.account) {
      throw new EmailMCPError(
        'account is required for attachment operations',
        'VALIDATION_ERROR',
        'Provide the account email address'
      )
    }

    if (!input.uid) {
      throw new EmailMCPError(
        'uid is required for attachment operations',
        'VALIDATION_ERROR',
        'Provide the email UID from search/read'
      )
    }

    switch (input.action) {
      case 'list':
        return await handleList(accounts, input)

      case 'download':
        return await handleDownload(accounts, input)

      default:
        throw createUnknownActionError(input.action, 'list, download')
    }
  })()
}

/**
 * List attachments for an email
 */
async function handleList(accounts: AccountConfig[], input: AttachmentsInput): Promise<any> {
  const account = resolveSingleAccount(accounts, input.account)
  const folder = input.folder || 'INBOX'

  const email = await readEmail(account, input.uid, folder)

  return {
    action: 'list',
    account: account.email,
    uid: input.uid,
    folder,
    subject: email.subject,
    total: email.attachments.length,
    attachments: email.attachments
  }
}

/**
 * Download a specific attachment (base64 inline, or as a file reference when mode=file)
 */
async function handleDownload(accounts: AccountConfig[], input: AttachmentsInput): Promise<any> {
  if (!input.filename) {
    throw new EmailMCPError(
      'filename is required for download action',
      'VALIDATION_ERROR',
      'Use attachments list action first to see available filenames'
    )
  }

  const account = resolveSingleAccount(accounts, input.account)
  const folder = input.folder || 'INBOX'

  const attachment = await getAttachment(account, input.uid, folder, input.filename)

  if (input.mode === 'file') {
    const { content_base64, ...meta } = attachment
    const content = Buffer.from(content_base64, 'base64')
    return {
      action: 'download',
      account: account.email,
      uid: input.uid,
      folder,
      ...meta,
      file: await toFileReference(meta.filename, meta.content_type, content)
    }
  }

  return {
    action: 'download',
    account: account.email,
    uid: input.uid,
    folder,
    ...attachment
  }
}

/**
 * HTTP mode: short-lived download URL (the `{ download_url, file_id }` shape other
 * connectors accept as a file parameter). stdio: write to a local temp dir and return the path.
 */
async function toFileReference(filename: string, contentType: string, content: Buffer): Promise<Record<string, any>> {
  // Check if HTTP mode is available and create a short-lived download link if so.
  // Otherwise, write to a temp file and return the path.
  if (attachmentLinksAvailable()) {
    const link = createAttachmentLink({ filename, contentType, content })
    return { name: filename, mime_type: contentType, ...link }
  }

  // basename() strips any directory components a hostile filename could carry
  const dir = join(tmpdir(), 'better-email-mcp-attachments', `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  await mkdir(dir, { recursive: true })
  const path = join(dir, basename(filename.replaceAll('\\', '/')) || 'attachment')
  await writeFile(path, content)
  return { name: filename, mime_type: contentType, path }
}
