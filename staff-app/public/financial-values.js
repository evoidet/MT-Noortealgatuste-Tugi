// Shared browser/server arithmetic: decimal input -> integer units, half-up per line.
export const termLabels = Object.freeze({
  delivery: "Täitmise koht / tarneviis",
  costs: "Hinna sisu ja lisakulud",
  payment: "Maksetingimused",
  confirmation: "Kinnitamine",
  changes: "Muudatused",
  annexes: "Lisad",
});
export function decimalUnits(value, precision = 2) {
  const text = String(value ?? "")
    .trim()
    .replace(",", ".");
  if (!new RegExp(`^\\d{1,9}(?:\\.\\d{1,${precision}})?$`).test(text))
    throw new Error("Vigane arv.");
  const [whole, fraction = ""] = text.split(".");
  return (
    BigInt(whole) * 10n ** BigInt(precision) +
    BigInt(fraction.padEnd(precision, "0"))
  );
}
export function totals(items, vatRate = 0, { allowIncomplete = false } = {}) {
  const lines = items.map((item) => {
    const missingQuantity = String(item.quantity ?? "").trim() === "";
    const missingPrice = String(item.unitPrice ?? "").trim() === "";
    if (allowIncomplete && (missingQuantity || missingPrice)) {
      if (!missingQuantity && decimalUnits(item.quantity, 4) === 0n)
        throw new Error("Kogus peab olema suurem kui null.");
      if (!missingPrice) decimalUnits(item.unitPrice);
      return null;
    }
    const quantity = decimalUnits(item.quantity, 4);
    const price = decimalUnits(item.unitPrice);
    if (quantity === 0n) throw new Error("Kogus peab olema suurem kui null.");
    const cents = (quantity * price + 5000n) / 10000n;
    if (cents > 100000000000n) throw new Error("Summa on liiga suur.");
    return Number(cents);
  });
  const subtotal = lines.reduce((sum, value) => sum + (value ?? 0), 0);
  const vat = Number(
    (BigInt(subtotal) * decimalUnits(vatRate) + 5000n) / 10000n,
  );
  return { lines, subtotal, vat, total: subtotal + vat };
}
export const money = (cents) =>
  new Intl.NumberFormat("et-EE", { style: "currency", currency: "EUR" }).format(
    cents / 100,
  );
export const dateText = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? value.split("-").reverse().join(".")
    : "";
