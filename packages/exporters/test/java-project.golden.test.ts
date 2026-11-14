/**
 * Goldens of the version-independent files of the Java project eject (ADR 0033 D2) for
 * `fixtures/sample-mod` and `fixtures/sample-mob`: the Gradle files, README, licence notes,
 * `.gitignore`, wrapper properties, `fabric.mod.json` and the manifest, kept readable under
 * `test/fixtures/<target id>/expected/java-project/<sample>/`. The Java sources are pinned by
 * the target's own goldens and, with everything else, by the tree hashes of
 * `sample-mod.java.golden.test.ts` and `sample-mob.java.golden.test.ts`.
 * `UPDATE_GOLDENS=1` rewrites them.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ElementKindRegistry, registerPlugin, utf8 } from '@msm/core';
import type { Plugin } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import modelsAnimPlugin from '@msm/plugin-models-anim';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import worldgenPlugin from '@msm/plugin-worldgen';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { exportJavaProject, repoRoot, STUB_WRAPPER } from './sample-java';

const update = process.env.UPDATE_GOLDENS === '1';
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  worldgenPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = { msmVersion: '0.6.0', plugins: ['msm.blocks-items', 'msm.datapack'] };

/** The files compared as text. */
const PINNED = [
  '.gitignore',
  'LICENSE-NOTES.md',
  'README.md',
  'build.gradle.kts',
  'gradle.properties',
  'gradle/wrapper/gradle-wrapper.properties',
  'msm.export.json',
  'settings.gradle.kts',
  'src/main/resources/fabric.mod.json',
];

describe.each(
  builtInTargets
    .filter((bundle) => bundle.target.javaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('Java project files (%s)', (_id, bundle) => {
  it.each(['sample-mod', 'sample-mob'])('%s', async (sample) => {
    const { files, ok } = await exportJavaProject({
      root: join(repoRoot, 'fixtures', sample),
      registry,
      bundle,
      meta,
      wrapper: STUB_WRAPPER,
    });
    expect(ok).toBe(true);
    const root = join(fixturesRoot, bundle.target.id, 'expected', 'java-project', sample);
    if (update) {
      await rm(root, { recursive: true, force: true });
      for (const path of PINNED) {
        const out = join(root, ...path.split('/'));
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, files.get(path) as Uint8Array);
      }
    }
    for (const path of PINNED) {
      const actual = utf8.decode(files.get(path) as Uint8Array);
      expect(actual, path).toBe(await readFile(join(root, ...path.split('/')), 'utf8'));
      expect(actual.includes('\r'), path).toBe(false);
    }
  });
});
