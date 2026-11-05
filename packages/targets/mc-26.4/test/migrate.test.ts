/**
 * `migrateFrom` (ADR 0037 D3) over the committed sample worldgen project
 * (`fixtures/sample-worldgen`, read straight from its element files) plus one element per
 * removed id.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Element, Json, Namespace, Project, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { target } from '../src/index';
import { createMigrateFrom, MigrationProblemCodes, migrationTables } from '../src/migrate';
import { MOVED_REGISTRIES, REMOVED_IDS, STILL_REGISTERED_ELSEWHERE } from '../src/removed-ids';

const SAMPLE = fileURLToPath(new URL('../../../../fixtures/sample-worldgen/', import.meta.url));
const PREVIOUS_ID = 'mc-26.3';

/** A stand-in for the previous target: only `id` matters to the hook. */
const previous = { ...target, id: PREVIOUS_ID } as Target;

async function jsonFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await jsonFiles(path)));
    else if (entry.name.endsWith('.json')) out.push(path);
  }
  return out.sort();
}

async function loadSample(): Promise<Project> {
  const header = JSON.parse(await readFile(join(SAMPLE, 'msm.project.json'), 'utf8')) as {
    name: string;
    namespaces: string[];
    targets: string[];
    plugins: string[];
  };
  const namespaces: Namespace[] = [];
  for (const name of header.namespaces) {
    const elements: Element[] = [];
    for (const file of await jsonFiles(join(SAMPLE, 'content', name))) {
      elements.push(JSON.parse(await readFile(file, 'utf8')) as Element);
    }
    namespaces.push({ name, elements, assets: [] });
  }
  return {
    formatVersion: 1,
    name: header.name,
    namespaces,
    targets: header.targets,
    plugins: header.plugins,
    settings: {},
  };
}

function element(id: string, kind: string, data: Json): Element {
  return {
    formatVersion: 1,
    id: id as Element['id'],
    kind,
    data,
    meta: { createdAt: '2026-11-05T00:00:00.000Z' },
  } as Element;
}

/** The removed ids the hook reports, as `[registry, id]` (moved registries excluded). */
const REPORTED = Object.entries(REMOVED_IDS)
  .filter(([registry]) => !(registry in MOVED_REGISTRIES))
  .flatMap(([registry, ids]) => ids.map((id) => [registry, id] as const));

/** One element naming `id` the way data names an id of `registry`. */
function elementFor(registry: string, id: string, index: number): Element {
  const elementId = `test:removed_${index}`;
  if (registry.startsWith('tag/')) {
    return element(elementId, 'minecraft:tag/entity_type', { values: [`#minecraft:${id}`] });
  }
  if (STILL_REGISTERED_ELSEWHERE[registry]?.[id] !== undefined) {
    return element(elementId, 'minecraft:worldgen/feature', { type: `minecraft:${id}` });
  }
  // Nested a few levels deep, once with the namespace and once without.
  return element(elementId, 'test:any', {
    outer: { list: [{ id: index % 2 === 0 ? `minecraft:${id}` : id }] },
  });
}

