package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.BlockSetTypes;
import dev.mcsupermods.runtime.registry.MsmBlock;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockSetType;
import net.minecraft.world.level.block.state.properties.WoodType;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.phys.AABB;

/**
 * The block class and vanilla {@code Properties} of each block type (ADR 0067 D4). The {@code Properties} below are the
 * ones vanilla's {@code Blocks.<clinit>} adds for the family on 26.3 and 26.4-snapshot-7 (read with {@code javap}), on
 * top of what the definition sets (strength, sound, light, tool):
 * <ul>
 *   <li>{@code stairs}, {@code slab}: {@code isViewBlocking} true only where the occlusion shape meets the camera's near
 *       plane ({@code Blocks.NEAR_PLANE_INTERSECTS_OUTLINE}; vanilla also copies the base block's properties with
 *       {@code ofLegacyCopy}, here the definition's own are used)</li>
 *   <li>{@code wall}, {@code fence}, {@code fence_gate}: {@code forceSolidOn}</li>
 *   <li>{@code pane}: {@code noOcclusion} (glass pane and iron bars)</li>
 *   <li>{@code door}: {@code noOcclusion}, {@code pushReaction(POPPED)} (oak and iron doors)</li>
 *   <li>{@code trapdoor}: {@code noOcclusion}, {@code isValidSpawn(never)} (oak and iron trapdoors)</li>
 *   <li>{@code button}: {@code noCollision}, {@code pushReaction(POPPED)} ({@code Blocks.buttonProperties}, whose
 *       {@code strength(0.5)} is the definition's here)</li>
 *   <li>{@code pressure_plate}: {@code forceSolidOn}, {@code noCollision}, {@code pushReaction(POPPED)} (oak, stone and
 *       weighted plates)</li>
 *   <li>{@code pillar}, {@code horizontal}, {@code directional}: nothing of their own (logs, furnaces and droppers set only
 *       map colour, instrument and strength)</li>
 *   <li>{@code crop}, {@code sapling}: {@code noCollision}, {@code randomTicks}, {@code pushReaction(POPPED)} (wheat, oak
 *       sapling; their {@code instabreak} is the definition's strength here)</li>
 *   <li>{@code leaves}: {@code Blocks.leavesProperties}: {@code randomTicks}, {@code noOcclusion},
 *       {@code isValidSpawn} for ocelots and parrots only, never suffocating or a redstone conductor,
 *       {@code ignitedByLava}, {@code pushReaction(POPPED)} (its {@code strength(0.2)} is the definition's here)</li>
 * </ul>
 * Vanilla's wooden doors, trapdoors and plates also set {@code ignitedByLava}; here {@code msm:flammable} sets it for every
 * type (the registrar), and leaves always.
 */
public final class BlockTypes {
    private BlockTypes() {}

    /** Tinted leaves and their tint, in registration order, for the client's tint registration (ADR 0068 D6). */
    private static final Map<Block, BlockType.Tint> TINTED_LEAVES = new LinkedHashMap<>();

    /** The definition's properties plus the family's own vanilla ones. */
    public static BlockBehaviour.Properties properties(BlockType type, BlockBehaviour.Properties props) {
        return switch (type) {
            case STAIRS, SLAB -> props.isViewBlocking(BlockTypes::nearPlaneIntersectsOutline);
            case WALL, FENCE, FENCE_GATE -> props.forceSolidOn();
            case PANE -> props.noOcclusion();
            case DOOR -> props.noOcclusion().pushReaction(PushReaction.POPPED);
            case TRAPDOOR -> props.noOcclusion().isValidSpawn((state, level, pos, entityType) -> false);
            case BUTTON -> props.noCollision().pushReaction(PushReaction.POPPED);
            case PRESSURE_PLATE -> props.forceSolidOn().noCollision().pushReaction(PushReaction.POPPED);
            case CROP, SAPLING -> props.noCollision().randomTicks().pushReaction(PushReaction.POPPED);
            case LEAVES -> props.randomTicks().noOcclusion().isValidSpawn(BlockTypes::ocelotOrParrot)
                    .isSuffocating((state, level, pos) -> false).ignitedByLava().pushReaction(PushReaction.POPPED)
                    .isRedstoneConductor((state, level, pos) -> false);
            default -> props;
        };
    }

    /** Vanilla's {@code Blocks.ocelotOrParrot} (private there): leaves are a valid spawn for ocelots and parrots only. */
    private static Boolean ocelotOrParrot(BlockState state, net.minecraft.world.level.BlockGetter level, net.minecraft.core.BlockPos pos,
            EntityType<?> entityType) {
        return entityType == EntityTypes.OCELOT || entityType == EntityTypes.PARROT;
    }

    /** Vanilla's {@code Blocks.NEAR_PLANE_INTERSECTS_OUTLINE} (private there): the occlusion shape meets the box. */
    private static boolean nearPlaneIntersectsOutline(BlockState state, net.minecraft.world.level.BlockGetter level,
            net.minecraft.core.BlockPos pos, AABB nearPlane) {
        for (AABB box : state.getOcclusionShape().toAabbs()) {
            if (box.move(pos).intersects(nearPlane)) {
                return true;
            }
        }
        return false;
    }

