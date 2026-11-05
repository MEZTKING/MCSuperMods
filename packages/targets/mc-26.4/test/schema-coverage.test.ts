import { readFile } from 'node:fs/promises';
import {
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type SchemaIndex,
  type SchemaNode,
} from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';

/**
 * Misode-parity proxy (Phase 2 plan D4 (a)): no `unsupported` node is reachable from the
 * data pack kinds MSM edits with forms. This package cannot depend on `@msm/targets` (it is
 * the aggregator's dependency), so it checks its own bundle.
 */
const COVERED_REFS: readonly string[] = [
  'resource:recipe',
  'resource:loot_table',
  'resource:advancement',
  'resource:predicate',
  'resource:item_modifier',
  'tag:block',
  'tag:item',
  'tag:entity_type',
  'tag:fluid',
  'tag:game_event',
  'tag:function',
  'tag:damage_type',
  'tag:enchantment',
  // Phase 3 (structures and worldgen).
  'resource:dimension',
  'resource:dimension_type',
  'resource:worldgen/biome',
  'resource:worldgen/block_state_provider',
  'resource:worldgen/carver',
  'resource:worldgen/density_function',
  'resource:worldgen/feature',
  'resource:worldgen/flat_level_generator_preset',
  'resource:worldgen/material_condition',
  'resource:worldgen/material_rule',
  'resource:worldgen/multi_noise_biome_source_parameter_list',
  'resource:worldgen/noise',
  'resource:worldgen/noise_settings',
  'resource:worldgen/placed_feature',
  'resource:worldgen/processor_list',
  'resource:worldgen/structure',
  'resource:worldgen/structure_set',
  'resource:worldgen/template_pool',
  'resource:worldgen/world_preset',
  'tag:worldgen/biome',
  'tag:worldgen/structure',
  'tag:worldgen/world_preset',
];

/** Tier-B kinds: reported (not asserted), since unmodelled nodes may remain there. */
const REPORTED_REFS: readonly string[] = [
  'resource:enchantment',
  'resource:damage_type',
  'resource:chat_type',
  'resource:jukebox_song',
  'resource:banner_pattern',
  'resource:painting_variant',
  'resource:trim_material',
  'resource:trim_pattern',
  'resource:dialog',
];

interface Finding {
  path: string;
  reason: string;
}

/** Every `unsupported` node reachable from `root`, each node visited once. */
function findUnsupported(root: SchemaNode): Finding[] {
  const seen = new Set<SchemaNode>();
  const found: Finding[] = [];
  const stack: { node: SchemaNode; path: string }[] = [{ node: root, path: '' }];
  while (stack.length > 0) {
    const { node, path } = stack.pop() as { node: SchemaNode; path: string };
    if (seen.has(node)) continue;
    seen.add(node);
    switch (node.kind) {
      case 'unsupported':
        found.push({ path: path || '/', reason: `${node.rawKind}: ${node.reason}` });
        break;
      case 'struct':
        for (const field of node.fields) {
          stack.push({ node: field.type, path: `${path}/${field.key}` });
          if (field.keyType) stack.push({ node: field.keyType, path: `${path}/${field.key}<key>` });
        }
        node.spreads.forEach((spread, i) => {
          stack.push({ node: spread, path: `${path}/...${i}` });
        });
        break;
      case 'list':
        stack.push({ node: node.item, path: `${path}/[]` });
        break;
      case 'tuple':
        node.items.forEach((item, i) => {
          stack.push({ node: item, path: `${path}/${i}` });
        });
        break;
      case 'union':
        node.members.forEach((member, i) => {
          stack.push({ node: member, path: `${path}/|${i}` });
        });
        break;
      case 'reference':
        stack.push({ node: node.resolve(), path: `${path}->${node.path}` });
        break;
      case 'dispatcher':
        for (const key of node.keys()) {
          const member = node.dispatch(key);
          if (member) stack.push({ node: member, path: `${path}/[${node.registry}=${key}]` });
        }
        break;
      default:
        break;
    }
  }
  return found;
}

async function loadIndex(): Promise<SchemaIndex> {
  const raw = JSON.parse(await readFile(vendored.vanillaMcdocSymbols, 'utf8')) as unknown;
  return createSchemaIndex(parseVanillaMcdocSymbols(raw), { mcVersion: target.mcVersion });
}

describe(`${target.id} schema coverage`, () => {
  it.each(COVERED_REFS)('reaches no unsupported node from %s', async (ref) => {
    const index = await loadIndex();
    const findings = findUnsupported(index.resolveSchemaRef(ref));
    expect(findings.map((f) => `${f.path} (${f.reason})`)).toEqual([]);
  });

  it('instantiates tag schemas per registry with id entries', async () => {
    const index = await loadIndex();
    const tag = index.resolveSchemaRef('tag:item');
    expect(tag.kind).toBe('struct');
    expect(index.resolveSchemaRef('tag:item')).toBe(tag);
    expect(index.resolveSchemaRef('tag:block')).not.toBe(tag);
  });

  it('reports the unsupported nodes left in other kinds', async () => {
    const index = await loadIndex();
    for (const ref of REPORTED_REFS) {
      const findings = findUnsupported(index.resolveSchemaRef(ref));
      console.log(`${ref}: ${findings.length} unsupported`);
      for (const finding of findings) console.log(`  ${finding.path} (${finding.reason})`);
    }
  });
});
