/**
 * Golden over the Java project eject of `fixtures/sample-machines` (ADR 0033, ADR 0074 D9,
 * ADR 0075 D11, plan B323): six containers (chest of 3 and 1 rows, a keep-contents chest,
 * hopper, dispenser and `none` layouts) and three machines (fuel with its own recipes, smelting
 * at double speed, redstone taking the first machine's recipes), each firing events that run a
 * function.
 *
 * - The export succeeds without errors (warnings only for project ids the vanilla registries
 *   do not know); the project's files and contents hash to the value pinned in
 *   `test/fixtures/<target id>/sample-machines-java.sha256` in two time zones (with a stub
 *   Gradle wrapper, so the pin does not follow the engine-mod wrapper).
 * - The layout holds the Gradle files, `ModBlockEntities.java`, `ModRecipes.java`, the shared
 *   container and machine classes, one block class and one block entity class per block, the
 *   machine recipes as data, and no `msm/` definitions.
 * - With `MSM_SAMPLE_MACHINES_JAVA_OUT` (a folder), the project is written there with the real
 *   wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build).
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
const sampleRoot = join(repoRoot, 'fixtures', 'sample-machines');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
const PLUGINS: readonly Plugin[] = [resourcePackPlugin, dataPackPlugin, blocksItemsPlugin];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = { msmVersion: '1.4.0', plugins: ['msm.blocks-items', 'msm.datapack'] };
const NAMESPACE = 'msm_sample_machines';
const PKG = `src/main/java/${NAMESPACE}`;
/** The block classes, from the block ids. */
const BLOCKS = [
  'Crate',
  'DispenserBox',
  'FastFurnace',
  'Grinder',
  'Holder',
  'HopperBox',
  'KeepCrate',
  'RedstoneGrinder',
  'SmallCrate',
] as const;
/** The classes copied from the runtime, written once for the project. */
const SHARED = [
  'block/ContainerSpec',
  'block/BlockEvents',
  'block/StorageBlockEntity',
  'block/ContainerMenus',
  'block/ContainerOpeners',
  'block/HolderInteraction',
  'block/ContainerBlockItem',
  'block/MachineSpec',
  'block/MachineBlockEntity',
  'block/MachineData',
  'block/MachineFurnaceMenu',
  'block/MachineResultSlot',
  'recipe/MachineRecipe',
  'recipe/MachineInput',
  'recipe/MachineRecipes',
] as const;
const GRINDER_RECIPES = ['bone_meal', 'flint', 'gravel', 'string_from_wool'] as const;
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
)('sample machines Java project (%s)', (_id, bundle) => {
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
      `${PKG}/MsmSampleMachinesMod.java`,
      `${PKG}/ModBlocks.java`,
      `${PKG}/ModBlockEntities.java`,
      `${PKG}/ModRecipes.java`,
      ...SHARED.map((name) => `${PKG}/${name}.java`),
      ...BLOCKS.flatMap((name) => [
        `${PKG}/block/${name}Block.java`,
        `${PKG}/block/${name}BlockEntity.java`,
      ]),
      ...GRINDER_RECIPES.map(
        (name) => `src/main/resources/data/${NAMESPACE}/${data.recipe}/grinder/${name}.json`,
      ),
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
    const java = (path: string): string => utf8.decode(files.get(`${PKG}/${path}`) as Uint8Array);
    // Every machine registers its own recipe type under its block id.
    const recipes = java('ModRecipes.java');
    for (const name of ['grinder', 'fast_furnace', 'redstone_grinder']) {
      expect(recipes, name).toContain(`"${name}"`);
    }
    // Every block entity type has the block's id.
    const types = java('ModBlockEntities.java');
    for (const name of ['crate', 'small_crate', 'keep_crate', 'hopper_box', 'dispenser_box']) {
      expect(types, name).toContain(`"${name}"`);
    }
    const readme = utf8.decode(files.get('README.md') as Uint8Array);
    expect(readme).toContain('`ModBlockEntities.java`');
    expect(readme).toContain('/ModRecipes.java`');
    expect(readme).toContain('`recipe/`');
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
    const hashFile = join(fixturesRoot, bundle.target.id, 'sample-machines-java.sha256');
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_MACHINES_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
