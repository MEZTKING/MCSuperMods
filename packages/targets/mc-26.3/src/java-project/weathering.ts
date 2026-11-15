/**
 * Waterlogging, weathering and waxing (ADR 0094 D7 to D9, D13) in the 26.3 generator, as the
 * runtime's `MsmWaterloggedBlock`, `registry/weathering/` and `BlockExtras` do (B449):
 *
 * - `msm:waterloggable` (only on `block`, `pillar`, `horizontal` and `directional`): the block's own
 *   class implements `SimpleWaterloggedBlock` with `WATERLOGGED`, filled on placement in water,
 *   keeping a water source (`Fluids.WATER.defaultFluidState()`) and ticking the water on shape
 *   updates;
 * - `msm:weathering`: the block's class implements `ChangeOverTimeBlock<WeatheringCopper.WeatherState>`
 *   and calls vanilla's own `changeOverTime` on random ticks, so the chance and the neighbour rule
 *   are vanilla's (a lower stage next to it, project or vanilla copper, stops it); `getNext` is the
 *   `next` block with every shared property copied, `getChanceModifier` 0.75 at the unaffected
 *   stage; a door's upper half follows its lower half through `updateShape`;
 * - `msm:waxable` and scraping: the generated `BlockWaxing`, one `UseBlockCallback` next to
 *   `BlockStripping`: honeycomb waxes (level event 3003, one honeycomb used), an axe scrapes a
 *   weathering block one stage back (`AXE_SCRAPE`, level event 3005) or unwaxes a waxed block
 *   (`AXE_WAX_OFF`, 3004) and takes one damage. Its maps hold only the project's own blocks, so a
 *   vanilla `next` or `into` is never scraped or unwaxed into a project block.
 *
 * Minecraft 26.3, Mojang names.
 *
 * @packageDocumentation
 */

import type { JavaFile } from './java';
import { identifierExpression } from './java';
import type { Reader } from './read';

/** The types `msm:waterloggable` is allowed on (ADR 0094 D7). */
export const WATERLOGGABLE_TYPES = ['block', 'pillar', 'horizontal', 'directional'];

/** The types `msm:weathering` is allowed on (ADR 0094 D8). */
export const WEATHERING_TYPES = [
  'block',
  'pillar',
  'horizontal',
  'directional',
  'slab',
  'stairs',
  'door',
  'trapdoor',
  'pane',
  'chain',
  'lantern',
];

const STAGES = ['unaffected', 'exposed', 'weathered', 'oxidized'];

/** A parsed `msm:weathering`. */
export interface WeatheringSpec {
  /** The next stage's block id, absent at the last stage. */
  readonly next: string | undefined;
  /** The `WeatheringCopper.WeatherState` constant. */
  readonly stage: string;
}

const ID = /^([a-z0-9_.-]+:)?[a-z0-9_./-]+$/;

function fullId(reader: Reader, key: string, value: string): string {
  if (!ID.test(value)) reader.fail(`${key} '${value}' is not a block id`);
  return value.includes(':') ? value : `minecraft:${value}`;
}

/** Reads `msm:weathering`, failing on a type that cannot weather (the runtime's load error). */
export function readWeathering(component: Reader, type: string): WeatheringSpec {
  component.onlyKeys(['next', 'stage'], 'msm:weathering field');
  if (!WEATHERING_TYPES.includes(type)) {
    component.fail(
      `msm:weathering is not allowed on type '${type}' (only ${WEATHERING_TYPES.join(', ')})`,
    );
  }
  const stage = component.requiredString('stage');
  if (!STAGES.includes(stage))
    component.fail(`stage '${stage}' is not one of ${STAGES.join(', ')}`);
  const next = component.optionalString('next');
  return {
    next: next === undefined ? undefined : fullId(component, 'next', next),
    stage: stage.toUpperCase(),
  };
}

/** Reads `msm:waxable`'s `into`. */
export function readWaxable(component: Reader): string {
  component.onlyKeys(['into'], 'msm:waxable field');
  return fullId(component, 'into', component.requiredString('into'));
}

