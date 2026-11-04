import { describe, expect, it } from 'vitest';
import {
  CommandStack,
  commands,
  createElement,
  createMemoryFileSystem,
  loadProject,
  saveProject,
  stableStringify,
} from '../src/index';
import { fixedNow, testRegistry } from './helpers/kinds';

const projectFile = stableStringify({
  formatVersion: 1,
  name: 'P',
  namespaces: ['ns'],
  plugins: [],
  settings: {},
  targets: [],
});

const elementFile = (id: string, kind = 'test:thing'): string =>
  stableStringify({
    data: { id },
    formatVersion: 1,
    id,
    kind,
    meta: { createdAt: '2026-11-04T12:00:00.000Z' },
  });

describe('SaveManifest (ADR 0012)', () => {
  it('lists exactly the element files load read, sorted', async () => {
    const fs = createMemoryFileSystem({
      'msm.project.json': projectFile,
      'content/ns/thing/b.json': elementFile('ns:b'),
      'content/ns/thing/a.json': elementFile('ns:a'),
      'content/ns/thing/bad.json': '{ not json',
      'content/ns/test/nested/a.json': elementFile('ns:a', 'test:nested'),
      'content/ns/thing/notes.txt': 'not an element',
    });
    const { manifest, problems } = await loadProject(fs, testRegistry());
    expect(manifest).toEqual({
      formatVersion: 1,
      elementFiles: ['content/ns/test/nested/a.json', 'content/ns/thing/b.json'],
    });
    expect(problems.map((problem) => [problem.code, problem.file])).toEqual([
      ['element.duplicate-id', 'content/ns/thing/a.json'],
      ['element.invalid-json', 'content/ns/thing/bad.json'],
    ]);
  });

  it('leaves a stray invalid file untouched on save', async () => {
    const fs = createMemoryFileSystem({
      'msm.project.json': projectFile,
      'content/ns/thing/a.json': elementFile('ns:a'),
      'content/ns/thing/broken.json': '{ not json',
    });
    const registry = testRegistry();
    const { project, manifest, problems } = await loadProject(fs, registry);
    expect(problems.map((problem) => problem.severity)).toEqual(['error']);
    const result = await saveProject(fs, project, registry, { manifest });
    expect(result.removed).toEqual([]);
    expect(fs.list()).toEqual([
      'content/ns/thing/a.json',
      'content/ns/thing/broken.json',
      'msm.project.json',
    ]);
    expect(fs.snapshot()['content/ns/thing/broken.json']).toEqual(
      new TextEncoder().encode('{ not json'),
    );
  });

  it('deletes the file of a removed element and returns the new manifest', async () => {
    const fs = createMemoryFileSystem({
      'msm.project.json': projectFile,
      'content/ns/thing/a.json': elementFile('ns:a'),
      'content/ns/thing/deep/b.json': elementFile('ns:deep/b'),
    });
    const registry = testRegistry();
    const loaded = await loadProject(fs, registry);
    const stack = new CommandStack(loaded.project);
    stack.execute(commands.removeElement('ns:deep/b'));
    const result = await saveProject(fs, stack.state, registry, { manifest: loaded.manifest });
    expect(result).toEqual({
      manifest: { formatVersion: 1, elementFiles: ['content/ns/thing/a.json'] },
      written: ['content/ns/thing/a.json', 'msm.project.json'],
      removed: ['content/ns/thing/deep/b.json'],
    });
    expect(fs.list()).toEqual(['content/ns/thing/a.json', 'msm.project.json']);
    expect(await fs.exists('content/ns/thing/deep')).toBe(false);
    expect(await fs.exists('content/ns/thing')).toBe(true);
  });

  it('deletes the old path of a moved element', async () => {
    const fs = createMemoryFileSystem({
      'msm.project.json': projectFile,
      'content/ns/wrong/place/a.json': elementFile('ns:a'),
    });
    const registry = testRegistry();
    const { project, manifest } = await loadProject(fs, registry);
    const result = await saveProject(fs, project, registry, { manifest });
    expect(result.removed).toEqual(['content/ns/wrong/place/a.json']);
    expect(fs.list()).toEqual(['content/ns/thing/a.json', 'msm.project.json']);
    expect(await fs.exists('content/ns/wrong')).toBe(false);
  });

  it('deletes nothing without a manifest', async () => {
    const fs = createMemoryFileSystem({
      'msm.project.json': projectFile,
      'content/ns/thing/a.json': elementFile('ns:a'),
      'content/ns/thing/b.json': elementFile('ns:b'),
    });
    const registry = testRegistry();
    const { project } = await loadProject(fs, registry);
    const stack = new CommandStack(project);
    stack.execute(commands.removeElement('ns:b'));
    const result = await saveProject(fs, stack.state, registry);
    expect(result.removed).toEqual([]);
    expect(fs.list()).toContain('content/ns/thing/b.json');
  });

  it('never deletes manifest entries outside content/ or that are not JSON', async () => {
    const fs = createMemoryFileSystem({
      'msm.project.json': projectFile,
      'assets/ns/a.json': '{}',
      'content/ns/thing/keep.txt': 'x',
    });
    const registry = testRegistry();
    const { project } = await loadProject(fs, registry);
    const result = await saveProject(fs, project, registry, {
      manifest: {
        formatVersion: 1,
        elementFiles: [
          'assets/ns/a.json',
          'content/ns/thing/keep.txt',
          '../x.json',
          'msm.project.json',
        ],
      },
    });
    expect(result.removed).toEqual([]);
    expect(fs.list()).toEqual([
      'assets/ns/a.json',
      'content/ns/thing/keep.txt',
      'msm.project.json',
    ]);
  });

  it('chains manifests across saves', async () => {
    const fs = createMemoryFileSystem({ 'msm.project.json': projectFile });
    const registry = testRegistry();
    const loaded = await loadProject(fs, registry);
    const stack = new CommandStack(loaded.project);
    stack.execute(
      commands.addElement(
        createElement({ id: 'ns:a', kind: 'test:thing', data: {}, now: fixedNow }),
      ),
    );
    const first = await saveProject(fs, stack.state, registry, { manifest: loaded.manifest });
    expect(first.manifest.elementFiles).toEqual(['content/ns/thing/a.json']);
    stack.undo();
    const second = await saveProject(fs, stack.state, registry, { manifest: first.manifest });
    expect(second.removed).toEqual(['content/ns/thing/a.json']);
    expect(second.manifest.elementFiles).toEqual([]);
    expect(await fs.exists('content/ns')).toBe(false);
  });
});
