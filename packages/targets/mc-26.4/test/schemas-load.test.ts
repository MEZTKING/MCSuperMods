import { readFile } from 'node:fs/promises';
import { createSchemaIndex, parseVanillaMcdocSymbols, type SchemaNode } from '@msm/schemas';
import { describe, expect, it } from 'vitest';
import { target, vendored } from '../src/index';

/** Counts `unsupported` nodes reachable from `node`, following references up to `depth`. */
function countUnsupported(node: SchemaNode, depth: number, seen = new Set<SchemaNode>()): number {
  if (depth < 0 || seen.has(node)) return 0;
  seen.add(node);
  switch (node.kind) {
    case 'unsupported':
      return 1;
    case 'struct':
      return (
        node.fields.reduce(
          (sum, field) =>
            sum +
            countUnsupported(field.type, depth - 1, seen) +
            (field.keyType ? countUnsupported(field.keyType, depth - 1, seen) : 0),
          0,
        ) + node.spreads.reduce((sum, spread) => sum + countUnsupported(spread, depth - 1, seen), 0)
      );
    case 'list':
      return countUnsupported(node.item, depth - 1, seen);
    case 'tuple':
      return node.items.reduce((sum, item) => sum + countUnsupported(item, depth - 1, seen), 0);
    case 'union':
      return node.members.reduce(
        (sum, member) => sum + countUnsupported(member, depth - 1, seen),
        0,
      );
    case 'reference':
      return countUnsupported(node.resolve(), depth - 1, seen);
    case 'dispatcher':
      return node.keys().reduce((sum, key) => {
        const member = node.dispatch(key);
        return member ? sum + countUnsupported(member, depth - 1, seen) : sum;
      }, 0);
    default:
      return 0;
  }
}

function field(node: SchemaNode | undefined, key: string) {
  if (node?.kind !== 'struct') return undefined;
  return node.fields.find((candidate) => candidate.key === key);
}

describe('26.4 schemas load', () => {
  it('loads the vendored vanilla-mcdoc export through @msm/schemas', async () => {
    const started = performance.now();

    const raw = JSON.parse(await readFile(vendored.vanillaMcdocSymbols, 'utf8')) as unknown;
    const symbols = parseVanillaMcdocSymbols(raw);
    const index = createSchemaIndex(symbols, { mcVersion: target.mcVersion });

    expect(index.typePaths().length).toBeGreaterThanOrEqual(2000);

    const recipe = index.resolve('::java::data::recipe::Recipe');
    expect(recipe.kind).toBe('struct');
    expect(field(recipe, 'type')?.type).toMatchObject({
      kind: 'string',
      idRegistry: 'recipe_serializer',
    });

    expect(index.dispatch('minecraft:resource', 'recipe')).toBeDefined();

    const shaped = index.dispatch('minecraft:recipe_serializer', 'minecraft:crafting_shaped');
    expect(shaped?.kind).toBe('struct');
    expect(field(shaped, 'pattern')).toBeDefined();

    const model = index.resolve('::java::assets::model::Model');
    expect(field(model, 'parent')?.optional).toBe(true);

    const unsupported = countUnsupported(recipe, 4);
    console.log(`unsupported nodes reachable from Recipe (depth <= 4): ${unsupported}`);

    expect(performance.now() - started).toBeLessThan(5000);
  });
});
