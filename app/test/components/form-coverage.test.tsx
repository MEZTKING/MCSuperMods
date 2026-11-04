// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Misode-parity proxy (Phase 2 plan D4 (b)): every member of the data pack dispatchers the
 * Data Pack Studio edits renders through `SchemaForm` without a JSON fallback, for every
 * built-in target.
 */
import type { Json } from '@msm/core';
import type { SchemaIndex, SchemaNode } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultValue, SchemaForm } from '../../src/renderer/src/forms';
import { schemaIndexFor } from './forms/schemas';

const DISPATCHERS: readonly string[] = [
  'minecraft:recipe_serializer',
  'minecraft:loot_pool_entry',
  'minecraft:loot_condition',
  'minecraft:loot_function',
  'minecraft:trigger',
  'minecraft:number_provider',
];

afterEach(cleanup);

/** Accessible names of the JSON fallbacks a render shows (each is a `"<label> (JSON)"` textarea). */
function fallbacks(container: HTMLElement): string[] {
  return [...container.querySelectorAll('textarea')]
    .map((area) => area.getAttribute('aria-label') ?? '')
    .filter((label) => label.endsWith('(JSON)'));
}

function renderMember(member: SchemaNode, value: Json): string[] {
  const { container } = render(
    <SchemaForm node={member} value={value} onChange={() => undefined} />,
  );
  const found = fallbacks(container);
  cleanup();
  return found;
}

for (const bundle of builtInTargets) {
  describe(`SchemaForm dispatcher coverage (${bundle.target.id})`, () => {
    let index: SchemaIndex;
    beforeAll(async () => {
      index = await schemaIndexFor(bundle);
    });

    for (const registry of DISPATCHERS) {
      it(`renders every ${registry} member without a JSON fallback`, () => {
        const keys = index.dispatcherKeys(registry);
        expect(keys.length).toBeGreaterThan(0);
        const failures: string[] = [];
        for (const key of keys) {
          const member = index.dispatch(registry, key);
          if (member === undefined) {
            failures.push(`${key}: no member`);
            continue;
          }
          const found = renderMember(member, defaultValue(member));
          if (found.length > 0) failures.push(`${key}: ${found.join(', ')}`);
        }
        expect(failures).toEqual([]);
      });
    }
  });
}
