/**
 * The 11 processor types (B638), each as the spike B634's before-and-after worlds showed it on both
 * targets (`docs/reference/spikes/b634/README.md`, "Processor list for B638"). A processor is
 * compiled once from its JSON (where a refused block state refuses the whole list) and then run over
 * the cells of a template. Random ones draw from MSM's own seeded random: the game's per-placement
 * random was not reproducible even at the same position, so the view compares shares, not cells.
 */

import { type BlockTags, isObject } from '../../features/blocks';
import { sampleInt } from '../../features/providers';
import type { FeatureRandom } from '../../features/random';
import type { PieceRotation, ProcessorFidelity, ProcessorWorld } from '../api';
import type { Vec3 } from '../boxes';
import {
  type Cell,
  type Cells,
  cellChanged,
  idOfState,
  normaliseState,
  readProcessorState,
  stateMatches,
  worldPos,
} from './cells';
import { Report, typeId } from './report';
import {
  AGE_CRYING_CHANCE,
  AGE_SLABS,
  AGE_STAIRS,
  AGE_WALLS,
  AGE_WHOLE,
  BLACKSTONE_TABLE,
  isFullBlock,
  keepsShape,
} from './tables';
import { compilePosTest, compileRuleTest } from './tests';

const AIR = 'minecraft:air';

/** What a processor reads while it runs. */
export interface RunContext {
  readonly origin: Vec3;
  readonly rotation: PieceRotation;
  readonly world: ProcessorWorld;
  readonly random: FeatureRandom;
  /** The final state of the jigsaw block at a template position (`minecraft:air` by default). */
  readonly jigsawFinal: (cell: Cell) => string;
}

/** A compiled processor. */
export interface CompiledProcessor {
  /** Its type id, as `minecraft:rule`. */
  readonly type: string;
  readonly report: Report;
  run(cells: Cells, ctx: RunContext): Cells;
}

/** The processor types MSM applies, with how faithfully (the schema walk reads this list). */
export const PROCESSOR_TYPES: Readonly<Record<string, ProcessorFidelity>> = Object.freeze({
  'minecraft:nop': 'exact',
  'minecraft:block_ignore': 'exact',
  'minecraft:block_rot': 'exact',
  'minecraft:rule': 'exact',
  'minecraft:capped': 'exact',
  'minecraft:gravity': 'exact',
  'minecraft:protected_blocks': 'exact',
  'minecraft:jigsaw_replacement': 'exact',
  'minecraft:blackstone_replace': 'exact',
  'minecraft:block_age': 'about_right',
  'minecraft:lava_submerged_block': 'about_right',
});

/** The block entity modifiers MSM applies (`append_loot`, `append_static`). */
export const BLOCK_ENTITY_MODIFIERS: Readonly<Record<string, ProcessorFidelity>> = Object.freeze({
  'minecraft:append_loot': 'exact',
  'minecraft:append_static': 'exact',
});

/** Block entity modifiers named only (limit 4L4: the spike did not measure them). */
export const BLOCK_ENTITY_MODIFIERS_ONLY_IN_THE_GAME: Readonly<Record<string, string>> =
  Object.freeze({
    'minecraft:clear':
      'The block entity modifier clear is only in the game; the block’s data is shown unchanged.',
    'minecraft:passthrough':
      'The block entity modifier passthrough is only in the game; the block’s data is shown unchanged.',
  });

const AGE_NOTE =
  'Block age is about right: MSM ages the stone family as the game was seen to, with its own random.';
const LAVA_NOTE =
  'Over lava, blocks that do not fill their cell are left out as the game was seen to; which blocks fill their cell is MSM’s guess by name, and water was not tried.';
const GRAVITY_NOTE =
  'The ground under this template is uneven, so gravity is about right here: it was learned on a flat floor.';

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function withId(state: string, id: string, keep: boolean): string {
  if (!keep) return id;
  const i = state.indexOf('[');
  return normaliseState(i === -1 ? id : id + state.slice(i));
}

/** Reads a block set given as a tag (`#minecraft:x`) or a list of block ids. */
function blockSet(
  value: unknown,
  tags: BlockTags,
  where: string,
): ((id: string) => boolean) | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    const tag = value.replace(/^#/, '');
    return (id) => tags.has(tag, id);
  }
  if (Array.isArray(value)) {
    const ids = new Set(value.map((v) => idOfState(readProcessorState(v, where))));
    return (id) => ids.has(id);
  }
  return () => false;
}

