// Shared supplier identity. VAT is intentionally explicit, never inferred from an address.
export const organization = Object.freeze({
  name: "MTÜ Noortealgatuste Tugi",
  registrationCode: "80652930",
  address: "Ida-Viru maakond, Kohtla-Järve linn, Ahtme linnaosa, Maleva tn 35-32, 31025",
  email: "juhatus@noortetugi.ee",
  phone: "+372 5695 5261",
  mobile: "+372 5887 9888",
  website: "noortetugi.ee",
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

export function completeDraftIssuer(saved, configured) {
  if (!configured) return saved;
  const { vatRegistered, vatNumber, vatRate, ...details } = configured;
  const issuer = { ...saved };
  for (const [key, value] of Object.entries(details)) {
    const stored = issuer[key];
    if (stored == null || (typeof stored === "string" && !stored.trim())) issuer[key] = value;
  }
  // VAT and the saved amounts belong to the same snapshot.
  if (typeof issuer.vatRegistered !== "boolean") Object.assign(issuer, { vatRegistered, vatNumber, vatRate });
  return issuer;
}
