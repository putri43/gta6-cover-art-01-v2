// Vice City Cover Studio — the editor, written for this entry.
// Wires the page: photo slots, layout / grade / size pickers, per-cell
// crop controls, caption editing, undo / redo, and one-click PNG
// export at 1080 x 1080, 1080 x 1350 and 1920 x 1080. The live preview
// and the export both paint through renderPoster in ./poster.js, so
// what you see is exactly what the PNG holds. A `?shot=` query sets
// up a fixed scene for screenshots instead (./shots.js).
import {
  freshState, cellsFor, renderPoster,
  GRADES, GRADE_LABELS, LAYOUTS, LAYOUT_LABELS, SIZES,
} from './poster.js';
import { runShot } from './shots.js';

const el = (id) => document.getElementById(id);
const posterCanvas = el('posterCanvas');
const state = freshState();
const photos = [null, null, null, null];
const slotNames = ['Photo 1', 'Photo 2', 'Photo 3', 'Photo 4'];
let selectedCell = 0;
let undoStack = [];
let undoPos = -1;
let applyingHistory = false;

const sizeFor = (id) => SIZES.find((s) => s.id === id) || SIZES[0];

/** Loads an image from a URL, resolving once it can be drawn. */
export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function takeSnapshot() {
  return JSON.stringify({ ...state, cells: state.cells.map((c) => ({ ...c })) });
}

function commit() {
  if (applyingHistory) return;
  undoStack = undoStack.slice(0, undoPos + 1);
  undoStack.push(takeSnapshot());
  if (undoStack.length > 40) undoStack.shift();
  undoPos = undoStack.length - 1;
  refreshUndoButtons();
}

function applySnapshot(json) {
  const next = JSON.parse(json);
  Object.assign(state, next);
  syncAll();
  draw();
}

function undo() {
  if (undoPos <= 0) return;
  undoPos -= 1;
  applyingHistory = true;
  applySnapshot(undoStack[undoPos]);
  applyingHistory = false;
  refreshUndoButtons();
}

function redo() {
  if (undoPos >= undoStack.length - 1) return;
  undoPos += 1;
  applyingHistory = true;
  applySnapshot(undoStack[undoPos]);
  applyingHistory = false;
  refreshUndoButtons();
}

function refreshUndoButtons() {
  el('undoBtn').disabled = undoPos <= 0;
  el('redoBtn').disabled = undoPos >= undoStack.length - 1;
}

/** Redraws the live preview at the current size's aspect ratio. */
function draw() {
  const size = sizeFor(state.sizeId);
  const scale = Math.min(560 / size.w, 560 / size.h);
  posterCanvas.width = Math.round(size.w * scale);
  posterCanvas.height = Math.round(size.h * scale);
  renderPoster(posterCanvas, photos, state);
  el('sizeText').textContent = `${size.w} x ${size.h}`;
  buildCellChips();
}

/** One row of toggle buttons for a picker container. */
function picker(containerId, items, current, onPick) {
  const box = el(containerId);
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.pick = item.id;
    b.textContent = item.label;
    b.addEventListener('click', () => {
      onPick(item.id);
      commit();
      syncAll();
      draw();
    });
    box.appendChild(b);
  }
  return () => {
    box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.pick === current()));
  };
}

const syncLayout = picker('layoutPicker', LAYOUTS.map((id) => ({ id, label: LAYOUT_LABELS[id] })),
  () => state.layout, (id) => { state.layout = id; selectedCell = 0; });
const syncGrade = picker('gradePicker', GRADES.map((id) => ({ id, label: GRADE_LABELS[id] })),
  () => state.grade, (id) => { state.grade = id; });
const syncSize = picker('sizePicker', SIZES.map((s) => ({ id: s.id, label: s.label })),
  () => state.sizeId, (id) => { state.sizeId = id; });

/** Marks the active picker buttons and fills every control from state. */
function syncAll() {
  syncLayout();
  syncGrade();
  syncSize();
  el('titleInput').value = state.title;
  el('subtitleInput').value = state.subtitle;
  el('styleSelect').value = state.titleStyle;
  el('onePhotoChk').checked = state.onePhoto;
  el('palmsChk').checked = state.palms;
  el('halftoneChk').checked = state.halftone;
  el('grainChk').checked = state.grain;
  el('badgeChk').checked = state.badge;
  el('starsChk').checked = state.stars;
  el('skylineChk').checked = state.skyline;
  const cell = state.cells[selectedCell] || { zoom: 1, dx: 0, dy: 0 };
  el('zoomRange').value = cell.zoom;
  el('panXRange').value = cell.dx;
  el('panYRange').value = cell.dy;
  el('zoomText').textContent = `${Math.round(cell.zoom * 100)}%`;
  el('cellPhotoSel').value = String(cell.photo ?? 0);
  el('cellLabel').textContent = `Cell ${selectedCell + 1} of ${cellsFor(state.layout).length}`;
}

