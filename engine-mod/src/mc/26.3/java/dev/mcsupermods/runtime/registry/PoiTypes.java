package dev.mcsupermods.runtime.registry;

import java.lang.reflect.Field;
import java.util.Map;
import net.fabricmc.fabric.api.object.builder.v1.world.poi.PoiHelper;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;

/**
 * Version seam (ADR 0038 D2, ADR 0098 D2): registers the point of interest type of a project job site, one entry for
 * every state of the block. 26.3: Fabric's {@code PoiHelper.register(Identifier, int, int, Block...)} (object builder API
 * 24.1.13), which also fills vanilla's state map. The caller checks {@code PoiTypes.hasPoi} for every state first
 * ({@code MsmProfessions}): vanilla's own duplicate check fires only after it has replaced the mapping (B469).
 *
 * <p>It also makes project beds villager homes ({@link #addHome}, ADR 0107 D4), by the same reflection on every version.
 */
public final class PoiTypes {
    private PoiTypes() {}

    /** Prepares the version's registration route: nothing to look up on 26.3. */
    public static void init() {}

    /** The route this version takes, for the log and the GameTests. */
    public static String route() {
        return "Fabric PoiHelper";
    }

    /**
     * Registers {@code id} for every state of {@code block}, with vanilla workstations' one ticket and range 1. Throws
     * {@link IllegalStateException} when the registration fails.
     */
    @SuppressWarnings("removal") // PoiHelper is the only registration route on 26.3 (ADR 0098 D2)
    public static Holder<PoiType> register(Identifier id, Block block) {
        try {
            PoiType type = PoiHelper.register(id, 1, 1, block);
            return BuiltInRegistries.POINT_OF_INTEREST_TYPE.wrapAsHolder(type);
        } catch (RuntimeException e) {
            throw new IllegalStateException("point of interest " + id + " could not be registered (PoiHelper: " + e + ")", e);
        }
    }

    /**
     * Makes every head state of {@code bed} a villager home (ADR 0107 D4 as amended after the B524 spike): joining
     * {@code #minecraft:beds} is not enough, vanilla's home point of interest type knows only its own beds. The head
     * states are put into vanilla's private, mutable state map ({@code PoiTypes.TYPE_BY_STATE}, read by
     * {@code PoiTypes.forState} when a block is set or a chunk's points of interest are checked) with the holder of
     * vanilla's red bed head, the same on every version; it must run before any world loads (the block's
     * registration). States that already have a type are left alone. Returns the number of states added; throws
     * {@link IllegalStateException} when the map or the home type cannot be reached.
     */
    @SuppressWarnings("unchecked")
    public static int addHome(Block bed) {
        Holder<PoiType> home = net.minecraft.world.entity.ai.village.poi.PoiTypes.forState(
                Blocks.BED.red().defaultBlockState().setValue(BedBlock.PART, BedPart.HEAD))
                .orElseThrow(() -> new IllegalStateException("vanilla's red bed has no point of interest type"));
        Map<BlockState, Holder<PoiType>> map;
        try {
            Field field = net.minecraft.world.entity.ai.village.poi.PoiTypes.class.getDeclaredField("TYPE_BY_STATE");
            field.setAccessible(true);
            map = (Map<BlockState, Holder<PoiType>>) field.get(null);
        } catch (ReflectiveOperationException | RuntimeException e) {
            throw new IllegalStateException("PoiTypes.TYPE_BY_STATE cannot be reached (" + e + ")", e);
        }
        int added = 0;
        for (BlockState state : bed.getStateDefinition().getPossibleStates()) {
            if (state.getValue(BedBlock.PART) == BedPart.HEAD && !map.containsKey(state)) {
                try {
                    map.put(state, home);
                } catch (UnsupportedOperationException e) {
                    throw new IllegalStateException("PoiTypes.TYPE_BY_STATE cannot be changed (" + e + ")", e);
                }
                added++;
            }
        }
        return added;
    }
}
