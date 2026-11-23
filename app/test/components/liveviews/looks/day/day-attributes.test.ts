/**
 * B626: which environment attributes the day strip can draw, derived from each target's own
 * vendored schema (B619 3S10: 45 of 52 on the snapshot; 26.3 gates `visual/has_sky_occluder`
 * out), and the strip's sampling: easings, the period's wrap, colours.
 */

import type { SchemaIndex } from '@msm/schemas';
import { builtInTargets, targetById } from '@msm/targets';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  type AttributeTable,
  attributeTable,
} from '../../../../../src/renderer/src/liveviews/looks/day/attributes';
import {
  cubicBezier,
  EASINGS,
  easingOf,
  sampleTrack,
  stripSpan,
  timelineOf,
} from '../../../../../src/renderer/src/liveviews/looks/day/strip';
import { schemaIndexFor } from '../../../forms/schemas';

const STRUCTURED = [
  'minecraft:audio/ambient_sounds',
  'minecraft:audio/background_music',
  'minecraft:gameplay/bed_rule',
  'minecraft:gameplay/natural_mob_spawns',
  'minecraft:gameplay/straw_bed_rule',
  'minecraft:visual/ambient_particles',
  'minecraft:visual/default_dripstone_particle',
];

const tables = new Map<string, AttributeTable>();
const indexes = new Map<string, SchemaIndex>();

beforeAll(async () => {
  for (const bundle of builtInTargets) {
    const index = await schemaIndexFor(bundle);
    indexes.set(bundle.target.id, index);
    tables.set(bundle.target.id, attributeTable(index));
  }
});

function table(id: string): AttributeTable {
  const found = tables.get(id);
  if (found === undefined) throw new Error(`no table for ${id}`);
  return found;
}

function kinds(id: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const info of table(id).attributes.values()) {
    const list = out[info.value.kind] ?? [];
    list.push(info.id);
    out[info.value.kind] = list;
  }
  return out;
}

describe('the attribute types from the schema (B626)', () => {
  it('reads every target, and names the same seven structured attributes on each', () => {
    expect(builtInTargets.length).toBeGreaterThanOrEqual(2);
    for (const bundle of builtInTargets) {
      const id = bundle.target.id;
      expect(kinds(id).structured?.sort()).toEqual(STRUCTURED);
      expect(table(id).easings).toHaveLength(32);
    }
  });

  it('draws 45 of 52 on 26.4 and 44 of 51 on 26.3 (has_sky_occluder is newer)', () => {
    const snapshot = table('mc-26.4');
    const release = table('mc-26.3');
    expect(targetById('mc-26.4')).toBeDefined();
    expect(snapshot.attributes.size).toBe(52);
    expect(release.attributes.size).toBe(51);
    expect(release.attributes.has('minecraft:visual/has_sky_occluder')).toBe(false);
    const counts = (id: string) =>
      Object.fromEntries(Object.entries(kinds(id)).map(([kind, ids]) => [kind, ids.length]));
    expect(counts('mc-26.4')).toEqual({
      boolean: 14,
      number: 18,
      colour: 9,
      choice: 4,
      structured: 7,
    });
    expect(counts('mc-26.3')).toMatchObject({ boolean: 13, number: 18, colour: 9, choice: 4 });
  });

  it('types colours, alpha, choices and registries from the schema', () => {
    const t = table('mc-26.3');
    expect(t.attributes.get('minecraft:visual/sky_color')?.value).toMatchObject({
      kind: 'colour',
      alpha: false,
    });
    expect(t.attributes.get('minecraft:visual/cloud_color')?.value).toMatchObject({
      kind: 'colour',
      alpha: true,
    });
    expect(t.attributes.get('minecraft:visual/moon_phase')?.value.choices).toContain('new_moon');
    expect(t.attributes.get('minecraft:gameplay/eyeblossom_open')?.value.choices).toEqual([
      'true',
      'false',
      'default',
    ]);
    expect(t.attributes.get('minecraft:gameplay/villager_activity')?.value).toMatchObject({
      kind: 'choice',
      registry: 'activity',
    });
  });

  it('types a keyframe by its modifier and names the ones the strip cannot draw', () => {
    const t = table('mc-26.3');
    expect(t.keyframeType('visual/sky_color', 'multiply')?.kind).toBe('colour');
    expect(t.keyframeType('visual/sky_color', 'blend_to_gray')).toMatchObject({
      kind: 'structured',
      words: 'a structured value (brightness, factor)',
    });
    expect(t.keyframeType('audio/music_volume', 'alpha_blend')?.kind).toBe('structured');
    expect(t.keyframeType('audio/music_volume', 'multiply')?.kind).toBe('number');
    expect(t.keyframeType('gameplay/fast_lava', 'xor')?.kind).toBe('boolean');
    expect(t.keyframeType('demo:nothing', undefined)).toBeNull();
  });

  it('knows every easing the schema names', () => {
    for (const name of table('mc-26.3').easings) expect(Object.keys(EASINGS)).toContain(name);
  });
});

