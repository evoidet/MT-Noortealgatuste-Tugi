// Shared supplier identity. VAT is intentionally explicit, never inferred from an address.
export const organization = Object.freeze({
  name: "MTÜ Noortealgatuste Tugi",
  registrationCode: "80652930",
  address: "Maleva tn 35-32, 31025 Kohtla-Järve, Eesti",
  email: "juhatus@noortetugi.ee",
  bank: "AS LHV Pank",
  iban: "EE077700771011606476",
  bic: "LHVBEE22",
});
export function financialIssuer() {
  const status = process.env.FINANCE_VAT_REGISTERED;
  if (!["true", "false"].includes(status)) return null;
  const vatRegistered = status === "true";
  const vatNumber = String(process.env.FINANCE_VAT_NUMBER || "").trim();
  const rate = Number(process.env.FINANCE_VAT_RATE);
  if (
    vatRegistered &&
    (!/^EE\d{9}$/.test(vatNumber) ||
      !Number.isFinite(rate) ||
      rate <= 0 ||
      rate > 100)
  )
    return null;
  return {
    ...organization,
    vatRegistered,
    vatNumber: vatRegistered ? vatNumber : "",
    vatRate: vatRegistered ? rate : 0,
  };
}
