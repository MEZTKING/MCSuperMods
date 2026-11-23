/**
 * The mechanics `elimination`, `fall_out`, `floor`, `team_base`, `generators`, `shop`, `border`
 * and `kit_on` lowered (B726; ADR 0132 D2, the B720 spike's K10 to K14, K17 and K19) on every
 * built-in target: the goldens of each sample's mechanic files
 * (`fixtures/<target id>/expected/game/mechanics/b726_<sample>.json`, `UPDATE_GOLDENS=1` rewrites
 * them); every function line of the whole games (round engine and mechanics) with their pieces
 * through `@msm/schemas/mcfunction` with no error and no warning, the macro lines once their
 * `$(...)` are filled with example values; each path once but for merged tags; the mechanics'
 * generated ids against their files; the floor expander; what the spike measured, line by line;
 * and the tick cost of the four-team, twelve-generator game against K19's bar.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, JsonObject, OutputFile } from '@msm/plugin-api';
import { defaultFunctionUri } from '@msm/schemas/mcfunction';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import { gamesGeneratedIds, gamesKinds } from '../../../src/index';
import { borderGeneratedIds } from '../../../src/lowering/game/mechanics/border';
import { eliminationGeneratedIds } from '../../../src/lowering/game/mechanics/elimination';
import { FALL_BOTTOM, fallOutGeneratedIds } from '../../../src/lowering/game/mechanics/fall-out';
import {
  boxVolume,
  FILL_LIMIT,
  fillParts,
  floorAreaExpander,
  floorAreaPatches,
  floorGeneratedIds,
} from '../../../src/lowering/game/mechanics/floor';
import { generatorsGeneratedIds } from '../../../src/lowering/game/mechanics/generators';
import { lowerMechanic } from '../../../src/lowering/game/mechanics/index';
import { generatedIdsOf, type MechanicIds } from '../../../src/lowering/game/mechanics/kill-pair';
import { kitOnGeneratedIds } from '../../../src/lowering/game/mechanics/kit-on';
import { shopGeneratedIds } from '../../../src/lowering/game/mechanics/shop';
import { teamBaseGeneratedIds } from '../../../src/lowering/game/mechanics/team-base';
import { projectIdsOf, textOf, toolsFor } from '../../pieces-support';
import { KIT_SAMPLES, PIECES, sampleElement } from '../samples';
import { B726_EXTRA_IDS, B726_PIECES, B726_SAMPLES, expandedSamples } from './samples-b726';

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

const GAMES = expandedSamples([...PIECES, ...KIT_SAMPLES]);
const OTHERS = [...KIT_SAMPLES, ...PIECES, ...B726_PIECES].map(sampleElement);

const gameNamed = (name: string): Element => {
  const found = GAMES.find((one) => one.id === `demo:${name}`);
  if (found === undefined) throw new Error(`no sample ${name}`);
  return found;
};

const mechanicsOf = (element: Element): JsonObject[] => {
  const list = (element.data as JsonObject).mechanics;
  return Array.isArray(list) ? (list as JsonObject[]) : [];
};

/** The files of a game's mechanics only. */
function mechanicFiles(element: Element, bundle: TargetBundle): OutputFile[] {
  const context = { element, namespace: 'demo', target: bundle.target };
  return mechanicsOf(element).flatMap((mechanic) => lowerMechanic(mechanic, context));
}

/** Every sample game (expanded) and the pieces, lowered whole by their kinds. */
async function allFiles(bundle: TargetBundle): Promise<OutputFile[]> {
  const out: OutputFile[] = [];
  for (const element of [...GAMES, ...OTHERS]) {
    const kind = gamesKinds.find((entry) => entry.id === element.kind);
    if (kind === undefined) throw new Error(`no kind ${element.kind}`);
    out.push(...(await kind.lower(element, bundle.target)));
  }
  return out;
}

/** Example values for a macro line's `$(name)`, as the game fills them. */
const MACRO_VALUES: Readonly<Record<string, string>> = { x: '-12', y: '64', z: '7' };

const fillMacro = (line: string): string =>
  line.startsWith('$')
    ? line.slice(1).replace(/\$\(([a-z_]+)\)/g, (_whole, name: string) => {
        const value = MACRO_VALUES[name];
        if (value === undefined) throw new Error(`no example value for $(${name})`);
        return value;
      })
    : line;

