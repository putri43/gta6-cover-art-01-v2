// Vice City Cover Studio — entrypoint.
//
// Hands the built app in: copies app/ and screenshots/ into the output
// directory and writes dossier.json with the kit's buildDossier library.
// Runs twice in the grader; both runs must write identical bytes, so this
// program does nothing time- or random-dependent: a plain recursive copy
// plus a dossier built from the copied files.

import { buildDossier } from "./vendor/makefun-app.ts";
import { cpSync as copyTree, mkdirSync as makeDir, writeFileSync as saveFile } from "node:fs";
import { dirname as parentDir, join as joinPaths } from "node:path";
import { fileURLToPath as urlToPath } from "node:url";

const here = parentDir(urlToPath(import.meta.url));
const target = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
const appFrom = joinPaths(here, "app");
const shotsFrom = joinPaths(here, "screenshots");
const appTo = joinPaths(target, "app");
const shotsTo = joinPaths(target, "screenshots");

makeDir(target, { recursive: true });
copyTree(appFrom, appTo, { recursive: true });
copyTree(shotsFrom, shotsTo, { recursive: true });

const caps = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

saveFile(joinPaths(target, "dossier.json"), buildDossier(target, caps));
