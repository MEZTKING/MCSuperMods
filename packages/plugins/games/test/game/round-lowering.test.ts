/**
 * The round engine and kits lowered (B724; ADR 0132 D1 to D3) on every built-in target: the
 * goldens of the round engine's own files per sample game and of each kit
 * (`fixtures/<target id>/expected/game/<sample>.json`, `UPDATE_GOLDENS=1` rewrites them), every
 * function line of the games, kits and the pieces they name lowered together through
 * `@msm/schemas/mcfunction` with no error and no warning, every JSON file through its schema,
 * every shared path merged as a tag, and `gamesGeneratedIds` against the files.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json, OutputFile } from '@msm/plugin-api';
import { validateJson } from '@msm/schemas';
import { defaultFunctionUri } from '@msm/schemas/mcfunction';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import { gameKind, gamesGeneratedIds, gamesKinds, kitKind } from '../../src/index';
import { lobbyFiles } from '../../src/lowering/game/lobby';
import { GAME_HOOKS } from '../../src/lowering/game/names';
import { rolesFiles } from '../../src/lowering/game/roles';
import { roundFiles } from '../../src/lowering/game/round';
import { itemArgument, snbtOf } from '../../src/lowering/kit';
import { projectIdsOf, textOf, toolsFor } from '../pieces-support';
import {
  GAME_SAMPLES,
  type GameSample,
  KIT_SAMPLES,
  PIECES,
  SAMPLE_EXTRA_IDS,
  sampleElement,
} from './samples';

const UPDATE = process.env.UPDATE_GOLDENS === '1';

const sorted = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sorted);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sorted((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
};

/** The files a sample lowers to; for a game, only the round engine's (no mechanics). */
async function engineFiles(sample: GameSample, bundle: TargetBundle): Promise<OutputFile[]> {
  const element = sampleElement(sample);
  if (sample.kind === gameKind.id) {
    const context = {
      element,
      namespace: element.id.slice(0, element.id.indexOf(':')),
      target: bundle.target,
    };
    return [...roundFiles(context), ...lobbyFiles(context), ...rolesFiles(context)];
  }
  return kitKind.lower(element, bundle.target);
}

/** Every sample, kit and piece lowered whole by its kind. */
async function allFiles(bundle: TargetBundle): Promise<OutputFile[]> {
  const out: OutputFile[] = [];
  for (const sample of [...GAME_SAMPLES, ...KIT_SAMPLES, ...PIECES]) {
    const kind = gamesKinds.find((entry) => entry.id === sample.kind);
    if (kind === undefined) throw new Error(`no kind ${sample.kind}`);
    out.push(...(await kind.lower(sampleElement(sample), bundle.target)));
  }
  return out;
}

const golden = (files: readonly OutputFile[]): string =>
  `${JSON.stringify(
    sorted(
      files.map((file) => ({
        path: file.path,
        layer: file.layer,
        schema: file.schema ?? null,
        merge: file.merge ?? null,
        ...(file.language === undefined
          ? { contents: file.contents }
          : { language: file.language, lines: textOf(file).split('\n') }),
      })),
    ),
    null,
    2,
  )}\n`;

