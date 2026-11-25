/**
 * Lowering test of the live views parity fixture (`fixtures/live-views`, ADR 0120 D9; plan brief
 * B607): the project loads with no problem, and MSM's data pack export of it, for every built-in
 * target, has no error and equals the committed `lowered/data/` file for file (JSON files as the
 * same JSON, functions as the same text). The parity build packs `lowered/data/` into the jar the
 * real server measures (`expectations.json`), and `@msm/sim`'s parity test plays the same files,
 * so this pins both to what MSM exports. `make_fixture.py` writes the project and `lowered/`;
 * after changing it, the two must still agree.
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
import type { Problem, Project } from '@msm/plugin-api';
import dataPackPlugin from '@msm/plugin-datapack';
import { createRegistryIndex, createSchemaIndex, parseVanillaMcdocSymbols } from '@msm/schemas';
import { collectProjectObjectives, createMcfunctionService } from '@msm/schemas/mcfunction';
import { builtInTargets, readVendoredJson, type TargetBundle } from '@msm/targets';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createZipSink, dataPackExporter, runExport } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, '..', '..', '..', 'fixtures', 'live-views');

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

async function load(): Promise<{ project: Project; registry: ElementKindRegistry }> {
  const registry = new ElementKindRegistry();
  registerPlugin(registry, dataPackPlugin);
  const { project, problems } = await loadProject(projectFs(fixtureRoot), registry);
  expect(problems).toEqual([]);
  return { project, registry };
}

async function exportData(bundle: TargetBundle): Promise<Record<string, Uint8Array>> {
  const { project, registry } = await load();
  const read = (key: Parameters<typeof readVendoredJson>[1]) =>
    readVendoredJson(bundle, key, nodeReadFile);
  const [symbols, vanilla, commands, blocks] = await Promise.all([
    read('vanillaMcdocSymbols'),
    read('mcmetaRegistries'),
    read('mcmetaCommands'),
    read('mcmetaBlocks'),
  ]);
  const ids = projectIds(project);
  const mcfunction = await createMcfunctionService(
    { commands, blocks, registries: vanilla as Record<string, string[]> },
    { mcVersion: bundle.target.mcVersion },
  );
  const functionLines: string[] = [];
  for (const namespace of project.namespaces) {
    for (const element of namespace.elements) {
      if (element.kind === 'minecraft:function') {
        functionLines.push(...((element.data as { lines: string[] }).lines ?? []));
      }
    }
  }
  const checkIds = {
    function: ids.function ?? [],
    predicate: ids.predicate ?? [],
    'tag/function': ['minecraft:load', 'minecraft:tick'],
    objective: collectProjectObjectives([functionLines.join('\n')]),
  };
  const utf8 = new TextDecoder();
  const sink = createZipSink();
  const report = await runExport({
    project: { ...project, targets: [bundle.target.id] },
    registry,
    target: bundle.target,
    schemaIndex: createSchemaIndex(parseVanillaMcdocSymbols(symbols), {
      mcVersion: bundle.target.mcVersion,
    }),
    registries: createRegistryIndex({
      vanilla: vanilla as Record<string, string[]>,
      project: ids,
    }),
    exporter: dataPackExporter,
    sink,
    readAsset: async () => {
      throw new Error('The fixture has no assets.');
    },
    meta: { msmVersion: '0.2.0', plugins: ['msm.datapack'] },
    async validateText(file) {
      if (file.language !== 'mcfunction') return [];
      const source = utf8.decode(file.contents as Uint8Array).replace(/\n$/, '');
      const found = await mcfunction.check(source, {
        uri: `file:///msm/${file.path}`,
        projectIds: checkIds,
      });
      return found.map(
        (problem): Problem => ({
          severity: problem.severity,
          code: problem.code,
          message: `line ${problem.line + 1}: ${problem.message}`,
          file: file.path,
        }),
      );
    },
  });
  expect(report.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  // The only warnings are the tags' deliberately missing entries.
  for (const problem of report.problems) {
    expect(problem.message).toMatch(
      /^data\/live_views\/tags\/item\/with_(missing|optional)\.json: /,
    );
  }
  expect(report.ok).toBe(true);
  const files = unzipSync(await sink.finish());
  return Object.fromEntries(Object.entries(files).filter(([path]) => path.startsWith('data/')));
}

describe('live views parity fixture', () => {
  it('loads with no problem, for a built-in target', async () => {
    const { project } = await load();
    expect(project.targets).toHaveLength(1);
    expect(builtInTargets.map((bundle) => bundle.target.id)).toContain(project.targets[0]);
    const count = project.namespaces.reduce((n, namespace) => n + namespace.elements.length, 0);
    expect(count).toBeGreaterThan(100);
  });

  describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
    '%s',
    (_id, bundle) => {
      // Genuinely heavy: a whole data pack export for the target, checked against its mcdoc
      // schemas and every function line through the offline Spyglass service built for that
      // target (nothing to share between targets). 1 to 2 s alone, 2.2 to 3.4 s on CI and 5.3 s
      // once here under load (B714), against Vitest's 5 s default.
      it('exports exactly the committed lowered data pack', { timeout: 30_000 }, async () => {
        const exported = await exportData(bundle);
        const loweredRoot = join(fixtureRoot, 'lowered');
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
          const text = decoder.decode(bytes);
          if (path.endsWith('.json')) {
            expect(JSON.parse(text), path).toEqual(JSON.parse(committed[path] as string));
          } else {
            expect(text, path).toBe(committed[path]);
          }
        }
      });
    },
  );
});
