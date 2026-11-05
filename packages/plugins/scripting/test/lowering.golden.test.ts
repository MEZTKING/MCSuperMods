/**
 * Golden tests of lowering: every sample is lowered for every built-in target, its source
 * parses, and the output is compared with `fixtures/<target id>/expected/script/<sample>.json`
 * (the file's path, layer, language and text). Set `UPDATE_GOLDENS=1` to rewrite the expected
 * files instead of comparing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json, ResourceLocation } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { scriptKind } from '../src/index';
import { element, sortedJson, syntaxErrors } from './support';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

interface Sample {
  name: string;
  id: ResourceLocation;
  data: Json;
}

const SAMPLES: Sample[] = [
  { name: 'default', id: 'demo:sample', data: scriptKind.defaultData as Json },
  {
    name: 'ore_glow',
    id: 'example:ores/ore_glow',
    data: {
      lines: [
        'import { msm, type Pos } from "msm:runtime";',
        '',
        'const above = (pos: Pos): Pos => pos.offset(0, 1, 0);',
        '',
        'msm.actions.define("example:ore_glow", (e) => {',
        '  e.world.setBlock(above(e.pos), "minecraft:glowstone");',
        '  e.world.playSound("minecraft:block.amethyst_block.chime", e.pos, { pitch: 1.5 });',
        '});',
        '',
        'msm.events.on("block.break", (e) => {',
        '  if (e.block.id === "example:ruby_ore" && !e.player.isCreative) {',
        '    msm.schedule(20, () => msm.log.info("Ruby ore broken at " + e.block.pos.toString()));',
        '  }',
        '});',
      ],
    },
  },
  { name: 'empty', id: 'demo:empty', data: { lines: [] } },
];

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'script lowering for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((sample) => [sample.name, sample] as const))(
      '%s matches the golden',
      async (name, sample) => {
        const files = scriptKind.lower(
          element('msm:script', sample.id, sample.data),
          bundle.target,
        );
        const actual = sortedJson(
          files.map((file) => {
            const text = new TextDecoder().decode(file.contents as Uint8Array);
            expect(syntaxErrors(text), file.path).toEqual([]);
            return {
              language: file.language,
              layer: file.layer,
              path: file.path,
              schema: file.schema ?? null,
              text,
            };
          }),
        );
        const url = new URL(`./fixtures/${targetId}/expected/script/${name}.json`, import.meta.url);
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );
  },
);
