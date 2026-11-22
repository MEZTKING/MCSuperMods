package dev.mcsupermods.runtime.registry.fluid;

import dev.mcsupermods.runtime.MsmRuntime;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelAccessor;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LevelEvent;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.material.Fluid;
import net.minecraft.world.level.material.FluidState;

/**
 * Mixing of project fluids with water, lava and each other (ADR 0108 D1 and its amendment after B525), on both versions
 * alike. A liquid block whose definition has {@code mixing} checks its five neighbours other than the one below when it
 * is placed or a neighbour changes ({@link MsmLiquidBlock}): when one holds a fluid a rule names, a source becomes the
 * rule's {@code source} block and a flowing block its {@code flowing} block, with vanilla's lava fizz
 * ({@code LevelEvent.LAVA_FIZZ}: the sound and the smoke). Vanilla's own liquid checks never run for such a block (on 26.3
 * they would still make obsidian of a lava-like fluid), so the block schedules its fluid tick itself.
 *
 * <p>Order (the first match wins): the rules that name a fluid id, in file order, before the {@code water} and
 * {@code lava} rules, in file order (a project fluid in {@code #minecraft:water} would otherwise match the tag first);
 * within a rule the sides up, north, south, west and east. A rule without the side the block needs ({@code source} for a
 * source, {@code flowing} for flowing fluid) does not match it. Liquids are compared by their liquid block
 * ({@code FluidState.createLegacyBlock().getBlock()}): one block per liquid on both versions, where 26.3 has two fluids
 * per liquid and {@code Fluid.isSame} exists on 26.3 only. A neighbour of the same liquid never mixes.
 *
 * <p>Falling: when such a fluid flows down into a block of a fluid a rule names (vanilla's lava falling into water), that
 * block becomes the rule's {@code flowing} block ({@link #fallInto}, called from the {@code MsmFluid} seam's
 * {@code spreadTo}); a rule without {@code flowing} lets the fluid flow in as usual.
 *
 * <p>The rules' blocks and fluids may be other mods' content, so they are looked up at server start ({@link #init});
 * an unknown block leaves that side out and an unknown fluid drops the rule, each with one warning
 * ({@link #lateWarnings}).
 */
public final class FluidMixing {
    private FluidMixing() {}

    /**
     * One rule with its ids looked up.
     *
     * @param tag     the {@code water} or {@code lava} keyword; null for a fluid rule
     * @param with    the named fluid's liquid block; null for a keyword rule
     * @param source  the block a source becomes, or null
     * @param flowing the block flowing fluid becomes, or null
     */
    record Rule(FluidDefinition.Behaviour tag, Block with, Block source, Block flowing) {
        boolean matches(FluidState other) {
            if (other.isEmpty()) {
                return false;
            }
            if (tag != null) {
                return other.is(tag == FluidDefinition.Behaviour.WATER ? FluidTags.WATER : FluidTags.LAVA);
            }
            return other.createLegacyBlock().getBlock() == with;
        }

        Block result(boolean sourceFluid) {
            return sourceFluid ? source : flowing;
        }
    }

    private static boolean installed;
    /** The looked-up rules per liquid block with {@code mixing}, ids first. Rebuilt at every server start. */
    private static volatile Map<MsmLiquidBlock, List<Rule>> rules = Map.of();
    private static volatile List<String> lateWarnings = List.of();

    /** Installs the server start lookup of the rules' blocks and fluids; called once from {@code onInitialize}. */
    public static void init() {
        if (!installed) {
            installed = true;
            ServerLifecycleEvents.SERVER_STARTING.register(server -> resolve());
        }
    }

    /** The warnings of the last lookup: rules naming an unknown block or fluid, or the fluid itself. */
    public static List<String> lateWarnings() {
        return lateWarnings;
    }

