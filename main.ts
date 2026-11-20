// Vice City Cover Studio — the entrypoint (Node 22, standard library only).
// The grader runs this program twice and both runs must write identical
// bytes. It copies the static app (app/) and the screenshots into the
// output directory and writes dossier.json with the vendored make.fun
// library, which summarises the app for the judge.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from a clean output directory so a stale file can never leak in.
if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

cpSync(join(repoRoot, 'app'), join(outDir, 'app'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
const shotDir = join(repoRoot, 'screenshots');
if (existsSync(shotDir)) {
  for (const name of readdirSync(shotDir).sort()) {
    if (name.startsWith('.')) continue;
    cpSync(join(shotDir, name), join(outDir, 'screenshots', name));
  }
}

// The gate's caps (reference/gate.json): app/ at most 993 files and
// 48 MiB, screenshots at most 4 files of 256 KiB, dossier at most 1.5 MiB
// with its source text capped at 160 KiB.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`wrote ${outDir}/dossier.json (${dossier.length} bytes)`);
