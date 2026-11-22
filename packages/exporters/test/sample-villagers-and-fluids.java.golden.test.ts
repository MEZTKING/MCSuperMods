/**
 * Golden over the Java project eject of `fixtures/sample-villagers-and-fluids` (ADR 0033, ADRs 0098
 * to 0101, ADR 0112 D3, plan B537): the glassblower profession and its job site, the brine and
 * molten amber fluids with their liquid blocks, buckets, mixing and renderers, and the dimension
 * type. The pedlar's trades, the pack mule's storage and the sugar glider's shoulder riding are
 * left out with one `export.not-in-eject` warning per mob (the mobs themselves are generated).
 *
 * - The export succeeds without errors or warnings other than project ids the vanilla registries
 *   do not know and those; the project's files and contents hash to the value pinned in
 *   `test/fixtures/<target id>/sample-villagers-and-fluids-java.sha256` in two time zones (with a
 *   stub Gradle wrapper, so the pin does not follow the engine-mod wrapper).
 * - The layout holds the Gradle files, the professions, the fluid classes and the client fluid
 *   renderers, and no `msm/` definitions.
 * - With `MSM_SAMPLE_VILLAGERS_JAVA_OUT` (a folder), the project is written there with the real
 *   wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build, wired by B541).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ElementKindRegistry, expandProject, loadProject, registerPlugin, utf8 } from '@msm/core';
import type { Plugin, Problem } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import entitiesPlugin from '@msm/plugin-entities';
import modelsAnimPlugin from '@msm/plugin-models-anim';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import worldgenPlugin from '@msm/plugin-worldgen';
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

// Ejecting mobs and fluids takes a few seconds (B368, B377).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';
const sampleRoot = join(repoRoot, 'fixtures', 'sample-villagers-and-fluids');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
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
const meta = {
  msmVersion: '1.5.2',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim', 'msm.worldgen'],
};
const NAMESPACE = 'msm_sample_villagers';
const PKG = `src/main/java/${NAMESPACE}`;
/** Warnings the eject may give: project ids, and the mobs' trader, storage and shoulder riding. */
const EXPECTED_WARNINGS: ReadonlySet<string> = new Set([
  'schema.unknown-id',
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
    .filter((bundle) => bundle.target.javaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('sample villagers and fluids Java project (%s)', (_id, bundle) => {
  const run = (wrapper: GradleWrapper | undefined = STUB_WRAPPER) => ejectExpanded(bundle, wrapper);

  it('exports with no errors and the expected layout', async () => {
    const { files, problems, ok } = await run();
    expect(problems.filter(unexpected)).toEqual([]);
    expect(ok).toBe(true);
    expect(
      problems
        .filter((problem) => problem.code === 'export.not-in-eject')
        .map((problem) => problem.file),
    ).toEqual([
      `msm/${NAMESPACE}/entity/pack_mule.json`,
      `msm/${NAMESPACE}/entity/pedlar.json`,
      `msm/${NAMESPACE}/entity/sugar_glider.json`,
    ]);
    const paths = [...files.keys()];
    for (const path of [
      'build.gradle.kts',
      'gradlew',
      'README.md',
      'src/main/resources/fabric.mod.json',
      `${PKG}/ModFluids.java`,
      `${PKG}/ModProfessions.java`,
      `${PKG}/fluid/FluidRegistry.java`,
      `${PKG}/fluid/FluidMixing.java`,
      `${PKG}/fluid/BrineFluidEvents.java`,
      `${PKG}/client/fluid/FluidRenderers.java`,
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
    const java = (path: string): string => utf8.decode(files.get(`${PKG}/${path}`) as Uint8Array);
    expect(java('ModProfessions.java')).toContain(
      '"entity.msm_sample_villagers.villager.glassblower"',
    );
    expect(java('ModFluids.java')).toContain('BrineFluidEvents::inside');
    const modJson = JSON.parse(
      utf8.decode(files.get('src/main/resources/fabric.mod.json') as Uint8Array),
    ) as { depends: Record<string, string>; entrypoints: Record<string, string[]> };
    expect(modJson.depends.msm_runtime).toBeUndefined();
    expect(modJson.entrypoints.client).toHaveLength(1);
  });

  it('has the recorded tree SHA-256 in two time zones', async () => {
    const hashes: string[] = [];
    for (const zone of TIME_ZONES) {
      await inTimeZone(zone, async () => {
        hashes.push(treeHash((await run()).files));
      });
    }
    expect(new Set(hashes).size).toBe(1);
    const hashFile = join(
      fixturesRoot,
      bundle.target.id,
      'sample-villagers-and-fluids-java.sha256',
    );
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_VILLAGERS_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
