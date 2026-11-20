// Studio wiring: state, history, controls, preview and PNG export.
// Runs as a classic script after presets.js, skyline.js and render.js.

const stage = document.getElementById("stage");
const layoutRow = document.getElementById("layoutRow");
const gradeRow = document.getElementById("gradeRow");
const sizeRow = document.getElementById("sizeRow");
const capTop = document.getElementById("capTop");
const capMain = document.getElementById("capMain");
const skylineToggle = document.getElementById("skylineToggle");
const panelList = document.getElementById("panelList");
const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");
const exportBtn = document.getElementById("exportBtn");
const resetBtn = document.getElementById("resetBtn");
const statusLine = document.getElementById("statusLine");

const images = {};
const uploads = {};
let uploadCount = 0;
let past = [];
let future = [];

function freshState() {
  const panel = (photo, zoom) => ({ photo, zoom: zoom || 1, dx: 0, dy: 0 });
  return {
    layout: "vice-grid",
    grade: "sunset",
    size: "portrait",
    captionTop: "Grand Theft Auto VI",
    captionMain: "Vice City",
    skyline: true,
    selected: 0,
    panels: [
      panel("boulevard", 1),
      panel("pier", 1),
      { photo: "boulevard", zoom: 1.15, dx: 0, dy: -0.25 },
      panel("pier", 1),
      panel("boulevard", 1),
      panel("pier", 1.2),
    ],
  };
}

let state = freshState();

function snap() {
  return JSON.stringify(state);
}

function pushHistory() {
  past.push(snap());
  if (past.length > 60) past.shift();
  future = [];
  syncHistoryButtons();
}

function undo() {
  if (!past.length) return;
  future.push(snap());
  state = JSON.parse(past.pop());
  syncAll();
  syncHistoryButtons();
}

function redo() {
  if (!future.length) return;
  past.push(snap());
  state = JSON.parse(future.pop());
  syncAll();
  syncHistoryButtons();
}

function syncHistoryButtons() {
  undoBtn.disabled = past.length === 0;
  redoBtn.disabled = future.length === 0;
}

function render() {
  renderPoster(stage, state, images);
  const size = EXPORT_SIZES.find((s) => s.id === state.size) || EXPORT_SIZES[1];
  const layout = LAYOUTS.find((l) => l.id === state.layout) || LAYOUTS[0];
  const grade = GRADES.find((g) => g.id === state.grade) || GRADES[0];
  statusLine.textContent = `${layout.name} · ${grade.name} · ${size.w}×${size.h} · panel ${state.selected + 1} of ${layout.panels.length}`;
}

function buildLayoutButtons() {
  layoutRow.innerHTML = "";
  LAYOUTS.forEach((l) => {
    const b = document.createElement("button");
    b.className = "pick" + (state.layout === l.id ? " on" : "");
    b.innerHTML = `<b>${l.name}</b><span>${l.blurb}</span>`;
    b.onclick = () => {
      if (state.layout === l.id) return;
      pushHistory();
      state.layout = l.id;
      state.selected = 0;
      buildLayoutButtons();
      buildPanelList();
      render();
    };
    layoutRow.appendChild(b);
  });
}

function buildGradeButtons() {
  gradeRow.innerHTML = "";
  GRADES.forEach((g) => {
    const b = document.createElement("button");
    b.className = "swatch" + (state.grade === g.id ? " on" : "");
    b.style.background = `linear-gradient(135deg, ${g.sky[0]}, ${g.sky[1]} 70%, ${g.accent})`;
    b.title = g.name;
    b.innerHTML = `<span>${g.name}</span>`;
    b.onclick = () => {
      if (state.grade === g.id) return;
      pushHistory();
      state.grade = g.id;
      buildGradeButtons();
      render();
    };
    gradeRow.appendChild(b);
  });
}

function buildSizeButtons() {
  sizeRow.innerHTML = "";
  EXPORT_SIZES.forEach((s) => {
    const b = document.createElement("button");
    b.className = "pick slim" + (state.size === s.id ? " on" : "");
    b.innerHTML = `<b>${s.name}</b><span>${s.w}×${s.h}</span>`;
    b.onclick = () => {
      if (state.size === s.id) return;
      pushHistory();
      state.size = s.id;
      buildSizeButtons();
      render();
    };
    sizeRow.appendChild(b);
  });
}

function photoOptions(current) {
  const opts = SAMPLE_PHOTOS.map((p) => `<option value="${p.id}" ${current === p.id ? "selected" : ""}>${p.name}</option>`).join("");
  const ups = Object.keys(uploads)
    .map((k) => `<option value="${k}" ${current === k ? "selected" : ""}>${uploads[k].name}</option>`)
    .join("");
  return opts + ups;
}

function sliderRow(label, min, max, step, value, onInput, onDone) {
  const wrap = document.createElement("label");
  wrap.className = "slider";
  wrap.innerHTML = `<span>${label}</span>`;
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", () => onInput(Number(input.value)));
  input.addEventListener("change", () => onDone());
  wrap.appendChild(input);
  return wrap;
}

