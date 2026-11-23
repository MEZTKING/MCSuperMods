/**
 * The mechanics `hearts` (with the shared kill pair), `tracker` and `head_start` lowered (B725;
 * ADR 0132 D2, the B720 spike's K2 to K9) on every built-in target: the goldens of each sample's
 * mechanic files (`fixtures/<target id>/expected/game/mechanics/<sample>.json`,
 * `UPDATE_GOLDENS=1` rewrites them); every function line of the whole games (round engine and
 * mechanics) through `@msm/schemas/mcfunction` with no error and no warning, the macro lines
 * once their `$(...)` are filled with example values; every JSON file through its schema; each
 * path once but for merged tags; the mechanics' generated ids against their files; and what the
 * spike measured, line by line.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, Json, JsonObject, OutputFile } from '@msm/plugin-api';
import { validateJson } from '@msm/schemas';
import { defaultFunctionUri } from '@msm/schemas/mcfunction';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import { gameKind, gamesGeneratedIds, gamesKinds } from '../../../src/index';
import { headStartGeneratedIds } from '../../../src/lowering/game/mechanics/head-start';
import { heartsGeneratedIds } from '../../../src/lowering/game/mechanics/hearts';
import { lowerMechanic } from '../../../src/lowering/game/mechanics/index';
import { generatedIdsOf, type MechanicIds } from '../../../src/lowering/game/mechanics/kill-pair';
import { trackerGeneratedIds } from '../../../src/lowering/game/mechanics/tracker';
import { projectIdsOf, textOf, toolsFor } from '../../pieces-support';
import { type GameSample, PIECES, sampleElement } from '../samples';
import { MECHANIC_EXTRA_IDS, MECHANIC_SAMPLES } from './samples';

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

const mechanicsOf = (element: Element): JsonObject[] => {
  const list = (element.data as JsonObject).mechanics;
  return Array.isArray(list) ? (list as JsonObject[]) : [];
};

/** The files of a sample's mechanics only. */
function mechanicFiles(sample: GameSample, bundle: TargetBundle): OutputFile[] {
  const element = sampleElement(sample);
  const context = { element, namespace: 'demo', target: bundle.target };
  return mechanicsOf(element).flatMap((mechanic) => lowerMechanic(mechanic, context));
}

/** Every sample game and the pieces, lowered whole by their kinds. */
async function allFiles(bundle: TargetBundle): Promise<OutputFile[]> {
  const out: OutputFile[] = [];
  for (const sample of [...MECHANIC_SAMPLES, ...PIECES]) {
    const kind = gamesKinds.find((entry) => entry.id === sample.kind);
    if (kind === undefined) throw new Error(`no kind ${sample.kind}`);
    out.push(...(await kind.lower(sampleElement(sample), bundle.target)));
  }
  return out;
}

/** Example values for a macro line's `$(name)`, as the game would fill them. */
const MACRO_VALUES: Readonly<Record<string, string>> = {
  hp: '22',
  x: '10',
  y: '70',
  z: '-10',
  dim: 'minecraft:the_nether',
};

const fillMacro = (line: string): string =>
  line.startsWith('$')
    ? line.slice(1).replace(/\$\(([a-z_]+)\)/g, (_whole, name: string) => {
        const value = MACRO_VALUES[name];
        if (value === undefined) throw new Error(`no example value for $(${name})`);
        return value;
      })
    : line;

/**
 * The one warning the offline checker gives for a line the game runs: on the snapshot target the
 * inline item modifier of `item modify` draws "Unknown key" for its own `type` and `components`
 * (B723's `knownCheckerGap` in `packages/targets/all/test/games.test.ts`; B720 K7 ran the same
 * line on that version's server and the compass was pointed). Errors never pass.
 */
