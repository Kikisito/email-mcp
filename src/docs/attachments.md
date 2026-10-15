# Attachments Tool - Full Documentation

## Overview
List and download email attachments.

## Important
- **list** returns metadata only (filename, content_type, size)
- **download** returns base64-encoded content, or a file reference with `mode: "file"`
- Large attachments may consume significant tokens - check size before downloading
- `account` and `uid` are required for all actions

## Actions

### list
List all attachments for an email.
```json
{"action": "list", "account": "user@gmail.com", "uid": 12345}
```
```json
{"action": "list", "account": "user@gmail.com", "uid": 12345, "folder": "INBOX"}
```

### download
Download a specific attachment by filename. Returns base64-encoded content.
```json
{"action": "download", "account": "user@gmail.com", "uid": 12345, "filename": "report.pdf"}
```

### download as file reference
Use `mode: "file"` to get a file reference instead of base64, e.g. to upload the attachment to Google Drive
without passing the bytes through the model.
```json
{"action": "download", "account": "user@gmail.com", "uid": 12345, "filename": "cv.pdf", "mode": "file"}
```
- HTTP mode: `file.download_url` (plus `file_id`, `name`, `mime_type`) is a temporary link, downloadable any number of times until it expires (10 minutes).
  Pass `{download_url, file_id}` to the other connector's file parameter.
- stdio mode: `file.path` is a local temp file.

## Parameters
- `action` - Action to perform (required): list, download
- `account` - Account email (required)
- `uid` - Email UID (required)
- `folder` - Mailbox folder (default: INBOX)
- `filename` - Attachment filename (required for download, case-insensitive)
- `mode` - `base64` (default) or `file` (download only)

## Response Fields

### list response
- `attachments[].filename` - Attachment filename
- `attachments[].content_type` - MIME type (e.g. application/pdf)
- `attachments[].size` - Size in bytes
- `attachments[].content_id` - Content-ID for inline attachments

### download response
- `filename` - Attachment filename
- `content_type` - MIME type
- `size` - Size in bytes
- `content_base64` - Base64-encoded file content (mode=base64)
- `file` - File reference (mode=file): `download_url`, `file_id`, `expires_in_seconds` (HTTP) or `path` (stdio), plus `name`, `mime_type`
