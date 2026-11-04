import { type Element, ElementKindRegistry, type Reference, type ReferenceIndex } from '@msm/core';
import type { ElementKind } from '@msm/plugin-api';
import { describe, expect, it } from 'vitest';
import { referencesForRename } from '../src/renderer/src/session/references';

/** A kind that is not built in, with its own `registry`. */
const gadgetKind: ElementKind = {
  id: 'test:gadget',
  schema: 'msm:test',
  folder: 'gadget',
  registry: 'gadget_registry',
  lower: () => [],
};

const gadget: Element = {
  formatVersion: 1,
  id: 'demo:widget',
  kind: 'test:gadget',
  data: {},
  meta: { createdAt: '2026-01-01T00:00:00.000Z' },
};

const references: Reference[] = [
  { from: 'demo:a', path: '/gadget', registry: 'gadget_registry', to: 'demo:widget' },
  {
    from: 'demo:b',
    path: '/lines/0',
    registry: '',
    to: 'demo:widget',
    range: { start: 0, end: 11 },
  },
  { from: 'demo:c', path: '/item', registry: 'item', to: 'demo:widget' },
];

const index: ReferenceIndex = {
  referencesTo: () => references,
  referencesFrom: () => [],
  all: () => references,
};

describe('referencesForRename', () => {
  it('uses the given kind registry for a kind that is not built in', () => {
    const registry = new ElementKindRegistry();
    registry.register(gadgetKind);
    const found = referencesForRename(index, gadget, registry).map((reference) => reference.from);
    expect(found).toEqual(['demo:a', 'demo:b']);
  });

  it('falls back to the kind id without the built-in lookup', () => {
    // `test:gadget` is unknown to the built-in plugins, so its registry is the kind id and the
    // typed reference in `gadget_registry` is not rewritten; only the text reference is.
    const found = referencesForRename(index, gadget).map((reference) => reference.from);
    expect(found).toEqual(['demo:b']);
  });
});
