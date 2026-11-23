/**
 * Golden over the Java project eject of `fixtures/sample-plants-and-storage` (ADR 0033, ADRs 0103
 * to 0105, ADR 0112 D3 and D4, plan B520): the four plant families with their companions, the
 * project pot and its potted plants, bronze on the six new weathering types with lightning, the
 * double, per-player, waterlogged and ageing chests, own sounds and set types, and flatten and
 * till. As in the app, the eject receives the expanded project. The rules for vanilla blocks are
 * ejected too since B537 (`ModVanillaBlockRules`), so nothing is `export.not-in-eject`.
 *
 * - The export succeeds without errors or warnings other than project ids the vanilla registries
 *   do not know and that one; the project's files and contents hash to the value pinned in
 *   `test/fixtures/<target id>/sample-plants-and-storage-java.sha256` in two time zones (with a
 *   stub Gradle wrapper, so the pin does not follow the engine-mod wrapper).
 * - The layout holds the Gradle files, the plant drivers, the pot, the weathering, lightning,
 *   storage and stripping classes, and no `msm/` definitions.
 * - With `MSM_SAMPLE_PLANTS_JAVA_OUT` (a folder), the project is written there with the real
 *   wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ElementKindRegistry, expandProject, loadProject, registerPlugin, utf8 } from '@msm/core';
import type { Plugin, Problem } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import { builtInTargets, type TargetBundle } from '@msm/targets';
import { describe, expect, it, vi } from 'vitest';
import {
  createJavaProjectExporter,
  createMemorySink,
  type GradleWrapper,
  runExport,
} from '../src/index';
import { indexesFor } from './helpers';
import {
  engineModWrapper,
  fixtureFs,
  repoRoot,
  STUB_WRAPPER,
  treeHash,
  writeTree,
} from './sample-java';
import { selectedTarget } from './selected-target';

// Expanding and ejecting some sixty blocks takes a few seconds (B368, B377).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';
const sampleRoot = join(repoRoot, 'fixtures', 'sample-plants-and-storage');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
const PLUGINS: readonly Plugin[] = [resourcePackPlugin, dataPackPlugin, blocksItemsPlugin];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = { msmVersion: '1.5.2', plugins: ['msm.blocks-items', 'msm.datapack'] };
const NAMESPACE = 'msm_sample_plants';
const PKG = `src/main/java/${NAMESPACE}`;
/** Warnings the eject may give: project ids. */
const EXPECTED_WARNINGS: ReadonlySet<string> = new Set(['schema.unknown-id']);
const unexpected = (problem: Problem): boolean =>
  problem.severity === 'error' ||
  (problem.severity === 'warning' && !EXPECTED_WARNINGS.has(problem.code));

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

/** Loads the fixture, expands it as the app does and exports it as a Java project. */
async function ejectExpanded(
  bundle: TargetBundle,
  wrapper: GradleWrapper | undefined,
): Promise<{ files: Map<string, Uint8Array>; problems: Problem[]; ok: boolean }> {
  const fs = fixtureFs(sampleRoot);
  const { project, problems: loadProblems } = await loadProject(fs, registry);
  if (loadProblems.length > 0) throw new Error(JSON.stringify(loadProblems));
  const expansion = await expandProject(project, PLUGINS, bundle.target);
  expect(expansion.problems).toEqual([]);
  const { schemaIndex, registries } = await indexesFor(bundle);
  const sink = createMemorySink();
  const report = await runExport({
    project: expansion.project,
    registry,
    target: bundle.target,
    schemaIndex,
    registries,
    exporter: createJavaProjectExporter({ loadGradleWrapper: async () => wrapper }),
    sink,
    readAsset: (namespace, path) => fs.readFile(`assets/${namespace}/${path}`),
    meta,
  });
  return { files: sink.files(), problems: report.problems, ok: report.ok };
}

describe.each(
  builtInTargets
    .filter((bundle) => bundle.target.loadJavaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('sample plants and storage Java project (%s)', (_id, bundle) => {
  const run = (wrapper: GradleWrapper | undefined = STUB_WRAPPER) => ejectExpanded(bundle, wrapper);

  it('exports with no errors and the expected layout', async () => {
    const { files, problems, ok } = await run();
    expect(problems.filter(unexpected)).toEqual([]);
    expect(ok).toBe(true);
    expect(problems.filter((problem) => problem.code === 'export.not-in-eject')).toEqual([]);
    const paths = [...files.keys()];
    for (const path of [
      'build.gradle.kts',
      'gradle.properties',
      'gradlew',
      'README.md',
      'src/main/resources/fabric.mod.json',
      `${PKG}/ModBlocks.java`,
      `${PKG}/Lightning.java`,
      `${PKG}/BlockWaxing.java`,
      `${PKG}/BlockStripping.java`,
      `${PKG}/ModVanillaBlockRules.java`,
      `${PKG}/block/PlayerStores.java`,
      `${PKG}/block/DoubleChestBlock.java`,
      `${PKG}/block/type/PlantSpec.java`,
      `${PKG}/block/type/ModFlowerPotBlock.java`,
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
    const java = (path: string): string => utf8.decode(files.get(`${PKG}/${path}`) as Uint8Array);
    const blocks = java('ModBlocks.java');
    for (const text of [
      'GLOW_VINE.attachBody(GLOW_VINE_PLANT);',
      'REED_BAMBOO.attachShoot(REED_BAMBOO_SHOOT);',
      'WIDE_LEAF.attachStem(WIDE_LEAF_STEM);',
      'CLAY_PLANTER.addPotted(CLAY_PLANTER_GRASS.plant(), CLAY_PLANTER_GRASS);',
      'Lightning.init();',
      'PlayerStores.register();',
      'BlockStripping.flatten(LOAM,',
      '.sound(ModBlocks.ownSounds(',
    ]) {
      expect(blocks, text).toContain(text);
    }
    expect(java('block/CreakyDoorBlock.java')).toContain('ModBlocks.ownSetType(');
    expect(java('block/TwinCrateBlock.java')).toContain('extends DoubleChestBlock');
    expect(java('block/PrivateCrateBlock.java')).toContain('PlayerStores.open(storage, player);');
    expect(java('block/SeaCrateBlock.java')).toContain('SimpleWaterloggedBlock');
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
    const hashFile = join(fixturesRoot, bundle.target.id, 'sample-plants-and-storage-java.sha256');
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_PLANTS_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
