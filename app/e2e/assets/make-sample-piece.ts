/**
 * One-off generator of `sample-piece.nbt`, the structure file the `worldgen-path` e2e spec
 * imports. The bytes come from our own codec (`@msm/plugin-structures`), never from the game:
 * a 3×2×3 template (cobblestone floor, one oak log post, a jigsaw on the north edge) at the
 * current target's data version. CC0.
 *
 * Run from the repository root with a TypeScript loader that resolves the workspace packages,
 * for example the `jiti` already in the pnpm store:
 *
 *     node node_modules/.pnpm/jiti@<version>/node_modules/jiti/lib/jiti-cli.mjs \
 *       app/e2e/assets/make-sample-piece.ts
 *
 * The output is deterministic, so rerunning it leaves the committed file unchanged.
 *
 * @packageDocumentation
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type StructureTemplateData,
  structureTemplateToNbt,
  writeNbt,
} from '@msm/plugin-structures';
import { defaultTargetId, targetById } from '@msm/targets';

const data: StructureTemplateData = {
  size: [3, 2, 3],
  palette: [
    'minecraft:cobblestone',
    'minecraft:jigsaw[orientation=north_up]',
    'minecraft:oak_log[axis=y]',
  ],
  blocks: [
    [0, 0, 0, 0],
    [1, 0, 0, 1],
    [2, 0, 0, 0],
    [0, 0, 1, 0],
    [1, 0, 1, 0],
    [2, 0, 1, 0],
    [0, 0, 2, 0],
    [1, 0, 2, 0],
    [2, 0, 2, 0],
    [1, 1, 1, 2],
  ],
  jigsaws: [
    {
      pos: [1, 0, 0],
      pool: 'minecraft:empty',
      name: 'minecraft:sample_piece',
      target: 'minecraft:empty',
      final_state: 'minecraft:cobblestone',
      joint: 'rollable',
    },
  ],
};

const bundle = targetById(defaultTargetId);
if (bundle === undefined) throw new Error(`No target ${defaultTargetId}.`);
const out = join(dirname(fileURLToPath(import.meta.url)), 'sample-piece.nbt');
writeFileSync(out, writeNbt(structureTemplateToNbt(data, bundle.target.dataVersion)));
console.log(`Wrote ${out}`);
