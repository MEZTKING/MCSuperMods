package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.loader.VanillaBlockRulesParser;
import dev.mcsupermods.runtime.registry.weathering.Waxing;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.component.BlockTransformer;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LevelEvent;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Property;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;

/**
 * The block components that are not block class behaviour (ADR 0067 D3, D4; ADR 0105 D3, D4): {@code msm:flammable}
 * through the {@code Flammability} seam, once per block at start-up, and {@code msm:strippable}, {@code msm:flattenable}
 * and {@code msm:tillable} through one Fabric {@link UseBlockCallback}. Vanilla's strip, flatten and till pairs are the
 * {@code block_transformer} registry entries {@code minecraft:axe}, {@code shovel} and {@code hoe}, which a data pack can
 * only replace whole, so the runtime changes the blocks it knows before the item's transformer runs. The same callback
 * waxes with honeycomb and unwaxes or scrapes with an axe (ADR 0094 D9, {@link Waxing}), because vanilla's honeycomb and
 * axes know only vanilla's copper, and applies the strip, flatten, till and wax rules of {@code msm:vanilla_block_rules}
 * files ({@link #addRule}, from the {@code VanillaPairs} seam; ADR 0105 D4 and its amendment after B503: one callback on
 * both versions). A block's own component wins over a rules file; between rules files the later one wins.
 */
public final class BlockExtras {
    /** The {@code block_transformer} entry that marks an axe: vanilla axes, project axes and other mods' axes. */
    public static final Identifier AXE_TRANSFORMER = Identifier.withDefaultNamespace("axe");
    /** The {@code block_transformer} entry that marks a shovel. */
    public static final Identifier SHOVEL_TRANSFORMER = Identifier.withDefaultNamespace("shovel");
    /** The {@code block_transformer} entry that marks a hoe. */
    public static final Identifier HOE_TRANSFORMER = Identifier.withDefaultNamespace("hoe");

    /** What a tool or honeycomb does to a block. */
    public enum Change {
        /** An axe strips it (logs into stripped logs). */
        STRIP("msm:strippable"),
        /** A shovel flattens it (dirt into a path), only with air above. */
        FLATTEN("msm:flattenable"),
        /** A hoe tills it (dirt into farmland), only with air above. */
        TILL("msm:tillable"),
        /** Honeycomb waxes it; an axe turns the waxed block back. Rules files only (project blocks use {@code msm:waxable}). */
        WAX("msm:waxable");

        private final String component;

        Change(String component) {
            this.component = component;
        }

        /** The rules list name, such as {@code strip}. */
        public String id() {
            return name().toLowerCase(Locale.ROOT);
        }
    }

    /**
     * One pair: the block becomes {@code into}, a tilled block drops {@code drops} on top.
     *
     * @param source the rules file that gave it, or null for the block's own component
     */
    private record Target(Identifier into, Optional<Identifier> drops, String source) {}

    /** Per change, block to its target; targets are resolved on use, so they may register later. */
    private static final Map<Change, Map<Block, Target>> TARGETS = new EnumMap<>(Change.class);
    /** A waxed block (the {@code into} of a wax rule) to the block an axe turns it back into. */
    private static final Map<Identifier, Identifier> UNWAX = new HashMap<>();
    private static volatile List<String> lateWarnings = List.of();
    private static boolean installed;

    static {
        for (Change change : Change.values()) {
            TARGETS.put(change, new IdentityHashMap<>());
        }
    }

    private BlockExtras() {}

    /**
     * Applies the block's {@code msm:flammable}, {@code msm:strippable}, {@code msm:flattenable} and {@code msm:tillable}
     * and records it for waxing ({@code msm:waxable}); called once per registered block.
     */
    static void apply(Block block, BlockComponents components) {
        Waxing.add(block, components);
        components.flammable().ifPresent(f -> Flammability.register(block, f.burnOdds(), f.igniteOdds()));
        components.strippable().ifPresent(s -> TARGETS.get(Change.STRIP).put(block, new Target(s.into(), Optional.empty(), null)));
        components.flattenable().ifPresent(f -> TARGETS.get(Change.FLATTEN).put(block, new Target(f.into(), Optional.empty(), null)));
        components.tillable().ifPresent(t -> TARGETS.get(Change.TILL).put(block, new Target(t.into(), t.drops(), null)));
    }

