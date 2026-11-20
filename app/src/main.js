// Vice City Cover Studio — the editor (my own implementation).
// Wires the page: photo slots, layout / grade / size pickers, per-panel
// crop controls, caption editing, undo / redo, and one-click PNG export
// at 1080 x 1080, 1080 x 1350 and 1920 x 1080. The live preview and the
// export both paint through paintPoster in ./cover.js, so what you see
// is exactly what the PNG holds. A `?shot=` query sets up a fixed scene
// for screenshots instead (./shots.js).
import {
  defaultState, layoutRects, paintPoster,
  GRADES, GRADE_NAMES, LAYOUTS, LAYOUT_NAMES, SIZES,
} from './cover.js';
import { runShot } from './shots.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv');
const state = defaultState();
const photos = [null, null, null, null];
const photoNames = ['Photo 1', 'Photo 2', 'Photo 3', 'Photo 4'];
let selectedPanel = 0;
let history = [];
let historyIndex = -1;
let holdHistory = false;

const sizeById = (id) => SIZES.find((s) => s.id === id) || SIZES[0];

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function snapshot() {
  return JSON.stringify({ ...state, panels: state.panels.map((p) => ({ ...p })) });
}

function pushHistory() {
  if (holdHistory) return;
  history = history.slice(0, historyIndex + 1);
  history.push(snapshot());
  if (history.length > 40) history.shift();
  historyIndex = history.length - 1;
  refreshUndo();
}

function restore(json) {
  const next = JSON.parse(json);
  Object.assign(state, next);
  syncControls();
  redraw();
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  holdHistory = true;
  restore(history[historyIndex]);
  holdHistory = false;
  refreshUndo();
}

function redo() {
  if (historyIndex >= history.length - 1) return;
  historyIndex += 1;
  holdHistory = true;
  restore(history[historyIndex]);
  holdHistory = false;
  refreshUndo();
}

function refreshUndo() {
  $('undoBtn').disabled = historyIndex <= 0;
  $('redoBtn').disabled = historyIndex >= history.length - 1;
}

/** Redraws the live preview at the current size's aspect ratio. */
function redraw() {
  const size = sizeById(state.sizeId);
  const scale = Math.min(560 / size.w, 560 / size.h);
  cv.width = Math.round(size.w * scale);
  cv.height = Math.round(size.h * scale);
  paintPoster(cv, photos, state);
  $('sizeLabel').textContent = `${size.w} x ${size.h}`;
  updateChips();
}

/** Builds the layout / grade / size picker buttons once. */
function buildPickers() {
  for (const id of LAYOUTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.layout = id;
    b.textContent = LAYOUT_NAMES[id];
    b.addEventListener('click', () => {
      state.layout = id;
      selectedPanel = 0;
      pushHistory();
      syncControls();
      redraw();
    });
    $('layoutRow').appendChild(b);
  }
  for (const id of GRADES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.grade = id;
    b.textContent = GRADE_NAMES[id];
    b.addEventListener('click', () => {
      state.grade = id;
      pushHistory();
      syncControls();
      redraw();
    });
    $('gradeRow').appendChild(b);
  }
  for (const s of SIZES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.size = s.id;
    b.textContent = s.label;
    b.addEventListener('click', () => {
      state.sizeId = s.id;
      pushHistory();
      syncControls();
      redraw();
    });
    $('sizeRow').appendChild(b);
  }
}

/** Marks the active picker buttons and fills every control from state. */
function syncControls() {
  document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('on', b.dataset.layout === state.layout));
  document.querySelectorAll('[data-grade]').forEach((b) => b.classList.toggle('on', b.dataset.grade === state.grade));
  document.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', b.dataset.size === state.sizeId));
  $('titleIn').value = state.title;
  $('subIn').value = state.subtitle;
  $('styleSel').value = state.titleStyle;
  $('onePhoto').checked = state.onePhoto;
  $('showPalms').checked = state.showPalms;
  $('halftone').checked = state.halftone;
  $('grain').checked = state.grain;
  $('badge').checked = state.badge;
  $('stars').checked = state.stars;
  const slot = state.panels[selectedPanel] || { zoom: 1, ox: 0, oy: 0 };
  $('zoomIn').value = slot.zoom;
  $('panXIn').value = slot.ox;
  $('panYIn').value = slot.oy;
  $('zoomVal').textContent = `${Math.round(slot.zoom * 100)}%`;
  $('photoSel').value = String(slot.photo ?? 0);
  $('panelLabel').textContent = `Panel ${selectedPanel + 1} of ${layoutRects(state.layout).length}`;
}

/** Rebuilds the clickable panel chips under the preview. */
function updateChips() {
  const row = $('chipRow');
  const count = layoutRects(state.layout).length;
  row.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === selectedPanel ? 'on' : '';
    b.textContent = `Panel ${i + 1}`;
    b.addEventListener('click', () => {
      selectedPanel = i;
      syncControls();
      redraw();
    });
    row.appendChild(b);
  }
}

