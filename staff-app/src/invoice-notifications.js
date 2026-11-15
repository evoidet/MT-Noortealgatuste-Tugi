import { createHash } from 'node:crypto';
import { assertInvoiceAttachments, INVOICE_COPY_EMAIL } from './mail.js';
import { safeOperationalError } from './safe-errors.js';
import { money } from '../public/financial-values.js';

export function invoiceSnapshotKey(doc) {
  const { issuer } = doc;
  // Enriched drafts and persisted JSONB snapshots can have different key order.
  // Keep existing delivery keys for older snapshots.
  const hasContacts = issuer && ['phone', 'mobile', 'website'].some(key => Object.hasOwn(issuer, key));
  const snapshot = hasContacts ? Object.fromEntries(Object.keys(issuer).sort().map(key => [key, issuer[key]])) : issuer;
  return createHash('sha256').update(JSON.stringify([doc.number, doc.data, snapshot, doc.correction_of])).digest('hex');
}

export function createInvoiceNotifier({ database, mailService, logger = console }) {
  return async function notify(doc, { pdf, docx }, actor, legacy = false) {
    const log = (event, error) => logger.error(event, safeOperationalError(error, 'INVOICE_EMAIL_UNCERTAIN'));
    const notification = {
      recipient: INVOICE_COPY_EMAIL, subject: `Arve koopia – ${doc.number}`,
      message: `Arve: ${doc.number}\nTellija: ${doc.data.customer}\nKogusumma: ${money(doc.data.totals.total)}\nArve PDF- ja Wordi failid on manuses.`,
      snapshotKey: invoiceSnapshotKey(doc),
    };
    try {
      assertInvoiceAttachments(pdf, docx);
      const deliveryId = await database.claimInvoiceDownload({ id: doc.id, actor, legacy, ...notification });
      if (!deliveryId) return;
      let accepted = false;
      try {
        const result = await mailService.sendFinancialDocument({ ...notification, number: doc.number, pdf, docx, deliveryId, invoiceCopy: true });
        accepted = (result.accepted || []).some(v => String(v).toLowerCase() === INVOICE_COPY_EMAIL);
        if (!accepted) log('invoice_copy_email_unaccepted', null);
      } catch (error) { log('invoice_copy_email_failed', error); }
      await database.finishInvoiceDownload({ deliveryId, accepted });
    } catch (error) { log('invoice_copy_delivery_record_failed', error); }
  };
}