describe('kit lowering helpers', () => {
  it('writes JSON as SNBT and items with their components', () => {
    expect(snbtOf({ text: 'Hi', 'minecraft:x': [1, true, 'a"b'] })).toBe(
      '{text:"Hi","minecraft:x":[1,true,"a\\"b"]}',
    );
    expect(itemArgument('minecraft:stone', undefined)).toBe('minecraft:stone');
    expect(itemArgument('minecraft:stone', {})).toBe('minecraft:stone');
    expect(itemArgument('minecraft:stone', { 'minecraft:unbreakable': {} })).toBe(
      'minecraft:stone[minecraft:unbreakable={}]',
    );
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'the round engine and kits lowered for %s',
  (targetId, bundle) => {
    beforeAll(async () => {
      await toolsFor(bundle);
    });

    it.each([...GAME_SAMPLES, ...KIT_SAMPLES].map((sample) => [sample.name, sample] as const))(
      '%s matches the golden',
      async (_name, sample) => {
        const actual = golden(await engineFiles(sample, bundle));
        const url = new URL(
          `../fixtures/${targetId}/expected/game/${sample.kind === gameKind.id ? 'game' : 'kit'}_${sample.name}.json`,
          import.meta.url,
        );
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );

    it('every function line passes the mcfunction checker with no error and no warning', async () => {
      const tools = await toolsFor(bundle);
      const all = await allFiles(bundle);
      const folders = bundle.target.folders.data;
      const projectIds = projectIdsOf(all, folders, SAMPLE_EXTRA_IDS);
      const found: string[] = [];
      let lines = 0;
      for (const file of all.filter((entry) => entry.language === 'mcfunction')) {
        const match = /^data\/([^/]+)\/[^/]+\/(.+)\.mcfunction$/.exec(file.path);
        const [, namespace, path] = match as unknown as [string, string, string];
        lines += textOf(file)
          .split('\n')
          .filter((line) => line.trim() !== '').length;
        const problems = await tools.mcfunction.check(textOf(file), {
          uri: defaultFunctionUri(namespace, path, folders.function),
          projectIds,
        });
        for (const problem of problems) {
          if (problem.severity === 'error' || problem.severity === 'warning') {
            found.push(`${file.path}:${problem.line + 1} ${problem.severity} ${problem.message}`);
          }
        }
      }
      expect(found).toEqual([]);
      expect(lines).toBeGreaterThan(300);
    }, 180_000);

    it('every JSON file passes its schema with no error and no unknown id', async () => {
      const tools = await toolsFor(bundle);
      for (const file of (await allFiles(bundle)).filter((entry) => entry.language === undefined)) {
        expect(file.schema, file.path).toBeDefined();
        const problems = validateJson(
          file.contents as Json,
          tools.schemas.resolveSchemaRef(file.schema as string),
          { registries: tools.registries },
        ).filter((problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id');
        expect(problems, file.path).toEqual([]);
      }
    });

    it('writes each path once, but for tags that merge', async () => {
      const byPath = new Map<string, OutputFile[]>();
      for (const file of await allFiles(bundle)) {
        expect(file.layer).toBe('datapack');
        byPath.set(file.path, [...(byPath.get(file.path) ?? []), file]);
      }
      for (const [path, files] of byPath) {
        if (files.length > 1)
          expect(
            files.every((file) => file.merge === 'tag'),
            path,
          ).toBe(true);
      }
      // The floor's timer win adds itself to the timer's own `ended` hook (the game is lowered
      // before the timer).
      const ended = byPath.get('data/demo/tags/function/msm_games/timer/round_clock/ended.json');
      expect(ended?.map((file) => file.contents)).toEqual([
        { values: ['demo:msm_games/game/floor/win/1/timer'] },
        { values: [] },
      ]);
    });

    it.each([...GAME_SAMPLES, ...KIT_SAMPLES].map((sample) => [sample.name, sample] as const))(
      'gamesGeneratedIds lists every id %s defines and no other',
      async (_name, sample) => {
        const element = sampleElement(sample);
        const kind = sample.kind === gameKind.id ? gameKind : kitKind;
        const files = await kind.lower(element, bundle.target);
        const folders = bundle.target.folders.data;
        const ids = projectIdsOf(files, folders);
        expect(gamesGeneratedIds(element)).toEqual(
          Object.fromEntries(Object.entries(ids).sort(([a], [b]) => (a < b ? -1 : 1))),
        );
      },
    );
  },
);

describe('the round engine’s names', () => {
  it('writes every hook tag empty, for Rules, stories and the mechanics to fill', async () => {
    const [bundle] = builtInTargets;
    if (bundle === undefined) throw new Error('no target');
    const files = await engineFiles(GAME_SAMPLES[0] as GameSample, bundle);
    for (const hook of GAME_HOOKS) {
      const file = files.find(
        (entry) => entry.path === `data/demo/tags/function/msm_games/game/hunt/${hook}.json`,
      );
      expect(file?.contents, hook).toEqual({ values: [] });
      expect(file?.merge).toBe('tag');
    }
  });
});
