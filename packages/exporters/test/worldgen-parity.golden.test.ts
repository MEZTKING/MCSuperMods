/**
 * Golden over the worldgen parity fixture (`fixtures/worldgen-parity`, ADR 0119 D13; plan brief
 * B581): for every built-in target with a project folder there (`<target id>/`), MSM's own data
 * pack export of that project must equal the committed `<target id>/lowered/data/` file for file,
 * each file the same JSON (`make_fixture.py` writes whole-number floats as `1.0` where MSM's
 * export writes `1`; the values are the same). The real game's expectations (`expectations.json`)
 * and `@msm/terrain`'s parity test both read `lowered/`, so this pins them to what MSM exports.
 * The fixture's `make_fixture.py` writes both; after changing it, the two must still agree.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type DirEntry,
  ElementKindRegistry,
  loadProject,
  type ProjectFileSystem,
  registerPlugin,
} from '@msm/core';
import type { Project } from '@msm/plugin-api';
import dataPackPlugin from '@msm/plugin-datapack';
import worldgenPlugin from '@msm/plugin-worldgen';
import { createRegistryIndex, createSchemaIndex, parseVanillaMcdocSymbols } from '@msm/schemas';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createZipSink, dataPackExporter, runExport } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, '..', '..', '..', 'fixtures', 'worldgen-parity');

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const readOnly = async (): Promise<never> => {
  throw new Error('The fixture project is read-only in tests.');
};

/** A read-only file system over one target's fixture project. */
function projectFs(root: string): ProjectFileSystem {
  const resolve = (path: string) => join(root, ...path.split('/'));
  return {
    readFile: async (path) => new Uint8Array(await readFile(resolve(path))),
    async readDir(path) {
      const entries = await readdir(resolve(path), { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() || entry.isDirectory())
        .map(
          (entry): DirEntry => ({
            name: entry.name,
            kind: entry.isDirectory() ? 'directory' : 'file',
          }),
        );
    },
    exists: (path) => exists(resolve(path)),
    writeFile: readOnly,
    mkdirp: readOnly,
    remove: readOnly,
  };
}

async function walk(dir: string, out: string[] = []): Promise<string[]> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, out);
    else out.push(path);
  }
  return out;
}

/** The ids the project defines per registry, as the app's session declares them. */
function projectIds(project: Project): Record<string, string[]> {
  const ids: Record<string, string[]> = {};
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      const registry = element.kind.replace(/^minecraft:/, '');
      const list = ids[registry] ?? [];
      list.push(element.id);
      ids[registry] = list;
    }
  }
  for (const list of Object.values(ids)) list.sort();
  return ids;
}

const nodeReadFile = async (url: URL): Promise<Uint8Array> => readFile(url);

async function exportData(bundle: TargetBundle, root: string): Promise<Record<string, Uint8Array>> {
  const registry = new ElementKindRegistry();
  registerPlugin(registry, dataPackPlugin);
  registerPlugin(registry, worldgenPlugin);
  const fs = projectFs(root);
  const { project, problems } = await loadProject(fs, registry);
  expect(problems).toEqual([]);
  expect(project.targets).toEqual([bundle.target.id]);
  const [symbols, vanilla] = await Promise.all([
    readVendoredJson(bundle, 'vanillaMcdocSymbols', nodeReadFile),
    readVendoredJson(bundle, 'mcmetaRegistries', nodeReadFile),
  ]);
  const sink = createZipSink();
  const report = await runExport({
    project,
    registry,
    target: bundle.target,
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    registries: createRegistryIndex({
      vanilla: vanilla as Record<string, string[]>,
      project: projectIds(project),
    }),
    exporter: dataPackExporter,
    sink,
    readAsset: (namespace, path) => fs.readFile(`assets/${namespace}/${path}`),
    meta: { msmVersion: '0.2.0', plugins: ['msm.datapack', 'msm.worldgen'] },
  });
  expect(report.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  expect(report.ok).toBe(true);
  const files = unzipSync(await sink.finish());
  return Object.fromEntries(Object.entries(files).filter(([path]) => path.startsWith('data/')));
}

const withFixture = (
  await Promise.all(
    builtInTargets.map(async (bundle) => ({
      bundle,
      root: join(fixtureRoot, bundle.target.id),
      present: await exists(join(fixtureRoot, bundle.target.id, 'lowered')),
    })),
  )
).filter((entry) => entry.present);

describe('worldgen parity fixture export', () => {
  it('has a project for every target the expectations measure', async () => {
    const expectations = JSON.parse(
      await readFile(join(fixtureRoot, 'expectations.json'), 'utf8'),
    ) as { targets: Record<string, unknown> };
    expect(withFixture.map((entry) => entry.bundle.target.id).sort()).toEqual(
      Object.keys(expectations.targets).sort(),
    );
  });

  describe.each(withFixture.map((entry) => [entry.bundle.target.id, entry] as const))(
    '%s',
    (_id, { bundle, root }) => {
      it('exports exactly the committed lowered data pack', async () => {
        const exported = await exportData(bundle, root);
        const loweredRoot = join(root, 'lowered');
        const committed: Record<string, string> = {};
        for (const path of await walk(join(loweredRoot, 'data'))) {
          committed[relative(loweredRoot, path).split(sep).join('/')] = await readFile(
            path,
            'utf8',
          );
        }
        const decoder = new TextDecoder();
        expect(Object.keys(exported).sort()).toEqual(Object.keys(committed).sort());
        for (const [path, bytes] of Object.entries(exported)) {
          expect(JSON.parse(decoder.decode(bytes)), path).toEqual(
            JSON.parse(committed[path] as string),
          );
        }
      });
    },
  );
});