    /**
     * Adds one pair of a rules file (ADR 0105 D4); called by the {@code VanillaPairs} seam after the registrar.
     *
     * @param source the file, as a load message names it
     * @return a warning when the pair is not used (the block's own component wins) or replaces an earlier file's; else empty
     */
    static Optional<String> addRule(Change change, Block block, Identifier into, Optional<Identifier> drops, String source) {
        Map<Block, Target> map = TARGETS.get(change);
        Identifier blockId = BuiltInRegistries.BLOCK.getKey(block);
        Target old = map.get(block);
        if (old != null && old.source() == null) {
            return Optional.of(source + ": " + change.id() + ": " + blockId + " has its own " + change.component
                    + ", which wins; the rule is not used");
        }
        map.put(block, new Target(into, drops, source));
        if (change == Change.WAX) {
            if (old != null) {
                UNWAX.remove(old.into());
            }
            UNWAX.put(into, blockId);
        }
        return old == null ? Optional.empty() : Optional.of(source + ": " + change.id() + ": the rule for " + blockId
                + " replaces the one in " + old.source());
    }

    /**
     * How a version ages a block into the next as copper does ({@code age} rules): a warning when it cannot, else empty.
     */
    @FunctionalInterface
    interface AgeRoute {
        Optional<String> age(Block block, Block next, String source);
    }

