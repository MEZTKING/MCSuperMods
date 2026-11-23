/**
 * The round engine played through in Try it's function engine (B724): a lowered game and its
 * pieces run in `@msm/sim`'s `LocalWorldSource` with its one player: the lobby, the countdown,
 * the round, a win, the ending and back to the lobby; a practice round (one player) that ends
 * once the player is out; a stop. `@msm/plugin-games` does not depend on `@msm/sim`, so the sim
 * is loaded by file path at test time, as the sim's own tests load the plugins. `gamemode` is not
 * run in Try it yet (B727): those lines are said as "only in Minecraft", and the round goes on.
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Element, Json, OutputFile } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import { gamesKinds } from '../../src/index';
import { ENDING_SECONDS } from '../../src/lowering/game/names';
import { element } from '../pieces-support';

/** The parts of `@msm/sim`'s `LocalWorldSource` this test reads. */
interface SimSource {
  tick(): void;
  chat(line: string): { result: string; answer: readonly string[] };
  readonly player: { readonly position: { x: number; y: number; z: number } };
  readonly functions: {
    readonly state: {
      score(holder: string, objective: string): number | undefined;
      readonly tags: ReadonlyMap<string, ReadonlySet<string>>;
    };
  };
  readonly lines: readonly { readonly text: string; readonly onlyInMinecraft?: boolean }[];
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

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

let sim: SimModule;
beforeAll(async () => {
  sim = (await import(
    pathToFileURL(join(REPO_ROOT, 'packages/sim/src/index.ts')).href
  )) as SimModule;
}, 120_000);

const [bundle] = builtInTargets;
if (bundle === undefined) throw new Error('no built-in target');
const target = bundle.target;

/** The lowered files of `elements`, every tag file merged as the export merges them. */
async function lowered(elements: readonly Element[]): Promise<Map<string, string | Uint8Array>> {
  const byPath = new Map<string, OutputFile[]>();
  for (const one of elements) {
    const kind = gamesKinds.find((entry) => entry.id === one.kind);
    if (kind === undefined) throw new Error(`no kind ${one.kind}`);
    for (const file of await kind.lower(one, target)) {
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

const game = (data: Record<string, Json>): Element =>
  element('msm:game', 'demo:round', {
    type: 'custom',
    name: 'Round',
    players: { min: 1, max: 8 },
    mechanics: [],
    ...data,
  });

const POINTS = element('msm:objective', 'demo:points', {
  criterion: 'dummy',
  name: 'Points',
  display: 'sidebar',
  render: 'integer',
});

const OBJECTIVE = 'demo.msm_game';

/** Where the player stands across (they may still be falling onto the floor). */
const where = (source: SimSource): { x: number; z: number } => ({
  x: source.player.position.x,
  z: source.player.position.z,
});
const TAG = 'demo.game.round';

async function play(data: Record<string, Json>): Promise<{
  source: SimSource;
  state: () => number | undefined;
  tags: () => string[];
  ticks: (n: number) => void;
  said: () => string[];
}> {
  const source = new sim.LocalWorldSource({
    files: await lowered([game(data), POINTS]),
    target,
    seed: 1,
    logLimit: 100_000,
  });
  const player = sim.PREVIEW_PLAYER_NAME;
  return {
    source,
    state: () => source.functions.state.score('#round.state', OBJECTIVE),
    tags: () =>
      [...(source.functions.state.tags.get(player) ?? [])]
        .filter((tag) => tag.startsWith(TAG))
        .map((tag) => tag.slice(TAG.length + 1))
        .sort(),
    ticks: (n) => {
      for (let i = 0; i < n; i += 1) source.tick();
    },
    said: () => source.lines.filter((line) => !line.onlyInMinecraft).map((line) => line.text),
  };
}

describe('the round engine in Try it', () => {
  it('waits in the lobby, counts down, plays, is won and goes back to the lobby', async () => {
    const { source, state, tags, ticks, said } = await play({
      round: {
        kind: 'rounds',
        start: 'command',
        countdown: 2,
        win: [{ type: 'score_target', objective: 'demo:points', target: 3, by: 'players' }],
        after: 'lobby',
      },
      lobby: { spawn: [3, 1, 3], teams: 'none' },
    });
    source.tick();
    expect(state()).toBe(0);
    // A player the game had not met is brought to the lobby.
    expect(where(source)).toEqual({ x: 3.5, z: 3.5 });

    expect(source.chat('/function demo:msm_games/game/round/start').result).toBe('ran');
    expect(state()).toBe(1);
    expect(said()).toContain('Round starts in 2 seconds.');
    ticks(40);
    expect(state()).toBe(2);
    expect(source.functions.state.score('#round.round', OBJECTIVE)).toBe(1);
    expect(tags()).toEqual(['in', 'player']);
    expect(said()).toContain('Round: the round has started.');

    source.chat('/scoreboard players set @s demo.points 3');
    source.tick();
    expect(state()).toBe(3);
    expect(tags()).toEqual(['in', 'player', 'winner']);
    expect(said().some((line) => line.includes('won the round of Round!'))).toBe(true);

    source.chat('/tp @s 6 1 6');
    ticks(20 * ENDING_SECONDS + 1);
    expect(state()).toBe(0);
    // Back in the lobby; the round's tags are gone and the winner's stays until the next round.
    expect(where(source)).toEqual({ x: 3.5, z: 3.5 });
    expect(tags()).toEqual(['winner']);

    // The next round starts again from the lobby.
    source.chat('/function demo:msm_games/game/round/start');
    ticks(40);
    expect(state()).toBe(2);
    expect(source.functions.state.score('#round.round', OBJECTIVE)).toBe(2);
    expect(tags()).toEqual(['in', 'player']);
  });

  it('ends a practice round with nobody winning once its one player is out', async () => {
    const { source, state, tags, ticks, said } = await play({
      round: {
        kind: 'rounds',
        start: 'command',
        countdown: 0,
        win: [{ type: 'last_standing', by: 'players' }],
        after: 'stay',
      },
    });
    source.tick();
    source.chat('/function demo:msm_games/game/round/start');
    expect(state()).toBe(2);
    expect(source.functions.state.score('#round.started', OBJECTIVE)).toBe(1);
    ticks(5);
    // One player still in: a practice round is not won by being the last one.
    expect(state()).toBe(2);
    source.chat('/function demo:msm_games/game/round/out');
    expect(tags()).toEqual(['out', 'player']);
    source.tick();
    expect(state()).toBe(3);
    expect(said()).toContain('Nobody won the round of Round.');
    ticks(20 * ENDING_SECONDS + 1);
    expect(state()).toBe(0);
    expect(tags()).toEqual([]);
  });

  it('stops a round, and ends one when its length is up', async () => {
    const { source, state, ticks, said } = await play({
      round: {
        kind: 'rounds',
        start: 'command',
        countdown: 0,
        length: 3,
        win: [{ type: 'timer_ends', winner: 'still_in' }],
        after: 'stay',
      },
    });
    source.tick();
    source.chat('/function demo:msm_games/game/round/start');
    expect(state()).toBe(2);
    source.chat('/function demo:msm_games/game/round/stop');
    expect(state()).toBe(0);
    expect(said()).toContain('Round: the round was stopped.');
    source.chat('/function demo:msm_games/game/round/start');
    ticks(20 * 3 + 2);
    expect(state()).toBe(3);
    expect(said().some((line) => line.includes('won the round of Round!'))).toBe(true);
  });

  it('starts an endless game once the first player is in the world', async () => {
    const { source, state, tags, ticks } = await play({
      round: { kind: 'endless', start: 'world_start', countdown: 0, win: [], after: 'stay' },
      roles: [{ id: 'player', name: 'Player', count: 'rest' }],
    });
    source.tick();
    expect(state()).toBe(0);
    ticks(20);
    expect(state()).toBe(2);
    expect(tags()).toEqual(['has_role', 'in', 'player', 'role.player']);
  });
});
