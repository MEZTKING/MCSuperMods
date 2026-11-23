/**
 * The mechanics `hearts`, `tracker` and `head_start` played through in Try it's function engine
 * (B725; the brief's exit criterion "a sim play-through per mechanic"). Skipped until Try it runs
 * the commands these mechanics write and has more than one player:
 *
 * - B727 (Try it runs the commands games use): `attribute` (most health on the hearts row, the
 *   head start's modifiers), `gamemode` (spectator at zero), `trigger` (withdraw), `item modify`
 *   (the tracker's compass), `effect` (blindness), `time query gametime` (kept out), and the
 *   `deathCount` and `playerKillCount` scores moving when a player dies or kills;
 * - B728 (practice players): a second player to kill, track and be tracked, and the killer's
 *   advancement firing.
 *
 * B728 un-skips them (written as the round engine's own play-through, `../round-sim.test.ts`).
 * `@msm/plugin-games` does not depend on `@msm/sim`, so the sim is loaded by file path.
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Element, OutputFile } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { gamesKinds } from '../../../src/index';
import { type GameSample, sampleElement } from '../samples';
import { MECHANIC_SAMPLES } from './samples';

/** Why these play-throughs are skipped, for the test report. */
const WAITING =
  'waits for B727 (attribute, gamemode, trigger, item modify, effect, time and the death scores in Try it) and B728 (practice players)';

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

/** The lowered files of a sample game, tags merged as the export merges them. */
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

async function play(name: string): Promise<{ source: SimSource; player: string }> {
  const sim = (await import(
    pathToFileURL(join(REPO_ROOT, 'packages/sim/src/index.ts')).href
  )) as SimModule;
  const sample = MECHANIC_SAMPLES.find((entry) => entry.name === name) as GameSample;
  const source = new sim.LocalWorldSource({
    files: await lowered([sampleElement(sample)]),
    target: bundle?.target,
    seed: 1,
    logLimit: 100_000,
  });
  return { source, player: sim.PREVIEW_PLAYER_NAME };
}

describe.skip(`the mechanics in Try it (${WAITING})`, () => {
  it('hearts: starts with ten, loses one at a death that is not a kill, withdraws one', async () => {
    const { source } = await play('lifesteal');
    // The endless game starts once the player is in the world.
    for (let i = 0; i < 40; i += 1) source.tick();
    const hearts = (): number | undefined => source.functions.state.score('@s', 'demo.msm_hearts');
    expect(hearts()).toBe(10);
    source.chat('/kill @s');
    source.tick();
    expect(hearts()).toBe(9);
    source.chat('/trigger demo.msm_withdraw');
    source.tick();
    expect(hearts()).toBe(8);
  });

  it('hearts: at zero the player watches as a spectator, then is back when the time is up', async () => {
    const { source, player } = await play('lifesteal');
    for (let i = 0; i < 40; i += 1) source.tick();
    source.chat('/scoreboard players set @s demo.msm_hearts 1');
    source.chat('/kill @s');
    source.tick();
    expect(source.functions.state.tags.get(player)).toContain('demo.game.lifesteal.kept_out');
    for (let i = 0; i < 3600 * 20 + 2; i += 1) source.tick();
    expect(source.functions.state.tags.get(player)).not.toContain('demo.game.lifesteal.kept_out');
  });

  it('head start: the held player cannot move until the seconds are up', async () => {
    const { source, player } = await play('spin');
    source.chat('/function demo:msm_games/game/spin/start');
    source.tick();
    expect(source.functions.state.tags.get(player)).toContain('demo.game.spin.held');
    for (let i = 0; i < 10 * 20 + 2; i += 1) source.tick();
    expect(source.functions.state.tags.get(player)).not.toContain('demo.game.spin.held');
  });

  it.todo('hearts: a kill moves a heart from the victim to the killer (B728: a second player)');
  it.todo('hearts: the revive item brings back the player out longest (B728)');
  it.todo(
    'tracker: the hunter’s compass points at the runner, and at the last place in another dimension (B728)',
  );
});
