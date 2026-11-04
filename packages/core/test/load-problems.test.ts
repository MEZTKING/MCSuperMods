import { describe, expect, it } from 'vitest';
import {
  createMemoryFileSystem,
  type JsonObject,
  loadProject,
  type Migrator,
  migrateDocument,
  saveProject,
  stableStringify,
  UnsupportedFormatVersionError,
} from '../src/index';
import { testRegistry } from './helpers/kinds';

const projectFile = (namespaces: string[] = ['ns'], extra: JsonObject = {}): string =>
  stableStringify({
    formatVersion: 1,
    name: 'P',
    namespaces,
    plugins: [],
    settings: {},
    targets: [],
    ...extra,
  });

const elementFile = (id: string, kind: string, extra: JsonObject = {}): string =>
  stableStringify({
    data: {},
    formatVersion: 1,
    id,
    kind,
    meta: { createdAt: '2026-11-04T12:00:00.000Z' },
    ...extra,
  });

async function load(files: Record<string, string>) {
  return loadProject(createMemoryFileSystem(files), testRegistry());
}

describe('loadProject problems', () => {
  it('loads elements of unknown kinds and reports them', async () => {
    const { project, problems } = await load({
      'msm.project.json': projectFile(),
      'content/ns/_unknown/other/kind/a.json': elementFile('ns:a', 'other:kind'),
    });
    expect(problems).toMatchObject([
      { code: 'element.unknown-kind', elementId: 'ns:a', severity: 'warning' },
    ]);
    expect(project.namespaces[0]?.elements.map((element) => element.id)).toEqual(['ns:a']);
  });

  it('reports an element whose file is not in its kind folder', async () => {
    const { project, problems } = await load({
      'msm.project.json': projectFile(),
      'content/ns/wrong/a.json': elementFile('ns:a', 'test:thing'),
    });
    expect(problems).toMatchObject([
      { code: 'element.folder-mismatch', elementId: 'ns:a', file: 'content/ns/wrong/a.json' },
    ]);
    expect(project.namespaces[0]?.elements).toHaveLength(1);
  });

  it('uses the file id, not the file name, for the element path', async () => {
    const { problems } = await load({
      'msm.project.json': projectFile(),
      'content/ns/thing/b.json': elementFile('ns:a', 'test:thing'),
    });
    expect(problems.map((problem) => problem.code)).toEqual(['element.folder-mismatch']);
  });

  it('accepts multi-segment kind folders', async () => {
    const { problems } = await load({
      'msm.project.json': projectFile(),
      'content/ns/test/nested/a/b.json': elementFile('ns:a/b', 'test:nested'),
    });
    expect(problems).toEqual([]);
  });

  it('reports invalid JSON and skips the file', async () => {
    const { project, problems } = await load({
      'msm.project.json': projectFile(),
      'content/ns/thing/a.json': '{ not json',
    });
    expect(problems).toMatchObject([
      { code: 'element.invalid-json', severity: 'error', file: 'content/ns/thing/a.json' },
    ]);
    expect(project.namespaces[0]?.elements).toEqual([]);
  });

  it('reports invalid element shapes', async () => {
    const { problems } = await load({
      'msm.project.json': projectFile(),
      'content/ns/thing/a.json': '[]',
      'content/ns/thing/b.json': elementFile('NS:b', 'test:thing'),
      'content/ns/thing/c.json': elementFile('ns:c', 'test:thing', { meta: {} }),
      'content/ns/thing/d.json': elementFile('ns:d', 'test:thing', { formatVersion: 'x' }),
    });
    expect(problems.map((problem) => [problem.code, problem.file])).toEqual([
      ['element.invalid-shape', 'content/ns/thing/a.json'],
      ['element.invalid-shape', 'content/ns/thing/b.json'],
      ['element.invalid-shape', 'content/ns/thing/c.json'],
      ['element.invalid-shape', 'content/ns/thing/d.json'],
    ]);
  });

  it('reports an id whose namespace differs from its directory', async () => {
    const { problems } = await load({
      'msm.project.json': projectFile(['ns', 'other']),
      'content/ns/thing/a.json': elementFile('other:a', 'test:thing'),
    });
    expect(problems).toMatchObject([{ code: 'element.id-mismatch', elementId: 'other:a' }]);
  });

  it('reports duplicate ids and keeps the first', async () => {
    const { project, problems } = await load({
      'msm.project.json': projectFile(),
      'content/ns/test/nested/a.json': elementFile('ns:a', 'test:nested'),
      'content/ns/thing/a.json': elementFile('ns:a', 'test:thing'),
    });
    expect(problems).toMatchObject([
      { code: 'element.duplicate-id', file: 'content/ns/thing/a.json' },
    ]);
    expect(project.namespaces[0]?.elements[0]?.kind).toBe('test:nested');
    expect(project.namespaces[0]?.elements).toHaveLength(1);
  });

  it('creates listed namespaces that are missing on disk', async () => {
    const { project, problems } = await load({ 'msm.project.json': projectFile(['b', 'a']) });
    expect(problems).toEqual([]);
    expect(project.namespaces).toEqual([
      { name: 'a', elements: [], assets: [] },
      { name: 'b', elements: [], assets: [] },
    ]);
  });

  it('adds unlisted namespaces found on disk', async () => {
    const { project, problems } = await load({
      'msm.project.json': projectFile([]),
      'content/extra/thing/a.json': elementFile('extra:a', 'test:thing'),
      'assets/art/textures/a.png': 'png',
    });
    expect(problems).toMatchObject([
      { code: 'project.unlisted-namespace' },
      { code: 'project.unlisted-namespace' },
    ]);
    expect(project.namespaces.map((namespace) => namespace.name)).toEqual(['art', 'extra']);
    expect(project.namespaces[0]?.assets).toEqual([
      { path: 'textures/a.png', mediaType: 'image/png' },
    ]);
  });

  it('sorts elements by id and assets by path', async () => {
    const { project } = await load({
      'msm.project.json': projectFile(),
      'content/ns/test/nested/z.json': elementFile('ns:z', 'test:nested'),
      'content/ns/thing/b.json': elementFile('ns:b', 'test:thing'),
      'content/ns/thing/a/c.json': elementFile('ns:a/c', 'test:thing'),
      'assets/ns/sounds/b.ogg': 'x',
      'assets/ns/a.bbmodel': '{}',
      'assets/ns/.DS_Store': 'x',
    });
    const namespace = project.namespaces[0];
    expect(namespace?.elements.map((element) => element.id)).toEqual(['ns:a/c', 'ns:b', 'ns:z']);
    expect(namespace?.assets).toEqual([
      { path: 'a.bbmodel', mediaType: 'application/json' },
      { path: 'sounds/b.ogg', mediaType: 'audio/ogg' },
    ]);
  });

  it('reports malformed project fields and falls back to defaults', async () => {
    const { project, problems } = await load({
      'msm.project.json': projectFile(['ok', 'Bad'], { name: 3, settings: [] }),
    });
    expect(problems.map((problem) => problem.code)).toEqual([
      'project.invalid-shape',
      'project.invalid-shape',
      'project.invalid-shape',
    ]);
    expect(problems.every((problem) => problem.file === 'msm.project.json')).toBe(true);
    expect(project.name).toBe('');
    expect(project.settings).toEqual({});
    expect(project.namespaces.map((namespace) => namespace.name)).toEqual(['ok']);
  });

  it('throws when the project file is missing or not an object', async () => {
    await expect(load({})).rejects.toThrow(/msm\.project\.json/);
    await expect(load({ 'msm.project.json': '[]' })).rejects.toThrow(/JSON object/);
  });

  it('throws UnsupportedFormatVersionError for a newer project formatVersion', async () => {
    await expect(
      load({ 'msm.project.json': projectFile(['ns'], { formatVersion: 2 }) }),
    ).rejects.toThrow(UnsupportedFormatVersionError);
  });

  it('throws UnsupportedFormatVersionError for a newer element formatVersion', async () => {
    await expect(
      load({
        'msm.project.json': projectFile(),
        'content/ns/thing/a.json': elementFile('ns:a', 'test:thing', { formatVersion: 9 }),
      }),
    ).rejects.toThrow(UnsupportedFormatVersionError);
  });

  it('round-trips a loaded project with problems without losing loadable elements', async () => {
    const files = {
      'msm.project.json': projectFile(),
      'content/ns/wrong/a.json': elementFile('ns:a', 'test:thing'),
    };
    const fs = createMemoryFileSystem(files);
    const registry = testRegistry();
    const { project, manifest } = await loadProject(fs, registry);
    await saveProject(fs, project, registry, { manifest });
    expect(fs.list()).toEqual(['content/ns/thing/a.json', 'msm.project.json']);
    expect((await loadProject(fs, registry)).problems).toEqual([]);
  });
});