function buildPanelList() {
  panelList.innerHTML = "";
  const layout = LAYOUTS.find((l) => l.id === state.layout) || LAYOUTS[0];
  layout.panels.forEach((rect, i) => {
    const panel = state.panels[i];
    const row = document.createElement("div");
    row.className = "panel-row" + (state.selected === i ? " active" : "");
    row.onclick = () => {
      state.selected = i;
      buildPanelList();
      render();
    };
    const head = document.createElement("div");
    head.className = "panel-head";
    head.innerHTML = `<b>Panel ${i + 1}</b><span>${rect.tilt ? "tilted " : ""}${Math.round(rect.w * 100)}×${Math.round(rect.h * 100)}%</span>`;
    row.appendChild(head);

    const sel = document.createElement("select");
    sel.innerHTML = photoOptions(panel.photo);
    sel.onchange = () => {
      pushHistory();
      panel.photo = sel.value;
      render();
    };
    sel.onclick = (e) => e.stopPropagation();
    row.appendChild(sel);

    const up = document.createElement("button");
    up.className = "mini";
    up.textContent = "Upload a photo";
    up.onclick = (e) => {
      e.stopPropagation();
      const file = document.createElement("input");
      file.type = "file";
      file.accept = "image/*";
      file.onchange = () => {
        const f = file.files && file.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          uploadCount += 1;
          const key = `up${uploadCount}`;
          const img = new Image();
          img.onload = () => {
            images[key] = img;
            uploads[key] = { name: f.name.slice(0, 18) || `Upload ${uploadCount}` };
            pushHistory();
            panel.photo = key;
            buildPanelList();
            render();
          };
          img.src = String(reader.result);
        };
        reader.readAsDataURL(f);
      };
      file.click();
    };
    row.appendChild(up);

    row.appendChild(
      sliderRow("Zoom", 0.6, 2.2, 0.05, panel.zoom, (v) => {
        panel.zoom = v;
        render();
      }, pushHistory)
    );
    row.appendChild(
      sliderRow("Pan left / right", -0.4, 0.4, 0.01, panel.dx, (v) => {
        panel.dx = v;
        render();
      }, pushHistory)
    );
    row.appendChild(
      sliderRow("Pan up / down", -0.4, 0.4, 0.01, panel.dy, (v) => {
        panel.dy = v;
        render();
      }, pushHistory)
    );
    panelList.appendChild(row);
  });
}

function syncAll() {
  capTop.value = state.captionTop;
  capMain.value = state.captionMain;
  skylineToggle.checked = state.skyline;
  buildLayoutButtons();
  buildGradeButtons();
  buildSizeButtons();
  buildPanelList();
  render();
}

capTop.addEventListener("input", () => {
  state.captionTop = capTop.value;
  render();
});
capTop.addEventListener("change", pushHistory);
capMain.addEventListener("input", () => {
  state.captionMain = capMain.value;
  render();
});
capMain.addEventListener("change", pushHistory);
skylineToggle.addEventListener("change", () => {
  pushHistory();
  state.skyline = skylineToggle.checked;
  render();
});

undoBtn.onclick = undo;
redoBtn.onclick = redo;
resetBtn.onclick = () => {
  pushHistory();
  state = freshState();
  syncAll();
};

exportBtn.onclick = () => {
  const off = document.createElement("canvas");
  renderPoster(off, state, images);
  const size = EXPORT_SIZES.find((s) => s.id === state.size) || EXPORT_SIZES[1];
  off.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `vice-city-cover-${size.w}x${size.h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    statusLine.textContent = `Exported PNG ${size.w}×${size.h} — share it.`;
  }, "image/png");
};

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
    e.preventDefault();
    redo();
  }
});

// Screenshot scenes (?shot=...): fixed states so the four captures are stable.
function applyShot() {
  const shot = new URLSearchParams(location.search).get("shot");
  if (!shot) return;
  if (shot === "cover") {
    state.layout = "vice-grid";
    state.grade = "sunset";
    state.size = "portrait";
    state.captionTop = "Grand Theft Auto VI";
    state.captionMain = "Vice City";
    state.skyline = true;
  } else if (shot === "editor") {
    state.layout = "mosaic";
    state.grade = "neon-night";
    state.size = "portrait";
    state.selected = 1;
    state.panels[1].zoom = 1.4;
    state.captionTop = "Grand Theft Auto VI";
    state.captionMain = "Leonida";
  } else if (shot === "mosaic") {
    state.layout = "mosaic";
    state.grade = "neon-night";
    state.size = "square";
    state.captionTop = "Grand Theft Auto VI";
    state.captionMain = "Leonida";
  } else if (shot === "story") {
    state.layout = "hero-left";
    state.grade = "vice-gold";
    state.size = "story";
    state.captionTop = "Welcome back to";
    state.captionMain = "Vice City";
    // Tall story crops: pan the photos so the sun and the pier sit in frame.
    state.panels[0] = { photo: "boulevard", zoom: 1, dx: 0, dy: -0.15 };
    state.panels[1] = { photo: "pier", zoom: 1.1, dx: -0.15, dy: -0.05 };
    state.panels[2] = { photo: "boulevard", zoom: 1, dx: -0.1, dy: -0.15 };
  }
  document.body.dataset.shot = shot;
}

function loadSamples() {
  const jobs = SAMPLE_PHOTOS.map(
    (p) =>
      new Promise((done) => {
        const img = new Image();
        img.onload = () => {
          images[p.id] = img;
          done();
        };
        img.onerror = () => done();
        img.src = p.src;
      })
  );
  return Promise.all(jobs);
}

applyShot();
syncAll();
loadSamples().then(() => render());
