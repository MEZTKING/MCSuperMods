/**
 * Fluids 2 in Try it (B540, ADR 0108 as amended after B525, the runtime's B529): cauldrons by
 * bucket and bottle, glass bottles from a source, drinking a bottle with its `on_drink`, and
 * mixing as a block change and a log line.
 */
import type { Json, Target } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { LocalWorldSource, readFluids, type SimFiles, TRIGGER_SPECS } from '../../src/index.js';
import { builtInTargets } from '../lower-fixture.js';

const [target] = (await builtInTargets()) as [Target];
const UP = { x: 0.5, y: 1, z: 0.5 };
const floor = (x: number, z: number) => ({ x, y: -1, z });

function files(): SimFiles {
  const out = new Map<string, string>();
  const put = (path: string, json: Json) => out.set(path, JSON.stringify(json));
  put('msm/fl/fluid/goo.json', {
    format: 1,
    behaves_like: 'none',
    cauldron: { levels: true },
    bottle: { on_drink: 'fl:sip', food: { nutrition: 1, saturation: 0.1 } },
    mixing: [{ with: 'lava', source: 'minecraft:obsidian', flowing: 'minecraft:cobblestone' }],
    events: { 'fl:sip': { actions: [{ type: 'play_sound', sound: 'fl:sip' }] } },
  });
  put('msm/fl/fluid/magma.json', {
    format: 1,
    behaves_like: 'lava',
    cauldron: { levels: true },
    mixing: [{ with: 'fl:goo', source: 'minecraft:basalt' }],
  });
  put('assets/fl/lang/en_us.json', { 'block.fl.goo': 'Goo', 'block.fl.magma': 'Magma' });
  return out;
}

const at = (source: LocalWorldSource, x: number, y: number, z: number): string =>
  (() => {
    const state = source.world.get({ x, y, z });
    if (state === null) return 'air';
    const props = Object.entries(state.properties)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    return props === '' ? state.name : `${state.name}[${props}]`;
  })();

const useOn = (source: LocalWorldSource, x: number, z: number, item: string) =>
  source.act({ type: 'use', pos: { x, y: 0, z }, face: 'up', hit: UP, item });