/** Reads `msm:waterloggable`, failing on a type that cannot take it. */
export function readWaterloggable(component: Reader, type: string): true {
  component.onlyKeys([], 'msm:waterloggable field');
  if (!WATERLOGGABLE_TYPES.includes(type)) {
    component.fail(
      `msm:waterloggable is not allowed on type '${type}' (only ${WATERLOGGABLE_TYPES.join(', ')}; the others that hold water do so by themselves)`,
    );
  }
  return true;
}

/** The `getStateForPlacement` value of a waterlogged block, given the state without water. */
export function waterloggedPlacement(file: JavaFile, state: string): string {
  const fluids = file.use('net.minecraft.world.level.material.Fluids');
  return `${state}.setValue(WATERLOGGED, context.getLevel().getFluidState(context.getClickedPos()).getType() == ${fluids}.WATER)`;
}

/**
 * The members of a waterlogged block's class (`MsmWaterloggedBlock`): the fluid state and the
 * water tick on shape updates; a non-facing type also places in water through `super`'s state.
 *
 * @param placement - Whether to write `getStateForPlacement` (the facing types write their own).
 */
export function waterlogMembers(file: JavaFile, placement: boolean): string[] {
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  const fluidState = file.use('net.minecraft.world.level.material.FluidState');
  const fluids = file.use('net.minecraft.world.level.material.Fluids');
  const levelReader = file.use('net.minecraft.world.level.LevelReader');
  const ticks = file.use('net.minecraft.world.level.ScheduledTickAccess');
  const blockPos = file.use('net.minecraft.core.BlockPos');
  const direction = file.use('net.minecraft.core.Direction');
  const random = file.use('net.minecraft.util.RandomSource');
  const out: string[] = [];
  if (placement) {
    const placeContext = file.use('net.minecraft.world.item.context.BlockPlaceContext');
    out.push(
      '',
      '/** msm:waterloggable: placed in water, it holds the water. */',
      '@Override',
      `public ${blockState} getStateForPlacement(${placeContext} context) {`,
      `    ${blockState} state = super.getStateForPlacement(context);`,
      `    return state == null ? null : ${waterloggedPlacement(file, 'state')};`,
      '}',
    );
  }
  out.push(
    '',
    '/** msm:waterloggable: a water source while waterlogged. */',
    '@Override',
    `protected ${fluidState} getFluidState(${blockState} state) {`,
    `    return state.getValue(WATERLOGGED) ? ${fluids}.WATER.defaultFluidState() : super.getFluidState(state);`,
    '}',
    '',
    '/** msm:waterloggable: the water keeps flowing from a waterlogged block. */',
    '@Override',
    `protected ${blockState} updateShape(${blockState} state, ${levelReader} level, ${ticks} ticks, ${blockPos} pos, ${direction} direction,`,
    `        ${blockPos} neighbourPos, ${blockState} neighbour, ${random} random) {`,
    '    if (state.getValue(WATERLOGGED)) {',
    `        ticks.scheduleTick(pos, ${fluids}.WATER, ${fluids}.WATER.getTickDelay(level));`,
    '    }',
    '    return super.updateShape(state, level, ticks, pos, direction, neighbourPos, neighbour, random);',
    '}',
  );
  return out;
}

/** The interface a weathering block implements. */
export function weatheringInterface(file: JavaFile): string {
  const changeOverTime = file.use('net.minecraft.world.level.block.ChangeOverTimeBlock');
  const copper = file.use('net.minecraft.world.level.block.WeatheringCopper');
  return `${changeOverTime}<${copper}.WeatherState>`;
}

/** The `randomTick` body line that ages a weathering block (vanilla's own `changeOverTime`). */
export const WEATHER_TICK =
  "changeOverTime(state, level, pos, random); // msm:weathering: vanilla's chance and neighbour rule";

