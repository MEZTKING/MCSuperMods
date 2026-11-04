import { describe, expect, it } from 'vitest';
import {
  createElement,
  createEmptyProject,
  findElement,
  InvalidResourceLocationError,
  isResourceLocation,
  parseResourceLocation,
} from '../src/index';
import { fixedNow } from './helpers/kinds';

describe('parseResourceLocation', () => {
  it('splits namespace and path', () => {
    expect(parseResourceLocation('my_mod:blocks/ruby_ore')).toEqual({
      namespace: 'my_mod',
      path: 'blocks/ruby_ore',
    });
    expect(parseResourceLocation('a.b-c:x.y-z_0')).toEqual({ namespace: 'a.b-c', path: 'x.y-z_0' });
  });

  it.each([
    'stone',
    ':stone',
    'mod:',
    'Mod:stone',
    'mod:Stone',
    'mod:a:b',
    'mod/x:stone',
    'mod:a//b',
    'mod:../b',
    'mod:./b',
    'mod:a/',
    'mod:a b',
  ])('rejects %j', (id) => {
    expect(() => parseResourceLocation(id)).toThrow(InvalidResourceLocationError);
    expect(isResourceLocation(id)).toBe(false);
  });

  it('accepts valid ids in the type guard', () => {
    expect(isResourceLocation('minecraft:stone')).toBe(true);
  });
});

describe('project model helpers', () => {
  it('creates an empty project', () => {
    expect(createEmptyProject('Empty')).toEqual({
      formatVersion: 1,
      name: 'Empty',
      namespaces: [],
      plugins: [],
      settings: {},
      targets: [],
    });
  });

  it('creates elements and finds them', () => {
    const element = createElement({
      id: 'ns:thing',
      kind: 'test:thing',
      data: { a: 1 },
      now: fixedNow,
      tags: ['x'],
    });
    expect(element).toEqual({
      data: { a: 1 },
      formatVersion: 1,
      id: 'ns:thing',
      kind: 'test:thing',
      meta: { createdAt: '2026-11-04T12:00:00.000Z', tags: ['x'] },
    });
    expect('notes' in element.meta).toBe(false);
    const project = createEmptyProject('P');
    project.namespaces.push({ name: 'ns', elements: [element], assets: [] });
    expect(findElement(project, 'ns:thing')).toBe(element);
    expect(findElement(project, 'ns:other')).toBeUndefined();
  });

  it('rejects invalid element ids', () => {
    expect(() => createElement({ id: 'NS:x', kind: 'k', data: null })).toThrow(
      InvalidResourceLocationError,
    );
  });
});