describe('sampling a track (B626)', () => {
  const day = 24_000;

  it('blends numbers linearly and wraps the last keyframe into the next day', () => {
    const track = {
      keyframes: [
        { ticks: 6000, value: 0 },
        { ticks: 18_000, value: 1 },
      ],
    };
    expect(sampleTrack(track, 12_000, day, 'number')).toBeCloseTo(0.5);
    expect(sampleTrack(track, 0, day, 'number')).toBeCloseTo(0.5);
    expect(sampleTrack(track, 21_000, day, 'number')).toBeCloseTo(0.75);
    expect(sampleTrack(track, 30_000, day, 'number')).toBeCloseTo(0);
  });

  it('holds the ends without a period', () => {
    const track = {
      keyframes: [
        { ticks: 100, value: 2 },
        { ticks: 200, value: 4 },
      ],
    };
    expect(sampleTrack(track, 0, undefined)).toBe(2);
    expect(sampleTrack(track, 150, undefined)).toBe(3);
    expect(sampleTrack(track, 999, undefined)).toBe(4);
  });

  it('steps true or false and choices, and holds with constant', () => {
    const flag = {
      keyframes: [
        { ticks: 0, value: false },
        { ticks: 12_000, value: true },
      ],
    };
    expect(sampleTrack(flag, 11_999, day, 'boolean')).toBe(false);
    expect(sampleTrack(flag, 12_000, day, 'boolean')).toBe(true);
    const held = {
      ease: 'constant',
      keyframes: [
        { ticks: 0, value: 1 },
        { ticks: 100, value: 9 },
      ],
    };
    expect(sampleTrack(held, 50, 200, 'number')).toBe(1);
  });

  it('blends colours channel by channel, in their own form', () => {
    const track = {
      keyframes: [
        { ticks: 0, value: '#000000' },
        { ticks: 100, value: '#ff8040' },
      ],
    };
    expect(sampleTrack(track, 50, 200, 'colour')).toBe('#804020');
    const argb = {
      keyframes: [
        { ticks: 0, value: [0, 0, 0, 0] },
        { ticks: 10, value: [1, 1, 1, 1] },
      ],
    };
    expect(sampleTrack(argb, 5, undefined, 'colour')).toBe('#80808080');
  });

  it('follows named easings and cubic Bézier curves', () => {
    expect(easingOf('in_quad').fn(0.5)).toBeCloseTo(0.25);
    expect(easingOf('out_bounce').fn(1)).toBeCloseTo(1);
    expect(easingOf({ cubic_bezier: [0, 0, 1, 1] }).fn(0.3)).toBeCloseTo(0.3, 3);
    expect(cubicBezier(0.42, 0, 0.58, 1)(0.5)).toBeCloseTo(0.5, 3);
    expect(easingOf('wobbly')).toMatchObject({ known: false, name: 'wobbly' });
    const eased = {
      ease: 'in_quad',
      keyframes: [
        { ticks: 0, value: 0 },
        { ticks: 100, value: 1 },
      ],
    };
    expect(sampleTrack(eased, 50, undefined)).toBeCloseTo(0.25);
  });

  it('reads a timeline: period, clock, markers, tracks', () => {
    const timeline = timelineOf({
      clock: 'overworld',
      period_ticks: 24_000,
      time_markers: { day: 1000, night: { ticks: 13_000, show_in_commands: true } },
      tracks: { 'visual/sky_color': { keyframes: [{ ticks: 0, value: '#78a7ff' }] } },
    });
    expect(timeline.clock).toBe('minecraft:overworld');
    expect(timeline.markers.map((marker) => marker.ticks)).toEqual([1000, 13_000]);
    expect(timeline.tracks[0]?.attribute).toBe('minecraft:visual/sky_color');
    expect(stripSpan(timeline)).toBe(24_000);
    expect(
      stripSpan(timelineOf({ tracks: { a: { keyframes: [{ ticks: 500, value: 1 }] } } })),
    ).toBe(500);
  });
});