describe('fluid cauldrons and bottles', () => {
  it('reads the cauldrons, the bottle and the rules (a lava-like cauldron is full only)', () => {
    const fluids = readFluids(files(), target);
    expect(fluids.get('fl:goo')?.cauldron).toEqual({
      id: 'fl:goo_cauldron',
      displayName: 'Goo Cauldron',
      levels: true,
    });
    expect(fluids.get('fl:magma')?.cauldron?.levels).toBe(false);
    expect(fluids.get('fl:goo')?.bottle).toMatchObject({
      id: 'fl:goo_bottle',
      name: 'Bottle of Goo',
    });
    expect(fluids.forCauldron('fl:magma_cauldron')?.id).toBe('fl:magma');
    expect(TRIGGER_SPECS.find((one) => one.id === 'fluid:bottle.on_drink')?.handled).toBe(true);
  });

  it('fills by bucket, takes and adds levels by bottle, and gives back only a full one', () => {
    const source = new LocalWorldSource({ files: files(), target, seed: 1 });
    source.act({
      type: 'place',
      pos: floor(20, 20),
      face: 'up',
      hit: UP,
      block: 'minecraft:cauldron',
    });
    expect(at(source, 20, 0, 20)).toBe('minecraft:cauldron');
    useOn(source, 20, 20, 'fl:goo_bucket');
    expect(at(source, 20, 0, 20)).toBe('fl:goo_cauldron[level=3]');
    useOn(source, 20, 20, 'minecraft:glass_bottle');
    expect(at(source, 20, 0, 20)).toBe('fl:goo_cauldron[level=2]');
    expect(source.inventory.count('fl:goo_bottle')).toBe(1);
    // A bucket takes only a full cauldron.
    useOn(source, 20, 20, 'minecraft:bucket');
    expect(at(source, 20, 0, 20)).toBe('fl:goo_cauldron[level=2]');
    expect(source.lines.at(-1)?.text).toContain('a bucket takes only a full cauldron');
    useOn(source, 20, 20, 'fl:goo_bottle');
    expect(at(source, 20, 0, 20)).toBe('fl:goo_cauldron[level=3]');
    useOn(source, 20, 20, 'minecraft:bucket');
    expect(at(source, 20, 0, 20)).toBe('minecraft:cauldron');
    expect(source.inventory.count('fl:goo_bucket')).toBe(1);
    // Three bottles empty it; a bottle into the empty cauldron makes level 1.
    useOn(source, 20, 20, 'fl:goo_bottle');
    expect(at(source, 20, 0, 20)).toBe('fl:goo_cauldron[level=1]');
    useOn(source, 20, 20, 'minecraft:glass_bottle');
    expect(at(source, 20, 0, 20)).toBe('minecraft:cauldron');
    // A lava-like cauldron is full only and replaces what a cauldron holds.
    useOn(source, 20, 20, 'fl:goo_bucket');
    useOn(source, 20, 20, 'fl:magma_bucket');
    expect(at(source, 20, 0, 20)).toBe('fl:magma_cauldron');
    useOn(source, 20, 20, 'minecraft:glass_bottle');
    expect(at(source, 20, 0, 20)).toBe('fl:magma_cauldron');
  });

  it('fills a glass bottle from a source and drinks the bottle with its on_drink', () => {
    const source = new LocalWorldSource({ files: files(), target, seed: 1 });
    // Pour goo in front of the player (who faces south from the middle) and look down at it.
    const feet = source.player.position;
    const x = Math.floor(feet.x);
    const z = Math.floor(feet.z) + 2;
    source.act({ type: 'use', pos: floor(x, z), face: 'up', hit: UP, item: 'fl:goo_bucket' });
    expect(at(source, x, 0, z)).toBe('fl:goo');
    source.act({
      type: 'move',
      forward: 0,
      strafe: 0,
      jump: false,
      sneak: false,
      toggleFly: false,
      yaw: 0,
      pitch: 40,
    });
    source.tick();
    expect(source.useItem('minecraft:glass_bottle')).toBe(true);
    expect(source.inventory.count('fl:goo_bottle')).toBe(1);
    expect(at(source, x, 0, z)).toBe('fl:goo');
    expect(source.useItem('fl:goo_bottle')).toBe(true);
    expect(source.lines.map((line) => line.text)).toContain('You drank Bottle of Goo.');
    expect(
      source.trace.some((entry) => entry.kind === 'trigger' && entry.origin.eventId === 'fl:sip'),
    ).toBe(true);
    expect(
      source.lines.some((line) => line.onlyInMinecraft && line.text.includes('1.6 seconds')),
    ).toBe(true);
  });
});

describe('mixing', () => {
  it('turns a source into its block when the other liquid comes beside it, with a line', () => {
    const source = new LocalWorldSource({ files: files(), target, seed: 1 });
    source.act({ type: 'use', pos: floor(10, 10), face: 'up', hit: UP, item: 'fl:goo_bucket' });
    expect(at(source, 10, 0, 10)).toBe('fl:goo');
    source.act({
      type: 'use',
      pos: floor(11, 10),
      face: 'up',
      hit: UP,
      item: 'minecraft:lava_bucket',
    });
    expect(at(source, 11, 0, 10)).toBe('minecraft:lava');
    expect(at(source, 10, 0, 10)).toBe('minecraft:obsidian');
    expect(source.lines.map((line) => line.text)).toContain(
      'Goo met Lava at 10, 0, 10 and became Obsidian, with a fizz.',
    );
    expect(
      source.lines.some((line) => line.onlyInMinecraft && line.text.startsWith('Flowing Goo')),
    ).toBe(true);

    // A fluid-id rule: magma poured beside goo becomes basalt (goo has no rule for magma).
    source.act({ type: 'use', pos: floor(20, 10), face: 'up', hit: UP, item: 'fl:goo_bucket' });
    source.act({ type: 'use', pos: floor(21, 10), face: 'up', hit: UP, item: 'fl:magma_bucket' });
    expect(at(source, 21, 0, 10)).toBe('minecraft:basalt');
    expect(at(source, 20, 0, 10)).toBe('fl:goo');
    // The liquid below does not count: goo poured on top of lava stays.
    source.act({
      type: 'use',
      pos: floor(30, 10),
      face: 'up',
      hit: UP,
      item: 'minecraft:lava_bucket',
    });
    source.act({
      type: 'use',
      pos: { x: 30, y: 0, z: 10 },
      face: 'up',
      hit: UP,
      item: 'fl:goo_bucket',
    });
    expect(at(source, 30, 1, 10)).toBe('fl:goo');
  });
});
