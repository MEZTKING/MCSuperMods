package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.loader.types.GrowingPlantFields;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.tags.TagKey;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelReader;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.CaveVines;
import net.minecraft.world.level.block.GlowLichenBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;

/**
 * The blocks of the {@code growing_plant}, {@code column_plant}, {@code multiface} and {@code dripleaf} types (ADR 0103 D1,
 * D3 and its amendment after B503), and the small rules they share. The family properties common to a type are in
 * {@link BlockTypes#properties}; the ones that depend on a style or size are added here (vanilla's, as observed on 26.3 and
 * 26.4-snapshot-7; not copied code):
 * <ul>
 *   <li>{@code column_plant} {@code cane}: {@code noCollision} (sugar cane)</li>
 *   <li>{@code column_plant} {@code bamboo}: {@code forceSolidOn}, {@code noOcclusion}, {@code dynamicShape},
 *       {@code offsetType(XZ)}, never a redstone conductor (bamboo)</li>
 *   <li>{@code dripleaf} {@code small}: {@code noCollision}, {@code offsetType(XYZ)} (small dripleaf)</li>
 * </ul>
 * Light: a plant with {@code berries} glows at {@code berries.light} while it has them (else the definition's
 * {@code msm:light_emitter}, default 0); a {@code multiface} at its {@code light} on every state with a face, unless
 * {@code msm:light_emitter} sets its own. Companions ({@code <path>_plant}, {@code <path>_shoot}, {@code <path>_stem}) are
 * made by {@link Companions} right after their element.
 * <p>
 * Soil (amendment after the spike): a {@code soil} list is checked by the element's own survival rule, never by adding to
 * vanilla's shared tags; without one the plant uses vanilla's rule and tags (for strands: any sturdy face).
 */
public final class GrowingPlantTypes {
    private GrowingPlantTypes() {}

    /** Vanilla's kelp grows on 14 in 100 random ticks (the format's default {@code growth_chance}; verify at implementation). */
    static final float KELP_GROWTH_CHANCE = GrowingPlantFields.GrowingPlant.DEFAULT_GROWTH_CHANCE;

    /** The chance that a newly grown tip of a plant with berries has them, as cave vines (11 in 100; verify at implementation). */
    static final float BERRIES_ON_GROWTH_CHANCE = 0.11f;

    static final TagKey<Block> SUPPORTS_SUGAR_CANE = vanillaTag("supports_sugar_cane");
    static final TagKey<Block> SUPPORTS_SUGAR_CANE_ADJACENTLY = vanillaTag("supports_sugar_cane_adjacently");
    static final TagKey<Block> SUPPORTS_CACTUS = vanillaTag("supports_cactus");
    static final TagKey<Block> SUPPORTS_BAMBOO = vanillaTag("supports_bamboo");
    static final TagKey<Block> SUPPORTS_BIG_DRIPLEAF = vanillaTag("supports_big_dripleaf");

