# Database backups

The Supabase **free tier has no point-in-time recovery**, so the
[`Nightly DB backup`](../.github/workflows/backup.yml) GitHub Action dumps the
whole database once a day and stores it as a downloadable artifact (kept for
90 days). It's a free safety net until/unless you upgrade to Supabase Pro
(which adds managed daily backups + PITR).

## One-time setup

You need to give the Action a connection string. Use the **Session pooler**
string, because GitHub's runners only have IPv4 and Supabase's *direct*
connection is IPv6-only on the free tier.

1. In the Supabase dashboard → your **Vault** project → **Connect** (top bar).
2. Choose **Session pooler** (port `5432`). Copy the URI — it looks like:
   `postgresql://postgres.jpukcgqumytxjwflxrtd:[YOUR-PASSWORD]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`
3. Replace `[YOUR-PASSWORD]` with your database password (Settings → Database →
   reset it there if you don't have it).
4. In GitHub → repo **Settings → Secrets and variables → Actions → Secrets** →
   **New repository secret**:
   - Name: `SUPABASE_DB_URL`
   - Value: the full connection string from step 3
5. Trigger a test run: **Actions** tab → **Nightly DB backup** → **Run
   workflow**. When it's green, open the run and download the
   `vault-db-backup` artifact to confirm you got a `.sql.gz` file.

> The secret is a database credential — keep it only in GitHub Secrets, never
> in the repo. The backup artifacts contain user data; the repo is public but
> **artifacts are not** (only people with repo access can download them).

## Restoring

To restore a dump into a database (e.g. a fresh Supabase project, or local):

```bash
gunzip vault-backup-YYYYMMDDThhmmssZ.sql.gz
psql "<target-connection-string>" -f vault-backup-YYYYMMDDThhmmssZ.sql
```

For a partial restore (one table), open the `.sql` file and copy out the
relevant `COPY`/`INSERT` block, or re-dump a single table with
`pg_dump --table=public.<name>`.

## Notes

- Schedule: `03:17 UTC` daily. Change the `cron` in `backup.yml` to adjust.
- Retention: 90 days (the GitHub artifact maximum). For longer-term archival,
  add a step that pushes the dump to R2 / S3 / Google Drive.
- The dump uses `--no-owner --no-privileges` so it restores cleanly into a
  project with different role names.
