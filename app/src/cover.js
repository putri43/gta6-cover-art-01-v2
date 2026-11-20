// Vice City Cover Studio — poster engine (my own implementation).
// paintPoster draws one complete GTA-style poster on any 2D canvas:
// multi-panel photo layouts, sunset / neon colour grades, procedural
// palm silhouettes, halftone + seeded grain, and big caption lettering.
// Everything is canvas primitives and system fonts: no external art,
// no copied game assets, no network. The grain comes from a seeded
// generator, so the same state always exports the same PNG bytes.

export const LAYOUTS = ['hero', 'grid', 'mosaic', 'bleed', 'tilted', 'split'];
export const GRADES = ['sunset', 'neon', 'gold', 'drive', 'noir'];
export const SIZES = [
  { id: '1080x1080', w: 1080, h: 1080, label: 'Square 1080 x 1080' },
  { id: '1080x1350', w: 1080, h: 1350, label: 'Portrait 1080 x 1350' },
  { id: '1920x1080', w: 1920, h: 1080, label: 'Wide 1920 x 1080' },
];

export const LAYOUT_NAMES = {
  hero: 'Hero + 3',
  grid: 'Four Panel',
  mosaic: 'Nine Panel',
  bleed: 'Full Bleed',
  tilted: 'Snapshots',
  split: 'Diagonal Split',
};

export const GRADE_NAMES = {
  sunset: 'Vice Sunset',
  neon: 'Neon Nights',
  gold: 'Palm Gold',
  drive: 'Ocean Drive',
  noir: 'Mono Noir',
};

/** Fresh default state for a new poster. */
export function defaultState() {
  return {
    layout: 'hero',
    grade: 'sunset',
    sizeId: '1080x1080',
    title: 'NEON SHORE',
    subtitle: 'sunset boulevard',
    titleStyle: 'gradient',
    onePhoto: true,
    showPalms: true,
    halftone: true,
    grain: true,
    badge: true,
    stars: true,
    // One slot per panel the layout can show (max 9): photo, zoom, pan.
    panels: Array.from({ length: 9 }, (_, i) => ({
      photo: i === 0 ? 0 : 1,
      zoom: 1,
      ox: 0,
      oy: 0,
    })),
  };
}

/** Seeded generator (splitmix32) — grain is identical on every export. */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let z = a;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    z = (z ^ (z >>> 15)) >>> 0;
    return z / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Panel rectangles for a layout, as fractions of the photo area
 * (x, y, w, h in 0..1). `photo` is the default photo for that panel.
 */
export function layoutRects(layout) {
  switch (layout) {
    case 'hero':
      return [
        { x: 0, y: 0, w: 0.6, h: 1, photo: 0 },
        { x: 0.6, y: 0, w: 0.4, h: 0.34, photo: 1 },
        { x: 0.6, y: 0.34, w: 0.4, h: 0.33, photo: 0 },
        { x: 0.6, y: 0.67, w: 0.4, h: 0.33, photo: 1 },
      ];
    case 'grid':
      return [
        { x: 0, y: 0, w: 0.5, h: 0.5, photo: 0 },
        { x: 0.5, y: 0, w: 0.5, h: 0.5, photo: 1 },
        { x: 0, y: 0.5, w: 0.5, h: 0.5, photo: 1 },
        { x: 0.5, y: 0.5, w: 0.5, h: 0.5, photo: 0 },
      ];
    case 'mosaic':
      return Array.from({ length: 9 }, (_, i) => ({
        x: (i % 3) / 3,
        y: Math.floor(i / 3) / 3,
        w: 1 / 3,
        h: 1 / 3,
        photo: i % 2,
      }));
    case 'bleed':
      return [{ x: 0, y: 0, w: 1, h: 1, photo: 0 }];
    case 'tilted':
      return [
        { x: 0.03, y: 0.05, w: 0.34, h: 0.84, photo: 0, tilt: -4 },
        { x: 0.34, y: 0.01, w: 0.34, h: 0.84, photo: 1, tilt: 3 },
        { x: 0.64, y: 0.05, w: 0.34, h: 0.84, photo: 0, tilt: 7 },
      ];
    case 'split':
      return [
        { x: 0, y: 0, w: 1, h: 1, photo: 0, clip: 'top' },
        { x: 0, y: 0, w: 1, h: 1, photo: 1, clip: 'bottom' },
      ];
    default:
      return [{ x: 0, y: 0, w: 1, h: 1, photo: 0 }];
  }
}

/** Draws one image cover-fit inside a rect, with zoom and pan. */
export function fitPhoto(ctx, img, rx, ry, rw, rh, zoom, ox, oy) {
  if (!img) return false;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return false;
  const base = Math.max(rw / iw, rh / ih);
  const s = base * zoom;
  const dw = iw * s;
  const dh = ih * s;
  const dx = rx + (rw - dw) / 2 + ox * rw;
  const dy = ry + (rh - dh) / 2 + oy * rh;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
  return true;
}

