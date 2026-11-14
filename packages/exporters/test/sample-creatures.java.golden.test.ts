/**
 * Golden over the Java project eject of `fixtures/sample-creatures` (ADR 0033, ADR 0071 D9,
 * plan B302): six mobs on the three bases with taming, breeding, riding, flying, swimming,
 * ranged attacks, variants and a boss bar, one `vanilla` renderer mob (ejected with GeckoLib,
 * ADR 0072 D8) and a throwable item.
 *
 * - The export succeeds without errors (warnings only for project ids the vanilla registries
 *   do not know; infos such as `export.eject-uses-geckolib` pass); the project's files and
 *   contents hash to the value pinned in `test/fixtures/<target id>/sample-creatures-java.sha256`
 *   in two time zones (with a stub Gradle wrapper, so the pin does not follow the engine-mod
 *   wrapper).
 * - The layout holds the Gradle files, one generated class per mob and the copied resources,
 *   and no `msm/` definitions.
 * - With `MSM_SAMPLE_CREATURES_JAVA_OUT` (a folder), the project is written there with the real
 *   wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build).
 *
 * Pending B301: until the eject covers `msm:tameable`, `msm:breedable`, `msm:rideable` and the
 * `sit`, `fly` and `swim` states (B301, the target's `src/java-project/`), the
 * generator refuses this sample, so the suite is skipped ({@link PENDING_B301}). After B301
 * lands: set it to false, run once with `UPDATE_GOLDENS=1` to write the hash and check the
 * listed class names against the generator's.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ElementKindRegistry, registerPlugin, utf8 } from '@msm/core';
import type { Plugin, Problem } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import modelsAnimPlugin from '@msm/plugin-models-anim';
import resourcePackPlugin from '@msm/plugin-resourcepack';
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

/** True until B301 (Java eject part 2: taming, breeding, riding, GeckoLib states) lands. */
const PENDING_B301 = true;

const update = process.env.UPDATE_GOLDENS === '1';
const sampleRoot = join(repoRoot, 'fixtures', 'sample-creatures');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim'],
};
const PKG = 'src/main/java/msm_sample_creatures';
const MOBS = ['Archer', 'Boss', 'Fish', 'Glider', 'Mount', 'Pet'] as const;
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

describe
  .skipIf(PENDING_B301)
  .each(
    builtInTargets
      .filter((bundle) => bundle.target.javaProject !== undefined)
      .map((bundle) => [bundle.target.id, bundle] as const),
  )('sample creatures Java project (%s)', (_id, bundle) => {
  const run = (wrapper = STUB_WRAPPER) =>
    exportJavaProject({ root: sampleRoot, registry, bundle, meta, wrapper });

  it('exports with infos only and the expected layout', async () => {
    const { files, problems, ok } = await run();
    // Project ids are not in the vanilla registries the gate checks against: warnings only.
    expect(problems.filter(notIdWarningOrInfo)).toEqual([]);
    expect(ok).toBe(true);
    // The boss's `vanilla` renderer is ejected with GeckoLib (ADR 0072 D8): one info.
    expect(
      problems
        .filter((problem) => problem.code === 'export.eject-uses-geckolib')
        .map((problem) => problem.severity),
    ).toEqual(['info']);
    const paths = [...files.keys()];
    for (const path of [
      'build.gradle.kts',
      'gradle.properties',
      'gradlew',
      'src/main/resources/fabric.mod.json',
      `${PKG}/MsmSampleCreaturesMod.java`,
      `${PKG}/ModEntities.java`,
      `${PKG}/client/MsmSampleCreaturesModClient.java`,
      `${PKG}/client/entity/GeoModelBase.java`,
      ...MOBS.flatMap((name) => [
        `${PKG}/entity/${name}Entity.java`,
        `${PKG}/client/entity/${name}Model.java`,
      ]),
      'src/main/resources/data/minecraft/tags/entity_type/can_equip_saddle.json',
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
    const modJson = JSON.parse(
      utf8.decode(files.get('src/main/resources/fabric.mod.json') as Uint8Array),
    ) as { depends: Record<string, string>; entrypoints: Record<string, string[]> };
    const geckolib = bundle.target.geckolib;
    if (geckolib === undefined) throw new Error('no GeckoLib facts');
    expect(modJson.depends.msm_runtime).toBeUndefined();
    expect(modJson.depends[geckolib.modId]).toBe(geckolib.dependency);
    expect(modJson.entrypoints).toEqual({
      client: ['msm_sample_creatures.client.MsmSampleCreaturesModClient'],
      main: ['msm_sample_creatures.MsmSampleCreaturesMod'],
    });
    expect(utf8.decode(files.get('build.gradle.kts') as Uint8Array)).toContain('include(geckolib)');
  });

  it('has the recorded tree SHA-256 in two time zones', async () => {
    const hashes: string[] = [];
    for (const zone of TIME_ZONES) {
      await inTimeZone(zone, async () => {
        hashes.push(treeHash((await run()).files));
      });
    }
    expect(new Set(hashes).size).toBe(1);
    const hashFile = join(fixturesRoot, bundle.target.id, 'sample-creatures-java.sha256');
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_CREATURES_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
