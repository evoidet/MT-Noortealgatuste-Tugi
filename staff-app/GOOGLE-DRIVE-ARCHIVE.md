# Google Drive expense archive

The Drive archive is an optional server-side addition to expense submission.
Vercel Blob remains the source for application attachments and the existing
finance email remains the required delivery path.

## Google Cloud and Drive setup

1. In Google Cloud Console, select the project that will own this integration
   and enable **Google Drive API** under APIs & Services.
2. Under IAM & Admin > Service Accounts, create a dedicated service account,
   for example `noortetugi-drive-archive`. Do not enable domain-wide delegation.
3. Open the service account, choose Keys > Add key > Create new key > JSON, and
   download the key once. The JSON `client_email` and `private_key` fields are
   used below. Store the downloaded file securely and delete local copies after
   the values have been entered into Vercel.
4. The validator supports metadata checks for both Shared Drive folders and
   ordinary My Drive folders shared with the service account. Binary archival
   must target a Shared Drive: Google service accounts have no storage quota
   and cannot own uploaded files in a normal My Drive hierarchy. `driveId` is
   not used as a parentage test because Google only returns it for Shared Drive
   items; the explicit `parents` relationship remains the security check.
5. Share the archive root folder configured by
   `GOOGLE_DRIVE_ROOT_FOLDER_ID` with the service-account email as **Editor**.
   For a Shared Drive hierarchy, folder access or **Content manager** membership
   can be used according to Workspace policy.
6. Ensure each staff personal folder is a direct child of the configured archive
   root. The application reads both folders and verifies the child's `parents`
   metadata before writing.

The implementation uses server-to-server authentication and the Drive scope
`https://www.googleapis.com/auth/drive`. It does not change or reuse the staff
Google-login OAuth client. Although the OAuth scope is broad, the service
account can reach only content granted to that account; limit its folder grants
or Shared Drive membership to this archive.

## Vercel Production variables

Create these server-side variables in Vercel Project Settings > Environment
Variables for **Production**. Mark the email, private key, and mapping sensitive.
Do not prefix any name with `NEXT_PUBLIC_` and do not paste values into source.

```text
GOOGLE_DRIVE_ARCHIVE_ENABLED=true
GOOGLE_DRIVE_ROOT_FOLDER_ID=<archive root folder ID>
GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL=<client_email from the service-account JSON key>
GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY=<private_key from the service-account JSON key>
GOOGLE_DRIVE_USER_FOLDER_MAP={"<member1>@noortetugi.ee":"<folder-id-1>","<member2>@noortetugi.ee":"<folder-id-2>","<member3>@noortetugi.ee":"<folder-id-3>","<member4>@noortetugi.ee":"<folder-id-4>","<member5>@noortetugi.ee":"<folder-id-5>","<member6>@noortetugi.ee":"<folder-id-6>"}
```

`GOOGLE_DRIVE_ROOT_FOLDER_ID` is the value after `/folders/` in the archive
root URL. Each mapping value is the value after `/folders/` in that staff
folder's URL. Keys must be the exact authenticated staff email addresses. Each
value must be a distinct folder ID; configuration rejects an empty map or a
folder assigned to multiple accounts. Add or remove mappings as the staff
roster changes.

Vercel accepts the private key either with real newlines or escaped `\n`
sequences. Runtime configuration normalizes escaped newlines. Do not wrap JSON
or the PEM in additional quote characters.

An unmapped email is recorded as `DRIVE_FOLDER_NOT_CONFIGURED`. It is never
routed to another person's folder, and the existing finance email and submission
finalization continue.

## Migration and deployment

Deploy migration `006_google_drive_archival.sql` before enabling archival:

```sh
npm run db:migrate
npm run db:check
```

Then add the five variables and redeploy the same revision. Submit one synthetic
expense for a mapped staff account and verify one submission folder containing
the generated DOCX plus every original attachment. Retry Submit and verify that
the folder, files, and finance email are not duplicated.

Each remote folder carries the submission ID in Drive `appProperties`; each file
also carries a stable generated-document or attachment key. PostgreSQL records
folder/status metadata. This lets retries rediscover remote objects after a
successful Drive write followed by a failed database write.
