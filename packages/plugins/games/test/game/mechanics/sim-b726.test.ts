/**
 * The mechanics of B726 played through in Try it's function engine (the brief's exit criterion
 * "a sim play-through per mechanic"). Skipped until Try it runs the commands these mechanics
 * write and has more than one player:
 *
 * - B727 (Try it runs the commands games use): `gamemode` (adventure on the floor, spectator
 *   while waiting at a base or out), `gamerule` (`block_drops`), `worldborder`, `spawnpoint`,
 *   `trigger` and `dialog` (the shop's menu), `clear` counting without taking, `give` with
 *   components, macro functions (`function ... with storage`), and the `deathCount` score moving
 *   when the player dies;
 * - B728 (practice players): a second team for bases and the last team standing, a player who
 *   hits the shop's interaction.
 *
 * B728 un-skips them. `@msm/plugin-games` does not depend on `@msm/sim`, so the sim is loaded by
 * file path, as the round engine's own play-through does (`../round-sim.test.ts`).
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Element, OutputFile } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { gamesKinds } from '../../../src/index';
import { KIT_SAMPLES, PIECES, sampleElement } from '../samples';
import { B726_PIECES, expandedSamples } from './samples-b726';

/** Why these play-throughs are skipped, for the test report. */
const WAITING =
  'waits for B727 (gamemode, gamerule, worldborder, spawnpoint, trigger, dialog, clear, macros and the death score in Try it) and B728 (practice players)';

interface SimSource {
  tick(): void;
  chat(line: string): { result: string; answer: readonly string[] };
  readonly functions: {
    readonly state: {
      score(holder: string, objective: string): number | undefined;
      readonly tags: ReadonlyMap<string, ReadonlySet<string>>;
    };
  };
}

interface SimModule {
  LocalWorldSource: new (options: {
    files: Map<string, string | Uint8Array>;
    target: unknown;
    seed?: number;
    logLimit?: number;
  }) => SimSource;
  PREVIEW_PLAYER_NAME: string;
}

const REPO_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const [bundle] = builtInTargets;
if (bundle === undefined) throw new Error('no built-in target');

const OTHERS = [...KIT_SAMPLES, ...PIECES, ...B726_PIECES].map(sampleElement);

/** The lowered files of a sample game and the pieces, tags merged as the export merges them. */
async function lowered(elements: readonly Element[]): Promise<Map<string, string | Uint8Array>> {
  const byPath = new Map<string, OutputFile[]>();
  for (const one of elements) {
    const kind = gamesKinds.find((entry) => entry.id === one.kind);
    if (kind === undefined) throw new Error(`no kind ${one.kind}`);
    for (const file of await kind.lower(one, bundle?.target as never)) {
      byPath.set(file.path, [...(byPath.get(file.path) ?? []), file]);
    }
  }
  const files = new Map<string, string | Uint8Array>();
  for (const [path, list] of byPath) {
    const [first] = list;
    if (first === undefined) continue;
    if (first.contents instanceof Uint8Array) files.set(path, first.contents);
    else if (first.merge === 'tag') {
      const values = list.flatMap((file) => (file.contents as { values: string[] }).values);
      files.set(path, JSON.stringify({ values }));
    } else files.set(path, JSON.stringify(first.contents));
  }
  return files;
}

async function play(name: string): Promise<{
  source: SimSource;
  player: string;
  tags: () => ReadonlySet<string> | undefined;
  ticks: (n: number) => void;
}> {
  const sim = (await import(
    pathToFileURL(join(REPO_ROOT, 'packages/sim/src/index.ts')).href
  )) as SimModule;
  const game = expandedSamples([...PIECES, ...KIT_SAMPLES]).find(
    (one) => one.id === `demo:${name}`,
  );
  if (game === undefined) throw new Error(`no sample ${name}`);
  const others = OTHERS.filter((one) => one.kind !== 'msm:game');
  const source = new sim.LocalWorldSource({
    files: await lowered([game, ...others]),
    target: bundle?.target,
    seed: 1,
    logLimit: 100_000,
  });
  const player = sim.PREVIEW_PLAYER_NAME;
  return {
    source,
    player,
    tags: () => source.functions.state.tags.get(player),
    ticks: (n) => {
      for (let i = 0; i < n; i += 1) source.tick();
    },
  };
}

