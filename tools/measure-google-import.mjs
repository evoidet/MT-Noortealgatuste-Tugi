// Isolated local cold-import comparison. No credentials, requests or provider calls.
import { spawnSync } from "node:child_process";
for (const module of [
  "googleapis",
  "googleapis/build/src/apis/drive/index.js",
]) {
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const code = `const start=performance.now();await import(${JSON.stringify(module)});console.log(JSON.stringify({ms:performance.now()-start,rss:process.memoryUsage().rss}));`;
    const result = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", code],
      { encoding: "utf8" },
    );
    if (result.status !== 0) throw new Error("Import measurement failed");
    samples.push(JSON.parse(result.stdout));
  }
  console.log(JSON.stringify({ module, samples }));
}
