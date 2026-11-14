package dev.mcsupermods.runtime.registry.types;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.registry.BlockSetTypes;
import dev.mcsupermods.runtime.registry.MsmBlock;
import java.util.Optional;
import net.minecraft.resources.Identifier;
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
 * </ul>
 * Vanilla's wooden doors, trapdoors and plates also set {@code ignitedByLava}; here {@code msm:flammable} sets it for every
 * type (the registrar). Types without a block class yet ({@code crop}, {@code sapling}, {@code leaves}) are not
 * {@link #supported}; the registrar makes them plain blocks for now.
 */
public final class BlockTypes {
    private BlockTypes() {}

    /** Whether this runtime has the type's own block class. */
    public static boolean supported(BlockType type) {
        return switch (type) {
            case BLOCK, PILLAR, HORIZONTAL, DIRECTIONAL, SLAB, STAIRS, WALL, FENCE, FENCE_GATE, PANE, DOOR, TRAPDOOR, BUTTON,
                    PRESSURE_PLATE -> true;
            case CROP, SAPLING, LEAVES -> false;
        };
    }

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
            default -> props;
        };
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
     * The block for a definition of a {@link #supported} type.
     *
     * @param stairsBase the registered base block's default state; only for {@code stairs}
     */
    public static Block create(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props, BlockState stairsBase) {
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
            default -> MsmBlock.create(id, definition, props);
        };
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
