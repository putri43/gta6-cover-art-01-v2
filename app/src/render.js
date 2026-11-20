// Poster renderer: draws the whole cover into a canvas at any size.
// state: { layout, grade, captionTop, captionMain, skyline, panels }
// panels[i]: { photo, zoom, dx, dy } — photo is a key into `images`.
// images: { boulevard: Image, pier: Image, ...uploads } (missing => placeholder).

function posterSize(state) {
  const size = EXPORT_SIZES.find((s) => s.id === state.size) || EXPORT_SIZES[1];
  return { w: size.w, h: size.h };
}

function layoutOf(state) {
  return LAYOUTS.find((l) => l.id === state.layout) || LAYOUTS[0];
}

function gradeOf(state) {
  return GRADES.find((g) => g.id === state.grade) || GRADES[0];
}

function drawPhotoCover(ctx, img, px, py, pw, ph, zoom, panX, panY) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.max(pw / iw, ph / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = px + (pw - dw) / 2 + panX * pw;
  const dy = py + (ph - dh) / 2 + panY * ph;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function drawPanel(ctx, rect, panel, img, grade, W, H) {
  const px = rect.x * W;
  const py = rect.y * H;
  const pw = rect.w * W;
  const ph = rect.h * H;
  ctx.save();
  ctx.translate(px, py);
  if (rect.tilt) {
    ctx.translate(pw / 2, ph / 2);
    ctx.rotate((rect.tilt * Math.PI) / 180);
    ctx.translate(-pw / 2, -ph / 2);
    // Soft drop shadow behind a tilted snap.
    ctx.fillStyle = "rgba(0,0,0,0.38)";
    ctx.fillRect(9, 12, pw, ph);
  }
  ctx.beginPath();
  ctx.rect(0, 0, pw, ph);
  ctx.clip();
  if (img && img.complete && img.naturalWidth > 0) {
    drawPhotoCover(ctx, img, 0, 0, pw, ph, panel.zoom, panel.dx, panel.dy);
  } else {
    const g = ctx.createLinearGradient(0, 0, pw, ph);
    g.addColorStop(0, "#3a2b4d");
    g.addColorStop(1, "#12081f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, pw, ph);
  }
  // Grade wash: a translucent tint over the photo.
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = grade.wash;
  ctx.fillRect(0, 0, pw, ph);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  // A gentle dark foot so the frame reads.
  const foot = ctx.createLinearGradient(0, ph * 0.72, 0, ph);
  foot.addColorStop(0, "rgba(0,0,0,0)");
  foot.addColorStop(1, "rgba(0,0,0,0.28)");
  ctx.fillStyle = foot;
  ctx.fillRect(0, 0, pw, ph);
  ctx.restore();
  // Cream frame around the panel.
  ctx.save();
  ctx.translate(px, py);
  if (rect.tilt) {
    ctx.translate(pw / 2, ph / 2);
    ctx.rotate((rect.tilt * Math.PI) / 180);
    ctx.translate(-pw / 2, -ph / 2);
  }
  ctx.lineWidth = Math.max(3, W * 0.004);
  ctx.strokeStyle = "#fff8ec";
  ctx.strokeRect(0, 0, pw, ph);
  ctx.restore();
}

function drawHalftone(ctx, W, H, y0, y1) {
  const rnd = makeSeeded(99);
  ctx.save();
  ctx.fillStyle = "#000000";
  const step = Math.max(8, W * 0.009);
  for (let y = y0; y < y1; y += step) {
    for (let x = (y / step) % 2 === 0 ? 0 : step / 2; x < W; x += step) {
      const depth = (y - y0) / (y1 - y0);
      const r = step * 0.22 * depth * (0.6 + rnd() * 0.8);
      ctx.globalAlpha = 0.1 * depth + 0.04;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawGrain(ctx, W, H) {
  const rnd = makeSeeded(7);
  ctx.save();
  const n = Math.floor((W * H) / 1400);
  for (let i = 0; i < n; i++) {
    const v = rnd();
    ctx.globalAlpha = 0.05 + rnd() * 0.05;
    ctx.fillStyle = v > 0.5 ? "#ffffff" : "#000000";
    ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  ctx.restore();
}

function drawCaption(ctx, W, H, grade, top, main) {
  const bandH = H * 0.13;
  const bandY = H * 0.735;
  // Translucent band so the words sit clean on any photo.
  ctx.save();
  ctx.fillStyle = "rgba(8,4,18,0.62)";
  ctx.fillRect(0, bandY, W, bandH);
  ctx.fillStyle = grade.accent;
  ctx.fillRect(0, bandY, W, 3);
  ctx.fillRect(0, bandY + bandH - 3, W, 3);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Small top line, wide letters.
  ctx.fillStyle = grade.accent;
  ctx.font = `700 ${Math.round(H * 0.021)}px "Arial Narrow", Arial, sans-serif`;
  try {
    ctx.letterSpacing = `${Math.round(W * 0.012)}px`;
  } catch (e) {
    /* older canvas: no letter spacing, fine */
  }
  ctx.fillText(top.toUpperCase(), W / 2, bandY + bandH * 0.26);
  try {
    ctx.letterSpacing = "0px";
  } catch (e) {
    /* ignore */
  }
  // Main line: heavy, slanted, white with a dark edge and accent echo.
  const size = Math.min(W * 0.105, (H * 0.085 * W) / (main.length * 0.62 + 40));
  ctx.save();
  ctx.translate(W / 2, bandY + bandH * 0.64);
  ctx.transform(1, 0, -0.1, 1, 0, 0);
  ctx.font = `900 ${Math.round(size)}px "Arial Black", Arial, sans-serif`;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(4, size * 0.09);
  ctx.strokeStyle = "#14041f";
  ctx.strokeText(main.toUpperCase(), 0, 0);
  ctx.fillStyle = grade.accent;
  ctx.fillText(main.toUpperCase(), size * 0.035, size * 0.045);
  ctx.fillStyle = grade.ink;
  ctx.fillText(main.toUpperCase(), 0, 0);
  ctx.restore();
  ctx.restore();
}

function renderPoster(canvas, state, images) {
  const { w: W, h: H } = posterSize(state);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const grade = gradeOf(state);
  const layout = layoutOf(state);

  // Sky: the grade's sunset gradient fills the whole poster first.
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, grade.sky[0]);
  sky.addColorStop(0.55, grade.sky[1]);
  sky.addColorStop(1, "#160a24");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // Panels, with a thin sky gutter between them.
  const gut = 0.006;
  layout.panels.forEach((rect, i) => {
    const panel = state.panels[i] || { photo: "boulevard", zoom: 1, dx: 0, dy: 0 };
    const inset = {
      x: rect.x + (rect.x > 0 ? gut / 2 : 0),
      y: rect.y + (rect.y > 0 ? gut / 2 : 0),
      w: rect.w - (rect.x > 0 ? gut / 2 : 0) - (rect.x + rect.w < 1 ? gut / 2 : 0),
      h: rect.h - (rect.y > 0 ? gut / 2 : 0) - (rect.y + rect.h < 1 ? gut / 2 : 0),
      tilt: rect.tilt,
    };
    drawPanel(ctx, inset, panel, images[panel.photo], grade, W, H);
  });

  // Halftone screen across the lower third, above the skyline.
  drawHalftone(ctx, W, H, H * 0.6, H * 0.86);
  // The lit skyline strip along the foot.
  if (state.skyline) {
    drawSkyline(ctx, 0, H * 0.87, W, H * 0.13, 1337, grade.accent);
  }
  drawGrain(ctx, W, H);
  drawCaption(ctx, W, H, grade, state.captionTop, state.captionMain);

  // Outer cream frame.
  ctx.lineWidth = Math.max(6, W * 0.009);
  ctx.strokeStyle = "#fff8ec";
  ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, W - ctx.lineWidth, H - ctx.lineWidth);
}
