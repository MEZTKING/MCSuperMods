package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.BlockExtras;
import dev.mcsupermods.runtime.registry.BlockSetTypes;
import dev.mcsupermods.runtime.registry.Waterlogging;
import dev.mcsupermods.runtime.registry.container.BlockEntityHooks;
import dev.mcsupermods.runtime.registry.container.MsmWeatheringContainerBlock;
import dev.mcsupermods.runtime.registry.types.DrivenBlock;
import dev.mcsupermods.runtime.registry.types.BlockTypes;
import dev.mcsupermods.runtime.registry.types.FurnitureTypes;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Predicate;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.ProblemReporter;
import net.minecraft.util.RandomSource;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.BasePressurePlateBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.ButtonBlock;
import net.minecraft.world.level.block.ChangeOverTimeBlock;
import net.minecraft.world.level.block.ChestBlock;
import net.minecraft.world.level.block.WeatheringCopper;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.level.block.state.properties.ChestType;
import net.minecraft.world.level.block.state.properties.DoubleBlockHalf;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.level.storage.TagValueInput;

/**
 * Weathering blocks (ADR 0094 D8): a block with {@code msm:weathering} becomes the weathering class of its type, a small
 * subclass of the type's own class that implements vanilla's {@link ChangeOverTimeBlock} with
 * {@link WeatheringCopper.WeatherState} ages ({@link Ageing}). Its random tick asks vanilla's own
 * {@code ChangeOverTimeBlock.getNextState} whether to age, so the chance and the neighbour rule are vanilla's and project
 * blocks and vanilla copper slow each other alike (measured at B440, S5). The runtime keeps its own maps ({@link Maps}):
 * vanilla's static copper maps and Fabric's registries are not used (F12). Since ADR 0104 D1 rods, buttons, pressure
 * plates, fences, fence gates and walls weather too (B510), and lightning scrapes the blocks ({@link Lightning}). Since ADR
 * 0104 D6 (B513) containers weather too ({@code MsmWeatheringContainerBlock}, and double chests through
 * {@code StorageExtras}): {@link #replace} and {@link #randomTick} keep their block entity's data.
 */
public final class Weathering {
    private Weathering() {}

    /** Every weathering block's own {@code next}, by block id, in registration order; read by {@link #checkAfterRegistration}. */
    private static final Map<Identifier, Optional<Identifier>> DECLARED = new LinkedHashMap<>();
    /** The maps in use, rebuilt by {@link #checkAfterRegistration}; until then every declared {@code next} is used. */
    private static volatile Maps maps = Maps.EMPTY;
    private static boolean checked;

    /**
     * A weathering block's stage and link (ADR 0094 D8).
     *
     * @param id the block's own id
     * @param age vanilla's age of {@code stage}
     */
    public record Stage(Identifier id, WeatheringCopper.WeatherState age) {
        /** The chance modifier: vanilla copper's 0.75 at the unaffected stage, 1 otherwise (measured at B440). */
        public float chanceModifier() {
            return age == WeatheringCopper.WeatherState.UNAFFECTED ? 0.75f : 1.0f;
        }
    }

    /**
     * The weathering side of every weathering class: the stage, vanilla's age, the chance modifier and the next block's
     * state with the shared properties copied (the facing of stairs, the half of a door, {@code waterlogged}).
     */
    public interface Ageing extends ChangeOverTimeBlock<WeatheringCopper.WeatherState>, DrivenBlock {
        Stage weatheringStage();

        @Override
        default WeatheringCopper.WeatherState getAge() {
            return weatheringStage().age();
        }

        @Override
        default float getChanceModifier() {
            return weatheringStage().chanceModifier();
        }

        @Override
        default Optional<BlockState> getNext(BlockState state) {
            return next(weatheringStage().id()).map(block -> BlockExtras.copyProperties(state, block.defaultBlockState()));
        }
    }

