import { describe, expect, it } from 'vitest';
import {
  createCompletionSource,
  textureIds,
  translationKeys,
} from '../../src/renderer/src/studios/completions';
import { filterLang, keyPointer, mergeFiltered } from '../../src/renderer/src/studios/LangStudio';
import { formatLabel } from '../../src/renderer/src/studios/PackSettings';
import { element, sampleProject } from './fixtures';

function project() {
  const value = sampleProject();
  value.namespaces[0]?.elements.push(
    element('demo:en_us', 'minecraft:lang', { 'block.demo.ruby_block': 'Ruby Block' }),
  );
  return value;
}

describe('completions', () => {
  it('suggests translation keys, textures and models from the project', () => {
    const source = createCompletionSource(project(), null);
    expect(translationKeys(project())).toEqual(['block.demo.ruby_block']);
    expect(source.suggest('translation_key', 'block.')).toEqual(['block.demo.ruby_block']);
    expect(textureIds(project())).toEqual(['demo:block/ruby_block']);
    expect(source.projectIds('texture', 'block/')).toEqual(['demo:block/ruby_block']);
    expect(source.projectIds('model', 'demo:item')).toEqual(['demo:item/ruby']);
    expect(source.projectIds('element', '')).toHaveLength(4);
    expect(source.suggest('item', '')).toEqual([]);
  });

  it('suggests registry ids from the registry index', () => {
    const registries = {
      has: () => true,
      ids: (registry: string) =>
        registry === 'item' ? ['minecraft:stick', 'minecraft:stone', 'demo:ruby'] : [],
      registries: () => ['item'],
    };
    const source = createCompletionSource(project(), registries);
    expect(source.suggest('item', 'st')).toEqual(['minecraft:stick', 'minecraft:stone']);
    expect(source.suggest('item', 'demo:')).toEqual(['demo:ruby']);
  });
});

describe('language file helpers', () => {
  const full = { 'a.one': 'One', 'b.two': 'Two', 'c.three': 'Three' };

  it('filters by key or text', () => {
    expect(filterLang(full, 'two')).toEqual({ 'b.two': 'Two' });
    expect(filterLang(full, '  ')).toBe(full);
  });

  it('merges a rename made on the filtered view in place, keeping hidden keys', () => {
    const visible = filterLang(full, 'two');
    const merged = mergeFiltered(full, visible, { 'b.deux': 'Two' });
    expect(Object.entries(merged)).toEqual([
      ['a.one', 'One'],
      ['b.deux', 'Two'],
      ['c.three', 'Three'],
    ]);
    expect(mergeFiltered(full, visible, {})).toEqual({ 'a.one': 'One', 'c.three': 'Three' });
  });

  it('escapes keys as JSON pointers', () => {
    expect(keyPointer('a/b~c')).toBe('/a~1b~0c');
  });
});

describe('pack settings', () => {
  it('formats pack formats', () => {
    expect(formatLabel({ major: 97, minor: 1 })).toBe('97.1');
    expect(formatLabel({ major: 46, minor: 0 })).toBe('46');
  });
});
