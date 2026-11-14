/**
 * The Portal section's pure helpers (B337, ADR 0078 D1; format ADR 0077 D1): the frame and its
 * build block, group edits that leave no empty group, the scale mode, dimension choices, dust
 * colours, the project's portals and the "Light a portal" action.
 */
import type { Element, Json, Project } from '@msm/core';
import { describe, expect, it } from 'vitest';
import {
  colourFromHex,
  colourHex,
  dimensionChoices,
  groupEdit,
  isTagId,
  litByTriggerOnly,
  newLightPortalAction,
  projectPortals,
  scaleModeOf,
  takesColour,
  withFrame,
} from '../../../../src/renderer/src/studios/blocks-items/portal-model';

const el = (id: string, kind: string, data: Json): Element => ({
  id: id as `${string}:${string}`,
  kind,
  data,
  formatVersion: 1,
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
});

describe('portal model', () => {
  it('sets the frame, dropping the build block for a plain block frame', () => {
    const tagged = { type: 'portal', frame: '#demo:frames', frame_block: 'minecraft:obsidian' };
    expect(isTagId(tagged.frame)).toBe(true);
    expect(withFrame(tagged, '#demo:other')).toEqual({ ...tagged, frame: '#demo:other' });
    expect(withFrame(tagged, 'minecraft:quartz_block')).toEqual({
      type: 'portal',
      frame: 'minecraft:quartz_block',
    });
    expect(withFrame(tagged, '')).toEqual({ type: 'portal' });
  });

  it('reads the igniter and the scale mode', () => {
    expect(litByTriggerOnly({ igniter: false })).toBe(true);
    expect(litByTriggerOnly({ igniter: 'minecraft:fire_charge' })).toBe(false);
    expect(litByTriggerOnly({})).toBe(false);
    expect(scaleModeOf({})).toBe('dimensions');
    expect(scaleModeOf({ travel: { scale: 8 } })).toBe('number');
  });

  it('removes a group with its last field and never writes an empty group', () => {
    expect(groupEdit({}, 'travel', 'scale', 8)).toEqual({ path: ['travel', 'scale'], value: 8 });
    expect(groupEdit({ travel: { scale: 8 } }, 'travel', 'scale', undefined)).toEqual({
      path: ['travel'],
      value: undefined,
    });
    expect(
      groupEdit({ travel: { scale: 8, overlay: false } }, 'travel', 'scale', undefined),
    ).toEqual({ path: ['travel', 'scale'], value: undefined });
    expect(groupEdit({}, 'sounds', 'ambient', undefined)).toEqual({
      path: ['sounds', 'ambient'],
      value: undefined,
    });
  });

  it('offers project dimensions first, then vanilla, and keeps an unknown current one', () => {
    expect(dimensionChoices(['the_nether', 'demo:sky', 'minecraft:overworld', 'the_end'])).toEqual([
      'demo:sky',
      'minecraft:overworld',
      'minecraft:the_end',
      'minecraft:the_nether',
    ]);
    expect(dimensionChoices(['minecraft:overworld'], 'demo:gone')).toEqual([
      'demo:gone',
      'minecraft:overworld',
    ]);
    expect(dimensionChoices(['minecraft:overworld'], 'overworld')).toEqual(['minecraft:overworld']);
  });

  it('gives a colour only to dust, and converts colours', () => {
    expect(takesColour({})).toBe(true);
    expect(takesColour({ particles: { type: 'dust' } })).toBe(true);
    expect(takesColour({ particles: { type: 'minecraft:dust' } })).toBe(true);
    expect(takesColour({ particles: { type: 'minecraft:reverse_portal' } })).toBe(false);
    expect(colourHex(0xe0561c)).toBe('#e0561c');
    expect(colourHex(255)).toBe('#0000ff');
    expect(colourHex(16777216)).toBeUndefined();
    expect(colourHex('red')).toBeUndefined();
    expect(colourFromHex('#E0561C')).toBe(0xe0561c);
    expect(colourFromHex('nope')).toBeUndefined();
  });

  it("lists the project's portals and starts a Light a portal action with the first", () => {
    const project: Project = {
      formatVersion: 1,
      name: 'Demo',
      targets: [],
      plugins: [],
      settings: {},
      namespaces: [
        {
          name: 'demo',
          elements: [
            el('demo:z_gate', 'msm:block', { format: 1, type: 'portal' }),
            el('demo:a_gate', 'msm:block', { format: 1, type: 'portal' }),
            el('demo:stone', 'msm:block', { format: 1 }),
            el('demo:wand', 'msm:item', { format: 1, type: 'portal' }),
          ],
          assets: [],
        },
      ],
    };
    expect(projectPortals(project)).toEqual(['demo:a_gate', 'demo:z_gate']);
    expect(projectPortals(null)).toEqual([]);
    expect(newLightPortalAction(['demo:a_gate'])).toEqual({
      type: 'light_portal',
      portal: 'demo:a_gate',
    });
    expect(newLightPortalAction([])).toEqual({ type: 'light_portal', portal: '' });
  });
});
