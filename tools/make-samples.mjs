// Draws the two sample photos from scratch: a sunset boulevard and an
// ocean pier at dusk. Own software rasterizer plus a small PNG writer
// (zlib for the pixel data, hand-rolled CRC32 for the chunks). No images
// are read in; every pixel is computed here, so the samples are the
// studio's own art.
import { deflateSync as squeeze } from "node:zlib";
import { writeFileSync as saveFile } from "node:fs";
import { dirname as parentDir, join as joinPaths } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";

const here = parentDir(urlToPath(import.meta.url));
const outDir = joinPaths(here, "..", "app", "samples");

function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mix(c1, c2, t) {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

class Canvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
  }
  put(x, y, c, alpha = 1) {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    if (ix < 0 || iy < 0 || ix >= this.w || iy >= this.h) return;
    const o = (iy * this.w + ix) * 3;
    if (alpha >= 1) {
      this.px[o] = c[0];
      this.px[o + 1] = c[1];
      this.px[o + 2] = c[2];
    } else {
      this.px[o] = Math.round(this.px[o] * (1 - alpha) + c[0] * alpha);
      this.px[o + 1] = Math.round(this.px[o + 1] * (1 - alpha) + c[1] * alpha);
      this.px[o + 2] = Math.round(this.px[o + 2] * (1 - alpha) + c[2] * alpha);
    }
  }
  rect(x0, y0, x1, y1, c, alpha = 1) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) {
        this.put(x, y, c, alpha);
      }
    }
  }
  vgrad(y0, y1, stops) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++) {
      const t = (y - y0) / (y1 - y0);
      let c = stops[stops.length - 1][1];
      for (let i = 0; i < stops.length - 1; i++) {
        if (t >= stops[i][0] && t <= stops[i + 1][0]) {
          const lt = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
          c = mix(stops[i][1], stops[i + 1][1], lt);
          break;
        }
      }
      for (let x = 0; x < this.w; x++) this.put(x, y, c);
    }
  }
  disc(cx, cy, r, c, alpha = 1) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.put(x, y, c, alpha);
      }
    }
  }
  line(x0, y0, x1, y1, c, thick = 1) {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      this.disc(x, y, thick / 2, c);
    }
  }
  poly(points, c, alpha = 1) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of points) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    for (let y = Math.max(0, Math.floor(minY)); y < Math.min(this.h, Math.ceil(maxY)); y++) {
      const xs = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
          const t = (y - a[1]) / (b[1] - a[1]);
          xs.push(a[0] + (b[0] - a[0]) * t);
        }
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.max(0, Math.floor(xs[k])); x < Math.min(this.w, Math.ceil(xs[k + 1])); x++) {
          this.put(x, y, c, alpha);
        }
      }
    }
  }
}

const NIGHT = [16, 7, 26];
const SUN = [255, 190, 90];
const PALM = [14, 6, 20];

function palm(cv, bx, by, size, lean, rnd) {
  // Trunk: mostly upright, a gentle lean that grows toward the crown.
  let x = bx;
  let y = by;
  const segs = 9;
  const step = size / segs;
  let drift = lean / segs;
  for (let i = 0; i < segs; i++) {
    const nx = x + drift;
    const ny = y - step;
    cv.line(x, y, nx, ny, PALM, Math.max(2, size * 0.04 * (1 - (i / segs) * 0.45)));
    x = nx;
    y = ny;
    drift += (lean / segs) * 0.12;
  }
  // Crown: fronds fan upward and outward, then droop at the tips.
  const fronds = 7;
  for (let f = 0; f < fronds; f++) {
    const ang = -1.25 + (f / (fronds - 1)) * 2.5;
    const len = size * (0.48 + rnd() * 0.2);
    const dirX = Math.sin(ang);
    const dirY = -Math.cos(ang);
    let fx = x;
    let fy = y;
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const nx = x + dirX * len * t;
      const ny = y + dirY * len * t + len * 0.34 * t * t;
      cv.line(fx, fy, nx, ny, PALM, Math.max(1.5, size * 0.018 * (1 - t * 0.55)));
      fx = nx;
      fy = ny;
    }
  }
  cv.disc(x, y, size * 0.04, PALM);
}