describe.skip(`B726's mechanics in Try it (${WAITING})`, () => {
  it('floor: a round rebuilds the floor and hands out the tool a tick after the start', async () => {
    const { source, tags, ticks } = await play('spleef');
    source.chat('/setblock 5 64 5 minecraft:air');
    source.chat('/function demo:msm_games/game/spleef/start');
    ticks(1);
    expect(tags()).toContain('demo.game.spleef.floor.ready');
    ticks(1);
    expect(tags()).not.toContain('demo.game.spleef.floor.ready');
    expect(source.chat('/execute if block 5 64 5 minecraft:snow_block').result).not.toBe('fail');
  });

  it('fall out: a player below the height is out of the round', async () => {
    const { source, tags, ticks } = await play('spleef');
    source.chat('/function demo:msm_games/game/spleef/start');
    ticks(2);
    source.chat('/tp @s 5 50 5');
    ticks(1);
    expect(tags()).toContain('demo.game.spleef.out');
  });

  it('fall out, back: a player who falls is put back where the round started', async () => {
    const { source, ticks } = await play('layers');
    source.chat('/tp @s 3 12 3');
    source.chat('/function demo:msm_games/game/layers/start');
    ticks(2);
    source.chat('/tp @s 3 -10 3');
    ticks(1);
    expect(source.functions.state.score('@s', 'demo.msm_fall_y')).toBe(12);
  });

  it('elimination: three deaths and the player is out', async () => {
    const { source, tags, ticks } = await play('beds');
    source.chat('/function demo:msm_games/game/beds/start');
    for (let i = 0; i < 3; i += 1) {
      source.chat('/setblock 40 64 40 minecraft:air');
      source.chat('/kill @s');
      ticks(2);
    }
    expect(tags()).toContain('demo.game.beds.out');
  });

  it('team base: a death while the bed stands waits five seconds, then comes back', async () => {
    const { source, tags, ticks } = await play('beds');
    source.chat('/function demo:msm_games/game/beds/start');
    ticks(1);
    source.chat('/kill @s');
    ticks(1);
    expect(tags()).toContain('demo.game.beds.team_base.waiting');
    ticks(6 * 20);
    expect(tags()).not.toContain('demo.game.beds.team_base.waiting');
  });

  it('generators: an iron generator fills its pile to the cap and stops', async () => {
    const { source, ticks } = await play('beds');
    source.chat('/function demo:msm_games/game/beds/start');
    ticks(60 * 20);
    source.chat(
      '/execute store result score #n demo.msm_game run data get entity @e[type=minecraft:item,x=43.5,y=64,z=40.5,distance=..1.5,limit=1] Item.count',
    );
    expect(source.functions.state.score('#n', 'demo.msm_game')).toBe(48);
  });

  it('shop: a menu purchase takes the cost and gives the item', async () => {
    const { source, ticks } = await play('beds');
    source.chat('/function demo:msm_games/game/beds/start');
    source.chat('/give @s minecraft:iron_ingot 2');
    source.chat('/give @s minecraft:gold_ingot 1');
    source.chat('/scoreboard players enable @s demo.msm_shop');
    source.chat('/trigger demo.msm_shop set 201');
    ticks(1);
    expect(source.chat('/clear @s minecraft:end_stone 0').answer.join(' ')).toContain('12');
  });

  it('border: set at the start, shrinking a minute in, its size again at the end', async () => {
    const { source, ticks } = await play('spleef');
    source.chat('/function demo:msm_games/game/spleef/start');
    ticks(61 * 20);
    expect(source.chat('/worldborder get').answer.join(' ')).not.toContain('64');
  });

  it('kit on: the kit at the start', async () => {
    const { source, ticks } = await play('spleef');
    source.chat('/function demo:msm_games/game/spleef/start');
    ticks(2);
    expect(source.chat('/clear @s minecraft:diamond_shovel 0').answer.join(' ')).toContain('2');
  });

  it.todo('team base: a broken bed and the last team standing (B728: a second team)');
  it.todo('shop: a hit on the menu opens the dialog (B728: a practice player hits)');
});