/**
 * The members of a weathering block's class (ADR 0094 D8; `MsmWeatheringBlock` and its kin).
 *
 * @param ownRandomTick - Whether the class writes `randomTick` for `msm:on_random_tick` (it then
 *   ages the block itself, see {@link WEATHER_TICK}).
 * @param door - Whether the block is a door (only the lower half ages; the upper half follows).
 * @param waxing - The generated `BlockWaxing` class as seen from `file`.
 */
export function weatheringMembers(
  file: JavaFile,
  spec: WeatheringSpec,
  ownRandomTick: boolean,
  door: boolean,
  waxing: string,
): string[] {
  const blockState = file.use('net.minecraft.world.level.block.state.BlockState');
  const optional = file.use('java.util.Optional');
  const copper = file.use('net.minecraft.world.level.block.WeatheringCopper');
  const out: string[] = [];
  out.push(
    '',
    spec.next === undefined
      ? '/** msm:weathering: the last stage, it ages no further. */'
      : `/** msm:weathering: ages into {@code ${spec.next}}, shared properties copied (looked up when it ages). */`,
    '@Override',
    `public ${optional}<${blockState}> getNext(${blockState} state) {`,
    spec.next === undefined
      ? `    return ${optional}.empty();`
      : `    return ${waxing}.into(state, ${identifierExpression(file, spec.next)});`,
    '}',
    '',
    '/** As vanilla copper: the unaffected stage ages 0.75 times as fast. */',
    '@Override',
    'public float getChanceModifier() {',
    `    return ${spec.stage === 'UNAFFECTED' ? '0.75f' : '1.0f'};`,
    '}',
    '',
    '@Override',
    `public ${copper}.WeatherState getAge() {`,
    `    return ${copper}.WeatherState.${spec.stage};`,
    '}',
  );
  if (spec.next !== undefined || ownRandomTick) {
    out.push(
      '',
      '@Override',
      `protected boolean isRandomlyTicking(${blockState} state) {`,
      ownRandomTick
        ? '    return true; // msm:on_random_tick'
        : '    return true; // msm:weathering: it ages',
      '}',
    );
  }
  if (!ownRandomTick && spec.next !== undefined) {
    const serverLevel = file.use('net.minecraft.server.level.ServerLevel');
    const blockPos = file.use('net.minecraft.core.BlockPos');
    const random = file.use('net.minecraft.util.RandomSource');
    out.push(
      '',
      '@Override',
      `protected void randomTick(${blockState} state, ${serverLevel} level, ${blockPos} pos, ${random} random) {`,
      ...(door
        ? [
            `    if (state.getValue(HALF) == ${halfType(file)}.LOWER) {`,
            `        ${WEATHER_TICK}`,
            '    }',
          ]
        : [`    ${WEATHER_TICK}`]),
      '}',
    );
  }
  if (door) {
    const levelReader = file.use('net.minecraft.world.level.LevelReader');
    const ticks = file.use('net.minecraft.world.level.ScheduledTickAccess');
    const blockPos = file.use('net.minecraft.core.BlockPos');
    const direction = file.use('net.minecraft.core.Direction');
    const random = file.use('net.minecraft.util.RandomSource');
    const doorBlock = file.use('net.minecraft.world.level.block.DoorBlock');
    out.push(
      '',
      '/** msm:weathering: the upper half follows the lower half when that ages, is waxed or scraped. */',
      '@Override',
      `protected ${blockState} updateShape(${blockState} state, ${levelReader} level, ${ticks} ticks, ${blockPos} pos, ${direction} direction,`,
      `        ${blockPos} neighbourPos, ${blockState} neighbour, ${random} random) {`,
      `    if (direction == ${direction}.DOWN && state.getValue(HALF) == ${halfType(file)}.UPPER && !neighbour.is(this)`,
      `            && neighbour.getBlock() instanceof ${doorBlock} && neighbour.getValue(HALF) == ${halfType(file)}.LOWER) {`,
      `        return neighbour.setValue(HALF, ${halfType(file)}.UPPER);`,
      '    }',
      '    return super.updateShape(state, level, ticks, pos, direction, neighbourPos, neighbour, random);',
      '}',
    );
  }
  return out;
}

