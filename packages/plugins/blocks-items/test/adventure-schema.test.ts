/**
 * The Item Studio's Adventure mode lists (ADR 0117 Y16): `minecraft:can_break` and
 * `minecraft:can_place_on` in an item's `msm:components`, checked by the target's own component
 * schema on both targets. One block predicate or a list is accepted, an unknown block or tag is
 * `schema.unknown-id` (so no `blocks-items.*` validator repeats it), and the old
 * `{ predicates: [...] }` form is refused, as the game refuses it.
 */
import type { Json } from '@msm/plugin-api';
import { validateJson } from '@msm/schemas';
import { builtInTargets } from '@msm/targets';
import { describe, expect, it } from 'vitest';
import { indexesFor } from './support';

const item = (value: Json): Json => ({
  format: 1,
  model: 'minecraft:item/iron_pickaxe',
  components: {
    'msm:components': { 'minecraft:can_break': value, 'minecraft:can_place_on': value },
  },
});

describe.each(builtInTargets.map((bundle) => [bundle.target.id, bundle] as const))(
  'adventure mode lists on %s',
  (_id, bundle) => {
    const check = async (value: Json) => {
      const indexes = await indexesFor(bundle);
      const node = indexes.schemaIndex.resolveSchemaRef('msm:item');
      return validateJson(item(value), node, { registries: indexes.registries }).map(
        (problem) => [problem.severity, problem.code, problem.path] as const,
      );
    };

    it('accepts one predicate or a list, of blocks, project blocks and tags', async () => {
      expect(await check({ blocks: 'minecraft:stone' })).toEqual([]);
      expect(await check({ blocks: ['minecraft:stone', 'example:ruby_ore'] })).toEqual([]);
      expect(await check([{ blocks: ['minecraft:stone'] }, { blocks: '#minecraft:logs' }])).toEqual(
        [],
      );
    });

    it('warns about an unknown block or tag', async () => {
      expect(await check({ blocks: ['minecraft:no_such_block'] })).toEqual([
        ['warning', 'schema.unknown-id', '/components/msm:components/minecraft:can_break/blocks/0'],
        [
          'warning',
          'schema.unknown-id',
          '/components/msm:components/minecraft:can_place_on/blocks/0',
        ],
      ]);
      expect((await check({ blocks: '#minecraft:no_such_tag' })).map((entry) => entry[1])).toEqual([
        'schema.unknown-id',
        'schema.unknown-id',
      ]);
    });

    it('refuses the old predicates form', async () => {
      const problems = await check({ predicates: [{ blocks: 'minecraft:stone' }] });
      expect(problems.filter((entry) => entry[0] === 'error').length).toBeGreaterThan(0);
    });
  },
);