function boulevard() {
  const W = 960;
  const H = 600;
  const cv = new Canvas(W, H);
  const rnd = seeded(20261119);
  cv.vgrad(0, H, [
    [0, [43, 16, 85]],
    [0.45, [214, 74, 110]],
    [0.72, [255, 126, 46]],
    [1, [255, 190, 110]],
  ]);
  // Sun low over the street.
  cv.disc(W * 0.5, H * 0.66, 74, SUN, 0.35);
  cv.disc(W * 0.5, H * 0.66, 58, SUN, 0.55);
  cv.disc(W * 0.5, H * 0.66, 44, [255, 224, 150]);
  // Distant towers on both sides.
  const towers = [
    [0, 300, 70, 150], [84, 330, 56, 120], [150, 315, 64, 135],
    [760, 310, 68, 140], [838, 335, 58, 115], [906, 305, 54, 145],
  ];
  for (const [tx, ty, tw, th] of towers) {
    cv.rect(tx, H - 210 - th + 60, tx + tw, H - 150, [26, 12, 40]);
    for (let wy = H - 210 - th + 72; wy < H - 160; wy += 16) {
      for (let wx = tx + 8; wx < tx + tw - 8; wx += 14) {
        if (rnd() > 0.5) cv.rect(wx, wy, wx + 5, wy + 7, [255, 209, 102], 0.85);
      }
    }
  }
  // Road: a dark trapezoid widening toward the viewer.
  cv.poly([[W * 0.42, H * 0.72], [W * 0.58, H * 0.72], [W * 0.98, H], [W * 0.02, H]], [24, 10, 32]);
  // Centre dashes, growing with perspective.
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const y = H * (0.74 + 0.26 * t);
    const wdt = 3 + 26 * t * t;
    cv.rect(W / 2 - wdt / 2, y, W / 2 + wdt / 2, y + 4 + 10 * t, [255, 209, 102], 0.9);
  }
  // Sidewalks and palms.
  cv.poly([[0, H * 0.78], [W * 0.42, H * 0.72], [W * 0.02, H], [0, H]], [38, 18, 48]);
  cv.poly([[W, H * 0.78], [W * 0.58, H * 0.72], [W * 0.98, H], [W, H]], [38, 18, 48]);
  palm(cv, 90, H * 0.82, 150, -8, rnd);
  palm(cv, 210, H * 0.78, 120, 6, rnd);
  palm(cv, 850, H * 0.8, 140, 7, rnd);
  palm(cv, 760, H * 0.86, 105, -5, rnd);
  return cv;
}

function pier() {
  const W = 960;
  const H = 600;
  const cv = new Canvas(W, H);
  const rnd = seeded(20261120);
  cv.vgrad(0, H * 0.52, [
    [0, [6, 24, 34]],
    [0.6, [30, 90, 96]],
    [1, [255, 150, 80]],
  ]);
  // Sea: warm horizon bands cooling downward.
  cv.vgrad(H * 0.52, H, [
    [0, [214, 110, 70]],
    [0.25, [90, 70, 90]],
    [1, [10, 26, 40]],
  ]);
  // Sun and its shimmer path on the water.
  cv.disc(W * 0.68, H * 0.5, 46, [255, 224, 150]);
  cv.disc(W * 0.68, H * 0.5, 30, [255, 240, 200]);
  for (let i = 0; i < 90; i++) {
    const y = H * 0.54 + rnd() * H * 0.42;
    const wdt = 12 + rnd() * 70 * (y / H);
    const x = W * 0.68 + (rnd() - 0.5) * (90 + (y - H * 0.52) * 0.5);
    cv.rect(x - wdt / 2, y, x + wdt / 2, y + 2.5, [255, 200, 120], 0.16 + rnd() * 0.3);
  }
  // Pier: planks receding to the horizon point.
  const vx = W * 0.68;
  const vy = H * 0.52;
  cv.poly([[vx - 26, vy], [vx + 26, vy], [W * 0.86, H], [W * 0.5, H]], [52, 32, 24]);
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const y = vy + (H - vy) * t * t;
    const half = 26 + (W * 0.18) * t * t;
    cv.line(vx - half, y, vx + half, y, [24, 14, 12], 2 + 3 * t);
  }
  // Posts with lamps along both edges.
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const y = vy + (H - vy) * t * t;
    const spread = 26 + (W * 0.18) * t * t;
    for (const s of [-1, 1]) {
      const px = vx + s * spread;
      cv.line(px, y, px, y - 26 - 30 * t, [20, 12, 10], 4 + 4 * t);
      cv.disc(px, y - 30 - 30 * t, 5 + 5 * t, [255, 220, 140], 0.5);
      cv.disc(px, y - 30 - 30 * t, 3 + 3 * t, [255, 240, 190]);
    }
  }
  // Faint far skyline on the left.
  for (const [tx, tw, th] of [[40, 46, 60], [96, 34, 84], [138, 52, 48], [198, 30, 66]]) {
    cv.rect(tx, H * 0.52 - th, tx + tw, H * 0.52, [16, 26, 38]);
  }
  // Two palms framing the pier's near end.
  palm(cv, 60, H * 0.98, 130, 6, rnd);
  palm(cv, 920, H * 0.99, 110, -6, rnd);
  return cv;
}

// --- PNG writer ---

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
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function writePng(cv, path) {
  const raw = Buffer.alloc(cv.h * (1 + cv.w * 3));
  for (let y = 0; y < cv.h; y++) {
    raw[y * (1 + cv.w * 3)] = 0;
    raw.set(cv.px.subarray(y * cv.w * 3, (y + 1) * cv.w * 3), y * (1 + cv.w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(cv.w, 0);
  ihdr.writeUInt32BE(cv.h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", squeeze(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  saveFile(path, png);
  return png.length;
}

const b = writePng(boulevard(), joinPaths(outDir, "boulevard.png"));
const p = writePng(pier(), joinPaths(outDir, "pier.png"));
console.log(`boulevard.png ${b} bytes, pier.png ${p} bytes`);