    /**
     * A button or pressure plate that weathers: how long it stays pressed, so a pressed one that changes stage (ageing,
     * waxing, scraping or lightning) still lets go; the tick scheduled for the old block is not run for the new one.
     */
    interface Pressed {
        int pressedTicks();
    }

    /** Vanilla's age of an MSM stage. */
    public static WeatheringCopper.WeatherState age(BlockComponents.WeatheringStage stage) {
        return switch (stage) {
            case UNAFFECTED -> WeatheringCopper.WeatherState.UNAFFECTED;
            case EXPOSED -> WeatheringCopper.WeatherState.EXPOSED;
            case WEATHERED -> WeatheringCopper.WeatherState.WEATHERED;
            case OXIDIZED -> WeatheringCopper.WeatherState.OXIDIZED;
        };
    }

    /**
     * The weathering block for {@code definition}, or empty when it is not one (then the registrar tries the next hook
     * and then {@code BlockTypes.create}); called from the registrar before the block is registered. A {@code block},
     * {@code pillar}, {@code horizontal} or {@code directional} block that is also {@code msm:waterloggable} gets the
     * waterlogged weathering class.
     */
    public static Optional<Block> blockFor(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        Optional<BlockComponents.Weathering> weathering = definition.components().weathering();
        if (weathering.isEmpty() || !BlockType.WEATHERING_TYPES.contains(definition.type())) {
            return Optional.empty();
        }
        Stage stage = new Stage(id, age(weathering.get().stage()));
        if (BlockEntityHooks.wantsBlockEntity(definition)) {
            // ADR 0104 D6 (B513): a container ages keeping its contents; a double chest is StorageExtras' (it calls
            // declare); a machine never weathers (the parser drops the component).
            if (definition.components().machine().isPresent()
                    || definition.components().container().map(BlockComponents.Container::doubleChest).orElse(true)) {
                return Optional.empty();
            }
            Block container = Waterlogging.waterloggable(definition)
                    ? new MsmWeatheringContainerBlock.Waterlogged(id, definition, stage, props)
                    : new MsmWeatheringContainerBlock(id, definition, stage, props);
            declare(id, weathering.get());
            return Optional.of(container);
        }
        Block block = switch (definition.type()) {
            case BLOCK, PILLAR, HORIZONTAL, DIRECTIONAL -> Waterlogging.waterloggable(definition)
                    ? new MsmWeatheringBlock.Waterlogged(id, definition, stage, props)
                    : new MsmWeatheringBlock(id, definition, stage, props);
            case SLAB -> new MsmWeatheringSlabBlock(id, definition, stage, props);
            case STAIRS -> new MsmWeatheringStairBlock(id, definition, stage, stairsBase(definition), props);
            case DOOR -> new MsmWeatheringDoorBlock(id, definition, stage, setType(definition), props);
            case TRAPDOOR -> new MsmWeatheringTrapDoorBlock(id, definition, stage, setType(definition), props);
            case PANE -> new MsmWeatheringPaneBlock(id, definition, stage, props);
            // The properties FurnitureTypes adds for its chains and lanterns (B446), here because these are made instead.
            case CHAIN -> new MsmWeatheringChainBlock(id, definition, stage, props.forceSolidOn().noOcclusion());
            case LANTERN -> {
                BlockBehaviour.Properties p = props.forceSolidOn().noOcclusion().pushReaction(PushReaction.POPPED);
                yield new MsmWeatheringLanternBlock(id, definition, stage, definition.components().lightEmitter().isPresent()
                        ? p : p.lightLevel(state -> FurnitureTypes.LANTERN_LIGHT));
            }
            // ADR 0104 D1 (B510): the properties FurnitureTypes and BlockTypes add for these types are already in props,
            // apart from the rod's (FurnitureTypes adds them when it makes the rod), so they are added here.
            case ROD -> new MsmWeatheringRodBlock(id, definition, stage, definition.components().lightEmitter().isPresent()
                    ? props.forceSolidOff().noOcclusion() : props.forceSolidOff().noOcclusion().lightLevel(state -> FurnitureTypes.ROD_LIGHT));
            case BUTTON -> new MsmWeatheringButtonBlock(id, definition, stage, setType(definition),
                    ((BlockType.Button) definition.typeFields()).pressTicks(), props);
            case PRESSURE_PLATE -> {
                Optional<Integer> weightedMax = ((BlockType.PressurePlate) definition.typeFields()).weightedMax();
                yield weightedMax.isPresent()
                        ? new MsmWeatheringPressurePlateBlock.Weighted(id, definition, stage, weightedMax.get(), setType(definition), props)
                        : new MsmWeatheringPressurePlateBlock(id, definition, stage, setType(definition), props);
            }
            case FENCE -> new MsmWeatheringFenceBlock(id, definition, stage, props);
            case FENCE_GATE -> new MsmWeatheringFenceGateBlock(id, definition, stage,
                    BlockTypes.woodType(((BlockType.FenceGate) definition.typeFields()).woodType()), props);
            case WALL -> new MsmWeatheringWallBlock(id, definition, stage, props);
            default -> throw new IllegalStateException("type '" + definition.type().id() + "' does not weather");
        };
        declare(id, weathering.get());
        return Optional.of(block);
    }