/** A block entity modifier as a function of the old data. */
function compileModifier(
  json: unknown,
  report: Report,
): (nbt: unknown, random: FeatureRandom) => unknown {
  if (json === undefined) return (nbt) => nbt;
  const type = isObject(json) ? typeId(json.type) : '';
  const named = BLOCK_ENTITY_MODIFIERS_ONLY_IN_THE_GAME[type];
  if (named) {
    report.mark('about_right', named);
    return (nbt) => nbt;
  }
  if (type === 'minecraft:append_loot' && isObject(json)) {
    const table = typeof json.loot_table === 'string' ? json.loot_table : '';
    return (nbt, random) => ({
      ...(isObject(nbt) ? nbt : {}),
      LootTable: table,
      LootTableSeed: Number(BigInt.asIntN(52, random.nextLong())),
    });
  }
  if (type === 'minecraft:append_static' && isObject(json)) {
    const data = json.data;
    if (!isObject(data)) {
      report.mark('about_right', 'Static block entity data written as text is not read here.');
      return (nbt) => nbt;
    }
    return (nbt) => ({ ...(isObject(nbt) ? nbt : {}), ...data });
  }
  report.mark(
    'only_in_game',
    `The block entity modifier ${type || '(unnamed)'} is only in the game; the block’s data is shown unchanged.`,
  );
  return (nbt) => nbt;
}

function mapCells(cells: Cells, fn: (cell: Cell) => Cell | null): Cells {
  return cells.map((cell) => (cell === null ? null : fn(cell)));
}

function setState(cell: Cell, state: string): Cell {
  return state === cell.state ? cell : { ...cell, state };
}

function worldState(ctx: RunContext, pos: Vec3): string {
  return ctx.world.blockAt(pos[0], pos[1], pos[2]) ?? AIR;
}

/**
 * Compiles one processor of a list. Throws {@link RefusedList} when its JSON writes a block state
 * the game refuses.
 */