/** Rebuilds the clickable cell chips under the preview. */
function buildCellChips() {
  const row = el('cellChips');
  const count = cellsFor(state.layout).length;
  row.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = i === selectedCell ? 'on' : '';
    b.textContent = `Cell ${i + 1}`;
    b.addEventListener('click', () => {
      selectedCell = i;
      syncAll();
      draw();
    });
    row.appendChild(b);
  }
}

/** Reads a chosen file into a photo slot and redraws. */
async function loadSlot(index, file) {
  if (!file) return;
  photos[index] = await loadImage(URL.createObjectURL(file));
  slotNames[index] = file.name.length > 18 ? file.name.slice(0, 17) + '…' : file.name;
  el(`slotName${index}`).textContent = slotNames[index];
  el(`slotMark${index}`).textContent = '✓';
  draw();
}

/** Builds the four photo-slot cards. */
function buildSlots() {
  const box = el('photoSlots');
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
    input.addEventListener('change', (e) => loadSlot(Number(input.dataset.slot), e.target.files[0]));
  });
}

/** Renders the current poster at full resolution and downloads it as PNG. */
export function exportPng(sizeId) {
  const size = sizeFor(sizeId);
  const off = document.createElement('canvas');
  off.width = size.w;
  off.height = size.h;
  renderPoster(off, photos, { ...state, sizeId });
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
  el('titleInput').addEventListener('input', (e) => { state.title = e.target.value; draw(); });
  el('titleInput').addEventListener('change', commit);
  el('subtitleInput').addEventListener('input', (e) => { state.subtitle = e.target.value; draw(); });
  el('subtitleInput').addEventListener('change', commit);
  el('styleSelect').addEventListener('change', (e) => { state.titleStyle = e.target.value; commit(); draw(); });
  const bindToggle = (id, key) => el(id).addEventListener('change', (e) => {
    state[key] = e.target.checked;
    commit();
    draw();
  });
  bindToggle('onePhotoChk', 'onePhoto');
  bindToggle('palmsChk', 'palms');
  bindToggle('halftoneChk', 'halftone');
  bindToggle('grainChk', 'grain');
  bindToggle('badgeChk', 'badge');
  bindToggle('starsChk', 'stars');
  bindToggle('skylineChk', 'skyline');
  el('cellPhotoSel').addEventListener('change', (e) => {
    state.cells[selectedCell].photo = Number(e.target.value);
    state.onePhoto = false;
    el('onePhotoChk').checked = false;
    commit();
    draw();
  });
  el('zoomRange').addEventListener('input', (e) => {
    state.cells[selectedCell].zoom = Number(e.target.value);
    el('zoomText').textContent = `${Math.round(state.cells[selectedCell].zoom * 100)}%`;
    draw();
  });
  el('zoomRange').addEventListener('change', commit);
  el('panXRange').addEventListener('input', (e) => { state.cells[selectedCell].dx = Number(e.target.value); draw(); });
  el('panXRange').addEventListener('change', commit);
  el('panYRange').addEventListener('input', (e) => { state.cells[selectedCell].dy = Number(e.target.value); draw(); });
  el('panYRange').addEventListener('change', commit);
  el('resetCropBtn').addEventListener('click', () => {
    state.cells[selectedCell] = { ...state.cells[selectedCell], zoom: 1, dx: 0, dy: 0 };
    commit();
    syncAll();
    draw();
  });
  el('undoBtn').addEventListener('click', undo);
  el('redoBtn').addEventListener('click', redo);
  el('exportBtn').addEventListener('click', async () => {
    const name = await exportPng(state.sizeId);
    el('statusText').textContent = `Saved ${name} — share it anywhere.`;
  });
  el('exportAllBtn').addEventListener('click', async () => {
    for (const s of SIZES) await exportPng(s.id);
    el('statusText').textContent = 'Saved all three sizes (1080 x 1080, 1080 x 1350, 1920 x 1080).';
  });
  el('demoBtn').addEventListener('click', async () => {
    photos[0] = await loadImage('samples/boulevard.png');
    photos[1] = await loadImage('samples/pier.png');
    el('slotName0').textContent = 'boulevard.png';
    el('slotName1').textContent = 'pier.png';
    el('slotMark0').textContent = '✓';
    el('slotMark1').textContent = '✓';
    draw();
    el('statusText').textContent = 'Sample photos loaded — replace them with your own any time.';
  });
  // Clicking the preview picks the cell under the pointer.
  posterCanvas.addEventListener('click', (e) => {
    const r = posterCanvas.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width;
    const fy = (e.clientY - r.top) / r.height;
    const cells = cellsFor(state.layout);
    const idx = cells.findIndex((d) => fx >= d.x && fx <= d.x + d.w && fy >= d.y && fy <= d.y + d.h);
    if (idx >= 0) {
      selectedCell = idx;
      syncAll();
      draw();
    }
  });
}

buildSlots();
bindControls();
syncAll();
commit();

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  runShot(shot, params, state, photos, loadImage, draw);
} else {
  draw();
}