    /**
     * Records the weathering block {@code id} and its {@code next}; called by {@link #blockFor} and, for a double chest that
     * weathers, by {@code StorageExtras}, which make the block.
     */
    public static void declare(Identifier id, BlockComponents.Weathering weathering) {
        DECLARED.put(id, weathering.next());
    }

    /** The stage of the weathering block {@code id} with {@code weathering}. */
    public static Stage stage(Identifier id, BlockComponents.Weathering weathering) {
        return new Stage(id, age(weathering.stage()));
    }

    /** The registered base block of weathering stairs; stairs register after their base (ADR 0067 D4). */
    private static BlockState stairsBase(BlockDefinition definition) {
        return BuiltInRegistries.BLOCK.getValue(((BlockType.Stairs) definition.typeFields()).baseBlock()).defaultBlockState();
    }

    private static net.minecraft.world.level.block.state.properties.BlockSetType setType(BlockDefinition definition) {
        return BlockSetTypes.of(switch (definition.typeFields()) {
            case BlockType.Opening o -> o.setType();
            case BlockType.Button b -> b.setType();
            case BlockType.PressurePlate p -> p.setType();
            default -> throw new IllegalArgumentException("type '" + definition.type().id() + "' has no set_type");
        });
    }

    /** The block {@code id} ages into, when it ages and its {@code next} is registered. */
    static Optional<Block> next(Identifier id) {
        Maps m = maps;
        Optional<Identifier> next = checked ? Optional.ofNullable(m.next().get(id)) : DECLARED.getOrDefault(id, Optional.empty());
        return next.filter(BuiltInRegistries.BLOCK::containsKey).map(BuiltInRegistries.BLOCK::getValue);
    }

    /**
     * Whether the block {@code id} has a next stage (it random-ticks). Vanilla may cache this before
     * {@link #checkAfterRegistration}, so a block whose {@code next} is refused there can still be random-ticked; it then
     * never ages ({@link #next} is empty).
     */
    public static boolean ages(Identifier id) {
        return checked ? maps.next().containsKey(id) : DECLARED.getOrDefault(id, Optional.empty()).isPresent();
    }

    /** The block {@code id} is scraped back into (the reverse of {@code next}), or empty. */
    static Optional<Identifier> previous(Identifier id) {
        return Optional.ofNullable(maps.previous().get(id));
    }

    /** Whether {@code id} is a project weathering block. */
    static boolean isWeathering(Identifier id) {
        return DECLARED.containsKey(id);
    }

