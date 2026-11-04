import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createMemoryFileSystem,
  createSaveManifest,
  loadProject,
  type MemoryFileSystem,
  type Project,
  saveProject,
  utf8,
} from '../src/index';
import { testRegistry } from './helpers/kinds';
import { sampleProject } from './helpers/sample';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function expectSameFiles(a: MemoryFileSystem, b: MemoryFileSystem): void {
  const left = a.snapshot();
  const right = b.snapshot();
  expect(Object.keys(right)).toEqual(Object.keys(left));
  for (const path of Object.keys(left)) expect(right[path], path).toEqual(left[path]);
}

async function roundTrip(project: Project, assets: Record<string, Uint8Array> = {}) {
  const registry = testRegistry();
  const first = createMemoryFileSystem(assets);
  await saveProject(first, project, registry);
  const { project: loaded, problems } = await loadProject(first, registry);
  expect(problems).toEqual([]);
  const second = createMemoryFileSystem(assets);
  await saveProject(second, loaded, registry);
  expectSameFiles(first, second);
  return { first, loaded };
}

describe('project round trip', () => {
  it('round-trips a new empty project byte for byte', async () => {
    const { first, loaded } = await roundTrip(createEmptyProject('Empty'));
    expect(first.list()).toEqual(['msm.project.json']);
    expect(utf8.decode(first.snapshot()['msm.project.json'] as Uint8Array)).toBe(
      '{\n  "formatVersion": 1,\n  "name": "Empty",\n  "namespaces": [],\n  "plugins": [],\n  "settings": {},\n  "targets": []\n}\n',
    );
    expect(loaded).toEqual(createEmptyProject('Empty'));
  });

  it('round-trips a sample project with two namespaces, three elements and an asset', async () => {
    const project = sampleProject();
    const { first, loaded } = await roundTrip(project, { 'assets/alpha/textures/thing.png': PNG });
    expect(first.list()).toEqual([
      'assets/alpha/textures/thing.png',
      'content/alpha/thing/gadgets/widget.json',
      'content/alpha/thing/sprocket.json',
      'content/beta/thing/gear.json',
      'msm.project.json',
    ]);
    expect(await first.exists('assets/beta')).toBe(true);
    expect(loaded).toEqual(project);
  });

  it('rewrites identical bytes when saved twice without changes', async () => {
    const registry = testRegistry();
    const fs = createMemoryFileSystem();
    await saveProject(fs, sampleProject(), registry);
    const before = fs.snapshot();
    await saveProject(fs, sampleProject(), registry);
    expect(fs.snapshot()).toEqual(before);
  });

  it('deletes manifest files it no longer writes and the directories they leave empty', async () => {
    const registry = testRegistry();
    const fs = createMemoryFileSystem({
      'content/alpha/thing/old.json': '{}',
      'content/gone/thing/deep/old.json': '{}',
      'content/alpha/thing/readme.txt': 'kept',
    });
    const manifest = createSaveManifest([
      'content/alpha/thing/old.json',
      'content/gone/thing/deep/old.json',
    ]);
    const result = await saveProject(fs, sampleProject(), registry, { manifest });
    expect(result.removed).toEqual([
      'content/alpha/thing/old.json',
      'content/gone/thing/deep/old.json',
    ]);
    expect(fs.list()).toEqual([
      'content/alpha/thing/gadgets/widget.json',
      'content/alpha/thing/readme.txt',
      'content/alpha/thing/sprocket.json',
      'content/beta/thing/gear.json',
      'msm.project.json',
    ]);
    expect(await fs.exists('content/gone')).toBe(false);
    expect(await fs.exists('content')).toBe(true);
  });

  it('never writes the .msm cache directory', async () => {
    const fs = createMemoryFileSystem();
    await saveProject(fs, sampleProject(), testRegistry());
    expect(await fs.exists('.msm')).toBe(false);
  });

  it('keeps elements of unknown kinds lossless under _unknown/', async () => {
    const project = sampleProject();
    const alpha = project.namespaces[0];
    if (alpha === undefined) throw new Error('missing namespace');
    alpha.elements.push({
      data: { x: 1 },
      formatVersion: 1,
      id: 'alpha:zzz',
      kind: 'other:widget',
      meta: { createdAt: '2026-11-04T12:00:00.000Z' },
    });
    const registry = testRegistry();
    const first = createMemoryFileSystem();
    await saveProject(first, project, registry);
    expect(first.list()).toContain('content/alpha/_unknown/other/widget/zzz.json');
    const { project: loaded, problems } = await loadProject(first, registry);
    expect(problems.map((problem) => problem.code)).toEqual(['element.unknown-kind']);
    const second = createMemoryFileSystem();
    await saveProject(second, loaded, registry);
    expectSameFiles(first, second);
  });

  it('refuses to save two elements to the same file', async () => {
    const project = sampleProject();
    const alpha = project.namespaces[0];
    const first = alpha?.elements[0];
    if (alpha === undefined || first === undefined) throw new Error('missing element');
    alpha.elements.push(structuredClone(first));
    await expect(saveProject(createMemoryFileSystem(), project, testRegistry())).rejects.toThrow(
      /Two elements/,
    );
  });
});
