// Generates the two sample photos for Vice City Cover Studio.
// Pure Node stdlib: a tiny PNG encoder (zlib + CRC32) and a small
// software rasterizer. Both scenes are procedural sunset art drawn
// pixel by pixel — no external images, no network.
//
//   node tools/generate-samples.mjs
// Writes app/samples/boulevard.png (640x800) and app/samples/pier.png (800x800).

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Deterministic PRNG (mulberry32) so the samples never change. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** CRC-32 (IEEE) over a Buffer. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 8 + data.length);
  return out;
}

/** Encodes an RGBA buffer (no alpha used, a=255) as a PNG. */
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** A mutable RGB canvas with a few drawing helpers. */
class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = Buffer.alloc(w * h * 4);
  }
  set(x, y, r, g, b) {
    const xi = x | 0, yi = y | 0;
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const o = (yi * this.w + xi) * 4;
    this.px[o] = r; this.px[o + 1] = g; this.px[o + 2] = b; this.px[o + 3] = 255;
  }
  /** Vertical gradient between two stops, stops = [[t, r, g, b], ...]. */
  vgrad(y0, y1, stops) {
    for (let y = 0; y < this.h; y++) {
      const t = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
      let i = 0;
      while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
      const a = stops[i], b = stops[i + 1];
      const f = (t - a[0]) / (b[0] - a[0] || 1);
      const r = Math.round(a[1] + (b[1] - a[1]) * f);
      const g = Math.round(a[2] + (b[2] - a[2]) * f);
      const bl = Math.round(a[3] + (b[3] - a[3]) * f);
      for (let x = 0; x < this.w; x++) this.set(x, y, r, g, bl);
    }
  }
  rect(x0, y0, x1, y1, r, g, b) {
    for (let y = Math.max(0, y0 | 0); y < Math.min(this.h, y1 | 0); y++) {
      for (let x = Math.max(0, x0 | 0); x < Math.min(this.w, x1 | 0); x++) this.set(x, y, r, g, b);
    }
  }
  /** Filled disc with soft edge (1px antialias ring). */
  disc(cx, cy, rad, r, g, b) {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++) {
      for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= rad) this.set(x, y, r, g, b);
        else if (d <= rad + 1) this.set(x, y, Math.round((r + 40) / 2), Math.round((g + 40) / 2), Math.round((b + 40) / 2));
      }
    }
  }
  /** Thick line segment, stamped with discs along its length. */
  thickLine(x0, y0, x1, y1, thick, r, g, b) {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, thick / 2, r, g, b);
    }
  }
  /** A palm silhouette: curved trunk + tapered drooping fronds.
   *  `lean` is the crown's horizontal offset in pixels from the base. */
  palm(bx, by, size, lean, r, g, b) {
    const topX = bx + lean, topY = by - size;
    // Trunk: discs along a gentle curve, tapering toward the crown.
    const segs = 18;
    let px = bx, py = by;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const nx = bx + lean * t * t;
      const ny = by - size * t;
      const w = Math.max(2.5, size * 0.05 * (1 - t * 0.55));
      const steps = Math.ceil(Math.hypot(nx - px, ny - py)) + 1;
      for (let s = 0; s <= steps; s++) {
        const f = s / steps;
        this.disc(px + (nx - px) * f, py + (ny - py) * f, w, r, g, b);
      }
      px = nx; py = ny;
    }
    // Fronds: tapered leaves stamped along a quadratic arc out of the crown.
    for (let i = 0; i < 7; i++) {
      const ang = (-168 + i * 50) * (Math.PI / 180);
      const len = size * (0.68 - Math.abs(i - 3) * 0.06);
      const cxp = topX + Math.cos(ang) * len * 0.5;
      const cyp = topY + Math.sin(ang) * len * 0.5 - size * 0.18;
      const tipX = topX + Math.cos(ang) * len;
      const tipY = topY + Math.sin(ang) * len * 0.55 + size * 0.14;
      const steps = 24;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const qx = (1 - t) * (1 - t) * topX + 2 * (1 - t) * t * cxp + t * t * tipX;
        const qy = (1 - t) * (1 - t) * topY + 2 * (1 - t) * t * cyp + t * t * tipY;
        const w = Math.max(1.2, size * 0.035 * (1 - t * 0.85));
        this.disc(qx, qy, w, r, g, b);
      }
    }
  }
}

function lerp(a, b, t) { return a + (b - a) * t; }