    /**
     * The block for a definition of any type.
     *
     * @param stairsBase the registered base block's default state; only for {@code stairs}
     * @param warn takes a load warning (without the file name)
     */
    public static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, BlockState stairsBase,
            Consumer<String> warn) {
        return switch (definition.type()) {
            case STAIRS -> new MsmStairBlock(id, definition, stairsBase, props);
            case SLAB -> new MsmSlabBlock(id, definition, props);
            case WALL -> new MsmWallBlock(id, definition, props);
            case FENCE -> new MsmFenceBlock(id, definition, props);
            case FENCE_GATE -> new MsmFenceGateBlock(id, definition,
                    woodType(((BlockType.FenceGate) definition.typeFields()).woodType()), props);
            case PANE -> new MsmPaneBlock(id, definition, props);
            case DOOR -> new MsmDoorBlock(id, definition, setType(definition), props);
            case TRAPDOOR -> new MsmTrapDoorBlock(id, definition, setType(definition), props);
            case BUTTON -> new MsmButtonBlock(id, definition, setType(definition),
                    ((BlockType.Button) definition.typeFields()).pressTicks(), props);
            case PRESSURE_PLATE -> {
                Optional<Integer> weightedMax = ((BlockType.PressurePlate) definition.typeFields()).weightedMax();
                yield weightedMax.isPresent()
                        ? new MsmWeightedPressurePlateBlock(id, definition, weightedMax.get(), setType(definition), props)
                        : new MsmPressurePlateBlock(id, definition, setType(definition), props);
            }
            case CROP -> crop(id, definition, props, warn);
            case SAPLING -> new MsmSaplingBlock(id, definition, props);
            case LEAVES -> leaves(id, definition, props, warn);
            case BLOCK, PILLAR, HORIZONTAL, DIRECTIONAL -> MsmBlock.create(id, definition, props);
        };
    }

    /**
     * A crop. A {@code stage_heights} list whose length is not {@code max_age + 1} is a warning, and vanilla's ramp is used
     * (B261: the format keeps any length; the validators warn too).
     */
    private static Block crop(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        BlockType.Crop crop = (BlockType.Crop) definition.typeFields();
        crop.stageHeightsSetting().filter(h -> h.size() != crop.maxAge() + 1).ifPresent(h -> warn.accept("stage_heights has "
                + h.size() + " entries, not max_age + 1 = " + (crop.maxAge() + 1) + "; vanilla's heights are used"));
        return MsmCropBlock.create(id, definition, MsmCropBlock.stageHeights(crop), props);
    }

    /**
     * Leaves: tinted ({@link MsmTintedLeavesBlock}, recorded for the client), untinted with a falling particle
     * ({@link MsmUntintedLeavesBlock}) or plain ({@link MsmLeavesBlock}). A {@code falling_particle} that is not a particle
     * type without options is a warning (no particle); with a tint it is ignored with a warning (tinted leaves fall in
     * their tint, as vanilla's).
     */
    private static Block leaves(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, Consumer<String> warn) {
        BlockType.Leaves leaves = (BlockType.Leaves) definition.typeFields();
        if (leaves.tint().isPresent()) {
            leaves.fallingParticle().ifPresent(p -> warn.accept("falling_particle " + p
                    + " is ignored on tinted leaves; their falling leaves take the tint"));
            Block block = new MsmTintedLeavesBlock(id, definition, leaves.particleChance(), props);
            TINTED_LEAVES.put(block, leaves.tint().get());
            return block;
        }
        if (leaves.fallingParticle().isPresent()) {
            Identifier p = leaves.fallingParticle().get();
            if (BuiltInRegistries.PARTICLE_TYPE.containsKey(p)
                    && BuiltInRegistries.PARTICLE_TYPE.getValue(p) instanceof SimpleParticleType particle) {
                return new MsmUntintedLeavesBlock(id, definition, leaves.particleChance(), particle, props);
            }
            warn.accept("falling_particle " + p + " is not a particle type without options; the leaves have no falling particle");
        }
        return new MsmLeavesBlock(id, definition, props);
    }

    /** Every tinted leaves block registered so far, with its tint (ADR 0068 D6); read by the client entrypoint. */
    public static Map<Block, BlockType.Tint> tintedLeaves() {
        return Collections.unmodifiableMap(TINTED_LEAVES);
    }

    /** The vanilla {@link BlockSetType} of a door, trapdoor, button or pressure plate (version seam {@link BlockSetTypes}). */
    private static BlockSetType setType(BlockDefinition definition) {
        return BlockSetTypes.of(switch (definition.typeFields()) {
            case BlockType.Opening o -> o.setType();
            case BlockType.Button b -> b.setType();
            case BlockType.PressurePlate p -> p.setType();
            default -> throw new IllegalArgumentException("type '" + definition.type().id() + "' has no set_type");
        });
    }

    /** The vanilla {@link WoodType} of an MSM wood type name; the constants are named alike on both targets. */
    public static WoodType woodType(BlockType.WoodKind kind) {
        return switch (kind) {
            case OAK -> WoodType.OAK;
            case SPRUCE -> WoodType.SPRUCE;
            case BIRCH -> WoodType.BIRCH;
            case ACACIA -> WoodType.ACACIA;
            case CHERRY -> WoodType.CHERRY;
            case JUNGLE -> WoodType.JUNGLE;
            case DARK_OAK -> WoodType.DARK_OAK;
            case PALE_OAK -> WoodType.PALE_OAK;
            case POPLAR -> WoodType.POPLAR;
            case CRIMSON -> WoodType.CRIMSON;
            case WARPED -> WoodType.WARPED;
            case MANGROVE -> WoodType.MANGROVE;
            case BAMBOO -> WoodType.BAMBOO;
        };
    }
}
