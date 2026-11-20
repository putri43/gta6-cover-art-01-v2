# Vice City Cover Studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/putri43/gta6-cover-art-01-v2/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/putri43/gta6-cover-art-01-v2/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

An offline browser studio that turns any photo and a caption into a GTA 6-style cover: a multi-panel Vice City poster with a neon-sunset grade, a lit skyline strip glowing under the caption, and a one-click PNG export in post sizes.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. Pick a layout, pick a grade, drop in a photo or use one of the two built-in sample shots, nudge each panel's crop, and export. Everything runs on your machine: no uploads, no accounts, no network.

## What it does

- **6 layouts** — Vice Grid, Sunset Strip, Mosaic, Hero Left, Duo, Tilted. Every panel takes its own photo.
- **5 grades** — Sunset, Neon Night, Vice Gold, Palm Teal, Mono Noir. Each one re-lights the whole poster.
- **Per-panel crop** — zoom and pan each photo inside its frame, with undo and redo.
- **Lit skyline strip** — a procedural tower skyline with glowing windows runs along the poster's foot, under the caption. Toggle it off for a clean look.
- **3 export sizes** — square 1080×1080, portrait 1080×1350, story 1080×1920, all as PNG.
- **Halftone + grain** — the print-shop finish: dot screen in the shadows and a seeded grain pass, identical on every render.

## Layout of the repo

- `app/` — the studio itself (`index.html`, `style.css`, `src/`), plus two procedurally drawn sample photos in `app/samples/`.
- `main.ts` — the entrypoint: copies `app/` and `screenshots/` to the output dir and writes `dossier.json`.
- `serve.ts` — the little static server for trying it locally.
- `tools/make-samples.mjs` — draws the sample photos from scratch (its own PNG writer).
- `tools/capture.mjs` — takes the four screenshots through headless Chrome's devtools port.
- `shots.json` — the four screenshot scenes.

---

<sub>Entered on [make.fun](https://make.fun/?ref=t70w2dhy&utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
