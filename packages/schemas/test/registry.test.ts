import { describe, expect, it } from 'vitest';
import { createRegistryIndex } from '../src/index';

describe('createRegistryIndex', () => {
  const index = createRegistryIndex({
    vanilla: { item: ['stone', 'dirt'], block: ['stone'] },
    project: { item: ['demo:gem', 'stick'], sound_event: ['demo:ding'] },
  });

  it('namespaces vanilla ids and accepts both forms', () => {
    expect(index.has('item', 'stone')).toBe(true);
    expect(index.has('item', 'minecraft:stone')).toBe(true);
    expect(index.has('minecraft:item', 'stone')).toBe(true);
    expect(index.has('item', 'gravel')).toBe(false);
    expect(index.has('item', 'other:stone')).toBe(false);
  });

  it('includes project ids', () => {
    expect(index.has('item', 'demo:gem')).toBe(true);
    expect(index.has('item', 'gem')).toBe(false);
    expect(index.has('item', 'minecraft:stick')).toBe(true);
    expect(index.has('sound_event', 'demo:ding')).toBe(true);
  });

  it('always accepts tags', () => {
    expect(index.has('item', '#minecraft:logs')).toBe(true);
    expect(index.has('unknown', '#demo:anything')).toBe(true);
  });

  it('treats unknown registries as empty', () => {
    expect(index.has('unknown', 'stone')).toBe(false);
    expect(index.ids('unknown')).toEqual([]);
  });

  it('lists sorted, namespaced ids and registries', () => {
    expect(index.ids('item')).toEqual([
      'demo:gem',
      'minecraft:dirt',
      'minecraft:stick',
      'minecraft:stone',
    ]);
    expect(index.ids('minecraft:block')).toEqual(['minecraft:stone']);
    expect(index.registries()).toEqual(['block', 'item', 'sound_event']);
  });
});

describe('createRegistryIndex tag references', () => {
  const index = createRegistryIndex({
    vanilla: { item: ['stone'], 'tag/item': ['logs'] },
    project: { 'tag/item': ['demo:gems'], 'tag/function': ['demo:tick'] },
  });

  it('checks #ids against tag/<registry> when it is known', () => {
    expect(index.has('item', '#minecraft:logs')).toBe(true);
    expect(index.has('item', '#logs')).toBe(true);
    expect(index.has('minecraft:item', '#demo:gems')).toBe(true);
    expect(index.has('item', '#demo:nope')).toBe(false);
    expect(index.has('function', '#demo:tick')).toBe(true);
    expect(index.has('function', '#demo:load')).toBe(false);
  });

  it('accepts #ids when the tag registry is unknown', () => {
    expect(index.has('block', '#minecraft:anything')).toBe(true);
  });

  it('never treats a plain id as a tag', () => {
    expect(index.has('item', 'logs')).toBe(false);
  });
});
