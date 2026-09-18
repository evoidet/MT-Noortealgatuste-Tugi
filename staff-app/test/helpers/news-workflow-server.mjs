import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { newsWorkflowFixture } from "./news-workflow-fixture.mjs";
const fixture = await newsWorkflowFixture();
let app = fixture.app;
const root = new URL("../../../", import.meta.url);
const files = new Map([
  ["/", "index.html"], ["/uudised", "uudised.html"], ["/uudised/", "uudised.html"],
  ...["uudised.html", "news-data.js", "news.js", "news-home.js", "news-photo-lightbox.js", "home.css",
    "style.css", "news.css", "translations.js", "i18n.js", "script.js", "site-config.js", "sender-init.js"]
    .map((file) => [`/${file}`, file])
]);
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path.startsWith("/__test/blob/") && req.method === "PUT") {
      const pathname = decodeURIComponent(path.slice("/__test/blob/".length));
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      if (fixture.state.blobs.has(pathname)) return res.writeHead(409).end();
      fixture.state.blobs.set(pathname, Buffer.concat(chunks));
      return res.writeHead(200).end();
    }
    if (path === "/__test/control" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const command = JSON.parse(body);
      if (command.restart) app = fixture.makeApp();
      for (const key of ["aiMode", "failFinalization", "failCreateResponse", "failSubmitResponse"]) {
        if (key in command) fixture.state[key] = command[key];
      }
      return res.writeHead(200, { "content-type": "application/json" }).end("{}");
    }
    if (path === "/__test/state") {
      const items = await fixture.reader.listSubmissions();
      const attachments = (await Promise.all(items.map((item) => fixture.reader.listAttachments(item.id)))).flat();
      return res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ items, attachments,
        blobCount: fixture.state.blobs.size, aiCalls: fixture.state.aiCalls }));
    }
    const file = files.get(path);
    if (file) {
      const type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
      return res.writeHead(200, { "content-type": type }).end(await readFile(new URL(file, root)));
    }
    // Model a gateway losing the application response after COMMIT. A bare
    // socket reset may be retried transparently by Chrome and is nondeterministic.
    const droppedFlag = req.method === "POST" && path === "/api/staff/submissions" ? "failCreateResponse"
      : req.method === "POST" && path.endsWith("/submit") ? "failSubmitResponse" : null;
    if (droppedFlag && fixture.state[droppedFlag]) {
      fixture.state[droppedFlag] = false;
      const end = res.end.bind(res);
      res.end = function () {
        res.statusCode = 502;
        res.removeHeader("Content-Length");
        res.setHeader("Content-Type", "text/html");
        return end("<html>Test gateway response lost</html>");
      };
    }
    app(req, res);
  } catch (error) {
    console.error("Synthetic workflow server:", error.message);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
server.listen(0, "127.0.0.1", () => {
  fixture.state.origin = `http://127.0.0.1:${server.address().port}`;
  console.log(JSON.stringify({ port: server.address().port, cookie: fixture.config.cookieName }));
});
process.stdin.resume();
process.stdin.on("end", () => server.close(async () => { await fixture.close(); process.exit(0); }));
