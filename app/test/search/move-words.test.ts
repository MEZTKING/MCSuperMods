/**
 * The move to another Minecraft is found by the words people use (ADR 0136 D15, B825): a
 * Minecraft version number the app knows ("26.4", as each built-in target gives it, never
 * typed here) and the plain ways of asking put **Move to another Minecraft version…** first,
 * on every target. The other words are in the fixed query set (`golden-queries.json`).
 */
import { builtInTargets } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import { TARGET_IDS } from './fixtures';
import { buildSearch, loadShared, ranked, type Shared } from './golden-runner';

let shared: Shared;
/** `commandWords` of the palette's commands, loaded by path as `fixtures.ts` loads the lists. */
let commandWords: (id: string, mcVersions: readonly string[]) => string[];
beforeAll(async () => {
  shared = await loadShared();
  const commandsPath = '../../src/renderer/src/commands/built-in-commands';
  ({ commandWords } = (await import(/* @vite-ignore */ commandsPath)) as {
    commandWords: typeof commandWords;
  });
}, 120_000);

/** Each built-in target's version and, for a test version, its release number. */
const versions = [
  ...new Set(
    builtInTargets.flatMap(({ target }) => [
      target.mcVersion,
      target.mcVersion.split('-')[0] ?? '',
    ]),
  ),
].filter((version) => version !== '');

/** The versions of targets that follow another one (a mod can move up to them). */
const newerVersions = new Set(
  builtInTargets
    .filter(({ target }) => target.previous !== undefined)
    .flatMap(({ target }) => [target.mcVersion, target.mcVersion.split('-')[0] ?? '']),
);

describe('Move to another Minecraft version by its words', () => {
  it('adds the versions the app knows to the move command only', () => {
    const words = commandWords('upgradeTarget', ['1.0', '1.1-snapshot-2']);
    expect(words).toEqual(expect.arrayContaining(['minecraft 1.0', '1.0', '1.1', 'minecraft 1.1']));
    expect(words).toContain('1.1-snapshot-2');
    expect(commandWords('save', ['1.0'])).not.toContain('1.0');
  });

  it.each(TARGET_IDS)(
    'finds the move by a version number on %s',
    (target) => {
      const search = buildSearch(shared, { target, names: false, project: 'empty' });
      for (const version of versions) {
        const newer = newerVersions.has(version);
        for (const mode of ['easy', 'very-easy'] as const) {
          for (const text of [version, `minecraft ${version}`, `port to ${version}`]) {
            const ids = ranked(search.ask(text, mode)).map((hit) => hit.id);
            const at = ids.indexOf('command:upgradeTarget');
            // A version a mod can move up to comes first; any version is in the top three (the
            // guide's sections on the two versions may come first for the release itself).
            if (newer) expect(at, `${text} (${mode}): ${ids.slice(0, 3).join(', ')}`).toBe(0);
            else expect(at, `${text} (${mode}): ${ids.slice(0, 3).join(', ')}`).toBeLessThan(3);
          }
        }
      }
    },
    120_000,
  );
});
