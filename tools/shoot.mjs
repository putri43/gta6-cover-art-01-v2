// Takes the 4 screenshots for Vice City Cover Studio.
// Serves app/ locally, drives the Playwright headless shell over CDP,
// waits for window.__shotReady on each ?shot= scene, and saves JPEGs
// to screenshots/. Also records every network request the pages make
// and fails if any of them leaves localhost — the app must be offline.
//
//   node tools/shoot.mjs
// Requires: node serve.ts (started here) and the headless shell at
// ~/.cache/ms-playwright/chromium_headless_shell-1255/...

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));
mkdirSync(join(repo, 'screenshots'), { recursive: true });

const SHELL = join(
  homedir(),
  '.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell',
);
const PORT = 8123;
const DEBUG_PORT = 9223;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal CDP client over Node's built-in WebSocket. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      } else if (data.method) {
        this.events.push(data);
      }
    };
  }
  call(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = (e) => reject(new Error(`ws error: ${e.message || 'unknown'}`));
    });
    return new Cdp(ws);
  }
}

async function waitFor(predicate, timeoutMs, label) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await sleep(250);
  }
  throw new Error(`timeout waiting for ${label}`);
}

const server = spawn('node', ['serve.ts', '--port', String(PORT)], { cwd: repo, stdio: 'pipe' });
const browser = spawn(SHELL, [
  '--headless', '--no-sandbox', '--disable-gpu',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--user-data-dir=/tmp/vc-cover-profile',
  'about:blank',
], { stdio: 'pipe' });

const requestedUrls = [];
let failed = null;
try {
  await waitFor(async () => {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/`);
      return res.ok;
    } catch { return false; }
  }, 15000, 'local server');
  const version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
  const cdp = await Cdp.connect(version.webSocketDebuggerUrl);

  for (const shot of shots) {
    const { targetId } = await cdp.call('Target.createTarget', {
      url: 'about:blank',
    });
    const { sessionId } = await cdp.call('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params = {}) => cdp.call(method, params, sessionId);
    await call('Page.enable');
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Emulation.setDeviceMetricsOverride', {
      width: shot.w, height: shot.h, deviceScaleFactor: 1, mobile: false,
    });
    const url = `http://127.0.0.1:${PORT}/index.html${shot.query}`;
    await call('Page.navigate', { url });
    await waitFor(async () => {
      const r = await call('Runtime.evaluate', {
        expression: 'window.__shotReady === true',
        returnByValue: true,
      });
      return r?.result?.value === true;
    }, 30000, `__shotReady for ${shot.name}`);
    const { data } = await call('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
    writeFileSync(join(repo, 'screenshots', shot.name), Buffer.from(data, 'base64'));
    console.log(`shot ${shot.name} (${shot.w}x${shot.h})`);
    await cdp.call('Target.closeTarget', { targetId });
  }

  // Offline check: every request the pages made must be local.
  for (const ev of cdp.events) {
    if (ev.method === 'Network.requestWillBeSent') {
      requestedUrls.push(ev.params.request.url);
    }
  }
  const external = requestedUrls.filter((u) => !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u));
  console.log(`requests seen: ${requestedUrls.length}, external: ${external.length}`);
  if (external.length > 0) {
    console.log(external.join('\n'));
    throw new Error('offline check failed: external requests seen');
  }
} catch (e) {
  failed = e;
  console.error(e.message);
} finally {
  browser.kill('SIGKILL');
  server.kill('SIGTERM');
}

if (failed) process.exit(1);
console.log('all shots done');