/** Boulevard at sunset: sky, sun, towers, road, palms. */
function boulevard() {
  const W = 640, H = 800;
  const c = new Canvas(W, H);
  c.vgrad(0, 540, [[0, 43, 16, 85], [0.45, 255, 46, 99], [0.8, 255, 140, 66], [1, 255, 211, 25]]);
  // Sun glow + disc.
  for (let y = 300; y < 540; y++) {
    for (let x = 200; x < 640; x++) {
      const d = Math.hypot(x - 430, y - 430);
      if (d < 150) {
        const f = 1 - d / 150;
        const o = (y * W + x) * 4;
        c.px[o] = Math.min(255, c.px[o] + f * 60);
        c.px[o + 1] = Math.min(255, c.px[o + 1] + f * 40);
      }
    }
  }
  c.disc(430, 430, 78, 255, 243, 176);
  // Tower blocks left and right.
  const rnd = mulberry32(20261120);
  const towers = [[0, 300, 150, 540], [120, 210, 250, 540], [470, 260, 600, 540], [560, 330, 640, 540]];
  for (const [x0, y0, x1, y1] of towers) {
    c.rect(x0, y0, x1, y1, 26, 11, 46);
    // Lit windows.
    for (let wy = y0 + 14; wy < y1 - 12; wy += 22) {
      for (let wx = x0 + 12; wx < x1 - 12; wx += 20) {
        if (rnd() < 0.42) c.rect(wx, wy, wx + 9, wy + 12, 255, 211, 25);
      }
    }
  }
  // Road: perspective trapezoid from the horizon to the bottom edge.
  for (let y = 540; y < H; y++) {
    const t = (y - 540) / (H - 540);
    const half = lerp(60, 300, t);
    const cx = W / 2;
    // Dark ground either side of the road.
    for (let x = 0; x < Math.floor(cx - half); x++) c.set(x, y, 28, 15, 51);
    for (let x = Math.ceil(cx + half); x < W; x++) c.set(x, y, 28, 15, 51);
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      c.set(x, y, 36, 21, 54);
    }
    // Centre dashes.
    if (Math.floor(y / 26) % 2 === 0) {
      const dw = lerp(3, 10, t);
      for (let x = Math.floor(cx - dw); x <= Math.ceil(cx + dw); x++) c.set(x, y, 255, 211, 25);
    }
  }
  // Palms silhouetted against the sunset, flanking the road.
  c.palm(64, 548, 175, 22, 21, 8, 38);
  c.palm(590, 548, 150, -18, 21, 8, 38);
  return encodePng(W, H, c.px);
}

/** Ocean pier at dusk: sky, sun, sea with a light column, pier deck. */
function pier() {
  const W = 800, H = 800;
  const c = new Canvas(W, H);
  c.vgrad(0, 470, [[0, 27, 42, 107], [0.5, 255, 94, 120], [0.85, 255, 179, 71], [1, 255, 211, 25]]);
  c.disc(400, 430, 70, 255, 243, 176);
  // Sea.
  const rnd = mulberry32(777);
  for (let y = 470; y < H; y++) {
    const t = (y - 470) / (H - 470);
    const r = Math.round(lerp(58, 18, t));
    const g = Math.round(lerp(26, 10, t));
    const b = Math.round(lerp(94, 51, t));
    for (let x = 0; x < W; x++) c.set(x, y, r, g, b);
    // Wave glints.
    for (let i = 0; i < 14; i++) {
      const wx = Math.floor(rnd() * W);
      const wl = 20 + rnd() * 70;
      for (let x = wx; x < Math.min(W, wx + wl); x++) {
        c.set(x, y, Math.min(255, r + 90), Math.min(255, g + 60), Math.min(255, b + 30));
      }
    }
  }
  // Sun reflection column under the sun.
  for (let y = 470; y < H; y++) {
    const t = (y - 470) / (H - 470);
    const half = 26 + t * 90;
    for (let x = Math.floor(400 - half); x <= Math.ceil(400 + half); x++) {
      if (rnd() < 0.5) {
        const o = (y * W + x) * 4;
        c.px[o] = Math.min(255, c.px[o] + 120);
        c.px[o + 1] = Math.min(255, c.px[o + 1] + 80);
        c.px[o + 2] = Math.min(255, c.px[o + 2] + 20);
      }
    }
  }
  // Pier deck: receding trapezoid + planks + posts.
  for (let y = 500; y < H; y++) {
    const t = (y - 500) / (H - 500);
    const half = lerp(46, 260, t);
    for (let x = Math.floor(400 - half); x <= Math.ceil(400 + half); x++) {
      c.set(x, y, 74, 48, 32);
    }
    if (y % 18 < 3) {
      for (let x = Math.floor(400 - half); x <= Math.ceil(400 + half); x++) c.set(x, y, 52, 33, 22);
    }
  }
  // Side posts and rails, shrinking toward the horizon.
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const y = Math.round(lerp(505, 780, t));
    const half = lerp(46, 260, t);
    const hgt = lerp(16, 60, t);
    c.rect(400 - half - 8, y - hgt, 400 - half, y, 52, 33, 22);
    c.rect(400 + half, y - hgt, 400 + half + 8, y, 52, 33, 22);
  }
  // Birds in the sky + a small boat on the horizon.
  const bird = (x, y, s) => {
    c.thickLine(x - s, y, x, y + s * 0.45, 2.5, 30, 12, 50);
    c.thickLine(x, y + s * 0.45, x + s, y, 2.5, 30, 12, 50);
  };
  bird(150, 120, 14); bird(210, 160, 11); bird(620, 110, 13); bird(680, 170, 10);
  c.rect(600, 458, 660, 468, 30, 12, 50);
  c.thickLine(630, 458, 630, 430, 3, 30, 12, 50);
  return encodePng(W, H, c.px);
}

writeFileSync(join(root, 'app/samples/boulevard.png'), boulevard());
writeFileSync(join(root, 'app/samples/pier.png'), pier());
console.log('wrote app/samples/boulevard.png + app/samples/pier.png');
