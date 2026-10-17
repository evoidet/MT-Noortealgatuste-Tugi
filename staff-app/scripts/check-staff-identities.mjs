// Read-only post-deployment check. Does not load or display environment files/credentials.
import { openDatabase } from "../src/database.js";
import { emailChanges, newMembers, financialMembers } from "../src/staff-identities.js";
const db = openDatabase(process.env.STORAGE_DATABASE_URL);
try {
  for (const [oldEmail, newEmail] of Object.entries(emailChanges)) {
    const [oldUser, newUser] = await Promise.all([
      db.getUserByEmail(oldEmail),
      db.getUserByEmail(newEmail),
    ]);
    console.log(
      `${oldEmail} -> ${newEmail}: ${oldUser && newUser ? "CONFLICT: verify both Google identities; no automatic merge" : newUser ? "current account exists" : oldUser ? "migration pending" : "account not yet provisioned"}`,
    );
  }
  for (const email of new Set([...newMembers, ...financialMembers])) {
    const user = await db.getUserByEmail(email);
    console.log(
      `${email}: ${user ? `account exists; role: ${user.role}; financial access: ${await db.hasFinancialAccess(user.id)}` : "awaiting first verified Google login"}`,
    );
  }
} catch {
  console.error(
    "Identity check failed. Verify database availability and migration 011.",
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