const knownCheckerGap = (line: string, message: string): boolean =>
  line.includes(' run item modify entity ') && /^Unknown key “(type|components)”$/.test(message);

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'the mechanics hearts, tracker and head start lowered for %s',
  (targetId, bundle) => {
    beforeAll(async () => {
      await toolsFor(bundle);
    });

    it.each(MECHANIC_SAMPLES.map((sample) => [sample.name, sample] as const))(
      '%s matches the golden',
      async (_name, sample) => {
        const actual = golden(mechanicFiles(sample, bundle));
        const url = new URL(
          `../../fixtures/${targetId}/expected/game/mechanics/${sample.name}.json`,
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
      const extra: Record<string, string[]> = { ...MECHANIC_EXTRA_IDS } as Record<string, string[]>;
      for (const sample of MECHANIC_SAMPLES) {
        for (const [category, ids] of Object.entries(gamesGeneratedIds(sampleElement(sample)))) {
          extra[category] = [...(extra[category] ?? []), ...ids];
        }
      }
      const projectIds = projectIdsOf(all, folders, extra);
      const found: string[] = [];
      let macros = 0;
      let lines = 0;
      let gaps = 0;
      for (const file of all.filter((entry) => entry.language === 'mcfunction')) {
        const match = /^data\/([^/]+)\/[^/]+\/(.+)\.mcfunction$/.exec(file.path);
        const [, namespace, path] = match as unknown as [string, string, string];
        const text = textOf(file).split('\n');
        macros += text.filter((line) => line.startsWith('$')).length;
        lines += text.filter((line) => line.trim() !== '').length;
        const filled = text.map(fillMacro);
        const problems = await tools.mcfunction.check(filled.join('\n'), {
          uri: defaultFunctionUri(namespace, path, folders.function),
          projectIds,
        });
        for (const problem of problems) {
          const line = filled[problem.line] ?? '';
          if (problem.severity !== 'error' && problem.severity !== 'warning') continue;
          if (problem.severity === 'warning' && knownCheckerGap(line, problem.message)) {
            gaps += 1;
            continue;
          }
          found.push(`${file.path}:${problem.line + 1} ${problem.severity} ${problem.message}`);
        }
      }
      expect(found).toEqual([]);
      // The hearts' `set` and the trackers' `set` (two hand slots each) are macro lines.
      expect(macros).toBe(3 + 2 * 2);
      expect(lines).toBeGreaterThan(600);
      // The gap shows on the snapshot target only (two keys on each of the four lines), and a
      // line with a wrong form does not pass.
      expect(gaps).toBe(bundle.target.channel === 'snapshot' ? 2 * 4 : 0);
      const wrong = await tools.mcfunction.check(
        'attribute @s minecraft:max_health base set\nexecute as @a run function',
        { uri: defaultFunctionUri('demo', 'wrong', folders.function), projectIds },
      );
      expect(wrong.filter((problem) => problem.severity === 'error').length).toBeGreaterThan(0);
    }, 240_000);

    it('every JSON file passes its schema with no error and no unknown id', async () => {
      const tools = await toolsFor(bundle);
      const files = MECHANIC_SAMPLES.flatMap((sample) => mechanicFiles(sample, bundle));
      const json = files.filter((file) => file.language === undefined);
      expect(json.some((file) => file.schema === 'resource:advancement')).toBe(true);
      expect(json.some((file) => file.schema === 'resource:recipe')).toBe(true);
      for (const file of json) {
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
      // The round engine writes its hooks empty; the mechanics add their functions to them.
      const died = byPath.get('data/demo/tags/function/msm_games/game/lifesteal/player_died.json');
      expect(died?.flatMap((file) => (file.contents as { values: string[] }).values)).toEqual([
        'demo:msm_games/game/lifesteal/hearts/died',
      ]);
    });

    const IDS: Readonly<Record<string, MechanicIds>> = {
      hearts: heartsGeneratedIds,
      tracker: trackerGeneratedIds,
      head_start: headStartGeneratedIds,
    };
    it.each(MECHANIC_SAMPLES.map((sample) => [sample.name, sample] as const))(
      'the generated ids of %s are those its mechanics write',
      (_name, sample) => {
        const element = sampleElement(sample);
        const context = { element, namespace: 'demo', target: bundle.target };
        for (const mechanic of mechanicsOf(element)) {
          const ids = IDS[mechanic.type as string];
          if (ids === undefined) throw new Error(`no ids for ${String(mechanic.type)}`);
          expect(ids(mechanic, element), String(mechanic.type)).toEqual(
            generatedIdsOf(lowerMechanic(mechanic, context), bundle.target),
          );
          // And the game's own generated ids carry them.
          const all = gamesGeneratedIds(element);
          for (const [category, list] of Object.entries(ids(mechanic, element))) {
            for (const id of list) expect(all[category], `${category} ${id}`).toContain(id);
          }
        }
      },
    );
  },
);

describe('what the spike measured, in the lowered lines', () => {
  const [bundle] = builtInTargets;
  if (bundle === undefined) throw new Error('no built-in target');
  const files = (name: string): Map<string, string[]> => {
    const sample = MECHANIC_SAMPLES.find((entry) => entry.name === name) as GameSample;
    const out = new Map<string, string[]>();
    for (const file of mechanicFiles(sample, bundle)) {
      if (file.language === 'mcfunction') {
        const path = file.path.replace(/^data\/demo\/function\/msm_games\/game\/[^/]+\//, '');
        out.set(path.replace(/\.mcfunction$/, ''), textOf(file).trimEnd().split('\n'));
      }
    }
    return out;
  };
  const json = (name: string, end: string): Json => {
    const sample = MECHANIC_SAMPLES.find((entry) => entry.name === name) as GameSample;
    const file = mechanicFiles(sample, bundle).find((entry) => entry.path.endsWith(end));
    if (file === undefined) throw new Error(`no ${end}`);
    return file.contents as Json;
  };

  it('K2: most health is hearts x 2 by a macro, never above the most', () => {
    const lines = files('lifesteal');
    expect(lines.get('hearts/apply')).toEqual([
      'execute if score @s demo.msm_hearts matches 21.. run scoreboard players set @s demo.msm_hearts 20',
      'execute store result storage demo:msm_games/game/lifesteal/hearts hp int 2 run scoreboard players get @s demo.msm_hearts',
      'function demo:msm_games/game/lifesteal/hearts/set with storage demo:msm_games/game/lifesteal/hearts',
    ]);
    expect(lines.get('hearts/set')).toEqual(['$attribute @s minecraft:max_health base set $(hp)']);
  });

  it('K3: the killer’s advancement in the 26.x one-condition form pairs the kill', () => {
    expect(json('lifesteal', 'advancement/msm_games/game/lifesteal/kill_pair.json')).toEqual({
      criteria: {
        killed_player: {
          trigger: 'minecraft:player_killed_entity',
          conditions: {
            entity: {
              type: 'minecraft:entity_properties',
              entity: 'this',
              predicate: { 'minecraft:entity_type': 'minecraft:player' },
            },
          },
        },
      },
      rewards: { function: 'demo:msm_games/game/lifesteal/kill_pair/killer' },
    });
    const lines = files('lifesteal');
    expect(lines.get('kill_pair/killer')?.[0]).toBe(
      'advancement revoke @s only demo:msm_games/game/lifesteal/kill_pair',
    );
    // The victim: in the round, its death not yet seen by the round engine, nearest the killer.
    expect(lines.get('kill_pair/pair')?.join('\n')).toContain(
      '@a[tag=demo.game.lifesteal.in,tag=!demo.game.lifesteal.killed,scores={demo.msm_deaths=1..},sort=nearest,limit=1]',
    );
    // Only player kills move a heart; other deaths lose one (or nothing, with `keep`).
    expect(lines.get('hearts/died')?.slice(0, 2)).toEqual([
      'execute if entity @s[tag=demo.game.lifesteal.killed] run scoreboard players remove @s demo.msm_hearts 1',
      'execute if entity @s[tag=!demo.game.lifesteal.killed] run scoreboard players remove @s demo.msm_hearts 1',
    ]);
    expect(files('spectate').get('hearts/died')?.join('\n')).not.toContain('tag=!');
  });

  it('K4: the Heart item is a recipe whose result carries components, found by eating it', () => {
    const recipe = json('lifesteal', 'recipe/msm_games/game/lifesteal/heart.json') as JsonObject;
    expect(recipe.type).toBe('minecraft:crafting_shaped');
    expect((recipe.result as JsonObject).components).toEqual({
      'minecraft:custom_name': { text: 'Heart', italic: false },
      'minecraft:item_model': 'minecraft:heart_of_the_sea',
      'minecraft:custom_data': { msm_heart_demo: true },
      'minecraft:consumable': {
        consume_seconds: 1.0,
        animation: 'eat',
        has_consume_particles: false,
      },
    });
    const eat = json('lifesteal', 'advancement/msm_games/game/lifesteal/heart.json') as JsonObject;
    expect(eat.criteria).toEqual({
      used: {
        trigger: 'minecraft:consume_item',
        conditions: {
          item: {
            items: 'minecraft:red_dye',
            predicates: { 'minecraft:custom_data': '{msm_heart_demo:1b}' },
          },
        },
      },
    });
    // No recipe: the item exists only by withdrawing or a command.
    const again = MECHANIC_SAMPLES.find((entry) => entry.name === 'again') as GameSample;
    expect(mechanicFiles(again, bundle).some((file) => file.path.includes('/recipe/'))).toBe(false);
  });

  it('K5 and K6: withdraw by trigger, kept out by game time', () => {
    const lines = files('lifesteal');
    expect(lines.get('hearts/tick')).toEqual([
      'execute store result score #lifesteal.hearts_now demo.msm_game run time query gametime',
      'execute as @a[tag=demo.game.lifesteal.kept_out] if score @s demo.msm_out_until <= #lifesteal.hearts_now demo.msm_game run function demo:msm_games/game/lifesteal/hearts/return',
      'scoreboard players enable @a[tag=demo.game.lifesteal.in] demo.msm_withdraw',
      'execute as @a[tag=demo.game.lifesteal.in,scores={demo.msm_withdraw=1..}] run function demo:msm_games/game/lifesteal/hearts/withdraw',
    ]);
    expect(lines.get('hearts/zero')).toContain(
      'scoreboard players add @s demo.msm_out_until 72000',
    );
    expect(lines.get('hearts/withdraw')?.[0]).toBe(
      'execute if score @s demo.msm_hearts matches 2.. run function demo:msm_games/game/lifesteal/hearts/take',
    );
    // At zero: out through the round engine, or a fresh start.
    expect(lines.get('hearts/zero')?.at(-1)).toBe('function demo:msm_games/game/lifesteal/out');
    expect(files('again').get('hearts/zero')?.join('\n')).not.toContain('/out');
  });

  it('K7: the tracker reads the target once and points every compass by one macro call', () => {
    const lines = files('hunt');
    expect(lines.get('tracker/second')?.[1]).toBe(
      'execute if score #hunt.tracker_s demo.msm_game matches 1.. run function demo:msm_games/game/hunt/tracker/point',
    );
    expect(files('spin').get('tracker/second')?.[1]).toContain('matches 5.. run');
    const read = lines.get('tracker/read/minecraft/the_nether') ?? [];
    expect(read.filter((line) => line.includes('from entity'))).toEqual([
      'data modify storage demo:msm_games/game/hunt/tracker/minecraft/the_nether p set from entity @s Pos',
    ]);
    expect(lines.get('tracker/set')?.[0]).toBe(
      '$execute as @a[tag=demo.game.hunt.role.hunter,tag=demo.game.hunt.in,distance=0..] run execute if items entity @s weapon.mainhand minecraft:compass[minecraft:custom_data~{msm_tracker_demo:1b}] run item modify entity @s weapon.mainhand {type:"minecraft:set_components",components:{"minecraft:lodestone_tracker":{target:{dimension:"$(dim)",pos:[I;$(x),$(y),$(z)]},tracked:false}}}',
    );
    // A dimension of the game's own is covered as well as the vanilla three.
    expect([...files('spin').keys()]).toContain('tracker/read/demo/arena');
  });

  it('K9: the head start holds by attribute modifiers, nothing per tick', () => {
    const lines = files('hunt');
    expect(lines.get('head_start/hold')).toEqual([
      'attribute @s minecraft:movement_speed modifier add demo:msm_games/game/hunt/head_start -1 add_multiplied_total',
      'attribute @s minecraft:jump_strength modifier add demo:msm_games/game/hunt/head_start -1 add_multiplied_total',
      'effect give @s minecraft:blindness 30 0 true',
      'tag @s add demo.game.hunt.held',
    ]);
    expect(files('spin').get('head_start/hold')?.join('\n')).not.toContain('blindness');
    const sample = MECHANIC_SAMPLES.find((entry) => entry.name === 'hunt') as GameSample;
    const hooks = mechanicFiles(sample, bundle)
      .filter((file) => file.merge === 'tag')
      .map((file) => file.path);
    expect(hooks.some((path) => path.endsWith('/hunt/tick.json'))).toBe(false);
  });

  it('lowers nothing for a tracker or head start whose roles the game lacks', () => {
    const element = sampleElement({
      ...(MECHANIC_SAMPLES.find((entry) => entry.name === 'hunt') as GameSample),
      data: {
        ...((MECHANIC_SAMPLES.find((entry) => entry.name === 'hunt') as GameSample)
          .data as JsonObject),
        roles: [],
      },
    });
    const context = { element, namespace: 'demo', target: bundle.target };
    for (const mechanic of mechanicsOf(element)) {
      expect(lowerMechanic(mechanic, context)).toEqual([]);
    }
    expect(gameKind.id).toBe('msm:game');
  });
});
