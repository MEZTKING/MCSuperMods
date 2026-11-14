/**
 * Golden over the Java project eject of `fixtures/sample-mod` (ADR 0033): every block and item
 * component and every block and item action of the fixture (gear since ADR 0044: a bow
 * subclass, a drink, a charm with `apply_effect`, horse armour; since ADRs 0055 and 0056 the
 * effects as `ModEffects` and `effect/*Effect`, the throwables over `ThrowableItem`, one
 * `ThrownItemEntity` and a client entrypoint for its renderer, without GeckoLib).
 *
 * - The export succeeds without errors (warnings only for project ids the vanilla registries
 *   do not know); the project's files and contents hash to the value
 *   pinned in `test/fixtures/<target id>/sample-mod-java.sha256` in two time zones (with a
 *   stub Gradle wrapper, so the pin does not follow the engine-mod wrapper).
 * - The layout holds the Gradle files, the generated classes and the copied resources, and
 *   no `msm/` definitions.
 * - With `MSM_SAMPLE_MOD_JAVA_OUT` (a folder), the project is written there with the real
 *   wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build, B139).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ElementKindRegistry, registerPlugin, utf8 } from '@msm/core';
import type { Plugin, Problem } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
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

const update = process.env.UPDATE_GOLDENS === '1';
const sampleRoot = join(repoRoot, 'fixtures', 'sample-mod');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
const PLUGINS: readonly Plugin[] = [resourcePackPlugin, dataPackPlugin, blocksItemsPlugin];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = { msmVersion: '0.6.0', plugins: ['msm.blocks-items', 'msm.datapack'] };
const PKG = 'src/main/java/msm_sample_mod';
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
    .filter((bundle) => bundle.target.javaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('sample mod Java project (%s)', (_id, bundle) => {
  const run = (wrapper = STUB_WRAPPER) =>
    exportJavaProject({ root: sampleRoot, registry, bundle, meta, wrapper });

  it('exports with infos only and the expected layout', async () => {
    const { files, problems, ok } = await run();
    // Project ids are not in the vanilla registries the gate checks against: warnings only.
    expect(problems.filter(notIdWarningOrInfo)).toEqual([]);
    expect(ok).toBe(true);
    const paths = [...files.keys()];
    for (const path of [
      '.gitignore',
      'LICENSE-NOTES.md',
      'README.md',
      'build.gradle.kts',
      'gradle.properties',
      'gradle/wrapper/gradle-wrapper.jar',
      'gradle/wrapper/gradle-wrapper.properties',
      'gradlew',
      'gradlew.bat',
      'msm.export.json',
      'settings.gradle.kts',
      'src/main/resources/fabric.mod.json',
      `${PKG}/MsmSampleMod.java`,
      `${PKG}/ModBlocks.java`,
      `${PKG}/ModItems.java`,
      `${PKG}/Actions.java`,
      `${PKG}/block/RubyOreBlock.java`,
      `${PKG}/block/ChimeBlock.java`,
      // Shaped blocks (ADR 0059 D6) get a class for their shape overrides.
      `${PKG}/block/RubySlabBlock.java`,
      `${PKG}/block/RubySproutBlock.java`,
      `${PKG}/block/RubyGlassBlock.java`,
      `${PKG}/item/RubyWandItem.java`,
      `${PKG}/item/RubyAppleItem.java`,
      `${PKG}/item/RubyBowItem.java`,
      `${PKG}/item/RubyCharmItem.java`,
      `${PKG}/ModEffects.java`,
      `${PKG}/effect/MobEffectBase.java`,
      `${PKG}/effect/RubyRushEffect.java`,
      `${PKG}/effect/RubyStingEffect.java`,
      `${PKG}/item/ThrowableItem.java`,
      `${PKG}/item/RubyDartItem.java`,
      `${PKG}/item/RubyBoomerangItem.java`,
      `${PKG}/entity/ThrownItemEntity.java`,
      `${PKG}/client/MsmSampleModClient.java`,
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
    // The client entrypoint registers the thrown item's renderer; no entities, so no GeckoLib.
    const client = utf8.decode(files.get(`${PKG}/client/MsmSampleModClient.java`) as Uint8Array);
    expect(client).not.toContain('geckolib');
    expect(paths.some((path) => path.includes('GlowStone'))).toBe(false); // no behaviour: plain Block
    expect(
      paths.filter((path) => path.startsWith('src/main/resources/data/')).length,
    ).toBeGreaterThan(0);
    const modJson = JSON.parse(
      utf8.decode(files.get('src/main/resources/fabric.mod.json') as Uint8Array),
    ) as {
      depends: Record<string, string>;
      entrypoints: Record<string, string[]>;
      version: string;
    };
    expect(modJson.depends.msm_runtime).toBeUndefined();
    expect(modJson.entrypoints).toEqual({
      client: ['msm_sample_mod.client.MsmSampleModClient'],
      main: ['msm_sample_mod.MsmSampleMod'],
    });
    expect(modJson.depends.geckolib).toBeUndefined();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Gradle's placeholder
    expect(modJson.version).toBe('${version}');
    expect(utf8.decode(files.get('gradle.properties') as Uint8Array)).toContain(
      'mod_version=1.0.0',
    );
  });

  it('has the recorded tree SHA-256 in two time zones', async () => {
    const hashes: string[] = [];
    for (const zone of TIME_ZONES) {
      await inTimeZone(zone, async () => {
        hashes.push(treeHash((await run()).files));
      });
    }
    expect(new Set(hashes).size).toBe(1);
    const hashFile = join(fixturesRoot, bundle.target.id, 'sample-mod-java.sha256');
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_MOD_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