describe('migrateDocument', () => {
  const oneToTwo: Migrator = {
    from: 1,
    to: 2,
    migrate: (document) => ({ ...document, renamed: document.old ?? null }),
  };

  it('returns current documents unchanged', () => {
    const document = { formatVersion: 1, a: 1 };
    expect(migrateDocument(document, [], 1)).toBe(document);
  });

  it('applies a 1 -> 2 migrator when the current version is 2', () => {
    expect(migrateDocument({ formatVersion: 1, old: 'x' }, [oneToTwo], 2)).toEqual({
      formatVersion: 2,
      old: 'x',
      renamed: 'x',
    });
  });

  it('chains migrators in order', () => {
    const twoToThree: Migrator = {
      from: 2,
      to: 3,
      migrate: ({ renamed, old: _old, ...rest }) => ({ ...rest, final: renamed ?? null }),
    };
    expect(migrateDocument({ formatVersion: 1, old: 'y' }, [twoToThree, oneToTwo], 3)).toEqual({
      formatVersion: 3,
      final: 'y',
    });
  });

  it('throws on a gap in the chain', () => {
    const twoToThree: Migrator = { from: 2, to: 3, migrate: (document) => document };
    expect(() => migrateDocument({ formatVersion: 1 }, [twoToThree], 3)).toThrow(
      UnsupportedFormatVersionError,
    );
    const oneToThree: Migrator = { from: 1, to: 3, migrate: (document) => document };
    expect(() => migrateDocument({ formatVersion: 1 }, [oneToThree], 3)).toThrow(
      UnsupportedFormatVersionError,
    );
  });

  it('throws on newer, missing or invalid versions', () => {
    expect(() => migrateDocument({ formatVersion: 3 }, [], 2)).toThrow(
      UnsupportedFormatVersionError,
    );
    expect(() => migrateDocument({}, [], 1)).toThrow(UnsupportedFormatVersionError);
    expect(() => migrateDocument({ formatVersion: 1.5 }, [], 2)).toThrow(
      UnsupportedFormatVersionError,
    );
  });
});