    /** The first stage of the project weathering block {@code id}: {@link #previous} followed to its end ({@code id} itself when none). */
    static Identifier firstStage(Identifier id) {
        Identifier at = id;
        Set<Identifier> seen = new HashSet<>();
        for (Optional<Identifier> back = previous(at); back.isPresent() && seen.add(at); back = previous(at)) {
            at = back.get();
        }
        return at;
    }

    /**
     * The first stage of the family of {@code id}: a waxed copy counts as its source, then {@link #firstStage}. A block of
     * no family is its own; per-player storage keeps one store per family (ADR 0104 D5, D6), so ageing and waxing keep it.
     */
    public static Identifier familyRoot(Identifier id) {
        return firstStage(Optional.ofNullable(maps.unwaxInto().get(id)).orElse(id));
    }

    /** The maps in use (read by {@link Waxing}). */
    static Maps maps() {
        return maps;
    }

    /**
     * The random tick of every weathering class, after the type's own: when the tick left the block as it was, vanilla's
     * own {@code ChangeOverTimeBlock.changeOverTime} decides (chance and neighbours) and sets the next stage. The upper
     * half of a door follows its lower half through {@code MsmWeatheringDoorBlock.updateShape}. A block with a block entity
     * (a container, ADR 0104 D6) asks vanilla's {@code getNextState} (the same chance and neighbour rule) and is
     * {@link #replace}d keeping its data, because vanilla's own change drops the contents (measured at B503, X13).
     */
    public static void randomTick(Ageing block, BlockState state, ServerLevel level, BlockPos pos, RandomSource random) {
        if (level.getBlockState(pos) != state) {
            return;
        }
        if (state.hasBlockEntity()) {
            block.getNextState(state, level, pos, random).ifPresent(next -> replace(level, pos, state, next));
            return;
        }
        block.changeOverTime(state, level, pos, random); // vanilla's chance, neighbour rule and setBlockAndUpdate
        BlockState now = level.getBlockState(pos);
        if (now != state) {
            afterChange(level, pos, state, now);
        }
    }

    /**
     * After a pressed button or plate became another block (ageing, waxing, scraping, lightning; ADR 0104 D1): the tick that
     * lets it go was scheduled for the old block, which the game does not run for the new one, so it is scheduled again
     * with the press time of whichever of the two is a weathering button or plate (a waxed copy is a plain one).
     */
    static void afterChange(Level level, BlockPos pos, BlockState from, BlockState to) {
        Block block = to.getBlock();
        if (!(block instanceof ButtonBlock || block instanceof BasePressurePlateBlock)) {
            return;
        }
        boolean pressed = to.hasProperty(BlockStateProperties.POWERED) && to.getValue(BlockStateProperties.POWERED)
                || to.hasProperty(BlockStateProperties.POWER) && to.getValue(BlockStateProperties.POWER) > 0;
        if (!pressed || level.getBlockTicks().hasScheduledTick(pos, block)) {
            return;
        }
        int ticks = block instanceof Pressed p ? p.pressedTicks() : from.getBlock() instanceof Pressed p ? p.pressedTicks() : 1;
        level.scheduleTick(pos, block, ticks);
    }

