/**
 * Golden over the Java project eject of `fixtures/sample-rules` (ADR 0033, ADR 0082 D10, plan
 * B380). As in the app (B371), the eject receives the **expanded** project
 * (`expandProject(project, PLUGINS, target)`): plain rules are ordinary events on their
 * subjects and eject with them, while rules that need a script are left out with the scripts
 * (`export.scripts-not-ejected`; the app's Export Java project dialog lists each of those rules
 * as `rules.not-in-eject`).
 *
 * - The export succeeds without errors; its warnings are only project ids the vanilla
 *   registries do not know and the generated scripts it leaves out; the project's files and
 *   contents hash to the value pinned in `test/fixtures/<target id>/sample-rules-java.sha256` in
 *   two time zones (with a stub Gradle wrapper, so the pin does not follow the engine-mod
 *   wrapper).
 * - The plain rules are in the Java code: the Chime Block's `block_used` event (a chime and a
 *   Ruby) and the Sentinel's `mob_every` event (a bell, sparkles and Glowing). The rules with
 *   logic (the Lucky Block, the Rally Horn and the world book) have no script in the project,
 *   and their subjects' `run_script` events do nothing there.
 * - With `MSM_SAMPLE_RULES_JAVA_OUT` (a folder), the project is written there with the real
 *   wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build).
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

// Expanding and ejecting a project with a mob and rules takes a few seconds (B368, B377).
vi.setConfig({ testTimeout: 60_000 });

const update = process.env.UPDATE_GOLDENS === '1';
const sampleRoot = join(repoRoot, 'fixtures', 'sample-rules');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
/** The plugins the sample needs, in the app's registration order (rules after scripting). */
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  entitiesPlugin,
  modelsAnimPlugin,
  scriptingPlugin,
  rulesPlugin,
];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.entities', 'msm.models-anim', 'msm.rules'],
};
const NAMESPACE = 'msm_sample_rules';
const PKG = `src/main/java/${NAMESPACE}`;
/** The books whose rules need a script: left out of the eject. */
const SCRIPT_BOOKS = ['lucky_block_rules', 'rally_horn_rules', 'world_rules'] as const;
/** Warnings the eject may give: project ids and the generated scripts it leaves out. */
const EXPECTED_WARNINGS: ReadonlySet<string> = new Set([
  'schema.unknown-id',
  'export.scripts-not-ejected',
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
)('sample rules Java project (%s)', (_id, bundle) => {
  const run = (wrapper: GradleWrapper | undefined = STUB_WRAPPER) => ejectExpanded(bundle, wrapper);

  it('exports with no errors, the plain rules as events and no scripts', async () => {
    const { files, problems, ok } = await run();
    expect(problems.filter(unexpected)).toEqual([]);
    expect(ok).toBe(true);
    // Each generated script is left out with a warning, and so is each subject's `run_script`
    // action (the Lucky Block's and the Rally Horn's events).
    const notEjected = problems
      .filter((problem) => problem.code === 'export.scripts-not-ejected')
      .map((problem) => problem.file ?? '')
      .sort();
    expect(notEjected).toEqual(
      [
        ...SCRIPT_BOOKS.map((name) => ruleScriptPath(`${NAMESPACE}:${name}`)),
        `msm/${NAMESPACE}/block/lucky_block.json`,
        `msm/${NAMESPACE}/item/rally_horn.json`,
      ].sort(),
    );
    const paths = [...files.keys()];
    const resources = 'src/main/resources';
    for (const path of [
      'build.gradle.kts',
      'gradle.properties',
      'gradlew',
      'README.md',
      `${resources}/fabric.mod.json`,
      `${PKG}/MsmSampleRulesMod.java`,
      `${PKG}/ModBlocks.java`,
      `${PKG}/ModItems.java`,
      `${PKG}/ModEntities.java`,
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
    expect(paths.some((path) => path.includes('/script/') || /\.(ts|js)$/.test(path))).toBe(false);

    const java = [...files.entries()]
      .filter(([path]) => path.endsWith('.java'))
      .map(([, bytes]) => utf8.decode(bytes))
      .join('\n');
    // The plain rules' actions: the chime and the Ruby, the bell, the sparkles and Glowing.
    for (const text of [
      'block.note_block.chime',
      `${NAMESPACE}:ruby`,
      'block.note_block.bell',
      'end_rod',
      'glowing',
    ]) {
      expect(java, text).toContain(text);
    }
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
    const hashFile = join(fixturesRoot, bundle.target.id, 'sample-rules-java.sha256');
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_RULES_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
