import { attachDatabasePool } from "@vercel/functions";
import { createStaffApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./database.js";

const stateKey = Symbol.for("noortetugi.staff.vercel-state");

if (!globalThis[stateKey]) {
  const config = loadConfig();
  const database = openDatabase(config.storageDatabaseUrl);
  attachDatabasePool(database.raw);
  attachDatabasePool(database.rawLocks);
  const { app } = createStaffApp({ config, database });
  globalThis[stateKey] = { app, config, database };
}

export default globalThis[stateKey].app;
