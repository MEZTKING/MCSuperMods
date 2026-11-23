/**
 * Lowering of the game pieces (B552; ADR 0113 D3 to D7, D9) on every built-in target: the
 * goldens under `fixtures/<target id>/expected/<kind folder>/<sample>.json` (`UPDATE_GOLDENS=1`
 * rewrites them), every function line through `@msm/schemas/mcfunction` with no error, every
 * JSON file through its schema, and every sample lowered together as one data pack: each path
 * written by more than one element merges as a tag. (The exporters' vanilla pack test cannot load
 * the games plugin yet: `@msm/exporters` gains the dependency in B551.)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Json, OutputFile, TargetFacts } from '@msm/plugin-api';
import { validateJson } from '@msm/schemas';
import { defaultFunctionUri } from '@msm/schemas/mcfunction';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  fillForm,
  GamesLoweringError,
  sharedFunctionFiles,
} from '../src/lowering/shared-functions';
import { PIECE_KINDS, SAMPLE_PROJECT_IDS, SAMPLES, type Sample } from './pieces-samples';
import { element, projectIdsOf, textOf, toolsFor } from './pieces-support';

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

async function lowerSample(sample: Sample, bundle: TargetBundle): Promise<OutputFile[]> {
  const kind = PIECE_KINDS[sample.kind];
  if (kind === undefined) throw new Error(`no kind ${sample.kind}`);
  return kind.lower(element(sample.kind, sample.id, sample.data), bundle.target);
}

const [firstBundle] = builtInTargets;
if (firstBundle === undefined) throw new Error('no built-in target');

describe('fillForm', () => {
  const target = firstBundle.target;
  it('fills required placeholders and writes optional ones only in order', () => {
    expect(fillForm(target, 'team_join', { team: 'a.b', members: '@s' })).toBe('team join a.b @s');
    expect(fillForm(target, 'objective_add', { objective: 'o', criterion: 'dummy' })).toBe(
      'scoreboard objectives add o dummy',
    );
    expect(
      fillForm(target, 'objective_add', {
        objective: 'o',
        criterion: 'dummy',
        display_name: '"x"',
      }),
    ).toBe('scoreboard objectives add o dummy "x"');
    expect(fillForm(target, 'random_value', { min: 1, max: 6 })).toBe('random value 1..6');
    expect(
      fillForm(target, 'place_template', { template: 'a:b', x: 1, y: 2, z: 3, mirror: 'none' }),
    ).toBe('place template a:b 1 2 3');
    expect(fillForm(target, 'worldborder_set_over_seconds', { width: 10, seconds: 5 })).toBe(
      'worldborder set 10 5s',
    );
  });

  it('refuses a missing value or a target without forms', () => {
    expect(() => fillForm(target, 'team_join', { team: 'a' })).toThrow(GamesLoweringError);
    if (target.commands === undefined) throw new Error('no command facts');
    const { forms: _forms, ...commands } = target.commands;
    const bare: TargetFacts = { ...target, commands };
    expect(() => fillForm(bare, 'team_join', { team: 'a', members: '@s' })).toThrow(
      /no command form/,
    );
  });
});

describe('sharedFunctionFiles', () => {
  it('writes each contribution, its entry in the plugin tag and the plugin tag in minecraft', () => {
    const files = sharedFunctionFiles(firstBundle.target, 'demo', [
      { phase: 'load', path: 'world_setup/start', lines: ['say hi'] },
      { phase: 'tick', path: 'world_setup/tick', lines: [] },
    ]);
    expect(
      files.map((file) => [file.path, file.merge ?? null, file.language ?? file.contents]),
    ).toEqual([
      ['data/demo/function/msm_games/world_setup/start.mcfunction', null, 'mcfunction'],
      [
        'data/demo/tags/function/msm_games/load.json',
        'tag',
        { values: ['demo:msm_games/world_setup/start'] },
      ],
      ['data/demo/function/msm_games/world_setup/tick.mcfunction', null, 'mcfunction'],
      [
        'data/demo/tags/function/msm_games/tick.json',
        'tag',
        { values: ['demo:msm_games/world_setup/tick'] },
      ],
      ['data/minecraft/tags/function/load.json', 'tag', { values: ['#demo:msm_games/load'] }],
      ['data/minecraft/tags/function/tick.json', 'tag', { values: ['#demo:msm_games/tick'] }],
    ]);
  });
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'game pieces lowered for %s',
  (targetId, bundle) => {
    it.each(SAMPLES.map((sample) => [`${sample.folder}/${sample.name}`, sample] as const))(
      '%s matches the golden',
      async (_name, sample) => {
        const files = await lowerSample(sample, bundle);
        const actual = `${JSON.stringify(
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
        const url = new URL(
          `./fixtures/${targetId}/expected/${sample.folder}/${sample.name}.json`,
          import.meta.url,
        );
        if (UPDATE) {
          await mkdir(dirname(fileURLToPath(url)), { recursive: true });
          await writeFile(url, actual);
        }
        expect(actual).toBe(await readFile(url, 'utf8'));
      },
    );

    it('every function line passes the mcfunction checker with no error', async () => {
      const tools = await toolsFor(bundle);
      const all = (await Promise.all(SAMPLES.map((sample) => lowerSample(sample, bundle)))).flat();
      const folders = bundle.target.folders.data;
      const projectIds = projectIdsOf(all, folders, SAMPLE_PROJECT_IDS);
      const found: string[] = [];
      for (const file of all.filter((entry) => entry.language === 'mcfunction')) {
        const match = /^data\/([^/]+)\/[^/]+\/(.+)\.mcfunction$/.exec(file.path);
        const [, namespace, path] = match as unknown as [string, string, string];
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
      // The checker is awake: a wrong option and an unknown objective are reported.
      const wrong = await tools.mcfunction.check(
        'team modify demo.my_team colour red\nscoreboard players set #a demo.nothing 1',
        { uri: defaultFunctionUri('demo', 'wrong', folders.function), projectIds },
      );
      expect(wrong.some((problem) => problem.severity === 'error')).toBe(true);
      expect(wrong.some((problem) => problem.line === 1)).toBe(true);
    }, 120_000);

    it('every JSON file passes its schema with no error and no unknown id', async () => {
      const tools = await toolsFor(bundle);
      const all = (await Promise.all(SAMPLES.map((sample) => lowerSample(sample, bundle)))).flat();
      for (const file of all.filter((entry) => entry.language === undefined)) {
        expect(file.schema, file.path).toBeDefined();
        const problems = validateJson(
          file.contents as Json,
          tools.schemas.resolveSchemaRef(file.schema as string),
          { registries: tools.registries },
        ).filter((problem) => problem.severity === 'error' || problem.code === 'schema.unknown-id');
        expect(problems, file.path).toEqual([]);
      }
    });

    it('lowers every sample into one data pack whose shared paths all merge as tags', async () => {
      const all = (await Promise.all(SAMPLES.map((sample) => lowerSample(sample, bundle)))).flat();
      const byPath = new Map<string, OutputFile[]>();
      for (const file of all) {
        expect(file.layer).toBe('datapack');
        byPath.set(file.path, [...(byPath.get(file.path) ?? []), file]);
      }
      const shared = [...byPath].filter(([, files]) => files.length > 1);
      expect(shared.map(([path]) => path).sort()).toEqual([
        'data/demo/tags/function/msm_games/load.json',
        'data/demo/tags/function/msm_games/tick.json',
        'data/minecraft/tags/function/load.json',
        'data/minecraft/tags/function/tick.json',
      ]);
      for (const [, files] of shared) {
        expect(files.every((file) => file.merge === 'tag' && file.schema === 'tag:function')).toBe(
          true,
        );
      }
      const loads = (byPath.get('data/demo/tags/function/msm_games/load.json') ?? []).flatMap(
        (file) => (file.contents as { values: string[] }).values,
      );
      expect(loads).toContain('demo:msm_games/team/teams/red/load');
      expect(new Set(loads).size).toBe(loads.length);
    });
  },
);
