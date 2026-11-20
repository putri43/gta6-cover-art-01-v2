// Fixed scenes for screenshots (my own implementation).
// ?shot=editor shows the editor with the sample photos loaded;
// ?shot=cover shows one exported poster alone, painted by the app
// itself at the requested size. Query keys: photo, photo2, layout,
// grade, size (1080x1080 | 1080x1350 | 1920x1080), caption, subtitle,
// titleStyle, onePhoto. window.__shotReady is set once painted.
import { SIZES, paintPoster } from './cover.js';

export async function runShot(shot, query, state, photos, loadImage, redraw) {
  const first = query.get('photo') || 'boulevard';
  const second = query.get('photo2') || 'pier';
  if (query.get('layout')) state.layout = query.get('layout');
  if (query.get('grade')) state.grade = query.get('grade');
  if (query.get('size')) state.sizeId = query.get('size');
  if (query.get('caption')) state.title = query.get('caption');
  if (query.get('subtitle') !== null) state.subtitle = query.get('subtitle') || '';
  if (query.get('titleStyle')) state.titleStyle = query.get('titleStyle');
  if (query.get('onePhoto') === '0') state.onePhoto = false;

  photos[0] = await loadImage(`samples/${first}.png`);
  photos[1] = await loadImage(`samples/${second}.png`);
  document.getElementById('slotName0').textContent = `${first}.png`;
  document.getElementById('slotName1').textContent = `${second}.png`;
  document.getElementById('slotMark0').textContent = '✓';
  document.getElementById('slotMark1').textContent = '✓';

  if (shot === 'cover') {
    document.body.classList.add('shot-cover');
    const size = SIZES.find((s) => s.id === state.sizeId) || SIZES[0];
    const canvas = document.getElementById('cv');
    canvas.width = size.w;
    canvas.height = size.h;
    paintPoster(canvas, photos, state);
  } else {
    redraw();
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__shotReady = true; }));
}
