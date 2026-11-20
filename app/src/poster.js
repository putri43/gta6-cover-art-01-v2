// Vice City Cover Studio — poster painter, written for this entry.
// renderPoster(canvas, photos, state) paints one complete GTA-style
// poster on any 2D canvas: multi-panel photo layouts, sunset / neon
// colour grades, procedural palms, a lit skyline strip under the
// caption, halftone + seeded grain, and big caption lettering.
// Canvas primitives and system fonts only — no external art, no
// copied game assets, no network. All randomness comes from a seeded
// generator, so the same state always exports identical PNG bytes.

export const LAYOUTS = ['hero', 'grid', 'mosaic', 'bleed', 'tilted', 'split'];
export const GRADES = ['sunset', 'neon', 'gold', 'drive', 'noir'];
export const SIZES = [
  { id: '1080x1080', w: 1080, h: 1080, label: 'Square 1080 x 1080' },
  { id: '1080x1350', w: 1080, h: 1350, label: 'Portrait 1080 x 1350' },
  { id: '1920x1080', w: 1920, h: 1080, label: 'Wide 1920 x 1080' },
];
export const LAYOUT_LABELS = {
  hero: 'Hero + 3', grid: 'Four Panel', mosaic: 'Nine Panel',
  bleed: 'Full Bleed', tilted: 'Snapshots', split: 'Diagonal Split',
};
export const GRADE_LABELS = {
  sunset: 'Vice Sunset', neon: 'Neon Nights', gold: 'Palm Gold',
  drive: 'Ocean Drive', noir: 'Mono Noir',
};

/** A fresh poster state. `cells` holds one crop slot per panel. */
export function freshState() {
  return {
    layout: 'hero',
    grade: 'sunset',
    sizeId: '1080x1080',
    title: 'NEON SHORE',
    subtitle: 'sunset boulevard',
    titleStyle: 'gradient',
    onePhoto: true,
    palms: true,
    halftone: true,
    grain: true,
    badge: true,
    stars: true,
    skyline: true,
    cells: Array.from({ length: 9 }, (_, i) => ({ photo: i % 2, zoom: 1, dx: 0, dy: 0 })),
  };
}

/** mulberry32 — the only randomness in the painter, fully seeded. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Cell geometry for a layout, as fractions of the photo area.
 * Each cell: x, y, w, h in 0..1, default photo index, optional tilt
 * (degrees) or diagonal clip ('top' / 'bottom').
 */
export function cellsFor(layout) {
  switch (layout) {
    case 'hero': return [
      { x: 0, y: 0, w: 0.6, h: 1, photo: 0 },
      { x: 0.6, y: 0, w: 0.4, h: 0.34, photo: 1 },
      { x: 0.6, y: 0.34, w: 0.4, h: 0.33, photo: 0 },
      { x: 0.6, y: 0.67, w: 0.4, h: 0.33, photo: 1 },
    ];
    case 'grid': return [
      { x: 0, y: 0, w: 0.5, h: 0.5, photo: 0 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5, photo: 1 },
      { x: 0, y: 0.5, w: 0.5, h: 0.5, photo: 1 },
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5, photo: 0 },
    ];
    case 'mosaic':
      return Array.from({ length: 9 }, (_, i) => ({
        x: (i % 3) / 3, y: Math.floor(i / 3) / 3, w: 1 / 3, h: 1 / 3, photo: i % 2,
      }));
    case 'bleed': return [{ x: 0, y: 0, w: 1, h: 1, photo: 0 }];
    case 'tilted': return [
      { x: 0.03, y: 0.05, w: 0.34, h: 0.84, photo: 0, tilt: -4 },
      { x: 0.34, y: 0.01, w: 0.34, h: 0.84, photo: 1, tilt: 3 },
      { x: 0.64, y: 0.05, w: 0.34, h: 0.84, photo: 0, tilt: 7 },
    ];
    case 'split': return [
      { x: 0, y: 0, w: 1, h: 1, photo: 0, clip: 'top' },
      { x: 0, y: 0, w: 1, h: 1, photo: 1, clip: 'bottom' },
    ];
    default: return [{ x: 0, y: 0, w: 1, h: 1, photo: 0 }];
  }
}

