import type { SchemaNode } from './schema-node';

/** Deep-freezes a hand-written node so shared extension nodes cannot be mutated. */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) frozen(entry);
    Object.freeze(value);
  }
  return value;
}

const int = (min?: number): SchemaNode =>
  min === undefined
    ? { kind: 'number', numberKind: 'int' }
    : { kind: 'number', numberKind: 'int', range: { min } };
const double = (): SchemaNode => ({ kind: 'number', numberKind: 'double' });
const string = (desc?: string): SchemaNode =>
  desc === undefined ? { kind: 'string' } : { kind: 'string', desc };
const field = (key: string, type: SchemaNode, optional = false, desc?: string) =>
  desc === undefined ? { key, type, optional } : { key, type, optional, desc };
const struct = (...fields: ReturnType<typeof field>[]): SchemaNode => ({
  kind: 'struct',
  fields,
  spreads: [],
});
const list = (item: SchemaNode): SchemaNode => ({ kind: 'list', item });

/** The `msm:structure_template` node (ADR 0021, plan D1). */
function structureTemplate(): SchemaNode {
  const blockPos = (): SchemaNode => ({ kind: 'tuple', items: [int(), int(), int()] });
  const snbt = "Block or entity NBT in SNBT, Minecraft's text form.";
  const blockState = 'A block state such as `minecraft:oak_stairs[facing=north]`.';
  return struct(
    field(
      'size',
      { kind: 'tuple', items: [int(1), int(1), int(1)] },
      false,
      'Size in blocks, `[x, y, z]`.',
    ),
    field('palette', list(string(blockState)), false, 'Block states used by `blocks`.'),
    field(
      'blocks',
      list({ kind: 'tuple', items: [int(0), int(0), int(0), int(0)] }),
      false,
      '`[x, y, z, paletteIndex]` per block; absent positions are structure void.',
    ),
    field(
      'block_entities',
      list(struct(field('pos', blockPos()), field('nbt', string(snbt)))),
      true,
      'Block entity data, excluding jigsaw blocks.',
    ),
    field(
      'jigsaws',
      list(
        struct(
          field('pos', blockPos()),
          field('pool', { kind: 'string', idRegistry: 'worldgen/template_pool' }),
          field('name', string()),
          field('target', string()),
          field('final_state', string(blockState)),
          field(
            'joint',
            {
              kind: 'enum',
              values: [
                { identifier: 'Rollable', value: 'rollable' },
                { identifier: 'Aligned', value: 'aligned' },
              ],
            },
            true,
          ),
          field('placement_priority', int(), true),
          field('selection_priority', int(), true),
        ),
      ),
      true,
      'Jigsaw blocks with their connection data.',
    ),
    field(
      'entities',
      list(
        struct(
          field('pos', { kind: 'tuple', items: [double(), double(), double()] }),
          field('block_pos', blockPos()),
          field('nbt', string(snbt)),
        ),
      ),
      true,
      'Entities, with their data in SNBT.',
    ),
  );
}

/**
 * MSM's built-in schema extensions: schema references that are neither mcdoc type paths nor
 * `resource:`/`tag:` references, resolved by `SchemaIndex.resolveSchemaRef`. Hand-written in
 * TypeScript until compiled MSM mcdoc replaces them behind the same references (Phase 4).
 *
 * - `msm:function`: an mcfunction source stored as one string per line (`{ "lines": [...] }`).
 * - `msm:structure_template`: a structure template stored as JSON and lowered to a vanilla
 *   structure `.nbt` file (ADR 0021): `size` `[x, y, z]`, `palette` block-state strings,
 *   `blocks` `[x, y, z, paletteIndex]` tuples, optional `block_entities` and `entities` with
 *   SNBT `nbt` strings, and optional `jigsaws` whose `pool` is a `worldgen/template_pool` id.
 */
export const BUILT_IN_EXTENSIONS: Readonly<Record<string, SchemaNode>> = frozen({
  'msm:function': {
    kind: 'struct',
    fields: [{ key: 'lines', optional: false, type: { kind: 'list', item: { kind: 'string' } } }],
    spreads: [],
  },
  'msm:structure_template': structureTemplate(),
});
