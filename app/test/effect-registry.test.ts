/**
 * `msm:effect` elements are `mob_effect` registry ids (B205, ADR 0055 D1): `projectRegistryIds`
 * yields them, so JSON forms, `#[id="mob_effect"]` checks and the mcfunction checker (which
 * reads the same project ids) know them.
 */
import type { Project } from '@msm/core';
import { describe, expect, it } from 'vitest';
import {
  BUILT_IN_KIND_LOOKUP,
  kindRegistry,
  projectRegistryIds,
} from '../src/renderer/src/session/schema-context';

function project(): Project {
  const meta = { createdAt: '2026-01-01T00:00:00.000Z' };
  return {
    formatVersion: 1,
    name: 'Test',
    namespaces: [
      {
        name: 'demo',
        elements: [
          { formatVersion: 1, id: 'demo:frost_bite', kind: 'msm:effect', data: {}, meta },
          { formatVersion: 1, id: 'demo:ruby_rush', kind: 'msm:effect', data: {}, meta },
          { formatVersion: 1, id: 'demo:dart', kind: 'msm:item', data: {}, meta },
        ],
        assets: [{ path: 'textures/mob_effect/ruby_rush.png', mediaType: 'image/png' }],
      },
    ],
    targets: ['mc-test'],
    plugins: [],
    settings: {},
  };
}

describe('mob_effect project ids', () => {
  it('come from msm:effect elements through the built-in kinds', () => {
    expect(kindRegistry('msm:effect', BUILT_IN_KIND_LOOKUP)).toBe('mob_effect');
    const ids = projectRegistryIds(project());
    expect(ids.mob_effect).toEqual(['demo:frost_bite', 'demo:ruby_rush']);
    expect(ids.item).toEqual(['demo:dart']);
    expect(ids.texture).toContain('demo:mob_effect/ruby_rush');
  });

  it('come from any kind that declares the mob_effect registry', () => {
    const ids = projectRegistryIds(project(), {
      registryFor: (kind) => (kind === 'msm:effect' ? 'mob_effect' : undefined),
    });
    expect(ids.mob_effect).toEqual(['demo:frost_bite', 'demo:ruby_rush']);
  });
});
