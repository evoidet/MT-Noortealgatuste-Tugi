// Verified against the named public profiles in index.html and the owner's request.
export const emailChanges = Object.freeze({
  "egor@noortetugi.ee": "egor.stepanov@noortetugi.ee",
  "sofia@noortetugi.ee": "sofia.germ@noortetugi.ee",
  "andrei@noortetugi.ee": "andrei.ostretsov@noortetugi.ee",
  "jekaterina@noortetugi.ee": "jekaterina.rogozina@noortetugi.ee",
  "mihhail@noortetugi.ee": "mihhail.semiyanov@noortetugi.ee",
  "mario@noortetugi.ee": "mario.polshin@noortetugi.ee",
});
export const newMembers = [
  "erik.kovaltsuk@noortetugi.ee",
  "mihhail.komarov@noortetugi.ee",
];
export const financialMembers = [
  "egor.stepanov@noortetugi.ee",
  "mihhail.komarov@noortetugi.ee",
];
export function currentEmail(value) {
  const email = String(value ?? "")
    .trim()
    .toLowerCase();
  return emailChanges[email] || email;
}
export function policyHasEmail(set, email) {
  const actual = String(email ?? "").trim().toLowerCase();
  // Upgrade legacy policy entries to the current address, never authorize an
  // old/reassigned address merely because its successor is now allowed.
  return [...set].some((value) =>
    String(value).trim().toLowerCase() === actual || currentEmail(value) === actual);
}
