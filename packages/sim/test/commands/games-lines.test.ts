/**
 * The commands games use in Try it (B727, `docs/PLAN-game-studio.md`): every function line
 * `@msm/plugin-games` lowers for its sample games (the round engine's, B724; the mechanics',
 * B725 and B726), with the kits and pieces they name, read by {@link lineSupport}. At least
 * 95 % run; the rest are listed by name here, so a new one fails the test until it is taught or
 * named. `@msm/sim` does not depend on the plugin: it is loaded by file path, as
 * `test/lower-fixture.ts` loads the built-in plugins.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Element, OutputFile, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { LocalWorldSource, lineSupport } from '../../src/index.js';
import { builtInTargets, REPO_ROOT } from '../lower-fixture.js';

interface Sample {
  readonly name: string;
  readonly kind: string;
  readonly id: string;
  readonly data: unknown;
}

const games = 'packages/plugins/games';
const load = async <T>(path: string): Promise<T> =>
  (await import(pathToFileURL(join(REPO_ROOT, games, path)).href)) as T;

const plugin = await load<{
  gamesKinds: readonly { id: string; lower(e: Element, t: Target): Promise<OutputFile[]> }[];
}>('src/index.ts');
const round = await load<{
  GAME_SAMPLES: readonly Sample[];
  KIT_SAMPLES: readonly Sample[];
  PIECES: readonly Sample[];
  sampleElement(sample: Sample): Element;
}>('test/game/samples.ts');
const b725 = await load<{ MECHANIC_SAMPLES: readonly Sample[] }>('test/game/mechanics/samples.ts');
const b726 = await load<{
  B726_PIECES: readonly Sample[];
  expandedSamples(pieces: readonly Sample[]): Element[];
}>('test/game/mechanics/samples-b726.ts');

const targets = await builtInTargets();

/** Every element the samples lower: the games, the kits and the pieces they name. */
function sampleElements(): Element[] {
  const pieces = [...round.PIECES, ...round.KIT_SAMPLES];
  return [
    ...[...round.GAME_SAMPLES, ...b725.MECHANIC_SAMPLES, ...pieces, ...b726.B726_PIECES].map(
      round.sampleElement,
    ),
    ...b726.expandedSamples(pieces),
  ];
}

/** The lowered files of every sample, tags merged as the export merges them. */
async function filesFor(target: Target, game: Element): Promise<Map<string, string | Uint8Array>> {
  const byPath = new Map<string, OutputFile[]>();
  const others = sampleElements().filter((one) => one.kind !== 'msm:game');
  for (const element of [game, ...others]) {
    const kind = plugin.gamesKinds.find((entry) => entry.id === element.kind);
    if (kind === undefined) throw new Error(`no kind ${element.kind}`);
    for (const file of await kind.lower(element, target)) {
      byPath.set(file.path, [...(byPath.get(file.path) ?? []), file]);
    }
  }
  const files = new Map<string, string | Uint8Array>();
  for (const [path, list] of byPath) {
    const [first] = list;
    if (first === undefined) continue;
    if (typeof first.contents === 'string' || first.contents instanceof Uint8Array) {
      files.set(path, first.contents);
    } else if (first.merge === 'tag') {
      const values = list.flatMap((file) => (file.contents as { values: string[] }).values);
      files.set(path, JSON.stringify({ values }));
    } else files.set(path, JSON.stringify(first.contents));
  }
  return files;
}

/** Every command line of the lowered functions, with its file. */
async function linesFor(target: Target): Promise<{ file: string; line: string }[]> {
  const seen = new Set<string>();
  const out: { file: string; line: string }[] = [];
  for (const element of sampleElements()) {
    const kind = plugin.gamesKinds.find((entry) => entry.id === element.kind);
    if (kind === undefined) throw new Error(`no kind ${element.kind}`);
    for (const file of await kind.lower(element, target)) {
      if (!file.path.endsWith('.mcfunction') || seen.has(file.path)) continue;
      seen.add(file.path);
      const text =
        typeof file.contents === 'string'
          ? file.contents
          : new TextDecoder().decode(file.contents as Uint8Array);
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line !== '' && !line.startsWith('#')) out.push({ file: file.path, line });
      }
    }
  }
  return out;
}

/**
 * The forms of the sample games' lines Try it does not run, by the name `lineSupport` gives
 * (B727 taught every one the samples write; a new form fails here until it is taught or named).
 */
const NOT_RUN: readonly string[] = [];

/**
 * What playing the sample games says is only in Minecraft, by the start of each line: the area's
 * limits (one Overworld, 48 by 32 by 48 blocks at the world's corner 0, 0, 0 without a games
 * ground), what is kept but not drawn or done, and what needs B728's practice players.
 */
const SAID: readonly string[] = [
  'blocks outside the test area',
  'the dimension ',
  'flying through blocks as a spectator',
  'how Interaction looks and acts',
  'how Villager looks and acts',
  'the criterion playerKillCount',
  'the death screen',
  'the items you held dropping where you died',
  "the scoreboard's list on the screen",
  "the scoreboard's sidebar on the screen",
  'what the game rule block_drops does',
  'what the world border does to players outside it',
  ' is a vanilla block; here it is a prop',
];

describe.each(targets.map((target) => [target.id, target] as const))(
  'the games lines in Try it on %s',
  (_id, target) => {
    it('runs at least 95 % of them and names the rest', async () => {
      const lines = await linesFor(target);
      const not = lines.filter(({ line }) => !lineSupport(line).runs);
      const share = (lines.length - not.length) / lines.length;
      expect(lines.length).toBeGreaterThan(2000);
      expect(share).toBeGreaterThanOrEqual(0.95);
      expect([...new Set(not.map(({ line }) => lineSupport(line).why))].sort()).toEqual(NOT_RUN);
      console.info(
        `B727: ${lines.length - not.length} of ${lines.length} lines of the sample games run in Try it (${(share * 100).toFixed(1)} %).`,
      );
    });

    it('plays each sample game through a start, a death and a respawn, saying only the named limits', async () => {
      const said = new Set<string>();
      for (const game of sampleElements().filter((one) => one.kind === 'msm:game')) {
        const source = new LocalWorldSource({
          files: await filesFor(target, game),
          target,
          seed: 1,
          logLimit: 100_000,
        });
        const path = game.id.split(':')[1] as string;
        source.tick();
        source.chat(`/function demo:msm_games/game/${path}/start`);
        for (let i = 0; i < 60; i += 1) source.tick();
        source.chat('/kill @s');
        for (let i = 0; i < 60; i += 1) source.tick();
        for (const line of source.lines) {
          if (line.onlyInMinecraft) said.add(line.text);
          // A line the game would not read, or a missing function, is a lowering or engine bug.
          else expect(line.text, game.id).not.toMatch(/^Unknown function|, line \d+: /);
        }
      }
      const unnamed = [...said].filter((text) => !SAID.some((start) => text.includes(start)));
      expect(unnamed).toEqual([]);
    });
  },
);
