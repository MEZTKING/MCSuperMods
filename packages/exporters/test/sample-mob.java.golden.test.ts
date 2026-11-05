/**
 * Golden over the Java project eject of `fixtures/sample-mob` (ADR 0033): an animated entity with
 * every entity component and goal, a spawn egg, a natural spawn and GeckoLib.
 *
 * - The export succeeds without errors (warnings only for project ids the vanilla registries
 *   do not know); the project's files and contents hash to the value
 *   pinned in `test/fixtures/<target id>/sample-mob-java.sha256` in two time zones (with a
 *   stub Gradle wrapper, so the pin does not follow the engine-mod wrapper).
 * - The layout holds the Gradle files, the generated classes and the copied resources, and
 *   no `msm/` definitions.
 * - With `MSM_SAMPLE_MOB_JAVA_OUT` (a folder), the project is written there with the real
 *   wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build, B139).
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

const update = process.env.UPDATE_GOLDENS === '1';
const sampleRoot = join(repoRoot, 'fixtures', 'sample-mob');
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
  msmVersion: '0.6.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim'],
};
const PKG = 'src/main/java/msm_sample_mob';
const notIdWarningOrInfo = (problem: Problem): boolean =>
  problem.severity === 'error' || (problem.severity === 'warning' && problem.code !== 'schema.unknown-id');

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

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'sample mob Java project (%s)',
  (_id, bundle) => {
    const run = (wrapper = STUB_WRAPPER) =>
      exportJavaProject({ root: sampleRoot, registry, bundle, meta, wrapper });

    it('exports with infos only and the expected layout', async () => {
      const { files, problems, ok } = await run();
      // Project ids are not in the vanilla registries the gate checks against: warnings only.
      expect(problems.filter(notIdWarningOrInfo)).toEqual([]);
      expect(ok).toBe(true);
      const paths = [...files.keys()];
      for (const path of [
        'build.gradle.kts',
        'gradle.properties',
        'gradlew',
        'src/main/resources/fabric.mod.json',
        `${PKG}/MsmSampleMobMod.java`,
        `${PKG}/ModEntities.java`,
        `${PKG}/Actions.java`,
        `${PKG}/entity/GlowGolemEntity.java`,
        `${PKG}/entity/FollowTypesGoal.java`,
        `${PKG}/client/MsmSampleMobModClient.java`,
        `${PKG}/client/entity/GeoModelBase.java`,
        `${PKG}/client/entity/GlowGolemModel.java`,
      ]) {
        expect(paths, path).toContain(path);
      }
      expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
      expect(paths.filter((path) => path.startsWith('src/main/resources/assets/')).length).toBeGreaterThan(0);
      const modJson = JSON.parse(
        utf8.decode(files.get('src/main/resources/fabric.mod.json') as Uint8Array),
      ) as { depends: Record<string, string>; entrypoints: Record<string, string[]> };
      const geckolib = bundle.target.geckolib;
      if (geckolib === undefined) throw new Error('no GeckoLib facts');
      expect(modJson.depends.msm_runtime).toBeUndefined();
      expect(modJson.depends[geckolib.modId]).toBe(geckolib.dependency);
      expect(modJson.entrypoints).toEqual({
        client: ['msm_sample_mob.client.MsmSampleMobModClient'],
        main: ['msm_sample_mob.MsmSampleMobMod'],
      });
      const build = utf8.decode(files.get('build.gradle.kts') as Uint8Array);
      expect(build).toContain('include(geckolib)');
      expect(utf8.decode(files.get('gradle.properties') as Uint8Array)).toContain(
        `geckolib_modrinth_version_id=${geckolib.modrinthVersionId}`,
      );
      expect(utf8.decode(files.get('README.md') as Uint8Array)).toContain('is not valid semver');
    });

    it('has the recorded tree SHA-256 in two time zones', async () => {
      const hashes: string[] = [];
      for (const zone of TIME_ZONES) {
        await inTimeZone(zone, async () => {
          hashes.push(treeHash((await run()).files));
        });
      }
      expect(new Set(hashes).size).toBe(1);
      const hashFile = join(fixturesRoot, bundle.target.id, 'sample-mob-java.sha256');
      const actual = hashes[0] as string;
      if (update) {
        await mkdir(dirname(hashFile), { recursive: true });
        await writeFile(hashFile, `${actual}\n`);
      }
      expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
    });

    const outDir = process.env.MSM_SAMPLE_MOB_JAVA_OUT;
    it.runIf(outDir !== undefined && bundle === builtInTargets[0])(
      'writes the project with the real Gradle wrapper for the ejected build',
      async () => {
        const { files, ok } = await run(await engineModWrapper());
        expect(ok).toBe(true);
        await writeTree(files, outDir as string);
      },
    );
  },
);