    /**
     * Applies every {@code msm:vanilla_block_rules} file of {@code report} (ADR 0105 D4), in scan order: strip, flatten,
     * till and wax through the use callback, burn through the {@code Flammability} seam, age through {@code ageRoute}.
     * A {@code block} (or an age rule's {@code next}) that is not registered at start-up skips the pair with a warning; an
     * {@code into} or {@code drops} is looked up on use and checked after start-up. A later file's pair for the same block
     * and list wins with a warning; so does a block's own component over any file. Logs the count of pairs used.
     */
    static LoadReport applyRules(LoadReport report, AgeRoute ageRoute) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<RawDefinition> raws = report.definitions().stream().filter(r -> r.kind().equals(VanillaBlockRulesParser.KIND)).toList();
        Map<Identifier, VanillaBlockRulesParser.Rules> files = VanillaBlockRulesParser.parseAll(raws, errors, warnings);
        Map<Identifier, String> describe = new HashMap<>();
        raws.forEach(r -> describe.putIfAbsent(r.id(), r.describe()));
        Map<Block, String> burnedBy = new IdentityHashMap<>();
        Map<Block, String> agedBy = new IdentityHashMap<>();
        int used = 0;
        for (Map.Entry<Identifier, VanillaBlockRulesParser.Rules> file : files.entrySet()) {
            String source = describe.get(file.getKey());
            VanillaBlockRulesParser.Rules rules = file.getValue();
            if (rules.isEmpty()) {
                warnings.add(source + ": no rules; the file does nothing");
                continue;
            }
            for (VanillaBlockRulesParser.Pair p : rules.strip()) {
                used += pair(Change.STRIP, p.block(), p.into(), Optional.empty(), source, warnings);
            }
            for (VanillaBlockRulesParser.Pair p : rules.flatten()) {
                used += pair(Change.FLATTEN, p.block(), p.into(), Optional.empty(), source, warnings);
            }
            for (VanillaBlockRulesParser.TillPair p : rules.till()) {
                used += pair(Change.TILL, p.block(), p.into(), p.drops(), source, warnings);
            }
            for (VanillaBlockRulesParser.Pair p : rules.wax()) {
                used += pair(Change.WAX, p.block(), p.into(), Optional.empty(), source, warnings);
            }
            for (VanillaBlockRulesParser.AgePair p : rules.age()) {
                Optional<Block> block = registered(p.block(), source, "age", "block", warnings);
                Optional<Block> next = block.isEmpty() ? Optional.empty() : registered(p.next(), source, "age", "next", warnings);
                if (next.isEmpty()) {
                    continue;
                }
                Optional<String> problem = ageRoute.age(block.get(), next.get(), source);
                if (problem.isPresent()) {
                    warnings.add(problem.get());
                    continue;
                }
                String earlier = agedBy.put(block.get(), source);
                if (earlier != null) {
                    warnings.add(source + ": age: the rule for " + p.block() + " replaces the one in " + earlier);
                }
                used++;
            }
            for (VanillaBlockRulesParser.BurnRule p : rules.burn()) {
                Optional<Block> block = registered(p.block(), source, "burn", "block", warnings);
                if (block.isEmpty()) {
                    continue;
                }
                try {
                    Flammability.register(block.get(), p.burnOdds(), p.igniteOdds());
                } catch (RuntimeException e) {
                    errors.add(source + ": burn " + p.block() + ": " + e.getMessage());
                    continue;
                }
                String earlier = burnedBy.put(block.get(), source);
                if (earlier != null) {
                    warnings.add(source + ": burn: the rule for " + p.block() + " replaces the one in " + earlier);
                }
                used++;
            }
        }
        errors.forEach(e -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, e));
        warnings.forEach(w -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, w));
        MsmRuntime.LOGGER.info("[{}] registered {} vanilla block rule(s) from {} file(s)", MsmRuntime.MOD_ID, used, files.size());
        lastRulesUsed = used;
        return report.withProblems(errors, warnings);
    }

    private static int lastRulesUsed;

    /** The pairs and rules of rules files used at start-up (as logged {@code registered N vanilla block rule(s)}). */
    public static int rulesUsed() {
        return lastRulesUsed;
    }

    /** Adds one strip, flatten, till or wax pair; 1 when it is used, 0 when it is skipped. */
    private static int pair(Change change, Identifier blockId, Identifier into, Optional<Identifier> drops, String source, List<String> warnings) {
        Optional<Block> block = registered(blockId, source, change.id(), "block", warnings);
        if (block.isEmpty()) {
            return 0;
        }
        Target old = TARGETS.get(change).get(block.get());
        addRule(change, block.get(), into, drops, source).ifPresent(warnings::add);
        return old != null && old.source() == null ? 0 : 1;
    }

    private static Optional<Block> registered(Identifier id, String source, String list, String field, List<String> warnings) {
        if (BuiltInRegistries.BLOCK.containsKey(id)) {
            return Optional.of(BuiltInRegistries.BLOCK.getValue(id));
        }
        warnings.add(source + ": " + list + ": " + field + " " + id + " is not a registered block (unknown, or from a mod that registers after "
                + MsmRuntime.MOD_ID + "); the rule is skipped");
        return Optional.empty();
    }

    /** Installs the use callback and the after-start check of the pairs' targets; called once from {@code onInitialize}. */
    public static void register() {
        if (!installed) {
            installed = true;
            UseBlockCallback.EVENT.register(BlockExtras::use);
            ServerLifecycleEvents.SERVER_STARTED.register(server -> checkTargets());
        }
    }

    /** The block this one strips into, or null. */
    public static Identifier strippedInto(Block block) {
        Target target = TARGETS.get(Change.STRIP).get(block);
        return target == null ? null : target.into();
    }

    /** The block {@code block} becomes by {@code change} (a component or a rules file), if any. */
    public static Optional<Identifier> changedInto(Change change, Block block) {
        return Optional.ofNullable(TARGETS.get(change).get(block)).map(Target::into);
    }

    /** The warnings of the last after-start check: targets and drops that name no registered block or item. */
    public static List<String> lateWarnings() {
        return lateWarnings;
    }

    /** Targets and till drops that name nothing registered, logged once after start-up (the pair then does nothing). */
    private static void checkTargets() {
        List<String> out = new ArrayList<>();
        for (Change change : Change.values()) {
            for (Map.Entry<Block, Target> e : TARGETS.get(change).entrySet()) {
                Target t = e.getValue();
                if (t.source() == null && change == Change.STRIP) {
                    continue; // msm:strippable is checked by the registrar
                }
                String where = (t.source() == null ? "block " + BuiltInRegistries.BLOCK.getKey(e.getKey()) + ": " + change.component
                        : t.source() + ": " + change.id() + " " + BuiltInRegistries.BLOCK.getKey(e.getKey()));
                if (!BuiltInRegistries.BLOCK.containsKey(t.into())) {
                    out.add(where + ": into " + t.into() + " is not a registered block; nothing happens");
                }
                t.drops().filter(d -> !BuiltInRegistries.ITEM.containsKey(d))
                        .ifPresent(d -> out.add(where + ": drops " + d + " is not a registered item; nothing is dropped"));
            }
        }
        out.forEach(w -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, w));
        lateWarnings = List.copyOf(out);
    }

    /**
     * The use callback: honeycomb waxes ({@link Waxing#wax}, then a wax rule); an axe strips, else scrapes or unwaxes
     * ({@link Waxing#axe}, then a wax rule backwards), as vanilla's axe tries stripping first; a shovel flattens; a hoe
     * tills. Vanilla's axe rule ({@code BlockTransformer.transformBlock}) holds for every axe use: a main-hand use with a
     * blocking item (a shield) in the off hand passes unless the player sneaks. The client predicts the same answer; only
     * the server changes the world.
     */
    private static InteractionResult use(Player player, Level level, InteractionHand hand, BlockHitResult hit) {
        if (player.isSpectator()) {
            return InteractionResult.PASS;
        }
        BlockPos pos = hit.getBlockPos();
        BlockState state = level.getBlockState(pos);
        ItemStack stack = player.getItemInHand(hand);
        InteractionResult waxed = Waxing.wax(player, level, hand, pos, state, stack);
        if (waxed != InteractionResult.PASS) {
            return waxed;
        }
        if (stack.is(Items.HONEYCOMB)) {
            return change(Change.WAX, player, level, hand, hit, state, stack);
        }
        Holder<BlockTransformer> transformer = stack.get(DataComponents.BLOCK_TRANSFORMER);
        if (transformer == null) {
            return InteractionResult.PASS;
        }
        if (transformer.is(SHOVEL_TRANSFORMER)) {
            return change(Change.FLATTEN, player, level, hand, hit, state, stack);
        }
        if (transformer.is(HOE_TRANSFORMER)) {
            return change(Change.TILL, player, level, hand, hit, state, stack);
        }
        if (!transformer.is(AXE_TRANSFORMER)) {
            return InteractionResult.PASS;
        }
        if (hand == InteractionHand.MAIN_HAND && player.getOffhandItem().has(DataComponents.BLOCKS_ATTACKS)
                && !player.isSecondaryUseActive()) {
            return InteractionResult.PASS;
        }
        InteractionResult stripped = change(Change.STRIP, player, level, hand, hit, state, stack);
        if (stripped != InteractionResult.PASS) {
            return stripped;
        }
        InteractionResult scraped = Waxing.axe(player, level, hand, pos, state, stack);
        return scraped != InteractionResult.PASS ? scraped : unwax(player, level, hand, pos, state, stack);
    }

    /**
     * Stripping, flattening, tilling or waxing (the caller checked the item and, for an axe, the shield rule): the block
     * turns into its target with every shared property copied (the axis of a log); flattening and tilling need air above
     * and a click on any face but the bottom, as vanilla's. The tool's sound plays (waxing: vanilla's wax-on level event),
     * the tool takes 1 damage or one honeycomb is used, a tilled block drops its {@code drops} on the clicked face, and the
     * hand swings (a success).
     */
    private static InteractionResult change(Change change, Player player, Level level, InteractionHand hand, BlockHitResult hit,
            BlockState state, ItemStack stack) {
        Target target = TARGETS.get(change).get(state.getBlock());
        if (target == null || !BuiltInRegistries.BLOCK.containsKey(target.into())) {
            return InteractionResult.PASS; // an unknown target is reported once after start-up
        }
        BlockPos pos = hit.getBlockPos();
        if ((change == Change.FLATTEN || change == Change.TILL)
                && (hit.getDirection() == Direction.DOWN || !level.getBlockState(pos.above()).isAir())) {
            return InteractionResult.PASS;
        }
        BlockState into = copyProperties(state, BuiltInRegistries.BLOCK.getValue(target.into()).defaultBlockState());
        if (!level.isClientSide()) {
            level.setBlock(pos, into, Block.UPDATE_ALL_IMMEDIATE);
            if (change == Change.WAX) {
                // A null source, as Waxing does: the waxing player's own client shows the effect too.
                level.levelEvent(null, LevelEvent.PARTICLES_WAX_ON, pos, 0);
            } else {
                level.playSound(null, pos, sound(change), SoundSource.BLOCKS, 1.0f, 1.0f);
            }
            level.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(player, into));
            if (change == Change.WAX) {
                stack.consume(1, player);
            } else {
                stack.hurtAndBreak(1, player, hand.asEquipmentSlot());
            }
            target.drops().filter(BuiltInRegistries.ITEM::containsKey).ifPresent(item -> Block.popResourceFromFace(level, pos,
                    hit.getDirection(), new ItemStack(BuiltInRegistries.ITEM.getValue(item))));
        }
        return InteractionResult.SUCCESS;
    }

    private static SoundEvent sound(Change change) {
        return switch (change) {
            case STRIP -> SoundEvents.AXE_STRIP.value();
            case FLATTEN -> SoundEvents.SHOVEL_FLATTEN.value();
            case TILL -> SoundEvents.HOE_TILL.value();
            case WAX -> throw new IllegalArgumentException("waxing plays a level event");
        };
    }

    /** An axe on the {@code into} of a wax rule: it turns back into the rule's block, with vanilla's wax-off sound and particles. */
    private static InteractionResult unwax(Player player, Level level, InteractionHand hand, BlockPos pos, BlockState state, ItemStack stack) {
        Identifier back = UNWAX.get(BuiltInRegistries.BLOCK.getKey(state.getBlock()));
        if (back == null || !BuiltInRegistries.BLOCK.containsKey(back)) {
            return InteractionResult.PASS;
        }
        BlockState into = copyProperties(state, BuiltInRegistries.BLOCK.getValue(back).defaultBlockState());
        if (!level.isClientSide()) {
            level.setBlock(pos, into, Block.UPDATE_ALL_IMMEDIATE);
            level.playSound(null, pos, SoundEvents.AXE_WAX_OFF.value(), SoundSource.BLOCKS, 1.0f, 1.0f);
            level.levelEvent(null, LevelEvent.PARTICLES_WAX_OFF, pos, 0);
            level.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(player, into));
            stack.hurtAndBreak(1, player, hand.asEquipmentSlot());
        }
        return InteractionResult.SUCCESS;
    }

    /** {@code to} with every property it shares with {@code from} (the same {@code Property}, such as the axis) set to {@code from}'s value. */
    public static BlockState copyProperties(BlockState from, BlockState to) {
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

    /** Every block given a pair by {@code change}, by id (for diagnostics and GameTests). */
    public static Map<Identifier, Identifier> pairs(Change change) {
        Map<Identifier, Identifier> out = new HashMap<>();
        TARGETS.get(change).forEach((block, target) -> out.put(BuiltInRegistries.BLOCK.getKey(block), target.into()));
        return Collections.unmodifiableMap(out);
    }
}