    /**
     * Replaces {@code from} at {@code pos} with {@code to}. A two-high block (a door) has its other half replaced first,
     * without shape updates, so the half set second keeps it; then {@code pos} with every update. A block with a block
     * entity (a container, ADR 0104 D6 and its amendment) keeps its whole data (contents, custom name, lock, loot table):
     * it is saved, the new block is set with {@code UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS} (so nothing drops) and the data
     * is loaded into the new block entity; {@code open} is set back to false, as the new block entity has no viewers. The
     * other half of a double chest is replaced alike, first, so the pair stays joined and of one stage.
     */
    public static void replace(Level level, BlockPos pos, BlockState from, BlockState to) {
        if (level.getBlockEntity(pos) != null && to.hasBlockEntity()) {
            if (from.getBlock() instanceof ChestBlock && from.hasProperty(ChestBlock.TYPE) && from.getValue(ChestBlock.TYPE) != ChestType.SINGLE
                    && to.hasProperty(ChestBlock.TYPE)) {
                BlockPos other = ChestBlock.getConnectedBlockPos(pos, from);
                BlockState otherState = level.getBlockState(other);
                if (otherState.is(from.getBlock()) && level.getBlockEntity(other) != null) {
                    keepingData(level, other, BlockExtras.copyProperties(otherState, to.getBlock().defaultBlockState()),
                            Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE);
                }
            }
            keepingData(level, pos, to, Block.UPDATE_ALL);
            afterChange(level, pos, from, level.getBlockState(pos));
            return;
        }
        if (from.hasProperty(BlockStateProperties.DOUBLE_BLOCK_HALF) && to.hasProperty(BlockStateProperties.DOUBLE_BLOCK_HALF)) {
            BlockPos other = from.getValue(BlockStateProperties.DOUBLE_BLOCK_HALF) == DoubleBlockHalf.LOWER ? pos.above() : pos.below();
            BlockState otherState = level.getBlockState(other);
            if (otherState.is(from.getBlock())) {
                level.setBlock(other, BlockExtras.copyProperties(otherState, to.getBlock().defaultBlockState()),
                        Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE);
            }
        }
        level.setBlock(pos, to, Block.UPDATE_ALL);
        afterChange(level, pos, from, level.getBlockState(pos));
    }