const IDS: Readonly<Record<string, MechanicIds>> = {
  elimination: eliminationGeneratedIds,
  fall_out: fallOutGeneratedIds,
  floor: floorGeneratedIds,
  team_base: teamBaseGeneratedIds,
  generators: generatorsGeneratedIds,
  shop: shopGeneratedIds,
  border: borderGeneratedIds,
  kit_on: kitOnGeneratedIds,
};

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'the mechanics of B726 lowered for %s',
  (targetId, bundle) => {
    beforeAll(async () => {
      await toolsFor(bundle);
    });

    it.each(B726_SAMPLES.map((sample) => [sample.name] as const))(
      '%s matches the golden',
      async (name) => {
        const actual = golden(mechanicFiles(gameNamed(name), bundle));
        const url = new URL(
          `../../fixtures/${targetId}/expected/game/mechanics/b726_${name}.json`,
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
      const extra: Record<string, string[]> = { ...B726_EXTRA_IDS } as Record<string, string[]>;
      for (const element of GAMES) {
        for (const [category, ids] of Object.entries(gamesGeneratedIds(element))) {
          extra[category] = [...(extra[category] ?? []), ...ids];
        }
      }
      const projectIds = projectIdsOf(all, folders, extra);
      const found: string[] = [];
      let macros = 0;
      let lines = 0;
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
          if (problem.severity !== 'error' && problem.severity !== 'warning') continue;
          found.push(`${file.path}:${problem.line + 1} ${problem.severity} ${problem.message}`);
        }
      }
      expect(found).toEqual([]);
      // The fall that puts players back is the one macro line (`layers`).
      expect(macros).toBe(1);
      expect(lines).toBeGreaterThan(700);
    }, 240_000);

    it('writes each path once, but for tags that merge', async () => {
      const byPath = new Map<string, OutputFile[]>();
      for (const file of await allFiles(bundle)) {
        expect(file.layer).toBe('datapack');
        byPath.set(file.path, [...(byPath.get(file.path) ?? []), file]);
      }
      for (const [path, files] of byPath) {
        if (files.length > 1) {
          expect(
            files.every((file) => file.merge === 'tag'),
            path,
          ).toBe(true);
        }
      }
      // The mechanics add themselves to the round's hooks, in the game's order.
      const died = byPath.get('data/demo/tags/function/msm_games/game/beds/player_died.json');
      expect(died?.flatMap((file) => (file.contents as { values: string[] }).values)).toEqual([
        'demo:msm_games/game/beds/team_base/died',
        'demo:msm_games/game/beds/elimination/died',
      ]);
    });

    it.each(B726_SAMPLES.map((sample) => [sample.name] as const))(
      'the generated ids of %s are those its mechanics write',
      (name) => {
        const element = gameNamed(name);
        const context = { element, namespace: 'demo', target: bundle.target };
        for (const mechanic of mechanicsOf(element)) {
          const ids = IDS[mechanic.type as string];
          if (ids === undefined) throw new Error(`no ids for ${String(mechanic.type)}`);
          expect(ids(mechanic, element), String(mechanic.type)).toEqual(
            generatedIdsOf(lowerMechanic(mechanic, context), bundle.target),
          );
          const all = gamesGeneratedIds(element);
          for (const [category, list] of Object.entries(ids(mechanic, element))) {
            for (const id of list) expect(all[category], `${category} ${id}`).toContain(id);
          }
        }
      },
    );
  },
);

describe('the floor expander', () => {
  it('gives each floor its area’s corners, and leaves the rest alone', () => {
    const elements = [...B726_SAMPLES, ...B726_PIECES].map(sampleElement);
    const patches = floorAreaPatches(elements);
    expect(patches.map((patch) => [patch.elementId, patch.path.join('/'), patch.value])).toEqual([
      ['demo:spleef', 'mechanics/0/from', [0, 64, 0]],
      ['demo:spleef', 'mechanics/0/to', [31, 64, 31]],
      ['demo:layers', 'mechanics/0/from', [-100, 10, -50]],
      ['demo:layers', 'mechanics/0/to', [99, 11, 49]],
      ['demo:pattern', 'mechanics/0/from', [0, 40, 0]],
      ['demo:pattern', 'mechanics/0/to', [15, 40, 15]],
    ]);
    expect(patches[0]?.origin).toEqual({ elementId: 'demo:spleef', pointer: '/mechanics/0/area' });
    // Without the area, nothing.
    const alone = B726_SAMPLES.map(sampleElement);
    expect(floorAreaPatches(alone)).toEqual([]);
    expect(floorAreaExpander.kinds).toEqual(['msm:game', 'msm:area']);
  });

  it('cuts a big floor into fills of at most 32,768 blocks that cover it once', () => {
    const box = { min: [-100, 10, -50], max: [99, 11, 49] } as const;
    const parts = fillParts(box);
    expect(parts.length).toBe(2);
    expect(parts.every((part) => boxVolume(part) <= FILL_LIMIT)).toBe(true);
    expect(parts.reduce((sum, part) => sum + boxVolume(part), 0)).toBe(boxVolume(box));
    const huge = { min: [0, 0, 0], max: [999, 0, 999] } as const;
    const many = fillParts(huge);
    expect(many.every((part) => boxVolume(part) <= FILL_LIMIT)).toBe(true);
    expect(many.reduce((sum, part) => sum + boxVolume(part), 0)).toBe(1_000_000);
  });
});