function halfType(file: JavaFile): string {
  return file.use('net.minecraft.world.level.block.state.properties.DoubleBlockHalf');
}

/** One line of `ModBlocks.register` filling `BlockWaxing`'s maps. */
export function waxingLines(
  file: JavaFile,
  field: string,
  blockId: string,
  weathering: WeatheringSpec | undefined,
  waxInto: string | undefined,
  projectBlocks: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  if (waxInto !== undefined) {
    out.push(`BlockWaxing.wax(${field}, ${identifierExpression(file, waxInto)}); // msm:waxable`);
    if (projectBlocks.has(waxInto)) {
      out.push(
        `BlockWaxing.unwax(${identifierExpression(file, waxInto)}, ${identifierExpression(file, blockId)}); // an axe takes the wax off`,
      );
    }
  }
  if (weathering?.next !== undefined && projectBlocks.has(weathering.next)) {
    out.push(
      `BlockWaxing.scrape(${identifierExpression(file, weathering.next)}, ${identifierExpression(file, blockId)}); // an axe scrapes ${weathering.next} back to this stage`,
    );
  }
  return out;
}

/**
 * The source of `<package>/BlockWaxing.java`: honeycomb waxing, axe scraping and unwaxing (the
 * weathering half of the runtime's `BlockExtras`, B449) as one Fabric `UseBlockCallback`, and the
 * property copy the weathering blocks use for their next stage.
 */
