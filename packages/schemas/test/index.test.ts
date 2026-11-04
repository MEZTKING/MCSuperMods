import { describe, expect, it } from 'vitest';
import {
  createSchemaIndex,
  parseVanillaMcdocSymbols,
  type SchemaField,
  type SchemaNode,
  SchemaNotFoundError,
} from '../src/index';
import { loadFixtureJson } from './fixture';

const symbols = parseVanillaMcdocSymbols(loadFixtureJson());

function struct(node: SchemaNode): SchemaNode & { kind: 'struct' } {
  if (node.kind !== 'struct') throw new Error(`expected struct, got ${node.kind}`);
  return node;
}

function field(node: SchemaNode, key: string): SchemaField | undefined {
  return struct(node).fields.find((f) => f.key === key);
}

function collectKinds(node: SchemaNode, seen: Set<SchemaNode>, counts: Map<string, number>): void {
  if (seen.has(node)) return;
  seen.add(node);
  counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
  switch (node.kind) {
    case 'struct':
      for (const f of node.fields) {
        collectKinds(f.type, seen, counts);
        if (f.keyType !== undefined) collectKinds(f.keyType, seen, counts);
      }
      for (const s of node.spreads) collectKinds(s, seen, counts);
      break;
    case 'list':
      collectKinds(node.item, seen, counts);
      break;
    case 'tuple':
      for (const item of node.items) collectKinds(item, seen, counts);
      break;
    case 'union':
      for (const m of node.members) collectKinds(m, seen, counts);
      break;
    case 'reference':
      collectKinds(node.resolve(), seen, counts);
      break;
    case 'dispatcher':
      for (const key of node.keys()) {
        const member = node.dispatch(key);
        if (member !== undefined) collectKinds(member, seen, counts);
      }
      break;
    default:
      break;
  }
}