    static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        Companions.companionId(id, definition).ifPresent(companion -> {
            if (BuiltInRegistries.BLOCK.containsKey(companion)) {
                throw new IllegalArgumentException("the generated block " + companion + " (the " + Companions.kind(definition)
                        + ") is already registered; the " + definition.type().id() + " is skipped");
            }
        });
        int ownLight = definition.components().lightEmitter().map(l -> l.level()).orElse(-1);
        return switch (definition.type()) {
            case GROWING_PLANT -> growingPlant(id, definition, props, ownLight, warn);
            case COLUMN_PLANT -> columnPlant(id, definition, props);
            case MULTIFACE -> {
                GrowingPlantFields.Multiface fields = (GrowingPlantFields.Multiface) definition.typeFields();
                yield new MsmMultifaceBlock(id, definition, ownLight >= 0 ? props : props.lightLevel(GlowLichenBlock.emission(fields.light())));
            }
            case DRIPLEAF -> {
                GrowingPlantFields.Dripleaf fields = (GrowingPlantFields.Dripleaf) definition.typeFields();
                yield fields.size() == GrowingPlantFields.DripleafSize.BIG
                        ? new MsmBigDripleafBlock(id, definition, props)
                        : new MsmSmallDripleafBlock(id, definition, props.noCollision().offsetType(BlockBehaviour.OffsetType.XYZ));
            }
            default -> throw new IllegalArgumentException("block type '" + definition.type().id() + "' is not a growing plant type");
        };
    }

    private static Block growingPlant(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, int ownLight,
            Consumer<String> warn) {
        GrowingPlantFields.GrowingPlant fields = (GrowingPlantFields.GrowingPlant) definition.typeFields();
        if (fields.needsWater() && fields.direction() == GrowingPlantFields.GrowthDirection.DOWN) {
            warn.accept("direction down is not used with needs_water: a water plant grows up, as kelp");
        }
        if (fields.berries().isPresent() && fields.bonemealGrowth().isPresent()) {
            warn.accept("bonemeal_growth is not used on a plant with berries: bone meal ripens the berries, as on cave vines");
        }
        if (fields.berries().isPresent()) {
            int light = fields.berries().get().light();
            int base = Math.max(ownLight, 0);
            props = props.lightLevel(state -> hasBerries(state) ? light : base);
        }
        return MsmGrowingPlantHeadBlock.create(id, definition, props);
    }

    private static Block columnPlant(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        GrowingPlantFields.ColumnPlant fields = (GrowingPlantFields.ColumnPlant) definition.typeFields();
        return switch (fields.style()) {
            case CANE -> new MsmColumnPlantBlock.Cane(id, definition, props.noCollision());
            case CACTUS -> new MsmColumnPlantBlock.Cactus(id, definition, props);
            case BAMBOO -> new MsmBambooBlock(id, definition, props.forceSolidOn().noOcclusion().dynamicShape()
                    .offsetType(BlockBehaviour.OffsetType.XZ).isRedstoneConductor((state, level, pos) -> false));
        };
    }

    // Shared rules.

    static TagKey<Block> vanillaTag(String path) {
        return TagKey.create(Registries.BLOCK, Identifier.withDefaultNamespace(path));
    }

    /** Whether {@code state} is one of the {@code soil} entries (a block id or a {@code #}tag). */
    static boolean matches(BlockState state, List<BlockType.IdOrTag> soil) {
        for (BlockType.IdOrTag entry : soil) {
            if (entry.tag() ? state.is(TagKey.create(Registries.BLOCK, entry.id()))
                    : BuiltInRegistries.BLOCK.getKey(state.getBlock()).equals(entry.id())) {
                return true;
            }
        }
        return false;
    }

    /** Whether {@code state} is the plant's soil: the definition's {@code soil} when given, else vanilla's {@code tag}. */
    static boolean isSoil(BlockState state, Optional<List<BlockType.IdOrTag>> soil, TagKey<Block> tag) {
        return soil.isPresent() ? matches(state, soil.get()) : state.is(tag);
    }

    /**
     * Whether water is beside {@code base} (one of its four sides holds water, or a block of
     * {@code #minecraft:supports_sugar_cane_adjacently} such as frosted ice), as sugar cane needs (B503 X2).
     */
    static boolean waterBeside(LevelReader level, BlockPos base) {
        for (Direction side : Direction.Plane.HORIZONTAL) {
            BlockPos at = base.relative(side);
            if (level.getFluidState(at).is(FluidTags.WATER) || level.getBlockState(at).is(SUPPORTS_SUGAR_CANE_ADJACENTLY)) {
                return true;
            }
        }
        return false;
    }

    /**
     * The height a column standing on {@code base} stops at: {@code max} when {@code min == max}, else one height from
     * {@code min} to {@code max} chosen by the column's place (each column its own, the same after a reload). Our own rule.
     */
    static int stopHeight(BlockPos base, int min, int max) {
        int low = Math.min(min, max);
        int high = Math.max(min, max);
        if (low == high) {
            return high;
        }
        return low + (int) Math.floorMod(Mth.getSeed(base.getX(), 0, base.getZ()) >>> 16, (long) (high - low + 1));
    }

    /** The lowest block of the column of {@code block} through {@code pos}. */
    static BlockPos base(LevelReader level, BlockPos pos, Block block) {
        BlockPos at = pos;
        while (level.getBlockState(at.below()).is(block) && at.getY() > level.getMinY()) {
            at = at.below();
        }
        return at;
    }

    /** {@code amount} of cactus damage to {@code entity} (server side only). */
    static void hurt(Level level, Entity entity, float amount) {
        if (amount > 0 && level instanceof ServerLevel server) {
            entity.hurtServer(server, server.damageSources().cactus(), amount);
        }
    }

    static boolean hasBerries(BlockState state) {
        return state.hasProperty(CaveVines.BERRIES) && state.getValue(CaveVines.BERRIES);
    }

    /** The registered item {@code id}, or {@code ItemStack.EMPTY} when it is not an item. */
    static ItemStack stackOf(Identifier id) {
        Item item = BuiltInRegistries.ITEM.getValue(id);
        return item == Items.AIR ? ItemStack.EMPTY : new ItemStack(item);
    }
}
