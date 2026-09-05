# Recover an uncertain expense notification

An interrupted or ambiguous SMTP attempt returns `SUBMISSION_DELIVERY_UNCERTAIN`. Automatic retries stop because the mail server may already have accepted the notification. This preserves the submission and prevents duplicate email.

Use provider delivery records or the finance recipient's confirmed receipt to determine whether the specific attempt was delivered. Select `not-sent` only when non-delivery is confirmed. If the outcome remains unknown, leave the marker unchanged.

From the repository root, in the existing trusted environment with `STORAGE_DATABASE_URL_UNPOOLED` configured, inspect the proposed recovery without writing:

```sh
npm run db:reconcile-delivery -- --submission <submission-uuid> --outcome sent
```

After confirming the result, add `--apply` to persist the reconciliation:

```sh
npm run db:reconcile-delivery -- --submission <submission-uuid> --outcome sent --apply
```

Use `--outcome not-sent` in both commands when non-delivery has been confirmed. Never include credentials or connection strings in commands or output.

The default command is a dry-run. Applying recovery changes only the current uncertain delivery audit marker: it adds a confirmed sent or rejected event with the same delivery key and reconciliation metadata. It does not send email, modify documents, or change submission data/status. It refuses active processing, finalized submissions, non-expense submissions, and already resolved attempts.

After `sent`, retry Submit once to finish the database status without another email. After `not-sent`, retry Submit once to perform a new notification attempt. A repeat recovery command refuses to overwrite an already resolved outcome. The tool uses the same transaction advisory lock as the application and prints only the submission ID and recovery state.