/** A palm silhouette: leaning trunk, six drooping fronds. */
export function drawPalm(ctx, x, y, s, mirror, color) {
  ctx.save();
  ctx.translate(x, y);
  if (mirror) ctx.scale(-1, 1);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  // Trunk: a tapering curve leaning right.
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.quadraticCurveTo(-10, -55, 4, -108);
  ctx.quadraticCurveTo(10, -118, 16, -112);
  ctx.quadraticCurveTo(4, -58, 8, 0);
  ctx.closePath();
  ctx.fill();
  // Fronds arc out from the crown at (10, -112).
  for (let i = 0; i < 6; i++) {
    const a = (-160 + i * 52) * (Math.PI / 180);
    const len = 88 - Math.abs(i - 2.5) * 12;
    const tipX = 10 + Math.cos(a) * len;
    const tipY = -112 + Math.sin(a) * len * 0.55;
    const midX = 10 + Math.cos(a) * len * 0.5;
    const midY = -112 + Math.sin(a) * len * 0.5 - 22;
    ctx.beginPath();
    ctx.moveTo(10, -112);
    ctx.quadraticCurveTo(midX, midY, tipX, tipY);
    ctx.quadraticCurveTo(midX + 8, midY + 14, 10, -106);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Cached halftone dot tile, reused as a fill pattern. */
let halftoneTile = null;
function halftonePattern(ctx) {
  if (halftoneTile) return halftoneTile;
  const c = document.createElement('canvas');
  c.width = 12;
  c.height = 12;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.9)';
  g.beginPath();
  g.arc(6, 6, 2.4, 0, Math.PI * 2);
  g.fill();
  halftoneTile = ctx.createPattern(c, 'repeat');
  return halftoneTile;
}

/** Cached seeded grain tile, reused as a fill pattern. */
let grainTile = null;
function grainPattern(ctx) {
  if (grainTile) return grainTile;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  const rnd = seededRandom(20261120);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = ctx.createPattern(c, 'repeat');
  return grainTile;
}

const GRADE_DEFS = {
  sunset: { stops: ['#ff8c42', '#ff2e63', '#6a1fb5'], blend: 'soft-light', alpha: 0.6, warm: 0.12 },
  neon: { stops: ['#00e5ff', '#ff2fb3', '#1a0b2e'], blend: 'overlay', alpha: 0.55, warm: 0 },
  gold: { stops: ['#ffd319', '#ff7b00', '#5c1a00'], blend: 'soft-light', alpha: 0.55, warm: 0.14 },
  drive: { stops: ['#00b4ff', '#0057ff', '#02163f'], blend: 'soft-light', alpha: 0.55, warm: 0 },
  noir: { stops: ['#9d8cff', '#4a2d7a', '#0d0518'], blend: 'soft-light', alpha: 0.5, warm: 0 },
};

/** Washes the chosen colour grade over a rect (noir also desaturates). */
export function applyGrade(ctx, grade, rx, ry, rw, rh) {
  const g = GRADE_DEFS[grade] || GRADE_DEFS.sunset;
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
  ctx.globalCompositeOperation = g.blend;
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

/** Warm glow from the top-right corner of the photo area. */
function cornerGlow(ctx, x, y, r, ax, ay, aw, ah) {
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
  glow.addColorStop(0, 'rgba(255, 210, 110, 0.5)');
  glow.addColorStop(1, 'rgba(255, 210, 110, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(ax, ay, aw, ah);
  ctx.restore();
}

/** Fits the title to the width and paints it with its style + glow. */
function paintTitle(ctx, title, subtitle, style, cx, topY, maxW, baseSize) {
  const text = (title || 'UNTITLED').trim().toUpperCase();
  let size = baseSize;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const setFont = (s) => {
    ctx.font = `900 ${s}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
    try {
      ctx.letterSpacing = `${Math.round(s * 0.04)}px`;
    } catch {
      /* older canvas: no letterSpacing */
    }
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
    try {
      ctx.letterSpacing = `${Math.round(subSize * 0.26)}px`;
    } catch {
      /* older canvas */
    }
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

/** A small tilted badge ribbon. */
function paintBadge(ctx, x, y, w, h, label) {
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

/**
 * Paints the whole poster.
 * `photos` is an array of images (or nulls); `state` is a poster state;
 * the canvas is painted at its own pixel size.
 */
export function paintPoster(canvas, photos, state) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const frame = Math.round(Math.min(W, H) * 0.022);
  const gutter = Math.round(Math.min(W, H) * 0.011);
  const bleed = state.layout === 'bleed';
  const bandH = bleed ? Math.round(H * 0.3) : Math.round(H * 0.235);
  const ax = frame;
  const ay = frame;
  const aw = W - frame * 2;
  const ah = H - frame * 2 - (bleed ? 0 : bandH);

  // Poster paper: cream frame, deep plum ground.
  ctx.fillStyle = '#fdf6ec';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1b0b33';
  ctx.fillRect(ax, ay, aw, ah + (bleed ? 0 : bandH));

  const rects = layoutRects(state.layout);
  rects.forEach((def, i) => {
    const slot = state.panels[i] || { photo: 0, zoom: 1, ox: 0, oy: 0 };
    const photoIndex = state.onePhoto ? 0 : (slot.photo ?? def.photo ?? 0);
    const rx = ax + def.x * aw;
    const ry = ay + def.y * ah;
    const rw = def.w * aw;
    const rh = def.h * ah;
    const gx = gutter / 2;
    const px = rx + (def.x > 0 ? gx : 0);
    const py = ry + (def.y > 0 ? gx : 0);
    const pw = rw - (def.x > 0 ? gx : 0) - (def.x + def.w < 1 ? gx : 0);
    const ph = rh - (def.y > 0 ? gx : 0) - (def.y + def.h < 1 ? gx : 0);
    ctx.save();
    if (def.clip === 'top') {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(ax + aw, ay);
      ctx.lineTo(ax, ay + ah);
      ctx.closePath();
      ctx.clip();
    } else if (def.clip === 'bottom') {
      ctx.beginPath();
      ctx.moveTo(ax + aw, ay + ah);
      ctx.lineTo(ax + aw, ay);
      ctx.lineTo(ax, ay + ah);
      ctx.closePath();
      ctx.clip();
    } else if (def.tilt) {
      const cx = px + pw / 2;
      const cy = py + ph / 2;
      ctx.translate(cx, cy);
      ctx.rotate((def.tilt * Math.PI) / 180);
      ctx.translate(-cx, -cy);
      ctx.fillStyle = '#fdf6ec';
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = gutter * 2;
      ctx.fillRect(px - gutter, py - gutter, pw + gutter * 2, ph + gutter * 2);
      ctx.shadowBlur = 0;
    }
    const photo = photos[photoIndex] || photos[0] || null;
    if (photo) {
      fitPhoto(ctx, photo, px, py, pw, ph, slot.zoom || 1, slot.ox || 0, slot.oy || 0);
    } else {
      // Empty panel: a sunset placeholder so the layout still reads.
      const ph2 = ctx.createLinearGradient(px, py, px, py + ph);
      ph2.addColorStop(0, '#ff8c42');
      ph2.addColorStop(1, '#6a1fb5');
      ctx.fillStyle = ph2;
      ctx.fillRect(px, py, pw, ph);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `700 ${Math.max(12, pw * 0.05)}px Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('+ ADD PHOTO', px + pw / 2, py + ph / 2);
    }
    applyGrade(ctx, state.grade, px, py, pw, ph);
    ctx.restore();
  });

  // Diagonal split seam.
  if (state.layout === 'split') {
    ctx.save();
    ctx.strokeStyle = '#fdf6ec';
    ctx.lineWidth = gutter * 1.4;
    ctx.beginPath();
    ctx.moveTo(ax + aw, ay);
    ctx.lineTo(ax, ay + ah);
    ctx.stroke();
    ctx.restore();
  }

  // Warm-grade glow from the top-right corner of the photo area.
  if ((state.grade === 'sunset' || state.grade === 'gold') && state.layout !== 'mosaic') {
    cornerGlow(ctx, ax + aw, ay, Math.min(W, H) * 0.45, ax, ay, aw, ah);
  }

  // Halftone across the lower half of the photo area.
  if (state.halftone) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = halftonePattern(ctx);
    ctx.fillRect(ax, ay + ah * 0.55, aw, ah * 0.45);
    ctx.restore();
  }

  // Palm silhouettes in the lower corners of the photo area.
  if (state.showPalms) {
    const s = Math.min(W, H) / 1080;
    ctx.save();
    ctx.globalAlpha = 0.92;
    drawPalm(ctx, ax + aw * 0.055, ay + ah * 0.985, s * 1.05, false, '#150826');
    drawPalm(ctx, ax + aw * 0.945, ay + ah * 0.985, s * 0.85, true, '#150826');
    ctx.restore();
  }

  // Title band: a gradient rising from the bottom.
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

  paintTitle(
    ctx,
    state.title,
    state.subtitle,
    state.titleStyle,
    ax + aw / 2,
    bandY + bandH * 0.16,
    aw * 0.92,
    Math.min(W, H) * 0.105,
  );

  // Badge ribbon + star row float over the photo area.
  if (state.badge) {
    const bw = Math.min(W, H) * 0.3;
    paintBadge(ctx, ax + bw / 2 + frame * 0.4, ay + Math.min(W, H) * 0.045, bw, Math.min(W, H) * 0.052, '★ SUNSET EDITION ★');
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
    ctx.fillStyle = grainPattern(ctx);
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.42, W / 2, H / 2, Math.max(W, H) * 0.75);
  vig.addColorStop(0, 'rgba(20,0,40,0)');
  vig.addColorStop(1, 'rgba(20,0,40,0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
}
