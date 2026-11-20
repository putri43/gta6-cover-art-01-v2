// The lit skyline strip: a procedural tower skyline with glowing windows,
// drawn along the foot of the poster, under the caption. Every tower and
// window comes from a seeded generator, so the same poster always draws
// the same skyline.

function makeSeeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function drawSkyline(ctx, x, y, w, h, seed, accent) {
  const rnd = makeSeeded(seed);
  // Soft glow behind the towers so the strip reads at a glance.
  const glow = ctx.createRadialGradient(x + w / 2, y + h, 10, x + w / 2, y + h, w * 0.62);
  glow.addColorStop(0, accent);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = glow;
  ctx.fillRect(x, y - h * 0.25, w, h * 1.25);
  ctx.restore();

  let cx = x;
  while (cx < x + w - 8) {
    const tw = 16 + rnd() * 42;
    const th = h * (0.3 + rnd() * 0.68);
    const top = y + h - th;
    // Tower body: near-black with a violet edge.
    ctx.fillStyle = "#0c0616";
    ctx.fillRect(cx, top, tw, th);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(cx, top, 1.5, th);
    // Antenna on the tallest towers.
    if (th > h * 0.72) {
      ctx.fillStyle = "#0c0616";
      ctx.fillRect(cx + tw / 2 - 1, top - h * 0.12, 2, h * 0.12);
      ctx.fillStyle = "#ff3b30";
      ctx.beginPath();
      ctx.arc(cx + tw / 2, top - h * 0.12, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Windows: a jittered grid, some lit warm, a few lit cool.
    const cols = Math.max(1, Math.floor(tw / 9));
    const rows = Math.max(1, Math.floor(th / 12));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rnd() > 0.44) continue;
        const wx = cx + 3 + c * 9;
        const wy = top + 5 + r * 12;
        const warm = rnd();
        ctx.fillStyle = warm > 0.86 ? "#37f4ff" : warm > 0.2 ? "#ffd166" : "#ff9a3c";
        ctx.globalAlpha = 0.55 + rnd() * 0.45;
        ctx.fillRect(wx, wy, 4, 6);
      }
    }
    ctx.globalAlpha = 1;
    cx += tw + 2 + rnd() * 6;
  }
  // Ground line under the towers.
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x, y + h - 2, w, 2);
}