    /** Looks up every registered fluid's rules; logs a warning per unknown id. */
    static synchronized void resolve() {
        Map<MsmLiquidBlock, List<Rule>> out = new IdentityHashMap<>();
        List<String> warnings = new ArrayList<>();
        for (MsmFluids.Entry entry : MsmFluids.registered()) {
            if (!entry.definition().mixing().isEmpty()) {
                out.put(entry.block(), compile(entry, warnings));
            }
        }
        warnings.forEach(w -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, w));
        rules = out;
        lateWarnings = List.copyOf(warnings);
    }

    private static List<Rule> compile(MsmFluids.Entry entry, List<String> warnings) {
        List<Rule> byId = new ArrayList<>();
        List<Rule> byTag = new ArrayList<>();
        List<FluidDefinition.Mixing> mixing = entry.definition().mixing();
        for (int n = 0; n < mixing.size(); n++) {
            FluidDefinition.Mixing m = mixing.get(n);
            String where = "fluid " + entry.id() + ": mixing[" + n + "]: ";
            Block with = null;
            if (m.withFluid().isPresent()) {
                Identifier id = m.withFluid().get();
                Optional<Fluid> fluid = BuiltInRegistries.FLUID.getOptional(id);
                if (fluid.isEmpty() || fluid.get().defaultFluidState().isEmpty()) {
                    warnings.add(where + "with " + id + " is not a registered fluid; the rule is dropped");
                    continue;
                }
                with = fluid.get().defaultFluidState().createLegacyBlock().getBlock();
                if (with == entry.block()) {
                    warnings.add(where + "with " + id + " is this fluid itself; the rule is dropped");
                    continue;
                }
            }
            Block source = block(m.source(), where + "source", warnings);
            Block flowing = block(m.flowing(), where + "flowing", warnings);
            if (source == null && flowing == null) {
                continue;
            }
            Rule rule = new Rule(m.withTag().orElse(null), with, source, flowing);
            (with != null ? byId : byTag).add(rule);
        }
        byId.addAll(byTag);
        return List.copyOf(byId);
    }

    private static Block block(Optional<Identifier> id, String where, List<String> warnings) {
        if (id.isEmpty()) {
            return null;
        }
        Optional<Block> block = BuiltInRegistries.BLOCK.getOptional(id.get());
        if (block.isEmpty()) {
            warnings.add(where + " " + id.get() + " is not a registered block; that side is left out");
            return null;
        }
        return block.get();
    }

    /** The rules of {@code block}, looked up on first use when the server start has not done it (a GameTest calling early). */
    static List<Rule> rulesOf(MsmLiquidBlock block) {
        List<Rule> found = rules.get(block);
        if (found == null && !block.definition().mixing().isEmpty()) {
            resolve();
            found = rules.get(block);
        }
        return found == null ? List.of() : found;
    }

    /** Whether {@code block} mixes by its own rules (and so never runs vanilla's liquid checks). */
    static boolean hasRules(MsmLiquidBlock block) {
        return !block.definition().mixing().isEmpty();
    }

    /**
     * The liquid block's own check: true when the block at {@code pos} was replaced by a rule's block. Server side only;
     * the client never mixes.
     */
    static boolean mix(MsmLiquidBlock block, Level level, BlockPos pos, BlockState state) {
        if (level.isClientSide()) {
            return false;
        }
        FluidState mine = state.getFluidState();
        if (mine.isEmpty()) {
            return false;
        }
        boolean source = mine.isSource();
        for (Rule rule : rulesOf(block)) {
            Block result = rule.result(source);
            if (result == null) {
                continue;
            }
            for (Direction d : Direction.values()) {
                if (d == Direction.DOWN) {
                    continue;
                }
                FluidState other = level.getFluidState(pos.relative(d));
                if (other.isEmpty() || other.createLegacyBlock().getBlock() == block) {
                    continue;
                }
                if (rule.matches(other)) {
                    level.setBlockAndUpdate(pos, result.defaultBlockState());
                    level.levelEvent(LevelEvent.LAVA_FIZZ, pos, 0);
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Falling into another liquid (vanilla's lava falling into water): when {@code owner}, the liquid block of the fluid
     * spreading, has a rule with {@code flowing} for the fluid at {@code pos} and the fluid flows {@code down} into it,
     * that block becomes the rule's {@code flowing} block with the fizz; true when it did (the fluid does not flow in).
     */
    public static boolean fallInto(Block owner, LevelAccessor level, BlockPos pos, Direction direction) {
        if (direction != Direction.DOWN || !(owner instanceof MsmLiquidBlock block) || !hasRules(block)) {
            return false;
        }
        FluidState other = level.getFluidState(pos);
        if (other.isEmpty() || other.createLegacyBlock().getBlock() == block) {
            return false;
        }
        for (Rule rule : rulesOf(block)) {
            if (rule.flowing() != null && rule.matches(other)) {
                level.setBlock(pos, rule.flowing().defaultBlockState(), Block.UPDATE_ALL);
                level.levelEvent(LevelEvent.LAVA_FIZZ, pos, 0);
                return true;
            }
        }
        return false;
    }
}
