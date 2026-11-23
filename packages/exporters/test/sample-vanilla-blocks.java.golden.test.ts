/**
 * Golden over the Java project eject of `fixtures/sample-vanilla-blocks` (ADR 0033, ADRs 0094 to
 * 0096 and 0101, plan B462): the twenty vanilla-like block types with their companions, a lamp
 * that holds water, four stages of tin with waxed copies, three bags (chest, hopper, dispenser),
 * a bundle, two commands (an event and a macro function), a conveyor and the creative tabs. As
 * in the app (B371), the eject receives the **expanded** project (`expandProject(project,
 * PLUGINS, target)`): the plain rule on `/greet` is an ordinary event action and ejects with the
 * command, while the Script API 1.6 script and the rule book's script are left out
 * (`export.scripts-not-ejected`), and with them the conveyor's `run_script` step event (B462b).
 *
 * - The export succeeds without errors or warnings other than project ids the vanilla
 *   registries do not know and the scripts it leaves out; the project's files and contents hash to the value pinned in
 *   `test/fixtures/<target id>/sample-vanilla-blocks-java.sha256` in two time zones (with a stub
 *   Gradle wrapper, so the pin does not follow the engine-mod wrapper).
 * - The layout holds the Gradle files, the shared block drivers, the companions, the weathering
 *   and waxing classes, the bags, the commands and the tab, the writing-screen pictures, and no
 *   `msm/` definitions.
 * - With `MSM_SAMPLE_VANILLA_BLOCKS_JAVA_OUT` (a folder), the project is written there with the
 *   real wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ElementKindRegistry, expandProject, loadProject, registerPlugin, utf8 } from '@msm/core';
import type { Plugin, Problem } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import rulesPlugin, { ruleScriptPath } from '@msm/plugin-rules';
import scriptingPlugin from '@msm/plugin-scripting';
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

// Expanding and ejecting a project with rules takes a few seconds (B368, B377).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';
const sampleRoot = join(repoRoot, 'fixtures', 'sample-vanilla-blocks');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  scriptingPlugin,
  rulesPlugin,
];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = {
  msmVersion: '1.5.1',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.rules', 'msm.scripting'],
};
const NAMESPACE = 'msm_sample_vanilla_blocks';
const PKG = `src/main/java/${NAMESPACE}`;
/**
 * Warnings the eject may give: project ids, the scripts it leaves out, and the scripts' Mixin
 * events (`block.place`, `world.explosion`), which only the Fabric mod jar has (ADR 0096 D6).
 */