    /** Sets {@code to} at {@code pos} with {@code flags}, moving the old block entity's data into the new one. */
    private static void keepingData(Level level, BlockPos pos, BlockState to, int flags) {
        BlockEntity old = level.getBlockEntity(pos);
        CompoundTag data = old == null ? null : old.saveWithoutMetadata(level.registryAccess());
        BlockState target = to.hasProperty(BlockStateProperties.OPEN) ? to.setValue(BlockStateProperties.OPEN, false) : to;
        level.setBlock(pos, target, flags | Block.UPDATE_SKIP_BLOCK_ENTITY_SIDEEFFECTS);
        BlockEntity now = level.getBlockEntity(pos);
        if (data != null && now != null) {
            now.loadWithComponents(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), data));
            now.setChanged();
        }
    }

    /**
     * Builds the maps from the weathering and waxing links once every block is registered (ADR 0094 D8, D9) and adds a
     * load error for each broken link; called once from the registrar after the blocks.
     */
    public static void checkAfterRegistration(List<String> errors) {
        List<String> found = new ArrayList<>();
        maps = Maps.build(DECLARED, Waxing.declared(), BuiltInRegistries.BLOCK::containsKey, found);
        checked = true;
        for (String error : found) {
            errors.add(error);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, error);
        }
    }

    /**
     * The weathering and waxing maps (ADR 0094 D8, D9), checked: pure, so {@code WeatheringMapsTest} builds them without a
     * game.
     *
     * @param next a weathering block to the block it ages into; only blocks that age
     * @param previous the reverse of {@code next} where it is one block: what an axe scrapes a weathering block back into
     * @param waxInto a weathering block to its waxed copy
     * @param unwaxInto the reverse of {@code waxInto}: what an axe turns a waxed copy back into
     */
    public record Maps(Map<Identifier, Identifier> next, Map<Identifier, Identifier> previous, Map<Identifier, Identifier> waxInto,
            Map<Identifier, Identifier> unwaxInto) {
        static final Maps EMPTY = new Maps(Map.of(), Map.of(), Map.of(), Map.of());

        /**
         * The checked maps. Errors, each also leaving the link out: a {@code next} or {@code into} that is not a registered
         * block (the block does not age, or is not waxed); a cycle of {@code next} links (no block of the cycle ages); two
         * blocks aging into one (neither is scraped back from it); a waxed copy that weathers itself, or that two blocks
         * wax into (it is not waxed into, and an axe does not unwax it).
         *
         * @param declared every weathering block's own {@code next}, absent for the last stage
         * @param waxDeclared a weathering block to its {@code msm:waxable} {@code into}
         * @param registered whether an id is a registered block
         */
        public static Maps build(Map<Identifier, Optional<Identifier>> declared, Map<Identifier, Identifier> waxDeclared,
                Predicate<Identifier> registered, List<String> errors) {
            Map<Identifier, Identifier> next = new TreeMap<>();
            for (var e : new TreeMap<>(declared).entrySet()) {
                if (e.getValue().isEmpty()) {
                    continue;
                }
                Identifier target = e.getValue().get();
                if (!registered.test(target)) {
                    errors.add("block " + e.getKey() + ": msm:weathering next " + target + " is not a registered block; the block"
                            + " does not age");
                } else {
                    next.put(e.getKey(), target);
                }
            }
            Set<Identifier> inCycle = new HashSet<>();
            for (Identifier start : List.copyOf(next.keySet())) {
                if (inCycle.contains(start)) {
                    continue;
                }
                List<Identifier> path = new ArrayList<>();
                Identifier at = start;
                while (at != null && !path.contains(at) && !inCycle.contains(at)) {
                    path.add(at);
                    at = next.get(at);
                }
                if (at != null && path.contains(at)) {
                    List<Identifier> cycle = path.subList(path.indexOf(at), path.size());
                    inCycle.addAll(cycle);
                    List<String> names = new ArrayList<>(cycle.stream().map(Identifier::toString).toList());
                    names.add(at.toString());
                    errors.add("blocks " + String.join(" -> ", names) + ": msm:weathering next links make a cycle; none of these"
                            + " blocks ages");
                }
            }
            inCycle.forEach(next::remove);
            Map<Identifier, List<Identifier>> sources = new TreeMap<>();
            next.forEach((from, to) -> sources.computeIfAbsent(to, k -> new ArrayList<>()).add(from));
            Map<Identifier, Identifier> previous = new TreeMap<>();
            sources.forEach((to, from) -> {
                if (from.size() == 1) {
                    previous.put(to, from.getFirst());
                } else {
                    errors.add("block " + to + ": " + from.size() + " blocks age into it (" + String.join(", ", from.stream()
                            .map(Identifier::toString).toList()) + "); an axe does not scrape it back");
                }
            });
            Map<Identifier, Identifier> waxInto = new TreeMap<>();
            Map<Identifier, List<Identifier>> waxSources = new TreeMap<>();
            for (var e : new TreeMap<>(waxDeclared).entrySet()) {
                Identifier into = e.getValue();
                if (!registered.test(into)) {
                    errors.add("block " + e.getKey() + ": msm:waxable into " + into + " is not a registered block; the block is not"
                            + " waxed");
                } else if (declared.containsKey(into)) {
                    errors.add("block " + e.getKey() + ": msm:waxable into " + into + " weathers itself (a waxed copy must not"
                            + " age); the block is not waxed");
                } else {
                    waxSources.computeIfAbsent(into, k -> new ArrayList<>()).add(e.getKey());
                }
            }
            Map<Identifier, Identifier> unwaxInto = new TreeMap<>();
            waxSources.forEach((into, from) -> {
                if (from.size() == 1) {
                    waxInto.put(from.getFirst(), into);
                    unwaxInto.put(into, from.getFirst());
                } else {
                    errors.add("block " + into + ": " + from.size() + " blocks are waxed into it (" + String.join(", ", from.stream()
                            .map(Identifier::toString).toList()) + "; a waxed block belongs to one block); none is waxed into it");
                }
            });
            return new Maps(Collections.unmodifiableMap(next), Collections.unmodifiableMap(previous),
                    Collections.unmodifiableMap(waxInto), Collections.unmodifiableMap(unwaxInto));
        }
    }
}
