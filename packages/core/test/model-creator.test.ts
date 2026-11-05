import { describe, expect, it } from 'vitest';
import {
  createElement,
  createEmptyProject,
  createMemoryFileSystem,
  type ElementCreatorMeta,
  loadProject,
  type Project,
  saveProject,
  utf8,
} from '../src/index';
import { fixedNow, testRegistry } from './helpers/kinds';

/** `meta.creator` (ADR 0043 D4): written by the Creator, kept through load and save. */
const creator = (): ElementCreatorMeta => ({
  flowId: 'gear-set',
  setId: '0b8f7d4e-2c1a-4a59-9a6e-3f5d2b1c0e7a',
  values: {
    colour: '#d01a3c',
    custom_durability: 900,
    material_name: 'Ruby',
    pieces: ['sword', 'helmet'],
    use_ore: true,
  },
  generatedId: 'alpha:ruby_sword',
});

const projectWith = (meta: ElementCreatorMeta | undefined): Project => {
  const project = createEmptyProject('Creator', { targets: ['mc-1.0'] });
  project.namespaces = [
    {
      name: 'alpha',
      elements: [
        createElement({
          id: 'alpha:ruby_sword',
          kind: 'test:thing',
          data: { size: 1 },
          now: fixedNow,
          ...(meta === undefined ? {} : { creator: meta }),
        }),
      ],
      assets: [],
    },
  ];
  return project;
};

describe('ElementMeta.creator', () => {
  it('is set by createElement as a copy of the input', () => {
    const input = creator();
    const element = createElement({
      id: 'alpha:ruby_sword',
      kind: 'test:thing',
      data: {},
      now: fixedNow,
      creator: input,
    });
    expect(element.meta.creator).toEqual(creator());
    (input.values.pieces as string[]).push('boots');
    expect(element.meta.creator?.values.pieces).toEqual(['sword', 'helmet']);
  });

  it('is absent unless given', () => {
    const element = createElement({ id: 'alpha:x', kind: 'test:thing', data: {}, now: fixedNow });
    expect(element.meta).toEqual({ createdAt: fixedNow() });
    expect('creator' in element.meta).toBe(false);
  });

  it('round-trips through save and load with sorted keys', async () => {
    const registry = testRegistry();
    const fs = createMemoryFileSystem();
    const project = projectWith(creator());
    await saveProject(fs, project, registry);
    const text = utf8.decode(fs.snapshot()['content/alpha/thing/ruby_sword.json'] as Uint8Array);
    const document = JSON.parse(text) as { meta: { creator: Record<string, unknown> } };
    expect(Object.keys(document.meta.creator)).toEqual([
      'flowId',
      'generatedId',
      'setId',
      'values',
    ]);
    expect(Object.keys(document.meta.creator.values as object)).toEqual([
      'colour',
      'custom_durability',
      'material_name',
      'pieces',
      'use_ore',
    ]);
    const { project: loaded, problems } = await loadProject(fs, registry);
    expect(problems).toEqual([]);
    expect(loaded).toEqual(project);
    const again = createMemoryFileSystem();
    await saveProject(again, loaded, registry);
    expect(again.snapshot()).toEqual(fs.snapshot());
  });

  it('drops a malformed creator on load and keeps the element', async () => {
    const registry = testRegistry();
    for (const bad of [
      'gear-set',
      { flowId: 'gear-set', setId: 's', values: {} },
      { flowId: 'gear-set', generatedId: 'alpha:x', setId: 's', values: { pieces: [1] } },
      { flowId: 'gear-set', generatedId: 'alpha:x', setId: 's', values: { nested: { a: 1 } } },
      { flowId: 1, generatedId: 'alpha:x', setId: 's', values: {} },
    ]) {
      const fs = createMemoryFileSystem();
      await saveProject(fs, projectWith(undefined), registry);
      const path = 'content/alpha/thing/ruby_sword.json';
      const document = JSON.parse(utf8.decode(fs.snapshot()[path] as Uint8Array)) as {
        meta: Record<string, unknown>;
      };
      document.meta.creator = bad;
      await fs.writeFile(path, utf8.encode(JSON.stringify(document)));
      const { project, problems } = await loadProject(fs, registry);
      expect(problems).toEqual([]);
      expect(project.namespaces[0]?.elements[0]?.meta).toEqual({ createdAt: fixedNow() });
    }
  });
});