const EXPECTED_WARNINGS: ReadonlySet<string> = new Set([
  'schema.unknown-id',
  'export.scripts-not-ejected',
  'export.not-in-eject',
]);
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
)('sample vanilla blocks Java project (%s)', (_id, bundle) => {
  const run = (wrapper: GradleWrapper | undefined = STUB_WRAPPER) => ejectExpanded(bundle, wrapper);

  it('exports with no errors and the expected layout', async () => {
    const { files, problems, ok } = await run();
    expect(problems.filter(unexpected)).toEqual([]);
    expect(ok).toBe(true);
    // The two scripts are left out with a warning each, and so is the conveyor's `run_script`.
    const notEjected = problems
      .filter((problem) => problem.code === 'export.scripts-not-ejected')
      .map((problem) => problem.file ?? '')
      .sort();
    expect(notEjected).toEqual(
      [
        `msm/${NAMESPACE}/script/script_api_1_6.ts`,
        ruleScriptPath(`${NAMESPACE}:vanilla_blocks_rules`),
        `msm/${NAMESPACE}/block/conveyor.json`,
      ].sort(),
    );
    // Both scripts listen to the two Mixin events, which are named once each per script.
    const mixinEvents = problems
      .filter((problem) => problem.code === 'export.not-in-eject')
      .map(
        (problem) =>
          `${problem.file ?? ''} ${/\((block\.place|world\.explosion)\)/.exec(problem.message)?.[1] ?? '?'}`,
      )
      .sort();
    expect(mixinEvents).toEqual(
      [
        ruleScriptPath(`${NAMESPACE}:vanilla_blocks_rules`),
        `msm/${NAMESPACE}/script/script_api_1_6.ts`,
      ]
        .flatMap((file) => [`${file} block.place`, `${file} world.explosion`])
        .sort(),
    );
    expect(
      [...files.keys()].some((path) => path.includes('/script/') || /\.(ts|js)$/.test(path)),
    ).toBe(false);
    const paths = [...files.keys()];
    const resources = 'src/main/resources';
    for (const path of [
      'build.gradle.kts',
      'gradle.properties',
      'gradlew',
      'README.md',
      `${resources}/fabric.mod.json`,
      `${resources}/assets/${NAMESPACE}/textures/gui/signs/cedar_sign.png`,
      `${resources}/assets/${NAMESPACE}/textures/gui/hanging_signs/cedar_hanging_sign.png`,
      `${PKG}/MsmSampleVanillaBlocksMod.java`,
      `${PKG}/ModBlocks.java`,
      `${PKG}/ModItems.java`,
      `${PKG}/ModCommands.java`,
      `${PKG}/ModCreativeTabs.java`,
      `${PKG}/BlockWaxing.java`,
      `${PKG}/item/BagMenus.java`,
      `${PKG}/item/SatchelItem.java`,
      `${PKG}/block/TinBlock.java`,
      `${PKG}/block/SeaLampBlock.java`,
      ...[
        'ModBedBlock',
        'ModBerryBushBlock',
        'ModCakeBlock',
        'ModCocoaBlock',
        'ModLayersBlock',
        'ModScaffoldingBlock',
        'ModSeaPickleBlock',
        'ModTallPlantBlock',
        'ModVineBlock',
      ].map((driver) => `${PKG}/block/type/${driver}.java`),
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);

    const java = (path: string): string => utf8.decode(files.get(`${PKG}/${path}`) as Uint8Array);
    const blocks = java('ModBlocks.java');
    for (const companion of [
      'EMBER_TORCH_WALL',
      'CEDAR_SIGN_WALL',
      'CEDAR_HANGING_SIGN_WALL',
      'GOURD_STEM_ATTACHED',
    ]) {
      expect(blocks, companion).toContain(
        `${companion} = Registry.register(BuiltInRegistries.BLOCK`,
      );
    }
    expect(blocks).toContain('.sound(WoodType.SPRUCE.soundType())');
    expect(blocks).toContain('.sound(WoodType.SPRUCE.hangingSignSoundType())');
    expect(blocks).toContain(
      `BlockWaxing.wax(TIN, Identifier.fromNamespaceAndPath("${NAMESPACE}", "waxed_tin"));`,
    );
    expect(java('block/TinBlock.java')).toContain(
      'implements ChangeOverTimeBlock<WeatheringCopper.WeatherState>',
    );
    expect(java('block/SeaLampBlock.java')).toContain('implements SimpleWaterloggedBlock');
    expect(java('item/SatchelItem.java')).toContain('BagItem.Layout.CHEST, 2, true');
    expect(java('ModItems.java')).toContain('new BundleItem(');
    const commands = java('ModCommands.java');
    expect(commands).toContain('"greet"');
    expect(commands).toContain('"hiya"');
    expect(commands).toContain('"kit"');
    expect(commands).toContain('EntityArgument.player()');
    expect(commands).toContain('IntegerArgumentType.integer(1, 16)');
    // The plain rule on /greet: a cookie after the wave (B462b).
    expect(commands).toContain('minecraft:cookie');
    expect(java('ModCreativeTabs.java')).toContain(
      `Component.translatable("itemGroup.${NAMESPACE}.vanilla_blocks")`,
    );
    const modJson = JSON.parse(
      utf8.decode(files.get(`${resources}/fabric.mod.json`) as Uint8Array),
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
    const hashFile = join(fixturesRoot, bundle.target.id, 'sample-vanilla-blocks-java.sha256');
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_VANILLA_BLOCKS_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
