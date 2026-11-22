/**
 * Golden over the Java project eject of `fixtures/sample-mobs-and-commands` (ADR 0033, ADRs 0107 to
 * 0111, ADR 0112 D3 and D4, plan B541), exported through `sample-java.ts` as the other samples
 * are: the bed as a villager home, the villager type, the two fluids with their mixing, cauldrons
 * and bottle, the fish bucket, the hovering, phasing, swooping and roosting mobs, the habits, the
 * dash, the kind merchant's trader (levels, reputation, demand and work site) and the perch owl's
 * shoulder riding (eject 2c), the larch boat and its chest boat, the two commands with their
 * argument types and the dialog action, the game rules, the statistics and the hand-ordered tab.
 *
 * `export.not-in-eject` names the script's four newer Mixin events (one warning each); the script and `/tally`'s `run_script` action are not ejected
 * (scripts never are, ADR 0033), with their own warnings.
 *
 * - The export succeeds without errors or warnings other than those and project ids the vanilla
 *   registries do not know; the project's files and contents hash to the value pinned in
 *   `test/fixtures/<target id>/sample-mobs-and-commands-java.sha256` in two time zones (with a
 *   stub Gradle wrapper, so the pin does not follow the engine-mod wrapper).
 * - The layout holds the Gradle files and the batch 2 classes, and no `msm/` definitions.
 * - With `MSM_SAMPLE_MOBS_COMMANDS_JAVA_OUT` (a folder), the project is written there with the
 *   real wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build).
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
import scriptingPlugin from '@msm/plugin-scripting';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it, vi } from 'vitest';
import type { GradleWrapper } from '../src/index';
import {
  engineModWrapper,
  exportJavaProject,
  repoRoot,
  STUB_WRAPPER,
  treeHash,
  writeTree,
} from './sample-java';
import { selectedTarget } from './selected-target';

// Ejecting twelve mobs, two fluids and a boat takes a few seconds (B368, B377).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';
const sampleRoot = join(repoRoot, 'fixtures', 'sample-mobs-and-commands');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
  scriptingPlugin,
];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = {
  msmVersion: '1.5.3',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim', 'msm.scripting'],
};
const NAMESPACE = 'msm_sample_mobs';
const PKG = `src/main/java/${NAMESPACE}`;

/** Warnings the eject may give: project ids and the script. */
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

describe.each(
  builtInTargets
    .filter((bundle) => bundle.target.javaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('sample mobs and commands Java project (%s)', (_id, bundle) => {
  const run = (wrapper: GradleWrapper | undefined = STUB_WRAPPER) =>
    exportJavaProject({ root: sampleRoot, registry, bundle, meta, wrapper });

  it('exports with no errors and the expected layout', async () => {
    const { files, problems, ok } = await run();
    expect(problems.filter(unexpected)).toEqual([]);
    expect(ok).toBe(true);
    const fileOf = (code: string): (string | undefined)[] =>
      problems.filter((problem) => problem.code === code).map((problem) => problem.file);
    expect(fileOf('export.not-in-eject')).toEqual(
      Array(4).fill(`msm/${NAMESPACE}/script/mob_notes.ts`),
    );
    expect(fileOf('export.scripts-not-ejected').sort()).toEqual([
      `msm/${NAMESPACE}/command/tally.json`,
      `msm/${NAMESPACE}/script/mob_notes.ts`,
    ]);
    const paths = [...files.keys()];
    for (const path of [
      'build.gradle.kts',
      'gradlew',
      'README.md',
      'src/main/resources/fabric.mod.json',
      `${PKG}/ModBlocks.java`,
      `${PKG}/ModItems.java`,
      `${PKG}/ModEntities.java`,
      `${PKG}/ModFluids.java`,
      `${PKG}/ModCommands.java`,
      `${PKG}/ModGameRules.java`,
      `${PKG}/ModStats.java`,
      `${PKG}/ModVillagerTypes.java`,
      `${PKG}/ModCreativeTabs.java`,
      `${PKG}/block/type/ModBedBlock.java`,
      `${PKG}/boat/ModBoats.java`,
      `${PKG}/client/boat/BoatRenderers.java`,
      `${PKG}/fluid/FluidMixing.java`,
      `${PKG}/fluid/FluidCauldrons.java`,
      `${PKG}/fluid/ModBottleItem.java`,
      `${PKG}/entity/HoverMoveControl.java`,
      `${PKG}/entity/PhaseChargeGoal.java`,
      `${PKG}/entity/SwoopGoal.java`,
      `${PKG}/entity/RoostGoal.java`,
      `${PKG}/entity/CollectItemsGoal.java`,
      `${PKG}/entity/DigForItemsGoal.java`,
      `${PKG}/entity/PlayDeadGoal.java`,
      `${PKG}/entity/BarterGoal.java`,
      `${PKG}/entity/MobHabits.java`,
      `${PKG}/entity/Trader.java`,
      `${PKG}/entity/MobTrader.java`,
      `${PKG}/entity/TraderReputation.java`,
      `${PKG}/entity/RestockAtWorkSiteGoal.java`,
      `${PKG}/entity/MobShoulder.java`,
      `${PKG}/entity/PerchOnOwnerGoal.java`,
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
    const java = (path: string): string => utf8.decode(files.get(`${PKG}/${path}`) as Uint8Array);
    const all = [...files.entries()]
      .filter(([path]) => path.endsWith('.java'))
      .map(([, bytes]) => utf8.decode(bytes))
      .join('\n');
    for (const text of ['"pond_carp_bucket"', '"larch_chest_boat"', '"maple_syrup_bottle"']) {
      expect(all, text).toContain(text);
    }
    expect(java('ModVillagerTypes.java')).toContain('"fen"');
    expect(java('ModGameRules.java')).toContain('"merchant_bonus"');
    expect(java('ModStats.java')).toContain('"distance_hopped"');
    expect(java('ModCommands.java')).toContain('"signal"');
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
    const hashFile = join(fixturesRoot, bundle.target.id, 'sample-mobs-and-commands-java.sha256');
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_MOBS_COMMANDS_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