describe('what the spike measured, in the lowered lines', () => {
  const [bundle] = builtInTargets;
  if (bundle === undefined) throw new Error('no built-in target');
  const files = (name: string): Map<string, string[]> => {
    const out = new Map<string, string[]>();
    for (const file of mechanicFiles(gameNamed(name), bundle)) {
      if (file.language === 'mcfunction') {
        const path = file.path.replace(/^data\/demo\/function\/msm_games\/game\/[^/]+\//, '');
        out.set(path.replace(/\.mcfunction$/, ''), textOf(file).trimEnd().split('\n'));
      }
    }
    return out;
  };

  it('K10: adventure mode, a can_break tool, block_drops off, fall-out by a selector box, rebuilt by fill', () => {
    const lines = files('spleef');
    expect(lines.get('floor/tool')).toEqual([
      'tag @s remove demo.game.spleef.floor.ready',
      'gamemode adventure @s',
      'give @s minecraft:diamond_shovel[minecraft:can_break={blocks:"minecraft:snow_block"}] 1',
    ]);
    expect(lines.get('floor/start')).toEqual(['gamerule block_drops false']);
    expect(lines.get('floor/end')?.[0]).toBe('gamerule block_drops true');
    expect(lines.get('floor/rebuild')).toEqual([
      'execute in minecraft:overworld run fill 0 64 0 31 64 31 minecraft:snow_block',
    ]);
    expect(lines.get('fall_out/tick')).toEqual([
      `execute in minecraft:overworld run execute as @a[tag=demo.game.spleef.in,tag=!demo.game.spleef.dead,gamemode=!spectator,x=-30000000,y=${FALL_BOTTOM},z=-30000000,dx=60000000,dy=${60 - 1 - FALL_BOTTOM},dz=60000000] run function demo:msm_games/game/spleef/fall_out/fell`,
    ]);
    // Drops on: the rule is left alone. A building rebuilds a patterned floor at its low corner.
    expect(files('layers').has('floor/start')).toBe(false);
    expect(files('layers').get('floor/rebuild')?.length).toBe(2);
    expect(files('pattern').get('floor/rebuild')).toEqual([
      'execute in minecraft:the_nether run place template demo:floor_pattern 0 40 0',
    ]);
  });

  it('K11: the bed foot decides, the spawn point, the wait as a spectator', () => {
    const lines = files('beds');
    expect(lines.get('team_base/spawn')?.[0]).toBe(
      'execute in minecraft:overworld run spawnpoint @s[team=demo.red] 40 65 43',
    );
    expect(lines.get('team_base/died/0')).toEqual([
      'execute in minecraft:overworld if block 40 64 40 #minecraft:beds[part=foot] run function demo:msm_games/game/beds/team_base/wait',
      'execute in minecraft:overworld run execute unless block 40 64 40 #minecraft:beds[part=foot] run function demo:msm_games/game/beds/out',
    ]);
    expect(lines.get('team_base/wait')?.slice(0, 3)).toEqual([
      'gamemode spectator @s',
      'tag @s add demo.game.beds.team_base.waiting',
      'scoreboard players set @s demo.msm_respawn 5',
    ]);
    // No wait: a standing bed does nothing at all; a broken one puts the player out.
    expect(files('bases').get('team_base/died/1')).toEqual([
      'execute in minecraft:overworld run execute unless block -10 64 0 #minecraft:beds[part=foot] run function demo:msm_games/game/bases/out',
    ]);
  });

  it('K12: a stack is counted by Item.count and topped up below the cap', () => {
    const lines = files('beds');
    expect(lines.get('generators/0')).toEqual([
      'scoreboard players set #beds.generator.0 demo.msm_game 0',
      'scoreboard players set #beds.generator.count demo.msm_game 0',
      'execute as @e[type=minecraft:item,x=43.5,y=64,z=40.5,distance=..1.5,sort=nearest,limit=1,nbt={Item:{id:"minecraft:iron_ingot"}}] run execute store result score #beds.generator.count demo.msm_game run data get entity @s Item.count',
      'execute if score #beds.generator.count demo.msm_game matches ..47 run summon minecraft:item 43.5 64 40.5 {Item:{id:"minecraft:iron_ingot",count:1},Motion:[0.0d,0.0d,0.0d]}',
    ]);
    expect(lines.get('generators/second')?.slice(0, 2)).toEqual([
      'scoreboard players add #beds.generator.0 demo.msm_game 1',
      'execute if score #beds.generator.0 demo.msm_game matches 1.. run execute if entity @a[tag=demo.game.beds.in,team=demo.red] run execute in minecraft:overworld run function demo:msm_games/game/beds/generators/0',
    ]);
  });

  it('K13: a still trader with Offers NBT; a menu counts without taking, then pays', () => {
    const lines = files('beds');
    const make = lines.get('shop/make') ?? [];
    expect(make[1]).toBe(
      'execute in minecraft:overworld run summon minecraft:villager 0.5 65 8.5 {Tags:["demo.game.beds.shop.0"],NoAI:1b,Invulnerable:1b,Silent:1b,PersistenceRequired:1b,VillagerData:{profession:"minecraft:armorer",level:5,type:"minecraft:plains"},Offers:{Recipes:[{buy:{id:"minecraft:iron_ingot",count:4},sell:{id:"minecraft:stone_sword",count:1,components:{"minecraft:custom_name":{text:"Team sword",italic:false},"minecraft:unbreakable":{}}},maxUses:2147483647,rewardExp:0b,xp:0},{buy:{id:"minecraft:gold_ingot",count:2},buyB:{id:"minecraft:iron_ingot",count:1},sell:{id:"minecraft:white_wool",count:16},maxUses:2147483647,rewardExp:0b,xp:0}]}}',
    );
    expect(lines.get('shop/1/buy/0')).toEqual([
      'scoreboard players set #beds.shop.have.0 demo.msm_game 0',
      'execute store result score #beds.shop.have.0 demo.msm_game run clear @s minecraft:iron_ingot 0',
      'execute if score #beds.shop.have.0 demo.msm_game matches 4.. run function demo:msm_games/game/beds/shop/1/pay/0',
      'execute unless score #beds.shop.have.0 demo.msm_game matches 4.. run tellraw @s {"text":"You need 4 Iron Ingot for that."}',
    ]);
    expect(lines.get('shop/1/pay/0')?.slice(0, 1)).toEqual(['clear @s minecraft:iron_ingot 4']);
    expect(lines.get('shop/1/menu')?.[0]).toBe('scoreboard players enable @s demo.msm_shop');
    expect(lines.get('shop/1/menu')?.[1]).toContain(
      'action:{type:"minecraft:run_command",command:"trigger demo.msm_shop set 101"}',
    );
    expect(lines.get('shop/1/open')?.[1]).toContain('@s[team=!demo.red]');
    expect(lines.get('shop/hit')?.[0]).toBe(
      'execute on attacker run tag @s add demo.game.beds.shop.opening',
    );
  });

  it('K19: a four-team, twelve-generator game runs few commands a tick', () => {
    const lines = files('beds');
    // The mechanics' share of each tick: the hook `tick` runs these files each tick, `second`
    // these once a second (the per-generator pairs and the bed tests).
    const perTick = ['shop/tick', 'fall_out/tick'].map((name) => lines.get(name)?.length ?? 0);
    const perSecond = ['team_base/second', 'generators/second'].map(
      (name) => lines.get(name)?.length ?? 0,
    );
    const tick = perTick.reduce((a, b) => a + b, 0);
    const second = perSecond.reduce((a, b) => a + b, 0);
    expect(tick).toBe(3);
    expect(second).toBe(4 + 2 + 24);
    // Amortised per tick: 3 + 30 / 20 = 4.5 command lines (plus a drop function when one is
    // due), against the spike's Bed Wars-style tick of about 24 lines at 0.038 ms (K19).
    expect(tick + second / 20).toBeLessThan(24);
  });
});
