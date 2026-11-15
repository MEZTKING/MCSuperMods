package dev.mcsupermods.runtime.gametest;

import net.fabricmc.fabric.api.object.builder.v1.world.poi.PoiHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.level.block.Block;

/** B469 spike (throwaway) seam: 26.3 registers a POI type for every state of a block through Fabric's PoiHelper. */
public final class SpikePoi {
    private SpikePoi() {}

    public static String route() {
        return "fabric PoiHelper.register(Identifier, int, int, Block...)";
    }

    public static PoiType register(Identifier id, int maxTickets, int validRange, Block block) {
        return PoiHelper.register(id, maxTickets, validRange, block);
    }
}
