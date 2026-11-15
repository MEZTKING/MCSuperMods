package dev.mcsupermods.runtime.gametest;

import com.google.common.collect.ImmutableSet;
import java.lang.reflect.Method;
import java.util.Set;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.entity.ai.village.poi.PoiTypes;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;

/**
 * B469 spike (throwaway) seam: 26.4-snapshot-7 has no Fabric PoiHelper (fabric-object-builder-api-v1 25.0.8), so this
 * calls vanilla's private {@code PoiTypes.register(ResourceKey, Set, int, int)} by its Mojang name: it builds the
 * record, registers it with {@code Registry.registerForHolder} and fills the private state map
 * ({@code registerBlockStates}).
 */
public final class SpikePoi {
    private SpikePoi() {}

    public static String route() {
        return "reflection PoiTypes.register(ResourceKey, Set<BlockState>, int, int) (private static, returns Holder)";
    }

    @SuppressWarnings("unchecked")
    public static PoiType register(Identifier id, int maxTickets, int validRange, Block block) {
        try {
            Method m = PoiTypes.class.getDeclaredMethod("register", ResourceKey.class, Set.class, int.class, int.class);
            m.setAccessible(true);
            Set<BlockState> states = ImmutableSet.copyOf(block.getStateDefinition().getPossibleStates());
            Holder<PoiType> holder = (Holder<PoiType>) m.invoke(null, ResourceKey.create(Registries.POINT_OF_INTEREST_TYPE, id),
                    states, maxTickets, validRange);
            return holder.value();
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("PoiTypes.register by reflection failed: " + e
                    + (e.getCause() != null ? " cause " + e.getCause() : ""), e);
        }
    }
}
