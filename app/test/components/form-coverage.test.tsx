// @vitest-environment happy-dom
/// <reference types="node" />
/**
 * Misode-parity proxy (Phase 2 plan D4 (b)): every member of the data pack dispatchers the
 * Data Pack Studio edits renders through `SchemaForm` without a JSON fallback, for every
 * built-in target. Phase 3 (B80) adds the worldgen kinds the worldgen Studios edit: their
 * templates and every member of their root dispatchers, with every section expanded, must
 * not show more JSON fallbacks than the recorded baseline.
 */
import type { Json } from '@msm/core';
import worldgenPlugin from '@msm/plugin-worldgen';
import type { RegistryIndex, SchemaIndex, SchemaNode } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { defaultValue, SchemaForm } from '../../src/renderer/src/forms';
import { completionsFrom, registryIndexFor, schemaIndexFor } from './forms/schemas';

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

/**
 * The worldgen schemas the worldgen Studios edit, the dispatcher whose members each one spreads
 * at its root or in its lists, and the JSON fallbacks recorded for them. Before B80 the same
 * renders showed 22 (biome: colour attributes and spawn counts), 27 (feature: block state
 * providers nested by their defaults) and 9 (placed feature: settings-free modifiers and int
 * providers); the baseline must not grow.
 */
const WORLDGEN: readonly { kind: string; dispatcher?: string; baseline: number }[] = [
  { kind: 'minecraft:worldgen/biome', baseline: 0 },
  { kind: 'minecraft:worldgen/feature', dispatcher: 'minecraft:feature_config', baseline: 0 },
  {
    kind: 'minecraft:worldgen/placed_feature',
    dispatcher: 'minecraft:placement_modifier',
    baseline: 0,
  },
];

/** Renders `value`, expands every collapsed section, and lists the JSON fallbacks. */
function renderExpanded(node: SchemaNode, value: Json, registries: RegistryIndex): string[] {
  const { container } = render(
    <SchemaForm
      node={node}
      value={value}
      onChange={() => undefined}
      completions={completionsFrom(registries)}
    />,
  );
  for (let round = 0; round < 16; round++) {
    const closed = [...container.querySelectorAll('[data-collapse-toggle][aria-expanded="false"]')];
    if (closed.length === 0) break;
    act(() => {
      for (const toggle of closed) fireEvent.click(toggle);
    });
  }
  const found = [...container.querySelectorAll('textarea')]
    .filter((area) => (area.getAttribute('aria-label') ?? '').endsWith('(JSON)'))
    .map((area) => area.closest('[data-pointer]')?.getAttribute('data-pointer') ?? '?');
  cleanup();
  return found;
}

for (const bundle of builtInTargets) {
  describe(`SchemaForm worldgen coverage (${bundle.target.id})`, () => {
    let index: SchemaIndex;
    let registries: RegistryIndex;
    beforeAll(async () => {
      index = await schemaIndexFor(bundle);
      registries = await registryIndexFor(bundle);
    });

    for (const { kind, dispatcher, baseline } of WORLDGEN) {
      it(`keeps ${kind} within ${baseline} JSON fallbacks`, () => {
        const root = index.resolveSchemaRef(`resource:${kind.slice('minecraft:'.length)}`);
        const failures: string[] = [];
        const templates = (worldgenPlugin.contributes.elementTemplates ?? []).filter(
          (template) => template.kind === kind,
        );
        expect(templates.length).toBeGreaterThan(0);
        for (const template of templates) {
          const data = template.data({
            id: 'demo:sample',
            namespace: 'demo',
            path: 'sample',
            projectNamespace: 'demo',
            namespaces: ['demo'],
            kindDefault: undefined,
          });
          for (const at of renderExpanded(root, data, registries)) {
            failures.push(`${template.id}: ${at}`);
          }
        }
        for (const at of renderExpanded(root, defaultValue(root), registries)) {
          failures.push(`default: ${at}`);
        }
        if (dispatcher !== undefined) {
          for (const key of index.dispatcherKeys(dispatcher)) {
            const member = index.dispatch(dispatcher, key);
            if (member === undefined) continue;
            for (const at of renderExpanded(member, defaultValue(member), registries)) {
              failures.push(`${key}: ${at}`);
            }
          }
        }
        expect(failures.length, failures.join('\n')).toBeLessThanOrEqual(baseline);
      }, 60_000);
    }
  });
}
