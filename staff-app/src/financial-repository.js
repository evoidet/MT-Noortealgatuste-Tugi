import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { financialMembers } from "./staff-identities.js";
const conflict = () =>
  Object.assign(new Error("Dokument on muutunud. Laadige see uuesti."), {
    status: 409,
  });
const clean = (row) => {
  if (!row) return null;
  const { pdf, docx, ...rest } = row;
  return rest;
};
export function financialRepository(pool, transaction) {
  async function history(client, row, actor, action) {
    await client.query(
      "INSERT INTO financial_history(document_id,actor_id,action,snapshot) VALUES($1,$2,$3,$4)",
      [row.id, actor, action, JSON.stringify(clean(row))],
    );
  }
  return {
    async grantVerifiedFinancialAccess(user) {
      if (!user.googleSubjectId || !financialMembers.includes(user.email))
        return;
      await pool.query(
        "INSERT INTO financial_access(user_id) VALUES($1) ON CONFLICT DO NOTHING",
        [user.id],
      );
    },
    async hasFinancialAccess(userId) {
      return (
        (
          await pool.query("SELECT 1 FROM financial_access WHERE user_id=$1", [
            userId,
          ])
        ).rows.length > 0
      );
    },
    async listFinancialDocuments({ search = "", status = "", offset = 0, kind = "" }) {
      const result = await pool.query(
        `SELECT d.id,d.kind,d.number,d.status,d.data,d.creator_id,d.created_at,d.version,u.name AS creator_name
        FROM financial_documents d JOIN users u ON u.id=d.creator_id
        WHERE ($1='' OR d.number ILIKE '%' || $1 || '%' OR d.data->>'customer' ILIKE '%' || $1 || '%')
        AND ($2='' OR d.status=$2) AND ($4='' OR d.kind=$4) ORDER BY d.created_at DESC,d.id LIMIT 51 OFFSET $3`,
        [
          search.slice(0, 150),
          status,
          Math.trunc(Math.max(0, Math.min(100000, Number(offset) || 0))),
          kind,
        ],
      );
      return {
        documents: result.rows.slice(0, 50),
        hasMore: result.rows.length > 50,
      };
    },
    async getFinancialDocument(id, withPdf = false) {
      const columns = withPdf
        ? "*"
        : "id,kind,number,status,data,issuer,creator_id,created_at,updated_at,version,correction_of,confirmed_at,confirmed_by,confirmation_delivery_status,(docx IS NOT NULL) AS has_docx";
      const row = (
        await pool.query(
          `SELECT ${columns} FROM financial_documents WHERE id=$1`,
          [id],
        )
      ).rows[0];
      return withPdf ? row : clean(row);
    },
    async financialHistory(id) {
      return (
        await pool.query(
          `SELECT h.id,h.action,h.created_at,u.name AS actor_name
        FROM financial_history h JOIN users u ON u.id=h.actor_id WHERE document_id=$1 ORDER BY h.id`,
          [id],
        )
      ).rows;
    },
    async createFinancialDocument({
      id,
      kind,
      data,
      issuer,
      actor,
      correctionOf = null,
    }) {
      return transaction(async (client) => {
        // Retry keys are scoped to the author; conflicts never overwrite existing data.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [id]);
        const previous = (
          await client.query("SELECT * FROM financial_documents WHERE id=$1", [
            id,
          ])
        ).rows[0];
        if (previous) {
          if (previous.creator_id !== actor || previous.kind !== kind ||
              previous.correction_of !== correctionOf ||
              !isDeepStrictEqual(previous.data, data)) throw conflict();
          return clean(previous);
        }
        if (correctionOf) {
          const original = (
            await client.query(
              "SELECT status,kind FROM financial_documents WHERE id=$1",
              [correctionOf],
            )
          ).rows[0];
          if (!original || original.status === "DRAFT" || original.kind !== kind) throw conflict();
        }
        const sequence =
          kind === "invoice"
            ? "financial_invoice_number"
            : "financial_quotation_number";
        const n = (await client.query(`SELECT nextval('${sequence}') AS n`))
          .rows[0].n;
        const number = `NT-${kind === "invoice" ? "AR" : "HP"}-${data.date.slice(0, 4)}-${String(n).padStart(6, "0")}`;
        const row = (
          await client.query(
            `INSERT INTO financial_documents(id,kind,number,data,issuer,creator_id,correction_of)
          VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
            [
              id,
              kind,
              number,
              JSON.stringify(data),
              JSON.stringify(issuer),
              actor,
              correctionOf,
            ],
          )
        ).rows[0];
        await history(client, row, actor, "CREATED");
        return clean(row);
      });
    },
    async updateFinancialDocument({ id, version, data, issuer, actor }) {
      return transaction(async (client) => {
        const row = (
          await client.query(
            `UPDATE financial_documents SET data=$3,issuer=$4,version=version+1,updated_at=NOW()
          WHERE id=$1 AND version=$2 AND status='DRAFT' RETURNING *`,
            [id, version, JSON.stringify(data), JSON.stringify(issuer)],
          )
        ).rows[0];
        if (!row) throw conflict();
        await history(client, row, actor, "UPDATED");
        return clean(row);
      });
    },
    async finalizeFinancialDocument({ id, version, pdf = null, docx = null, actor, confirmation = null }) {
      return transaction(async (client) => {
        const row = (
          await client.query(
            `UPDATE financial_documents SET pdf=$3,docx=$4,status='READY',version=version+1,updated_at=NOW(),
            confirmed_at=NOW(),confirmed_by=$5,confirmation_delivery_status=$6
          WHERE id=$1 AND version=$2 AND status='DRAFT' RETURNING *`,
            [id, version, pdf, docx, actor, confirmation ? 'SENDING' : null],
          )
        ).rows[0];
        if (!row) throw conflict();
        if (confirmation) {
          await client.query(`INSERT INTO financial_deliveries(id,document_id,actor_id,recipient,subject,message,status,purpose)
            VALUES($1,$2,$3,$4,$5,$6,'SENDING','confirmation')`,
          [confirmation.deliveryId, id, actor, confirmation.recipient, confirmation.subject, confirmation.message]);
        }
        await history(client, row, actor, "FINALIZED");
        return clean(row);
      });
    },
    async finishFinancialConfirmation({ id, deliveryId, actor, accepted }) {
      return transaction(async (client) => {
        const status = accepted ? 'SENT' : 'UNCERTAIN';
        const result = await client.query(`UPDATE financial_deliveries SET status=$3,completed_at=NOW()
          WHERE id=$1 AND document_id=$2 AND purpose='confirmation' AND status='SENDING' RETURNING id`, [deliveryId,id,status]);
        if (!result.rows.length) throw conflict();
        const row = (await client.query(`UPDATE financial_documents SET confirmation_delivery_status=$2,updated_at=NOW()
          WHERE id=$1 RETURNING *`, [id,status])).rows[0];
        await history(client,row,actor,`CONFIRMATION_${status}`);
        return clean(row);
      });
    },
    async claimFinancialDelivery({ id, actor, recipient, subject, message }) {
      return transaction(async (client) => {
        const row = (
          await client.query(
            `UPDATE financial_documents SET status='SENDING',version=version+1,updated_at=NOW()
          WHERE id=$1 AND status='READY' RETURNING *`,
            [id],
          )
        ).rows[0];
        if (!row) throw conflict();
        const deliveryId = randomUUID();
        await client.query(
          `INSERT INTO financial_deliveries(id,document_id,actor_id,recipient,subject,message,status)
          VALUES($1,$2,$3,$4,$5,$6,'SENDING')`,
          [deliveryId, id, actor, recipient, subject, message],
        );
        await history(client, row, actor, "SEND_STARTED");
        return { row, deliveryId };
      });
    },
    async finishFinancialDelivery({ id, deliveryId, actor, accepted }) {
      return transaction(async (client) => {
        const status = accepted ? "SENT" : "UNCERTAIN";
        await client.query(
          "UPDATE financial_deliveries SET status=$2,completed_at=NOW() WHERE id=$1",
          [deliveryId, status],
        );
        const row = (
          await client.query(
            `UPDATE financial_documents SET status=$2,version=version+1,updated_at=NOW()
          WHERE id=$1 AND status='SENDING' RETURNING *`,
            [id, status],
          )
        ).rows[0];
        if (!row) throw conflict();
        await history(client, row, actor, status);
        return clean(row);
      });
    },
  };
}
