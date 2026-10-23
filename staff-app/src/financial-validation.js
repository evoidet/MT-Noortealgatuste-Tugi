import { z } from "zod";
import { totals, termLabels } from "../public/financial-values.js";
const text = z.string().trim().max(1500).default("");
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(v);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  });
const schema = z.object({
  date,
  dueDate: date,
  supplyDate: z.preprocess((value) => value === "" ? undefined : value, date.optional()),
  currency: z.literal("EUR").default("EUR"),
  customer: text,
  registrationCode: text,
  address: text,
  contact: text,
  email: z.union([z.email(), z.literal("")]).default(""),
  phone: text,
  execution: text,
  project: text,
  referenceNumber: z
    .string()
    .regex(/^\d{0,20}$/)
    .default(""),
  explanation: text,
  items: z
    .array(
      z.object({
        description: z.string().trim().max(1000),
        quantity: z.union([z.string(), z.number()]),
        unit: z.string().trim().max(30),
        unitPrice: z.union([z.string(), z.number()]),
      }),
    )
    .min(1)
    .max(100),
  terms: z
    .object(
      Object.fromEntries(Object.keys(termLabels).map((key) => [key, text])),
    )
    .default({}),
});
export function validateFinancialData(value, issuer, complete = false) {
  try {
    const data = schema.parse(value);
    if (data.dueDate < data.date) throw new Error();
    const sums = totals(data.items, issuer.vatRate, { allowIncomplete: !complete });
    if (
      complete &&
      (!data.customer ||
        !data.address ||
        data.items.some((i) => !i.description || !i.unit))
    )
      throw new Error();
    return { ...data, totals: sums };
  } catch {
    throw Object.assign(
      new Error(
        "Kontrollige kuupäevi, tellija andmeid ja kauba või teenuse ridu.",
      ),
      { status: 422 },
    );
  }
}
export const deliverySchema = z.object({
  confirmed: z.literal(true),
  recipient: z.email().max(254),
  subject: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .regex(/^[^\r\n]+$/),
  message: z.string().trim().min(1).max(10000),
});