/** Reads a chosen file into a photo slot and redraws. */
async function setPhotoSlot(index, file) {
  if (!file) return;
  photos[index] = await loadImage(URL.createObjectURL(file));
  photoNames[index] = file.name.length > 18 ? file.name.slice(0, 17) + '…' : file.name;
  $(`slotName${index}`).textContent = photoNames[index];
  $(`slotMark${index}`).textContent = '✓';
  redraw();
}

/** Builds the four photo-slot cards. */
function buildSlots() {
  const box = $('slotRow');
  for (let i = 0; i < 4; i++) {
    const card = document.createElement('div');
    card.className = 'slot';
    card.innerHTML = `
      <span class="mark" id="slotMark${i}">+</span>
      <span class="name" id="slotName${i}">Photo ${i + 1} — empty</span>
      <label>Choose file
        <input type="file" accept="image/*" data-slot="${i}" hidden>
      </label>`;
    box.appendChild(card);
  }
  box.querySelectorAll('input[type=file]').forEach((input) => {
    input.addEventListener('change', (e) => setPhotoSlot(Number(input.dataset.slot), e.target.files[0]));
  });
}

/** Renders the current poster at full resolution and downloads it as PNG. */
export function exportCover(sizeId) {
  const size = sizeById(sizeId);
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  paintPoster(off, photos, { ...state, sizeId });
  return new Promise((resolve) => {
    off.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `vice-city-cover-${size.w}x${size.h}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      resolve(a.download);
    }, 'image/png');
  });
}

function bindControls() {
  $('titleIn').addEventListener('input', (e) => { state.title = e.target.value; redraw(); });
  $('titleIn').addEventListener('change', pushHistory);
  $('subIn').addEventListener('input', (e) => { state.subtitle = e.target.value; redraw(); });
  $('subIn').addEventListener('change', pushHistory);
  $('styleSel').addEventListener('change', (e) => { state.titleStyle = e.target.value; pushHistory(); redraw(); });
  const toggle = (id, key) => $(id).addEventListener('change', (e) => {
    state[key] = e.target.checked;
    pushHistory();
    redraw();
  });
  toggle('onePhoto', 'onePhoto');
  toggle('showPalms', 'showPalms');
  toggle('halftone', 'halftone');
  toggle('grain', 'grain');
  toggle('badge', 'badge');
  toggle('stars', 'stars');
  $('photoSel').addEventListener('change', (e) => {
    state.panels[selectedPanel].photo = Number(e.target.value);
    state.onePhoto = false;
    $('onePhoto').checked = false;
    pushHistory();
    redraw();
  });
  $('zoomIn').addEventListener('input', (e) => {
    state.panels[selectedPanel].zoom = Number(e.target.value);
    $('zoomVal').textContent = `${Math.round(state.panels[selectedPanel].zoom * 100)}%`;
    redraw();
  });
  $('zoomIn').addEventListener('change', pushHistory);
  $('panXIn').addEventListener('input', (e) => { state.panels[selectedPanel].ox = Number(e.target.value); redraw(); });
  $('panXIn').addEventListener('change', pushHistory);
  $('panYIn').addEventListener('input', (e) => { state.panels[selectedPanel].oy = Number(e.target.value); redraw(); });
  $('panYIn').addEventListener('change', pushHistory);
  $('resetCropBtn').addEventListener('click', () => {
    state.panels[selectedPanel] = { ...state.panels[selectedPanel], zoom: 1, ox: 0, oy: 0 };
    pushHistory();
    syncControls();
    redraw();
  });
  $('undoBtn').addEventListener('click', undo);
  $('redoBtn').addEventListener('click', redo);
  $('dlBtn').addEventListener('click', async () => {
    const name = await exportCover(state.sizeId);
    $('statusLine').textContent = `Saved ${name} — share it anywhere.`;
  });
  $('dlAllBtn').addEventListener('click', async () => {
    for (const s of SIZES) await exportCover(s.id);
    $('statusLine').textContent = 'Saved all three sizes (1080 x 1080, 1080 x 1350, 1920 x 1080).';
  });
  $('demoBtn').addEventListener('click', async () => {
    photos[0] = await loadImage('samples/boulevard.png');
    photos[1] = await loadImage('samples/pier.png');
    $('slotName0').textContent = 'boulevard.png';
    $('slotName1').textContent = 'pier.png';
    $('slotMark0').textContent = '✓';
    $('slotMark1').textContent = '✓';
    redraw();
    $('statusLine').textContent = 'Sample photos loaded — replace them with your own any time.';
  });
  // Clicking the preview picks the panel under the pointer.
  cv.addEventListener('click', (e) => {
    const r = cv.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const rects = layoutRects(state.layout);
    const idx = rects.findIndex((d) => fx >= d.x && fx <= d.x + d.w && fy >= d.y && fy <= d.y + d.h);
    if (idx >= 0) {
      selectedPanel = idx;
      syncControls();
      redraw();
    }
  });
}

buildPickers();
buildSlots();
bindControls();
syncControls();
pushHistory();

const query = new URLSearchParams(location.search);
const shot = query.get('shot');
if (shot) {
  runShot(shot, query, state, photos, loadImage, redraw);
} else {
  redraw();
}
