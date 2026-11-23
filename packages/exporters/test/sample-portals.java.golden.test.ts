/**
 * Golden over the Java project eject of `fixtures/sample-portals` (ADR 0033, ADR 0077 D9,
 * plan B341): three portals (a project frame block, a tag frame with a project key, and one lit
 * only by the `light_portal` action), the beacon block running that action, a project
 * dimension and a project sound event.
 *
 * - The export succeeds without errors (warnings only for project ids the vanilla registries
 *   do not know); the project's files and contents hash to the value pinned in
 *   `test/fixtures/<target id>/sample-portals-java.sha256` in two time zones (with a stub
 *   Gradle wrapper, so the pin does not follow the engine-mod wrapper).
 * - The layout holds the Gradle files, the eight `portal/*.java` classes copied from the
 *   runtime, one block class per portal (and one for the beacon, whose event lights a portal),
 *   `ModSounds.java`, the dimension and tags as data, and no `msm/` definitions.
 * - With `MSM_SAMPLE_PORTALS_JAVA_OUT` (a folder), the project is written there with the real
 *   wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ElementKindRegistry, registerPlugin, utf8 } from '@msm/core';
import type { Plugin, Problem } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import worldgenPlugin from '@msm/plugin-worldgen';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import {
  engineModWrapper,
  exportJavaProject,
  repoRoot,
  STUB_WRAPPER,
  treeHash,
  writeTree,
} from './sample-java';
import { selectedTarget } from './selected-target';

const update = process.env.UPDATE_GOLDENS === '1';
const sampleRoot = join(repoRoot, 'fixtures', 'sample-portals');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.worldgen'],
};
const NAMESPACE = 'msm_sample_portals';
const PKG = `src/main/java/${NAMESPACE}`;
/** The portal block classes, from the block ids. */
const PORTALS = ['DriftPortal', 'EmberPortal', 'SkyPortal'] as const;
/** The eight classes copied from the runtime, written once for the project (B339). */
const PORTAL_SHARED = [
  'ExitPortals',
  'PortalBlock',
  'PortalFrame',
  'PortalIndex',
  'PortalIndexAttachment',
  'PortalLighting',
  'PortalSpec',
  'PortalTravel',
] as const;
const notIdWarningOrInfo = (problem: Problem): boolean =>
  problem.severity === 'error' ||
  (problem.severity === 'warning' && problem.code !== 'schema.unknown-id');

async function inTimeZone<T>(zone: string, body: () => Promise<T>): Promise<T> {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return await body();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

describe.each(
  builtInTargets
    .filter((bundle) => bundle.target.loadJavaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('sample portals Java project (%s)', (_id, bundle) => {
  const run = (wrapper = STUB_WRAPPER) =>
    exportJavaProject({ root: sampleRoot, registry, bundle, meta, wrapper });

  it('exports with no errors and the expected layout', async () => {
    const { files, problems, ok } = await run();
    // Project ids are not in the vanilla registries the gate checks against: warnings only.
    expect(problems.filter(notIdWarningOrInfo)).toEqual([]);
    expect(ok).toBe(true);
    const paths = [...files.keys()];
    const data = bundle.target.folders.data;
    for (const path of [
      'build.gradle.kts',
      'gradle.properties',
      'gradlew',
      'README.md',
      'src/main/resources/fabric.mod.json',
      `${PKG}/MsmSamplePortalsMod.java`,
      `${PKG}/ModBlocks.java`,
      `${PKG}/ModItems.java`,
      `${PKG}/ModSounds.java`,
      `${PKG}/Actions.java`,
      `${PKG}/block/DriftBeaconBlock.java`,
      `src/main/resources/assets/${NAMESPACE}/sounds.json`,
      `src/main/resources/data/${NAMESPACE}/${data.dimension}/sky_realm.json`,
      `src/main/resources/data/${NAMESPACE}/${data.tags}/block/ember_frame.json`,
      `src/main/resources/data/minecraft/${data.tags}/block/portals.json`,
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.filter((path) => path.startsWith(`${PKG}/portal/`)).sort()).toEqual(
      PORTAL_SHARED.map((name) => `${PKG}/portal/${name}.java`),
    );
    expect(
      paths.filter((path) => path.startsWith(`${PKG}/block/`) && path.includes('Portal')).sort(),
    ).toEqual(PORTALS.map((name) => `${PKG}/block/${name}Block.java`));
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
    // A portal has no item model (no item unless `item` is written).
    expect(paths.some((path) => /\/items\/\w+_portal\.json$/.test(path))).toBe(false);

    const java = (path: string): string => utf8.decode(files.get(`${PKG}/${path}`) as Uint8Array);
    for (const name of PORTALS) {
      expect(java(`block/${name}Block.java`), name).toContain('extends PortalBlock');
    }
    // `on_travel` fires through the generated `onTravel` of the sky portal only.
    expect(java('block/SkyPortalBlock.java')).toContain('onTravel');
    expect(java('block/DriftPortalBlock.java')).not.toContain('onTravel');
    // The beacon's event lights the drift portal through the copied lighting class.
    const beacon = java('block/DriftBeaconBlock.java');
    expect(beacon).toContain('.lightNear(level, portal, base)');
    expect(beacon).toContain('drift_portal');
    expect(java('ModBlocks.java')).toContain('PortalLighting.add');
    const initialiser = java('MsmSamplePortalsMod.java');
    expect(initialiser).toContain('PortalIndexAttachment');
    expect(initialiser).toContain('ModSounds');
    const modJson = JSON.parse(
      utf8.decode(files.get('src/main/resources/fabric.mod.json') as Uint8Array),
    ) as { depends: Record<string, string> };
    expect(modJson.depends.msm_runtime).toBeUndefined();
  });

  it('has the recorded tree SHA-256 in two time zones', async () => {
    const hashes: string[] = [];
    for (const zone of TIME_ZONES) {
      await inTimeZone(zone, async () => {
        hashes.push(treeHash((await run()).files));
      });
    }
    expect(new Set(hashes).size).toBe(1);
    const hashFile = join(fixturesRoot, bundle.target.id, 'sample-portals-java.sha256');
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_PORTALS_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
