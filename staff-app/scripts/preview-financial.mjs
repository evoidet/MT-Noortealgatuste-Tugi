// Offline synthetic specimens: no database, configured credentials, email or production effects.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateFinancialPdf } from "../src/financial-pdf.js";
import { validateFinancialData } from "../src/financial-validation.js";
import { organization } from "../src/organization.js";
const directory = resolve(
  process.argv[2] || "staff-app/private/generated/pdf-review",
);
await mkdir(directory, { recursive: true });
const issuer = {
  ...organization,
  vatRegistered: false,
  vatRate: 0,
  vatNumber: "",
};
for (const kind of ["quotation", "invoice", "long", "multiline"]) {
  const data = validateFinancialData(
    {
      date: "2026-10-16",
      dueDate: "2026-10-30",
      customer: "Testklient ÕÄÖÜ",
      address: "Testi tänav 1, Tallinn",
      project: "Sünteetiline kujunduse kontroll",
      execution: "Oktoober 2026",
      items: Array.from({ length: kind === "long" ? 45 : 2 }, (_, i) => ({
        description: kind === "multiline" && i === 0
          ? Array.from({ length: 100 }, (_, line) => `Rida ${line + 1}`).join("\n")
          : `Testteenus ${i + 1}: noorte töötoa ettevalmistus ja läbiviimine`,
        quantity: "2",
        unit: "tund",
        unitPrice: "123,45",
      })),
      terms: {
        payment: "Tasumine 14 päeva jooksul arve kuupäevast.",
        delivery: "Tallinn",
        costs: "Kõik kulud sisalduvad kogumaksumuses.",
        changes: "Muudatused lepitakse eelnevalt kokku e-posti teel.",
      },
    },
    issuer,
    true,
  );
  const pdf = await generateFinancialPdf({
    kind: ["long", "multiline"].includes(kind) ? "quotation" : kind,
    number: `TEST-${kind.toUpperCase()}`,
    status: "READY",
    data,
    issuer,
  });
  await writeFile(resolve(directory, `${kind}.pdf`), pdf);
}
console.log(`Synthetic PDF specimens written to ${directory}`);
