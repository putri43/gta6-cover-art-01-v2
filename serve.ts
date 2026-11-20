// Tiny static server for the studio: serves app/ on localhost:8080 so the
// poster maker can be tried in a browser. No build step, no network calls.
import { createServer as makeServer } from "node:http";
import { readFile as readIt } from "node:fs/promises";
import { extname as suffixOf, join as joinPaths, normalize as tidy, dirname as parentDir } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";

const root = joinPaths(parentDir(urlToPath(import.meta.url)), "app");
const port = Number(process.env.PORT ?? 8080);

const kinds: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

const server = makeServer(async (req, res) => {
  const raw = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  const rel = tidy(raw).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]/, "") || "index.html";
  const file = joinPaths(root, rel);
  if (!file.startsWith(root)) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("nope\n");
    return;
  }
  try {
    const body = await readIt(file);
    res.writeHead(200, { "content-type": kinds[suffixOf(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("missing\n");
  }
});

server.listen(port, () => {
  console.log(`Vice City Cover Studio at http://localhost:${port}`);
});
