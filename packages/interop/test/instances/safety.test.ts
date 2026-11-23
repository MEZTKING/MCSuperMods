/**
 * ADR 0133 D5: MSM writes only inside folders that hold its marker. A made-up launcher folder
 * full of foreign instances (and same-named folders without the marker) is byte for byte the
 * same after every recipe has run twice on both targets, and no half-made instance or world
 * folder was ever visible.
 */

import { describe, expect, it } from 'vitest';
import {
  createManagedInstance,
  ensureInstance,
  listManaged,
  type RecipeProjectFacts,
  type RunAction,
  recipeFor,
} from '../../src/index';
import {
  bytesOf,
  INSTANCES,
  ROOT,
  StagingMemoryFs,
  seedForeignPrism,
  seedWorld,
  sha512,
  snapshot,
  stagingIds,
  TARGETS,
} from './helpers';

const modded: RecipeProjectFacts = { namespace: 'gems', modId: 'gems', playsWithoutMods: false };
const plainGame: RecipeProjectFacts = {
  namespace: 'parkour',
  modId: 'parkour',
  playsWithoutMods: true,
};

const ACTIONS: [RunAction, RecipeProjectFacts][] = [
  [{ kind: 'test' }, modded],
  [{ kind: 'game', join: { host: 'localhost', port: 25565 } }, modded],
  [
    {
      kind: 'plain',
      world: { folder: 'msm-game-parkour', source: '/msm/worlds/parkour', replace: true },
      resourcePacks: [{ fileName: 'parkour.zip', source: 'parkour' }],
    },
    plainGame,
  ],
  [
    {
      kind: 'modpack',
      name: 'Adventure',
      modIds: ['gems', 'dragons'],
      extraMods: [{ fileName: 'sodium-1.0.jar', projectId: 'AANobbMI' }],
    },
    modded,
  ],
  [
    { kind: 'map', name: 'Sky race', world: { folder: 'Sky race', source: '/msm/worlds/sky' } },
    plainGame,
  ],
  [
    { kind: 'map', name: 'Gem hunt', world: { folder: 'Gem hunt', source: '/msm/worlds/sky' } },
    modded,
  ],
];

/** Everything that is not MSM's: the root's files and every folder MSM did not make. */
const ours = (path: string): boolean =>
  /^\/prism\/instances\/MCSuperMods (Test|Plain|Pack|Map) .*\)(-\d+)?(\/|$)/.test(path) &&
  !/^\/prism\/instances\/MCSuperMods (Plain \(9\.1\)|Pack Adventure \(9\.1\))(\/|$)/.test(path);

describe('D5: foreign instances are never touched', () => {
  it('every recipe, run twice on both targets, leaves a full Prism folder byte for byte as it was', async () => {
    const fs = new StagingMemoryFs();
    seedForeignPrism(fs);
    seedWorld(fs, '/msm/worlds/parkour', 'parkour');
    seedWorld(fs, '/msm/worlds/sky', 'sky');
    fs.markForeign();
    const foreignBefore = snapshot(fs, (path) => path.startsWith(ROOT) && !ours(path));
    expect(foreignBefore.size).toBeGreaterThan(100);

    const deps = { fs, sha512, bytesOf, stagingId: stagingIds() };
    const made = new Set<string>();
    for (let round = 0; round < 2; round++) {
      for (const target of TARGETS) {
        for (const [action, project] of ACTIONS) {
          const result = await ensureInstance(deps, ROOT, recipeFor(action, project, target));
          expect(result.created).toBe(!made.has(result.folder));
          made.add(result.folder);
        }
      }
    }

    expect(fs.violations).toEqual([]);
    const foreignAfter = snapshot(fs, (path) => path.startsWith(ROOT) && !ours(path));
    expect(foreignAfter).toEqual(foreignBefore);
    // The two same-named folders without the marker made MSM use -2.
    expect([...made].sort()).toEqual([
      'MCSuperMods Map Gem hunt (9.1)',
      'MCSuperMods Map Gem hunt (9.2-snapshot-7)',
      'MCSuperMods Pack Adventure (9.1)-2',
      'MCSuperMods Pack Adventure (9.2-snapshot-7)',
      'MCSuperMods Plain (9.1)-2',
      'MCSuperMods Plain (9.2-snapshot-7)',
      'MCSuperMods Test (9.1)',
      'MCSuperMods Test (9.2-snapshot-7)',
    ]);
    // The user's staging-named folder is still there; MSM's own staging folders are gone.
    expect(await fs.exists(`${INSTANCES}/.msm-staging/notes/readme.txt`)).toBe(true);
    expect((await fs.readDir(`${INSTANCES}/.msm-staging`)).map((entry) => entry.name)).toEqual([
      'notes',
    ]);
    // Only MSM's folders are listed as MSM's.
    expect((await listManaged(fs, [ROOT])).map((entry) => entry.folder).sort()).toEqual(
      [...made].sort(),
    );
    // No write, removal or rename ever landed outside MSM's folders and its staging folders.
    for (const line of fs.log) {
      const path = line.replace(/^(write|remove|rename) /, '').split(' -> ');
      for (const p of path) {
        expect(ours(p) || /\/\.msm-staging\/stage-\d+(\/|$)/.test(p)).toBe(true);
      }
    }
  });

  it('the old writer leaves the same folder untouched too, now staged', async () => {
    const fs = new StagingMemoryFs();
    seedForeignPrism(fs);
    fs.markForeign();
    const before = snapshot(fs, (path) => path.startsWith(ROOT) && !ours(path));
    for (let round = 0; round < 2; round++) {
      for (const target of TARGETS) {
        await createManagedInstance(fs, INSTANCES, {
          mcVersion: target.mcVersion,
          loader: '0.20.1',
          api: target.fabric?.api ?? '',
        });
      }
    }
    expect(fs.violations).toEqual([]);
    expect(snapshot(fs, (path) => path.startsWith(ROOT) && !ours(path))).toEqual(before);
  });

  it('the check sees a half-made folder: the old in-place writer would show one', async () => {
    const fs = new StagingMemoryFs();
    fs.seed(`${ROOT}/prismlauncher.cfg`, 'InstanceDir=instances\n');
    fs.markForeign();
    // Without rename, `createManagedInstance` writes in place as before B761.
    Object.defineProperty(fs, 'rename', { value: undefined });
    await createManagedInstance(fs, INSTANCES, { mcVersion: '9.1', loader: '0.20.1', api: 'x' });
    expect(fs.violations.length).toBeGreaterThan(0);
    expect(fs.violations[0]).toMatch(/visible without instance\.cfg/);
  });
});
