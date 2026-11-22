package dev.mcsupermods.runtime.registry;

import com.google.common.collect.ImmutableSet;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.Set;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.ai.village.poi.PoiType;
import net.minecraft.world.level.block.BedBlock;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BedPart;

/**
 * Version seam (ADR 0038 D2, ADR 0098 D2 and its amendment): registers the point of interest type of a project job
 * site, one entry for every state of the block. 26.4-snapshot-7: Fabric API 0.165.4+26.4 has no {@code PoiHelper}
 * (object builder API 25.0.8), and vanilla's {@code PoiTypes.register(ResourceKey, Set, int, int)} is private; the
 * runtime calls it by its Mojang name (the game is not obfuscated), as {@code Flammability} calls
 * {@code FireBlock.setFlammable}. It registers the type for its holder and fills the private state map (B469). The
 * caller checks {@code PoiTypes.hasPoi} for every state first ({@code MsmProfessions}): vanilla's own duplicate check
 * fires only after it has replaced the mapping.
 *
 * <p>It also makes project beds villager homes ({@link #addHome}, ADR 0107 D4), by the same reflection on every version.
 */
public final class PoiTypes {
    private static Method register;

    private PoiTypes() {}

    /** Looks the private method up once; a failure is kept for {@link #register}, which reports it per profession. */
    public static void init() {
        if (register != null) {
            return;
        }
        try {
            Method m = net.minecraft.world.entity.ai.village.poi.PoiTypes.class.getDeclaredMethod("register", ResourceKey.class,
                    Set.class, int.class, int.class);
            m.setAccessible(true);
            register = m;
        } catch (NoSuchMethodException | RuntimeException e) {
            register = null;
        }
    }

    /** The route this version takes, for the log and the GameTests. */
    public static String route() {
        return "reflection PoiTypes.register";
    }

    /**
     * Registers {@code id} for every state of {@code block}, with vanilla workstations' one ticket and range 1. Throws
     * {@link IllegalStateException} when the registration fails.
     */
    @SuppressWarnings("unchecked")
    public static Holder<PoiType> register(Identifier id, Block block) {
        init();
        if (register == null) {
            throw new IllegalStateException("point of interest " + id
                    + " could not be registered (PoiTypes.register(ResourceKey, Set, int, int) not found)");
        }
        Set<BlockState> states = ImmutableSet.copyOf(block.getStateDefinition().getPossibleStates());
        try {
            return (Holder<PoiType>) register.invoke(null, ResourceKey.create(Registries.POINT_OF_INTEREST_TYPE, id), states, 1, 1);
        } catch (IllegalAccessException | InvocationTargetException | RuntimeException e) {
            Throwable cause = e instanceof InvocationTargetException ite && ite.getCause() != null ? ite.getCause() : e;
            throw new IllegalStateException("point of interest " + id + " could not be registered (PoiTypes.register: " + cause + ")",
                    cause);
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
