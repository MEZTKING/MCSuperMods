/**
 * What the mechanics' play-throughs in Try it share (B728): the lowered files of sample games,
 * tags merged as the export merges them, and `@msm/sim`'s `LocalWorldSource` loaded by file path
 * (`@msm/plugin-games` does not depend on `@msm/sim`), with the area's corner set so the samples'
 * world positions land in the 48 by 32 by 48 test area, and practice players.
 */
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Element, OutputFile } from '@msm/plugin-api';
import { builtInTargets } from '@msm/targets';
import { gamesKinds } from '../../../src/index';

/** What a practice action names (`@msm/sim`'s `PracticeAction`, as these tests use it). */
export type Action =
  | { do: 'join'; who: string; team?: string; at?: { pos: [number, number, number] } }
  | { do: 'leave'; who: string }
  | { do: 'walk'; who: string; to: { pos: [number, number, number] } | { area: string } }
  | { do: 'hit'; who: string; target: string; damage?: number }
  | { do: 'knock_out'; who: string; by?: string }
  | { do: 'break_under'; who: string; target?: string }
  | { do: 'break'; who: string; at: [number, number, number] }
  | { do: 'hit_thing'; who: string; type: string }
  | { do: 'use'; who: string; item: string }
  | { do: 'type'; who: string; line: string };

/** The parts of `LocalWorldSource` these tests read. */
export interface SimSource {
  tick(): void;
  chat(line: string): { result: string; answer: readonly string[] };
  readonly lines: readonly { readonly text: string; readonly onlyInMinecraft?: boolean }[];
  readonly functions: {
    readonly state: {
      corner: { x: number; y: number; z: number };
      score(holder: string, objective: string): number | undefined;
      readonly tags: ReadonlyMap<string, ReadonlySet<string>>;
      readonly games: {
        readonly dead: ReadonlyMap<string, number>;
        gameMode(holder: string): string;
        maxHealth(holder: string): number;
      };
    };
  };
  readonly practice: {
    act(action: Action): { ok: boolean; said: string };
    setUserAway(away: boolean): void;
    all(): readonly {
      readonly name: string;
      readonly pos: { x: number; y: number; z: number };
      readonly inventory: {
        count(id: string): number;
        readonly slots: readonly ({
          readonly id: string;
          readonly count: number;
          readonly components?: Record<string, unknown>;
        } | null)[];
      };
    }[];
  };
}

interface SimModule {
  LocalWorldSource: new (options: {
    files: Map<string, string | Uint8Array>;
    target: unknown;
    seed?: number;
    logLimit?: number;
    vanillaBlockstates?: ReadonlyMap<string, string>;
  }) => SimSource;
  PREVIEW_PLAYER_NAME: string;
}

const REPO_ROOT = fileURLToPath(new URL('../../../../../../', import.meta.url));
const [bundle] = builtInTargets;
if (bundle === undefined) throw new Error('no built-in target');

/** The lowered files of `elements`, every tag file merged as the export merges them. */
export async function lowered(
  elements: readonly Element[],
): Promise<Map<string, string | Uint8Array>> {
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

/**
 * Vanilla's bed block tag, as the jar holds it (the test stands in for vanilla's data: Try it
 * reads the tag from the user's jar, which these tests do not have).
 */
export const BEDS_TAG: readonly [string, string] = [
  'data/minecraft/tags/block/beds.json',
  JSON.stringify({ values: ['minecraft:red_bed', 'minecraft:blue_bed'] }),
];

/**
 * Vanilla's red bed block states, as the jar's block state file names them (the test stands in
 * for the jar: Try it reads vanilla blocks' states from it, so a bed keeps its `part`).
 */
export const BED_STATES: ReadonlyMap<string, string> = new Map(
  ['minecraft:red_bed', 'minecraft:blue_bed'].map((id) => [
    id,
    JSON.stringify({
      variants: {
        'facing=north,part=foot': { model: 'minecraft:block/bed' },
        'facing=north,part=head': { model: 'minecraft:block/bed' },
      },
    }),
  ]),
);

/** A play-through: the source, Try it's own player's name and helpers. */
export interface Play {
  readonly source: SimSource;
  readonly player: string;
  ticks(n: number): void;
  tags(holder?: string): ReadonlySet<string>;
  score(holder: string, objective: string): number | undefined;
  /** The lines What happened shows, without the "only in Minecraft" ones. */
  said(): string[];
  act(action: Action): { ok: boolean; said: string };
}

/**
 * Loads the lowered `elements` into Try it with the area's block 0, 0, 0 at the world position
 * `corner` (as a games ground places it), before the first tick.
 */
export async function play(
  elements: readonly Element[],
  corner: { x: number; y: number; z: number },
  extraFiles: readonly (readonly [string, string])[] = [],
): Promise<Play> {
  const sim = (await import(
    pathToFileURL(join(REPO_ROOT, 'packages/sim/src/index.ts')).href
  )) as SimModule;
  const files = await lowered(elements);
  for (const [path, text] of extraFiles) files.set(path, text);
  const source = new sim.LocalWorldSource({
    files,
    target: bundle?.target,
    seed: 1,
    logLimit: 100_000,
    vanillaBlockstates: BED_STATES,
  });
  source.functions.state.corner = corner;
  const player = sim.PREVIEW_PLAYER_NAME;
  return {
    source,
    player,
    ticks: (n) => {
      for (let i = 0; i < n; i += 1) source.tick();
    },
    tags: (holder = player) => source.functions.state.tags.get(holder) ?? new Set(),
    score: (holder, objective) => source.functions.state.score(holder, objective),
    said: () => source.lines.filter((line) => !line.onlyInMinecraft).map((line) => line.text),
    act: (action) => source.practice.act(action),
  };
}