describe('createSchemaIndex over the fixture subset', () => {
  const index = createSchemaIndex(symbols, { mcVersion: '1.21.5' });

  it('exposes ref, version and sorted type paths', () => {
    expect(index.ref).toBe(symbols.ref);
    expect(index.mcVersion).toBe('1.21.5');
    const paths = index.typePaths();
    expect([...paths]).toEqual([...paths].sort());
    expect(paths).toContain('::java::data::recipe::Recipe');
    expect(index.has('::java::assets::model::Model')).toBe(true);
    expect(index.has('::java::nope::Nope')).toBe(false);
  });

  it('normalises Recipe: type id string plus one dispatcher spread', () => {
    const recipe = struct(index.resolve('::java::data::recipe::Recipe'));
    const type = field(recipe, 'type');
    expect(type?.type.kind).toBe('string');
    expect(type?.type.kind === 'string' && type.type.idRegistry).toBe('recipe_serializer');
    expect(recipe.spreads).toHaveLength(1);
    const spread = recipe.spreads[0];
    expect(spread?.kind).toBe('dispatcher');
    if (spread?.kind !== 'dispatcher') throw new Error('unreachable');
    expect(spread.registry).toBe('minecraft:recipe_serializer');
    expect(spread.discriminator).toEqual(['type']);
    expect(spread.keys()).toContain('crafting_shaped');
    const shaped = spread.dispatch('crafting_shaped');
    expect(shaped).toBe(index.resolve('::java::data::recipe::CraftingShaped'));
    expect(field(shaped as SchemaNode, 'pattern')).toBeDefined();
  });

  it('memoises resolve and returns the same node through dispatch', () => {
    const recipe = index.resolve('::java::data::recipe::Recipe');
    expect(index.resolve('::java::data::recipe::Recipe')).toBe(recipe);
    expect(index.dispatch('minecraft:resource', 'recipe')).toBe(recipe);
    expect(index.dispatch('minecraft:resource', 'minecraft:recipe')).toBe(recipe);
    expect(index.dispatch('minecraft:resource', 'nope')).toBeUndefined();
    expect(index.dispatch('minecraft:nope', 'recipe')).toBeUndefined();
    expect(index.dispatcherKeys('minecraft:resource')).toEqual(['model', 'recipe']);
    expect(index.dispatcherKeys('minecraft:nope')).toEqual([]);
  });

  it('normalises Model: optional parent with model ids, gui_light union, map-like textures', () => {
    const model = index.resolve('::java::assets::model::Model');
    const parent = field(model, 'parent');
    expect(parent?.optional).toBe(true);
    expect(parent?.type.kind === 'string' && parent.type.idRegistry).toBe('model');
    const guiLight = field(model, 'gui_light')?.type;
    expect(guiLight?.kind === 'union' && guiLight.members.map((m) => m.kind)).toEqual([
      'literal',
      'literal',
    ]);
    const textures = field(model, 'textures')?.type;
    expect(textures && field(textures, '*')?.optional).toBe(true);
  });

  it('gives Model.textures a texture_slot key type and tags its values', () => {
    const textures = field(index.resolve('::java::assets::model::Model'), 'textures')?.type;
    const slot = textures && field(textures, '*');
    expect(slot?.keyType?.kind).toBe('string');
    expect(slot?.keyType?.tags).toEqual(['texture_slot']);
    const value = slot?.type;
    if (value?.kind !== 'union') throw new Error('expected a union of texture values');
    expect(value.members[0]?.kind).toBe('string');
    expect(value.members[0]?.tags).toEqual(['texture_slot']);
  });

  it('instantiates ItemStack and MinMaxBounds<int> from the fixture', () => {
    const stack = struct(index.resolve('::java::world::item::ItemStack'));
    expect(field(stack, 'id')).toBeDefined();
    const count = field(stack, 'count')?.type;
    expect(count?.kind === 'number' && count.numberKind).toBe('int');
    const amplifier = field(
      index.resolve('::java::data::advancement::predicate::MobEffectPredicate'),
      'amplifier',
    )?.type;
    if (amplifier?.kind !== 'union') throw new Error('expected MinMaxBounds<int> to be a union');
    expect(amplifier.members[0]?.kind === 'number' && amplifier.members[0].numberKind).toBe('int');
    const bounds = struct(amplifier.members[1] as SchemaNode);
    expect(bounds.fields.map((f) => [f.key, f.type.kind])).toEqual([
      ['min', 'number'],
      ['max', 'number'],
    ]);
    // Identical instantiations share one node.
    const duration = field(
      index.resolve('::java::data::advancement::predicate::MobEffectPredicate'),
      'duration',
    )?.type;
    expect(duration).toBe(amplifier);
  });

  it('resolves schema references by type path or resource category', () => {
    expect(index.resolveSchemaRef('::java::assets::model::Model')).toBe(
      index.resolve('::java::assets::model::Model'),
    );
    expect(index.resolveSchemaRef('resource:model')).toBe(
      index.resolve('::java::assets::model::Model'),
    );
    expect(index.resolveSchemaRef('resource:minecraft:recipe')).toBe(
      index.resolve('::java::data::recipe::Recipe'),
    );
    expect(() => index.resolveSchemaRef('resource:nope')).toThrow(SchemaNotFoundError);
    expect(() => index.resolveSchemaRef('resource:')).toThrow(SchemaNotFoundError);
    expect(() => index.resolveSchemaRef('::java::nope::Nope')).toThrow(SchemaNotFoundError);
  });

  it('throws SchemaNotFoundError for an unknown path', () => {
    expect(() => index.resolve('::java::nope::Nope')).toThrow(SchemaNotFoundError);
  });

  it('gates fields by #[since]', () => {
    // ModelElement.light_emission is #[since="1.21.2"] in the fixture.
    const path = '::java::assets::model::ModelElement';
    const older = createSchemaIndex(symbols, { mcVersion: '1.21.1' });
    const newer = createSchemaIndex(symbols, { mcVersion: '1.21.2' });
    expect(field(older.resolve(path), 'light_emission')).toBeUndefined();
    expect(field(newer.resolve(path), 'light_emission')).toBeDefined();
  });

  it('gates fields by #[until]', () => {
    // Model.overrides is #[until="1.21.4"] in the fixture.
    const path = '::java::assets::model::Model';
    const older = createSchemaIndex(symbols, { mcVersion: '1.21.3' });
    const newer = createSchemaIndex(symbols, { mcVersion: '1.21.4' });
    expect(field(older.resolve(path), 'overrides')).toBeDefined();
    expect(field(newer.resolve(path), 'overrides')).toBeUndefined();
  });

  it('walks every reachable node without throwing and counts unsupported kinds', () => {
    const counts = new Map<string, number>();
    const seen = new Set<SchemaNode>();
    for (const path of index.typePaths()) collectKinds(index.resolve(path), seen, counts);
    expect(counts.get('struct')).toBeGreaterThan(0);
    // Generics are instantiated where they are used; the only unsupported nodes left are
    // the template declarations themselves, resolved here by path without arguments.
    const templates = index
      .typePaths()
      .filter((path) => symbols.mcdoc[path]?.kind === 'template').length;
    expect(templates).toBeGreaterThan(0);
    expect(counts.get('unsupported')).toBe(templates);
  });
});