export function blockWaxingJava(javaPackage: string): string {
  return `// Generated by MCSuperMods: msm:weathering and msm:waxable of msm_runtime (BlockExtras, B449) as a plain helper.
package ${javaPackage};

import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.BlockTransformer;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;

/**
 * msm:waxable and scraping (ADR 0094 D9): honeycomb waxes a block into its waxed copy; an axe (any item whose
 * {@code block_transformer} is {@code minecraft:axe}) scrapes a weathering block one stage back or takes the wax off a
 * waxed block. The game keeps its own waxing and scraping in maps of vanilla blocks, so these blocks are handled here,
 * before the item's own use. Only the mod's own blocks are scraped or unwaxed into others; lightning does not scrape
 * them. Doors change both halves.
 */
public final class BlockWaxing {
    /** The {@code block_transformer} entry that marks an axe. */
    public static final Identifier AXE_TRANSFORMER = Identifier.withDefaultNamespace("axe");
    /** Level events the client plays the wax, wax-off and scrape particles and sounds for. */
    private static final int WAX_ON = 3003;
    private static final int WAX_OFF = 3004;
    private static final int SCRAPE = 3005;

    private static final Map<Block, Identifier> WAX_INTO = new IdentityHashMap<>();
    private static final Map<Identifier, Identifier> UNWAX_INTO = new HashMap<>();
    private static final Map<Identifier, Identifier> PREVIOUS = new HashMap<>();
    private static boolean installed;

    private BlockWaxing() {}

    /** Honeycomb waxes {@code block} into the block {@code into}. */
    public static void wax(Block block, Identifier into) {
        WAX_INTO.put(block, into);
    }

    /** An axe turns the waxed block {@code waxed} back into {@code into}. */
    public static void unwax(Identifier waxed, Identifier into) {
        UNWAX_INTO.put(waxed, into);
    }

    /** An axe scrapes the weathering block {@code next} back into {@code previous}. */
    public static void scrape(Identifier next, Identifier previous) {
        PREVIOUS.put(next, previous);
    }

    /** Installs the callback, once. */
    public static void register() {
        if (!installed) {
            installed = true;
            UseBlockCallback.EVENT.register(BlockWaxing::use);
        }
    }

    /** {@code state} as the block {@code into}, every shared property copied; empty when {@code into} is not registered. */
    public static Optional<BlockState> into(BlockState state, Identifier into) {
        if (!BuiltInRegistries.BLOCK.containsKey(into)) {
            return Optional.empty();
        }
        return Optional.of(copyProperties(state, BuiltInRegistries.BLOCK.getValue(into).defaultBlockState()));
    }

    private static InteractionResult use(Player player, Level level, InteractionHand hand, BlockHitResult hit) {
        if (player.isSpectator()) {
            return InteractionResult.PASS;
        }
        BlockPos pos = hit.getBlockPos();
        BlockState state = level.getBlockState(pos);
        ItemStack stack = player.getItemInHand(hand);
        if (stack.is(Items.HONEYCOMB)) {
            Identifier into = WAX_INTO.get(state.getBlock());
            if (into == null) {
                return InteractionResult.PASS;
            }
            Optional<BlockState> waxed = into(state, into);
            if (waxed.isEmpty()) {
                return InteractionResult.PASS;
            }
            if (!level.isClientSide()) {
                change(level, pos, state, waxed.get(), player);
                level.levelEvent(player, WAX_ON, pos, 0);
                stack.consume(1, player);
            }
            return InteractionResult.SUCCESS;
        }
        Holder<BlockTransformer> transformer = stack.get(DataComponents.BLOCK_TRANSFORMER);
        if (transformer == null || !transformer.is(AXE_TRANSFORMER)) {
            return InteractionResult.PASS;
        }
        if (hand == InteractionHand.MAIN_HAND && player.getOffhandItem().has(DataComponents.BLOCKS_ATTACKS)
                && !player.isSecondaryUseActive()) {
            return InteractionResult.PASS;
        }
        Identifier id = BuiltInRegistries.BLOCK.getKey(state.getBlock());
        Identifier previous = PREVIOUS.get(id);
        boolean scraping = previous != null;
        Identifier into = scraping ? previous : UNWAX_INTO.get(id);
        if (into == null) {
            return InteractionResult.PASS;
        }
        Optional<BlockState> changed = into(state, into);
        if (changed.isEmpty()) {
            return InteractionResult.PASS;
        }
        if (!level.isClientSide()) {
            change(level, pos, state, changed.get(), player);
            level.playSound(null, pos, scraping ? SoundEvents.AXE_SCRAPE.value() : SoundEvents.AXE_WAX_OFF.value(), SoundSource.BLOCKS,
                    1.0f, 1.0f);
            level.levelEvent(player, scraping ? SCRAPE : WAX_OFF, pos, 0);
            stack.hurtAndBreak(1, player, hand.asEquipmentSlot());
        }
        return InteractionResult.SUCCESS;
    }

    /** Sets {@code to} at {@code pos}, and at the other half of a two-block-high block. */
    private static void change(Level level, BlockPos pos, BlockState from, BlockState to, Player player) {
        level.setBlock(pos, to, Block.UPDATE_ALL_IMMEDIATE);
        if (from.hasProperty(BlockStateProperties.DOUBLE_BLOCK_HALF) && to.hasProperty(BlockStateProperties.DOUBLE_BLOCK_HALF)) {
            boolean lower = from.getValue(BlockStateProperties.DOUBLE_BLOCK_HALF) == DoubleBlockHalf.LOWER;
            BlockPos other = lower ? pos.above() : pos.below();
            BlockState there = level.getBlockState(other);
            if (there.is(from.getBlock())) {
                level.setBlock(other, copyProperties(there, to.getBlock().defaultBlockState()), Block.UPDATE_ALL_IMMEDIATE);
            }
        }
        level.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(player, to));
    }

    /** {@code to} with every property it shares with {@code from} set to {@code from}'s value. */
    private static BlockState copyProperties(BlockState from, BlockState to) {
        BlockState out = to;
        for (Property<?> property : from.getProperties()) {
            if (to.hasProperty(property)) {
                out = copy(from, out, property);
            }
        }
        return out;
    }

    private static <T extends Comparable<T>> BlockState copy(BlockState from, BlockState to, Property<T> property) {
        return to.setValue(property, from.getValue(property));
    }
}
`;
}
