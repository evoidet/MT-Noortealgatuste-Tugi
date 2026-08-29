import { createStaffApp } from "./app.js";
import { loadConfig } from "./config.js";
import { openDatabase } from "./database.js";

const config = loadConfig();
const database = openDatabase(config.databasePath);
database.pruneExpired();

const { app } = createStaffApp({ config, database });
const server = app.listen(config.port, () => {
  console.log(`Noorte Tugi staff service listening on port ${config.port}.`);
});

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down.`);
  server.close(() => {
    database.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

