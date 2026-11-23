/**
 * Golden over the Java project eject of `fixtures/sample-particles` (ADR 0033, ADR 0080 D11,
 * plan B358): three particle types, two blocks with ambient particles (a project particle and a
 * dust options object), three items sending particles (`motion`, an options object, `force`),
 * an effect naming a project particle, a function and a script.
 *
 * - The export succeeds without errors; its warnings are only project ids the vanilla
 *   registries do not know and the one script, which is not ejected
 *   (`export.scripts-not-ejected`); the project's files and contents hash to the value pinned in
 *   `test/fixtures/<target id>/sample-particles-java.sha256` in two time zones (with a stub
 *   Gradle wrapper, so the pin does not follow the engine-mod wrapper).
 * - The layout holds the Gradle files, `ModParticles.java`, the client particle classes copied
 *   from the runtime (`client/particle/ModParticle`, `ModParticleProvider`, `ParticleLook`),
 *   `particle/ParticleSpecs` and `particle/AmbientParticles`, the descriptions and frames, the
 *   function as data, and no `msm/` definitions and no script.
 * - With `MSM_SAMPLE_PARTICLES_JAVA_OUT` (a folder), the project is written there with the real
 *   wrapper from `engine-mod/` for `./gradlew build` (CI's ejected build).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ElementKindRegistry, registerPlugin, utf8 } from '@msm/core';
import type { Plugin, Problem } from '@msm/plugin-api';
import blocksItemsPlugin from '@msm/plugin-blocks-items';
import dataPackPlugin from '@msm/plugin-datapack';
import resourcePackPlugin from '@msm/plugin-resourcepack';
import scriptingPlugin from '@msm/plugin-scripting';
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
const sampleRoot = join(repoRoot, 'fixtures', 'sample-particles');
const fixturesRoot = join(repoRoot, 'packages', 'exporters', 'test', 'fixtures');
const TIME_ZONES = ['Pacific/Kiritimati', 'America/Los_Angeles'] as const;
const PLUGINS: readonly Plugin[] = [
  resourcePackPlugin,
  dataPackPlugin,
  blocksItemsPlugin,
  scriptingPlugin,
];
const registry = new ElementKindRegistry();
for (const plugin of PLUGINS) registerPlugin(registry, plugin);
const meta = {
  msmVersion: '1.4.0',
  plugins: ['msm.blocks-items', 'msm.datapack', 'msm.scripting'],
};
const NAMESPACE = 'msm_sample_particles';
const PKG = `src/main/java/${NAMESPACE}`;
const PARTICLES = ['bubble', 'petal', 'spark'] as const;
const FRAMES = 4;
/** Warnings the eject may give: project ids and the script it leaves out. */
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

describe.each(
  builtInTargets
    .filter((bundle) => bundle.target.loadJavaProject !== undefined)
    .map((bundle) => [bundle.target.id, bundle] as const),
)('sample particles Java project (%s)', (_id, bundle) => {
  const run = (wrapper = STUB_WRAPPER) =>
    exportJavaProject({ root: sampleRoot, registry, bundle, meta, wrapper });

  it('exports with no errors and the expected layout', async () => {
    const { files, problems, ok } = await run();
    expect(problems.filter(unexpected)).toEqual([]);
    expect(ok).toBe(true);
    // The script is left out, with one warning naming it.
    const scripts = problems.filter((problem) => problem.code === 'export.scripts-not-ejected');
    expect(scripts.length).toBe(1);
    const paths = [...files.keys()];
    const resources = 'src/main/resources';
    const data = bundle.target.folders.data;
    const descriptionFolder = bundle.target.particles?.descriptionFolder ?? 'particles';
    const textureFolder = bundle.target.particles?.textureFolder ?? 'particle';
    for (const path of [
      'build.gradle.kts',
      'gradle.properties',
      'gradlew',
      'README.md',
      `${resources}/fabric.mod.json`,
      `${PKG}/MsmSampleParticlesMod.java`,
      `${PKG}/ModBlocks.java`,
      `${PKG}/ModItems.java`,
      `${PKG}/ModParticles.java`,
      `${PKG}/particle/ParticleSpecs.java`,
      `${PKG}/particle/AmbientParticles.java`,
      `${PKG}/client/particle/ModParticle.java`,
      `${PKG}/client/particle/ModParticleProvider.java`,
      `${PKG}/client/particle/ParticleLook.java`,
      `${resources}/data/${NAMESPACE}/${data.function}/burst.mcfunction`,
      ...PARTICLES.map(
        (name) => `${resources}/assets/${NAMESPACE}/${descriptionFolder}/${name}.json`,
      ),
      ...PARTICLES.flatMap((name) =>
        Array.from(
          { length: FRAMES },
          (_, frame) =>
            `${resources}/assets/${NAMESPACE}/textures/${textureFolder}/${name}_${frame}.png`,
        ),
      ),
    ]) {
      expect(paths, path).toContain(path);
    }
    expect(paths.some((path) => path.startsWith('msm/') || path.includes('/msm/'))).toBe(false);
    expect(paths.some((path) => path.includes('/script/') || /\.(ts|js)$/.test(path))).toBe(false);

    const java = (path: string): string => utf8.decode(files.get(`${PKG}/${path}`) as Uint8Array);
    const particles = java('ModParticles.java');
    for (const name of PARTICLES) expect(particles, name).toContain(`"${name}"`);
    expect(particles).toContain('FabricParticleTypes.simple(');
    const modJson = JSON.parse(
      utf8.decode(files.get(`${resources}/fabric.mod.json`) as Uint8Array),
    ) as {
      depends: Record<string, string>;
      entrypoints: Record<string, unknown>;
    };
    expect(modJson.depends.msm_runtime).toBeUndefined();
    // The particle providers are registered from the client entrypoint.
    expect(modJson.entrypoints.client).toBeDefined();
  });

  it('has the recorded tree SHA-256 in two time zones', async () => {
    const hashes: string[] = [];
    for (const zone of TIME_ZONES) {
      await inTimeZone(zone, async () => {
        hashes.push(treeHash((await run()).files));
      });
    }
    expect(new Set(hashes).size).toBe(1);
    const hashFile = join(fixturesRoot, bundle.target.id, 'sample-particles-java.sha256');
    const actual = hashes[0] as string;
    if (update) {
      await mkdir(dirname(hashFile), { recursive: true });
      await writeFile(hashFile, `${actual}\n`);
    }
    expect(actual).toBe((await readFile(hashFile, 'utf8')).trim());
  });

  const outDir = process.env.MSM_SAMPLE_PARTICLES_JAVA_OUT;
  it.runIf(outDir !== undefined && bundle === selectedTarget())(
    'writes the project with the real Gradle wrapper for the ejected build',
    async () => {
      const { files, ok } = await run(await engineModWrapper());
      expect(ok).toBe(true);
      await writeTree(files, outDir as string);
    },
  );
});
