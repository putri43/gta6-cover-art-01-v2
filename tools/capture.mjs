// Takes the four screenshots in shots.json through headless Chrome's
// devtools port (Node's built-in WebSocket, no extra packages). Serves
// nothing itself: serve.ts must already run on :8080. Prints every
// request URL that is not localhost, so an offline violation is visible.
import { spawn as launch } from "node:child_process";
import { readFileSync as readIt, writeFileSync as saveFile } from "node:fs";
import { mkdtempSync as freshDir, rmSync as removeDir } from "node:fs";
import { tmpdir as tempRoot } from "node:os";
import { dirname as parentDir, join as joinPaths } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";

const here = parentDir(urlToPath(import.meta.url));
const repo = joinPaths(here, "..");
const shell = "/home/hatch/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell";
const plan = JSON.parse(readIt(joinPaths(repo, "shots.json"), "utf8"));
const width = plan.size.width;
const height = plan.size.height;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function waitForDevTools(port, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return await res.json();
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("headless shell did not open its devtools port");
}

function main() {
  const profile = freshDir(joinPaths(tempRoot(), "vcs-shots-"));
  const port = 9223;
  const browser = launch(shell, [
    `--remote-debugging-port=${port}`,
    "--no-sandbox",
    "--disable-gpu",
    `--window-size=${width},${height}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ], { stdio: "ignore" });

  const seenUrls = [];
  let ws = null;
  let nextId = 1;
  const pending = new Map();
  const events = [];
  let loadWaiter = null;

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  function onMessage(raw) {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${msg.error.message}`));
      else resolve(msg.result);
    } else if (msg.method) {
      events.push(msg);
      if (msg.method === "Network.requestWillBeSent") {
        seenUrls.push(msg.params.request.url);
      }
      if (msg.method === "Page.loadEventFired" && loadWaiter) {
        const w = loadWaiter;
        loadWaiter = null;
        w();
      }
    }
  }

  const finish = async (code) => {
    try {
      if (ws) ws.close();
    } catch {
      /* already gone */
    }
    browser.kill("SIGKILL");
    removeDir(profile, { recursive: true, force: true });
    process.exit(code);
  };

  waitForDevTools(port)
    .then(async () => {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((t) => t.type === "page");
      if (!page) throw new Error("no page target in the headless shell");
      ws = new WebSocket(page.webSocketDebuggerUrl);
      await new Promise((done, fail) => {
        ws.onopen = done;
        ws.onerror = fail;
      });
      ws.onmessage = (ev) => onMessage(ev.data);
      await send("Page.enable");
      await send("Runtime.enable");
      await send("Network.enable");
      await send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: false,
      });
      for (const shot of plan.shots) {
        const url = `http://localhost:8080${shot.page}`;
        const loaded = new Promise((done) => {
          loadWaiter = done;
        });
        await send("Page.navigate", { url });
        await Promise.race([loaded, sleep(15000)]);
        await sleep(1400);
        const { data } = await send("Page.captureScreenshot", { format: "jpeg", quality: 82 });
        const file = joinPaths(repo, "screenshots", shot.file);
        saveFile(file, Buffer.from(data, "base64"));
        console.log(`${shot.file} — ${shot.note}`);
      }
      const foreign = [...new Set(seenUrls)].filter((u) => !u.startsWith("http://localhost:8080") && !u.startsWith("http://127.0.0.1") && u !== "about:blank" && !u.startsWith("chrome"));
      console.log(`requests seen: ${seenUrls.length}, non-local: ${foreign.length}`);
      for (const u of foreign) console.log(`  FOREIGN ${u}`);
      await finish(foreign.length ? 1 : 0);
    })
    .catch((err) => {
      console.error(`capture failed: ${err.message}`);
      finish(1);
    });
}

main();