/** Cover-fits one image into a rect, honouring zoom and pan. */
function drawCover(ctx, img, rx, ry, rw, rh, zoom, dx, dy) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const s = Math.max(rw / iw, rh / ih) * zoom;
  const dw = iw * s, dh = ih * s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  ctx.drawImage(img, rx + (rw - dw) / 2 + dx * rw, ry + (rh - dh) / 2 + dy * rh, dw, dh);
  ctx.restore();
}

/**
 * Fills a tapered ribbon along a polyline: samples the centreline and
 * builds a polygon whose half-width shrinks from w0 to w1. Used for
 * palm trunks and fronds so they read as solid shapes, not strokes.
 */
function ribbon(ctx, pts, w0, w1) {
  const n = pts.length;
  const left = [], right = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[Math.min(n - 1, i + 1)];
    const r = pts[Math.max(0, i - 1)];
    let nx = -(q[1] - r[1]), ny = q[0] - r[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    left.push([p[0] + nx * w, p[1] + ny * w]);
    right.push([p[0] - nx * w, p[1] - ny * w]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i++) ctx.lineTo(left[i][0], left[i][1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
}

/** Samples a quadratic bezier into a point list. */
function quadPts(x0, y0, cx, cy, x1, y1, steps = 20) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([
      (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1,
      (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1,
    ]);
  }
  return pts;
}

/** A palm silhouette: leaning ribbon trunk, seven ribbon fronds. */
function drawPalm(ctx, x, y, s, lean, color) {
  ctx.save();
  ctx.fillStyle = color;
  const crownX = x + lean, crownY = y - s;
  // Trunk: gentle curve, wide at the base.
  ribbon(ctx, quadPts(x, y, x + lean * 0.25, y - s * 0.55, crownX, crownY, 14), s * 0.085, s * 0.035);
  // Fronds arc out of the crown and droop.
  for (let i = 0; i < 7; i++) {
    const a = (-165 + i * 50) * (Math.PI / 180);
    const len = s * (0.7 - Math.abs(i - 3) * 0.06);
    const tipX = crownX + Math.cos(a) * len;
    const tipY = crownY + Math.sin(a) * len * 0.55 + s * 0.16;
    const midX = crownX + Math.cos(a) * len * 0.55;
    const midY = crownY + Math.sin(a) * len * 0.55 - s * 0.2;
    ribbon(ctx, quadPts(crownX, crownY, midX, midY, tipX, tipY), s * 0.045, 1);
  }
  ctx.restore();
}

let halftoneCache = null;
function halftoneFill(ctx) {
  if (halftoneCache) return halftoneCache;
  const c = document.createElement('canvas');
  c.width = 14; c.height = 14;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.85)';
  g.beginPath(); g.arc(3.5, 3.5, 2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(10.5, 10.5, 2, 0, Math.PI * 2); g.fill();
  halftoneCache = ctx.createPattern(c, 'repeat');
  return halftoneCache;
}

let grainCache = null;
function grainFill(ctx) {
  if (grainCache) return grainCache;
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const g = c.getContext('2d');
  const img = g.createImageData(96, 96);
  const rnd = mulberry32(0xc0ffee);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainCache = ctx.createPattern(c, 'repeat');
  return grainCache;
}

const GRADE_TABLE = {
  sunset: { stops: ['#ff8c42', '#ff2e63', '#6a1fb5'], mode: 'soft-light', alpha: 0.6, warm: 0.12 },
  neon: { stops: ['#00e5ff', '#ff2fb3', '#1a0b2e'], mode: 'overlay', alpha: 0.55, warm: 0 },
  gold: { stops: ['#ffd319', '#ff7b00', '#5c1a00'], mode: 'soft-light', alpha: 0.55, warm: 0.14 },
  drive: { stops: ['#00b4ff', '#0057ff', '#02163f'], mode: 'soft-light', alpha: 0.55, warm: 0 },
  noir: { stops: ['#9d8cff', '#4a2d7a', '#0d0518'], mode: 'soft-light', alpha: 0.5, warm: 0 },
};

/** Washes the colour grade over a rect (noir desaturates first). */
function gradeWash(ctx, grade, rx, ry, rw, rh) {
  const g = GRADE_TABLE[grade] || GRADE_TABLE.sunset;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  if (grade === 'noir') {
    ctx.globalCompositeOperation = 'saturation';
    ctx.fillStyle = '#808080';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.globalCompositeOperation = 'source-over';
  }
  const grad = ctx.createLinearGradient(rx, ry, rx + rw * 0.3, ry + rh);
  grad.addColorStop(0, g.stops[0]);
  grad.addColorStop(0.55, g.stops[1]);
  grad.addColorStop(1, g.stops[2]);
  ctx.globalCompositeOperation = g.mode;
  ctx.globalAlpha = g.alpha;
  ctx.fillStyle = grad;
  ctx.fillRect(rx, ry, rw, rh);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  if (g.warm > 0) {
    ctx.globalAlpha = g.warm;
    ctx.fillStyle = '#ff7a18';
    ctx.fillRect(rx, ry, rw, rh);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** A tilted badge ribbon. */
function drawBadge(ctx, x, y, w, h, label) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.09);
  const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  grad.addColorStop(0, '#ff2e63');
  grad.addColorStop(1, '#ff8a00');
  ctx.fillStyle = grad;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = h * 0.5;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.45);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.font = `900 ${h * 0.42}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 0, h * 0.03);
  ctx.restore();
}

/** The caption: big fitted title + italic subtitle with side rules. */
function drawCaption(ctx, title, subtitle, style, cx, topY, maxW, baseSize) {
  const text = (title || 'UNTITLED').trim().toUpperCase();
  let size = baseSize;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const setFont = (s) => {
    ctx.font = `900 ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    try { ctx.letterSpacing = `${Math.round(s * 0.04)}px`; } catch { /* no letterSpacing */ }
  };
  setFont(size);
  while (ctx.measureText(text).width > maxW && size > 18) {
    size -= 3;
    setFont(size);
  }
  const y = topY + size;
  ctx.shadowColor = 'rgba(255, 46, 99, 0.8)';
  ctx.shadowBlur = size * 0.26;
  ctx.lineJoin = 'round';
  if (style === 'gradient') {
    const grad = ctx.createLinearGradient(cx - maxW / 2, y - size, cx + maxW / 2, y);
    grad.addColorStop(0, '#ffd319');
    grad.addColorStop(0.45, '#ff2e63');
    grad.addColorStop(1, '#8c1eff');
    ctx.strokeStyle = '#160423';
    ctx.lineWidth = Math.max(3, size * 0.09);
    ctx.strokeText(text, cx, y);
    ctx.fillStyle = grad;
    ctx.fillText(text, cx, y);
  } else if (style === 'outline') {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(2, size * 0.045);
    ctx.strokeText(text, cx, y);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillText(text, cx, y);
  } else {
    ctx.strokeStyle = '#160423';
    ctx.lineWidth = Math.max(3, size * 0.08);
    ctx.strokeText(text, cx, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, cx, y);
  }
  ctx.shadowBlur = 0;
  const sub = (subtitle || '').trim();
  if (sub) {
    const subSize = Math.max(14, size * 0.3);
    ctx.font = `italic 600 ${subSize}px Georgia, "Times New Roman", serif`;
    try { ctx.letterSpacing = `${Math.round(subSize * 0.26)}px`; } catch { /* no letterSpacing */ }
    ctx.fillStyle = '#ffe9a8';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = subSize * 0.3;
    const subY = y + subSize * 1.7;
    const tw = ctx.measureText(sub).width;
    ctx.fillText(sub, cx, subY);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,233,168,0.85)';
    ctx.lineWidth = Math.max(1.5, subSize * 0.07);
    const gap = tw / 2 + subSize * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - gap - subSize * 3, subY - subSize * 0.32);
    ctx.lineTo(cx - gap, subY - subSize * 0.32);
    ctx.moveTo(cx + gap, subY - subSize * 0.32);
    ctx.lineTo(cx + gap + subSize * 3, subY - subSize * 0.32);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * The skyline strip: procedural tower silhouettes with lit windows
 * along the bottom of the caption band — the poster's signature row.
 */
function drawSkyline(ctx, x, y, w, h) {
  const rnd = mulberry32(0x51d3);
  ctx.save();
  ctx.fillStyle = '#0d0318';
  let cx = x;
  while (cx < x + w) {
    const bw = 26 + rnd() * 54;
    const bh = h * (0.35 + rnd() * 0.6);
    ctx.fillRect(cx, y + h - bh, bw, bh);
    // Lit windows in this tower.
    for (let wy = y + h - bh + 6; wy < y + h - 6; wy += 11) {
      for (let wx = cx + 5; wx < cx + bw - 5; wx += 10) {
        if (rnd() < 0.3) {
          ctx.fillStyle = rnd() < 0.8 ? '#ffd319' : '#ff8c42';
          ctx.fillRect(wx, wy, 4, 5);
          ctx.fillStyle = '#0d0318';
        }
      }
    }
    cx += bw + 4 + rnd() * 10;
  }
  ctx.restore();
}

/**
 * Paints the whole poster. `photos` is an array of images (or nulls),
 * `state` a poster state; the canvas is painted at its own pixel size.
 */
export function renderPoster(canvas, photos, state) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const frame = Math.round(Math.min(W, H) * 0.022);
  const gap = Math.round(Math.min(W, H) * 0.011);
  const bleed = state.layout === 'bleed';
  const bandH = bleed ? Math.round(H * 0.3) : Math.round(H * 0.235);
  const ax = frame, ay = frame;
  const aw = W - frame * 2;
  const ah = H - frame * 2 - (bleed ? 0 : bandH);

  // Paper frame + deep plum ground.
  ctx.fillStyle = '#fdf6ec';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b0b33';
  ctx.fillRect(ax, ay, aw, ah + (bleed ? 0 : bandH));

  const cells = cellsFor(state.layout);
  cells.forEach((cell, i) => {
    const crop = state.cells[i] || { photo: 0, zoom: 1, dx: 0, dy: 0 };
    const photoIndex = state.onePhoto ? 0 : (crop.photo ?? cell.photo ?? 0);
    const rx = ax + cell.x * aw, ry = ay + cell.y * ah;
    const rw = cell.w * aw, rh = cell.h * ah;
    const ix = rx + (cell.x > 0 ? gap / 2 : 0);
    const iy = ry + (cell.y > 0 ? gap / 2 : 0);
    const iw = rw - (cell.x > 0 ? gap / 2 : 0) - (cell.x + cell.w < 1 ? gap / 2 : 0);
    const ih = rh - (cell.y > 0 ? gap / 2 : 0) - (cell.y + cell.h < 1 ? gap / 2 : 0);
    ctx.save();
    if (cell.clip === 'top') {
      ctx.beginPath();
      ctx.moveTo(ax, ay); ctx.lineTo(ax + aw, ay); ctx.lineTo(ax, ay + ah);
      ctx.closePath(); ctx.clip();
    } else if (cell.clip === 'bottom') {
      ctx.beginPath();
      ctx.moveTo(ax + aw, ay + ah); ctx.lineTo(ax + aw, ay); ctx.lineTo(ax, ay + ah);
      ctx.closePath(); ctx.clip();
    } else if (cell.tilt) {
      const cx = ix + iw / 2, cy = iy + ih / 2;
      ctx.translate(cx, cy);
      ctx.rotate((cell.tilt * Math.PI) / 180);
      ctx.translate(-cx, -cy);
      ctx.fillStyle = '#fdf6ec';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = gap * 2;
      ctx.fillRect(ix - gap, iy - gap, iw + gap * 2, ih + gap * 2);
      ctx.shadowBlur = 0;
    }
    const photo = photos[photoIndex] || photos[0] || null;
    if (photo) {
      drawCover(ctx, photo, ix, iy, iw, ih, crop.zoom || 1, crop.dx || 0, crop.dy || 0);
    } else {
      // Empty cell: a sunset placeholder so the layout still reads.
      const ph = ctx.createLinearGradient(ix, iy, ix, iy + ih);
      ph.addColorStop(0, '#ff8c42');
      ph.addColorStop(1, '#6a1fb5');
      ctx.fillStyle = ph;
      ctx.fillRect(ix, iy, iw, ih);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `700 ${Math.max(12, iw * 0.05)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('+ ADD PHOTO', ix + iw / 2, iy + ih / 2);
    }
    gradeWash(ctx, state.grade, ix, iy, iw, ih);
    ctx.restore();
  });

  // Diagonal split seam.
  if (state.layout === 'split') {
    ctx.save();
    ctx.strokeStyle = '#fdf6ec';
    ctx.lineWidth = gap * 1.4;
    ctx.beginPath();
    ctx.moveTo(ax + aw, ay);
    ctx.lineTo(ax, ay + ah);
    ctx.stroke();
    ctx.restore();
  }

  // Warm glow from the top-right of the photo area.
  if ((state.grade === 'sunset' || state.grade === 'gold') && state.layout !== 'mosaic') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = ctx.createRadialGradient(ax + aw, ay, 0, ax + aw, ay, Math.min(W, H) * 0.45);
    glow.addColorStop(0, 'rgba(255, 210, 110, 0.5)');
    glow.addColorStop(1, 'rgba(255, 210, 110, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(ax, ay, aw, ah);
    ctx.restore();
  }

  // Halftone across the lower half of the photo area.
  if (state.halftone) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = halftoneFill(ctx);
    ctx.fillRect(ax, ay + ah * 0.55, aw, ah * 0.45);
    ctx.restore();
  }

  // Palm silhouettes in the lower corners of the photo area,
  // clipped to the photo area so no frond spills onto the frame.
  if (state.palms) {
    const s = Math.min(W, H) / 1080;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ax, ay, aw, ah);
    ctx.clip();
    ctx.globalAlpha = 0.92;
    drawPalm(ctx, ax + aw * 0.055, ay + ah * 0.985, s * 1.05 * 180, s * 26, '#150826');
    drawPalm(ctx, ax + aw * 0.945, ay + ah * 0.985, s * 0.85 * 180, -s * 20, '#150826');
    ctx.restore();
  }

  // Caption band: gradient rising from the bottom.
  const bandY = ay + ah;
  if (!bleed) {
    const band = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
    band.addColorStop(0, 'rgba(27,11,51,0)');
    band.addColorStop(0.35, '#1b0b33');
    band.addColorStop(1, '#12041f');
    ctx.fillStyle = band;
    ctx.fillRect(ax, bandY, aw, bandH);
  } else {
    const veil = ctx.createLinearGradient(0, H - bandH, 0, H);
    veil.addColorStop(0, 'rgba(18,4,31,0)');
    veil.addColorStop(1, 'rgba(18,4,31,0.88)');
    ctx.fillStyle = veil;
    ctx.fillRect(ax, H - bandH, aw, bandH);
  }
  // Neon rule above the title.
  ctx.fillStyle = '#ff2e63';
  ctx.fillRect(ax + aw * 0.08, bandY + bandH * 0.06, aw * 0.84, Math.max(2, H * 0.004));

  drawCaption(
    ctx, state.title, state.subtitle, state.titleStyle,
    ax + aw / 2, bandY + bandH * 0.14, aw * 0.92, Math.min(W, H) * 0.105,
  );

  // Skyline strip along the bottom of the caption band.
  if (state.skyline) {
    drawSkyline(ctx, ax, bandY + bandH * 0.86, aw, bandH * 0.14);
  }

  // Badge ribbon + star row float over the photo area.
  if (state.badge) {
    const bw = Math.min(W, H) * 0.3;
    drawBadge(ctx, ax + bw / 2 + frame * 0.4, ay + Math.min(W, H) * 0.045, bw, Math.min(W, H) * 0.052, '★ SUNSET EDITION ★');
  }
  if (state.stars) {
    ctx.save();
    ctx.font = `900 ${Math.round(Math.min(W, H) * 0.038)}px Arial, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd319';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.fillText('★★★★★', ax + aw - frame * 0.4, ay + Math.min(W, H) * 0.045);
    ctx.restore();
  }

  // Film grain + vignette over everything.
  if (state.grain) {
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = grainFill(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(20,0,40,0)');
  vig.addColorStop(1, 'rgba(20,0,40,0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}
