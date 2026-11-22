import { describe, expect, it } from 'vitest';
import { buildEntityCatalogue, plainEntityName, plainList } from '../../src/index.js';
import { FAKE_TARGET, testLog } from '../blocks/helpers.js';
import { mob, mobFiles } from './helpers.js';

describe('entity catalogue', () => {
  const log = testLog();
  const catalogue = buildEntityCatalogue(mobFiles(), FAKE_TARGET, log);

  it('reads every readable definition, sorted', () => {
    expect(catalogue.ids()).toEqual(['bee', 'cow', 'fish', 'frog', 'ghost', 'parrot'].map(mob));
  });

  it('keeps the size, model, scale, movement and names', () => {
    const cow = catalogue.get(mob('cow'));
    expect(cow).toMatchObject({
      displayName: 'Moo Cow',
      spawnEgg: 'zoo:cow_spawn_egg',
      spawnEggName: 'Cow Egg',
      width: 0.9,
      height: 1.4,
      mode: 'walk',
      speed: 0.2,
      stepHeight: 0.6,
      model: {
        model: 'zoo:entity/cow',
        texture: 'zoo:entity/cow',
        animations: 'zoo:entity/cow_animations',
        scale: 1.2,
        idle: 'idle',
        walk: 'walk',
      },
      origin: { elementId: 'zoo:cow' },
    });
    expect(catalogue.get(mob('bee'))).toMatchObject({
      displayName: 'Buzzy Bee',
      spawnEggName: 'Buzzy Bee Spawn Egg',
      mode: 'fly',
      flyingSpeed: 0.6,
      hovers: true,
      model: { fly: 'fly', scale: 1 },
    });
    expect(catalogue.get(mob('parrot'))).toMatchObject({ hovers: false, flyingSpeed: 0.4 });
    expect(catalogue.get(mob('frog'))).toMatchObject({ mode: 'amphibious', stepHeight: 1 });
    expect(catalogue.get(mob('fish'))?.spawnEgg).toBeUndefined();
    expect(catalogue.get(mob('fish'))?.speed).toBe(0.25);
  });

  it('finds a mob by its spawn egg', () => {
    expect(catalogue.entityForEgg('zoo:bee_spawn_egg')?.id).toBe(mob('bee'));
    expect(catalogue.entityForEgg('zoo:fish_spawn_egg')).toBeUndefined();
  });

  it('lists in plain words what only the game does', () => {
    expect(catalogue.get(mob('cow'))?.onlyInMinecraft).toEqual([
      'goals (panic, look around)',
      'breeding and babies',
      'natural spawning',
    ]);
    expect(catalogue.get(mob('bee'))?.onlyInMinecraft).toEqual([]);
  });

  it('says out loud what it cannot read', () => {
    expect(log.only).toEqual([
      'Broken has a definition the preview cannot read; it is left out of the preview',
      'Ghost moves in a way the preview does not know (burrow); here it walks',
    ]);
    expect(catalogue.get(mob('ghost'))?.mode).toBe('walk');
  });

  it('makes names and lists in plain words', () => {
    expect(plainEntityName('zoo:mobs/glow_golem')).toBe('Glow Golem');
    expect(plainList([])).toBe('');
    expect(plainList(['a'])).toBe('a');
    expect(plainList(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
