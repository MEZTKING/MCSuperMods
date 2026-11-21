package dev.mcsupermods.runtime.registry;

import net.fabricmc.fabric.api.object.builder.v1.world.poi.PoiHelper;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.level.block.Block;

/**
 * Version seam (ADR 0038 D2, ADR 0098 D2): registers the point of interest type of a project job site, one entry for
 * every state of the block. 26.3: Fabric's {@code PoiHelper.register(Identifier, int, int, Block...)} (object builder API
 * 24.1.13), which also fills vanilla's state map. The caller checks {@code PoiTypes.hasPoi} for every state first
 * ({@code MsmProfessions}): vanilla's own duplicate check fires only after it has replaced the mapping (B469).
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
}
