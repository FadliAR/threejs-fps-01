// Harbour Line — a threejs-fps-01 entry (Node 22, standard library only).
// The program hands the game in: it copies this repository's game/ and
// screenshots/ to /output (or $MAKEFUN_OUTPUT_DIR outside the grader) and
// writes /output/dossier.json with the kit's vendored buildDossier library.
// It copies bytes only, so two runs write byte-identical output.
//
// Play locally with `node serve.ts`, then open http://localhost:8080.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The gate's caps from the kit's reference/gate.json: the dossier text is
// capped at 163,840 bytes; screenshots at most 4 files of 256 KiB; game/
// at most 993 entries and 48 MiB in all. The program refuses to write an
// output the scorer would refuse on those counts.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);