describe('migrateFrom (mc-26.3 → this target)', () => {
  it('has the hook and takes nothing from the sample worldgen project', async () => {
    expect(target.migrateFrom).toBeTypeOf('function');
    const project = await loadSample();
    expect(project.targets).toEqual([PREVIOUS_ID]);
    expect(project.namespaces.flatMap((ns) => ns.elements).length).toBeGreaterThan(10);
    // The sample uses rule tests (minecraft:block_match …), whose registry only moved.
    expect(JSON.stringify(project)).toContain('minecraft:block_match');
    const report = target.migrateFrom?.(previous, project);
    expect(report).toEqual({ changes: [], problems: [] });
  });

  it('reports every removed id once, with element, pointer, registry and id', async () => {
    const project = await loadSample();
    const added = REPORTED.map(([registry, id], index) => elementFor(registry, id, index));
    project.namespaces.push({ name: 'test', elements: added, assets: [] });
    const before = structuredClone(project);
    const report = target.migrateFrom?.(previous, project);
    expect(project).toEqual(before);
    expect(report?.changes).toEqual([]);
    const problems = report?.problems ?? [];
    expect(problems).toHaveLength(REPORTED.length);
    REPORTED.forEach(([registry, id], index) => {
      const problem = problems[index];
      expect(problem, `${registry} ${id}`).toMatchObject({
        severity: 'error',
        code: MigrationProblemCodes.removedId,
        elementId: `test:removed_${index}`,
      });
      const shown = registry.startsWith('tag/') ? `#minecraft:${id}` : `minecraft:${id}`;
      expect(problem?.message).toContain(shown);
      expect(problem?.message).toContain(`registry ${registry}`);
      expect(problem?.message).toContain(target.mcVersion);
      const path = registry.startsWith('tag/')
        ? '/values/0'
        : STILL_REGISTERED_ELSEWHERE[registry]?.[id] !== undefined
          ? '/type'
          : '/outer/list/0/id';
      expect(problem?.path, `${registry} ${id}`).toBe(path);
    });
  });

  it('names the replacement of large_dripstone and does not rewrite it (shape differs)', () => {
    const project: Project = {
      formatVersion: 1,
      name: 'Dripstone',
      namespaces: [
        {
          name: 'test',
          elements: [
            element('test:caves', 'minecraft:worldgen/feature', {
              type: 'minecraft:large_dripstone',
              floor_to_ceiling_search_range: 30,
            }),
            // The vanilla configured and placed features keep the name: not reported.
            element('test:caves_placed', 'minecraft:worldgen/placed_feature', {
              feature: 'minecraft:large_dripstone',
              placement: [],
            }),
          ],
          assets: [],
        },
      ],
      targets: [PREVIOUS_ID],
      plugins: [],
      settings: {},
    };
    const report = target.migrateFrom?.(previous, project);
    expect(report?.changes).toEqual([]);
    expect(report?.problems).toHaveLength(1);
    expect(report?.problems[0]).toMatchObject({ elementId: 'test:caves', path: '/type' });
    expect(report?.problems[0]?.message).toContain('minecraft:large_speleothem');
    expect(report?.problems[0]?.message).toContain('base_block');
  });

  it('applies a rename whose shape matches as one update change with data', () => {
    const migrate = createMigrateFrom({
      ...migrationTables(target.id, target.mcVersion),
      renames: [
        { registry: 'fluid', from: 'flowing_water', to: 'water', sameShape: true },
        {
          registry: 'tag/entity_type',
          from: 'ignores_poison_and_regen',
          to: 'undead',
          sameShape: true,
        },
      ],
    });
    const data = {
      fluids: ['minecraft:flowing_water', 'flowing_water', 'minecraft:lava'],
      tag: '#minecraft:ignores_poison_and_regen',
      sound: 'minecraft:intentionally_empty',
    };
    const project: Project = {
      formatVersion: 1,
      name: 'Rename',
      namespaces: [{ name: 'test', elements: [element('test:one', 'test:any', data)], assets: [] }],
      targets: [PREVIOUS_ID],
      plugins: [],
      settings: {},
    };
    const before = structuredClone(project);
    const report = migrate(previous, project);
    expect(project).toEqual(before);
    expect(report.changes).toHaveLength(1);
    expect(report.changes[0]).toMatchObject({
      elementId: 'test:one',
      kind: 'update',
      data: {
        fluids: ['minecraft:water', 'minecraft:water', 'minecraft:lava'],
        tag: '#minecraft:undead',
        sound: 'minecraft:intentionally_empty',
      },
    });
    expect(report.changes[0]?.description).toContain('minecraft:flowing_water → minecraft:water');
    expect(report.problems.map((problem) => problem.path)).toEqual(['/sound']);
  });

  it('ignores ids of other namespaces and plain strings that only look alike', () => {
    const project: Project = {
      formatVersion: 1,
      name: 'Other',
      namespaces: [
        {
          name: 'test',
          elements: [
            element('test:one', 'test:any', {
              a: 'mymod:flowing_water',
              b: 'minecraft:freeze_immune_entity_types',
              c: '#minecraft:flowing_water',
              d: 'minecraft:interpolated_noise',
            }),
          ],
          assets: [],
        },
      ],
      targets: [PREVIOUS_ID],
      plugins: [],
      settings: {},
    };
    expect(target.migrateFrom?.(previous, project)).toEqual({ changes: [], problems: [] });
  });

  it('needs nothing for a project already on this target', () => {
    const project: Project = {
      formatVersion: 1,
      name: 'Same',
      namespaces: [
        {
          name: 'test',
          elements: [element('test:one', 'test:any', { a: 'minecraft:flowing_water' })],
          assets: [],
        },
      ],
      targets: [target.id],
      plugins: [],
      settings: {},
    };
    expect(target.migrateFrom?.(target, project)).toEqual({ changes: [], problems: [] });
  });

  it('reports one target.no-migration-path problem for an unknown previous target', () => {
    const project: Project = {
      formatVersion: 1,
      name: 'Old',
      namespaces: [],
      targets: ['mc-0.0'],
      plugins: [],
      settings: {},
    };
    const report = target.migrateFrom?.({ ...target, id: 'mc-0.0' } as Target, project);
    expect(report?.changes).toEqual([]);
    expect(report?.problems).toHaveLength(1);
    expect(report?.problems[0]?.code).toBe(MigrationProblemCodes.noMigrationPath);
    expect(report?.problems[0]?.message).toContain('mc-0.0');
  });
});