export function compileProcessor(json: unknown, tags: BlockTags): CompiledProcessor {
  const report = new Report();
  const type = isObject(json) ? typeId(json.processor_type) : '';
  const make = (run: CompiledProcessor['run']): CompiledProcessor => ({ type, report, run });
  if (!isObject(json)) {
    report.mark(
      'only_in_game',
      'A processor is not an object; the template is shown unchanged for it.',
    );
    return make((cells) => cells);
  }
  switch (type) {
    case 'minecraft:nop':
      return make((cells) => cells);

    case 'minecraft:jigsaw_replacement':
      return make((cells, ctx) =>
        mapCells(cells, (cell) =>
          idOfState(cell.state) === 'minecraft:jigsaw'
            ? { pos: cell.pos, state: ctx.jigsawFinal(cell), dy: cell.dy }
            : cell,
        ),
      );

    case 'minecraft:block_ignore': {
      const blocks = (Array.isArray(json.blocks) ? json.blocks : []).map((b) =>
        readProcessorState(b, 'block_ignore'),
      );
      return make((cells) =>
        mapCells(cells, (cell) => (blocks.some((b) => stateMatches(cell.state, b)) ? null : cell)),
      );
    }

    case 'minecraft:block_rot': {
      const integrity = num(json.integrity, 1);
      const rottable = blockSet(json.rottable_blocks, tags, 'block_rot');
      return make((cells, ctx) =>
        mapCells(cells, (cell) => {
          if (rottable && !rottable(idOfState(cell.state))) return cell;
          return ctx.random.nextFloat() < integrity ? cell : null;
        }),
      );
    }

    case 'minecraft:rule': {
      const rules = (Array.isArray(json.rules) ? json.rules : []).map((r, i) => {
        const rule = isObject(r) ? r : {};
        return {
          input: compileRuleTest(rule.input_predicate, tags, report),
          location: compileRuleTest(rule.location_predicate, tags, report),
          position: compilePosTest(rule.position_predicate, report),
          output: readProcessorState(rule.output_state, `rule ${i + 1}’s output_state`),
          modifier: compileModifier(rule.block_entity_modifier, report),
        };
      });
      return make((cells, ctx) =>
        mapCells(cells, (cell) => {
          const pos = worldPos(cell, ctx.origin, ctx.rotation);
          const there = worldState(ctx, pos);
          for (const rule of rules) {
            if (
              rule.input(cell.state, pos[1], ctx.random) &&
              rule.location(there, pos[1], ctx.random) &&
              rule.position(pos, ctx.origin, ctx.random)
            ) {
              const nbt = rule.modifier(cell.nbt, ctx.random);
              return {
                pos: cell.pos,
                state: rule.output,
                dy: cell.dy,
                ...(nbt === undefined ? {} : { nbt }),
              };
            }
          }
          return cell;
        }),
      );
    }

    case 'minecraft:capped': {
      const delegate = compileProcessor(json.delegate, tags);
      const limit = json.limit;
      for (const note of delegate.report.notes) report.mark(delegate.report.fidelity, note);
      report.mark(delegate.report.fidelity);
      return make((cells, ctx) => {
        const out = delegate.run(cells, ctx);
        const changed: number[] = [];
        for (let i = 0; i < cells.length; i += 1)
          if (cellChanged(cells[i] ?? null, out[i] ?? null)) changed.push(i);
        const keep = Math.max(0, sampleInt(limit, ctx.random));
        if (changed.length <= keep) return out;
        // Pick `keep` of the changed blocks at random; the rest stay as they were.
        for (let i = changed.length - 1; i > 0; i -= 1) {
          const j = ctx.random.nextInt(i + 1);
          const t = changed[i] as number;
          changed[i] = changed[j] as number;
          changed[j] = t;
        }
        const result = cells.slice();
        for (const i of changed.slice(0, keep)) result[i] = out[i] ?? null;
        return result;
      });
    }

    case 'minecraft:gravity': {
      const offset = Math.floor(num(json.offset, 0));
      return make((cells, ctx) => {
        const surfaces = new Set<number>();
        const out = mapCells(cells, (cell) => {
          const pos = worldPos(cell, ctx.origin, ctx.rotation);
          const surface = ctx.world.surfaceAt(pos[0], pos[2]);
          if (surface === null) return cell;
          surfaces.add(surface);
          const dy = surface + offset - ctx.origin[1];
          return dy === cell.dy ? cell : { ...cell, dy };
        });
        if (surfaces.size > 1) report.mark('about_right', GRAVITY_NOTE);
        return out;
      });
    }

    case 'minecraft:protected_blocks': {
      const value = json.value;
      const protectedSet = blockSet(value, tags, 'protected_blocks') ?? (() => false);
      return make((cells, ctx) =>
        mapCells(cells, (cell) => {
          const there = idOfState(worldState(ctx, worldPos(cell, ctx.origin, ctx.rotation)));
          return protectedSet(there) ? null : cell;
        }),
      );
    }

    case 'minecraft:blackstone_replace':
      return make((cells) =>
        mapCells(cells, (cell) => {
          const id = idOfState(cell.state);
          const to = BLACKSTONE_TABLE[id];
          return to
            ? setState(cell, withId(cell.state, to, keepsShape(id) && keepsShape(to)))
            : cell;
        }),
      );

    case 'minecraft:block_age': {
      report.mark('about_right', AGE_NOTE);
      const mossiness = num(json.mossiness, 0);
      return make((cells, ctx) =>
        mapCells(cells, (cell) => {
          const id = idOfState(cell.state);
          const r = ctx.random;
          if (AGE_WHOLE.has(id)) {
            if (r.nextFloat() < 0.5) return cell;
            const mossy = r.nextFloat() < mossiness;
            const stairs = r.nextFloat() < 0.5;
            const to = mossy
              ? stairs
                ? 'minecraft:mossy_stone_brick_stairs'
                : 'minecraft:mossy_stone_bricks'
              : stairs
                ? 'minecraft:stone_brick_stairs'
                : 'minecraft:cracked_stone_bricks';
            return setState(cell, to);
          }
          if (AGE_STAIRS.has(id)) {
            if (r.nextFloat() < 0.5) return cell;
            const mossy = r.nextFloat() < mossiness;
            const stairs = r.nextFloat() < 0.5;
            if (mossy) {
              return setState(
                cell,
                stairs
                  ? withId(cell.state, 'minecraft:mossy_stone_brick_stairs', true)
                  : 'minecraft:mossy_stone_brick_slab',
              );
            }
            return setState(cell, stairs ? 'minecraft:stone_brick_slab' : 'minecraft:stone_slab');
          }
          if (AGE_SLABS.has(id) || AGE_WALLS.has(id)) {
            if (!(r.nextFloat() < mossiness)) return cell;
            const to = AGE_SLABS.has(id)
              ? 'minecraft:mossy_stone_brick_slab'
              : 'minecraft:mossy_stone_brick_wall';
            return setState(cell, withId(cell.state, to, true));
          }
          if (id === 'minecraft:obsidian') {
            return r.nextFloat() < AGE_CRYING_CHANCE
              ? setState(cell, 'minecraft:crying_obsidian')
              : cell;
          }
          return cell;
        }),
      );
    }

    case 'minecraft:lava_submerged_block':
      report.mark('about_right', LAVA_NOTE);
      return make((cells, ctx) =>
        mapCells(cells, (cell) => {
          const there = idOfState(worldState(ctx, worldPos(cell, ctx.origin, ctx.rotation)));
          if (there !== 'minecraft:lava') return cell;
          const id = idOfState(cell.state);
          return id === AIR || isFullBlock(id) ? cell : null;
        }),
      );

    default:
      report.mark(
        'only_in_game',
        `The processor type ${type || '(unnamed)'} is only in the game; the template is shown unchanged for it.`,
      );
      return make((cells) => cells);
  }
}
