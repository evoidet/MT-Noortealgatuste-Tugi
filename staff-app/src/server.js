import { createStaffApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./database.js";

const config = loadConfig();
const database = openDatabase(config.storageDatabaseUrl);
await database.pruneExpired();

const { app } = createStaffApp({ config, database });
const server = app.listen(config.port, () => {
  console.log(`Noorte Tugi staff service listening on port ${config.port}.`);
});

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  server.close(async () => {
    try {
      await database.close();
      process.exit(0);
    } catch {
      process.exit(1);
    }
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
