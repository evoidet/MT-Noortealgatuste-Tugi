// Test-only local server. Never import this from production code.
import { createServer } from "node:http";
import { aiFixture } from "./ai-fixture.mjs";
const fixture = aiFixture();
const server = createServer(async (request, response) => {
  if (request.url === "/__test/ai" && request.method === "POST") {
    let body = "";
    for await (const part of request) body += part;
    const options = JSON.parse(body);
    fixture.state.behavior = options.behavior || "success";
    fixture.state.delay = options.delay || 0;
    response.writeHead(200, { "content-type": "application/json" }).end("{}");
  } else if (request.url === "/__test/ai" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ calls: fixture.state.calls }));
  } else fixture.app(request, response);
});
server.listen(0, "127.0.0.1", () => console.log(JSON.stringify({ port: server.address().port, cookie: fixture.config.cookieName })));
process.stdin.resume();
process.stdin.on("end", () => server.close(() => process.exit(0)));
