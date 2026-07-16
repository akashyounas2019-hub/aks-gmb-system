# Google Drive backup

## What you'll get

A new **Backups** section in the app with:

- **Connect Google Drive** button — each user links their own Google account.
- **Backup Now** — immediately uploads every image to their Drive, preserving folder structure.
- **Schedule** — off / daily / weekly, running automatically in the background.
- **Backup history** — status, file count, size, timestamp, error messages if any.

## How the Drive folders are laid out

```text
My Drive/
  GMB Library Backups/
    Raw Images/
      <Folder name>/     ← same folder names as in the app
        image1.jpg
      Unfiled/
        image2.jpg
    Published Images/
      ...
    Geo-Tagged Images/
      ...
    Videos/
      <video name>/
        original.mp4
        frames/
          001.jpg
```

Existing files at the same path are skipped so re-running a backup only uploads what's new or changed.

## Prerequisites (you must do this once)

Google Drive per-user access uses an **App User Connector**. A workspace admin needs to configure a Google OAuth client in workspace settings before end users can connect. I'll surface this and stop cleanly if it isn't ready — no half-built UI.

## Technical breakdown

1. **Connector wiring**
   - Use the `google_drive` App User Connector (per-user OAuth, offline access).
   - Store each user's encrypted connection key in a new server-only table `app_user_connections` (Lovable-provided encryption secret).

2. **Backup engine** (`src/lib/backup.functions.ts`, server-only)
   - Lists all live images + videos for the user.
   - Creates/reuses the Drive folder tree via `files.list` + `files.create` (mimeType `application/vnd.google-apps.folder`).
   - Downloads each object from Supabase Storage and uploads via multipart `POST /upload/drive/v3/files`.
   - Writes progress to a `backup_runs` table (status, counts, error).

3. **Schema** (single migration)
   - `app_user_connections` (user_id, connector_id, encrypted key)
   - `backup_settings` (user_id, schedule: off/daily/weekly, hour_utc, drive_root_folder_id)
   - `backup_runs` (user_id, started_at, finished_at, status, files_uploaded, bytes, error)

4. **Scheduling**
   - Public server route `/api/public/hooks/run-backups` — verifies `apikey` header, finds users whose schedule is due, runs the backup engine for each.
   - `pg_cron` job every hour that POSTs to that route.

5. **UI** (`src/routes/_authenticated/backups.tsx` + nav entry)
   - Connection status + Connect / Disconnect.
   - Backup Now button (calls the engine directly, shows live progress).
   - Schedule selector (Off / Daily / Weekly + time-of-day).
   - Runs history table.

## Out of scope for this pass

- No two-way sync (Drive → app).
- No selective backup (whole library only for v1).
- No sharing/permissions changes on the Drive folder.

## Confirm before I build

- Are you OK with the folder layout above?
- Ready to configure the Google OAuth client in Workspace → App User Connectors when I prompt you? Without it, connect will fail.
