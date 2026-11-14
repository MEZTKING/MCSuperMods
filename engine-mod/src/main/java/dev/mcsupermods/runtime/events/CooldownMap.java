package dev.mcsupermods.runtime.events;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.Level;

/**
 * Per-entity cooldowns of block triggers ({@code msm:on_step}, {@code msm:on_entity_inside}; ADR 0058 D1, ADR 0061 D2
 * and D4), keyed by dimension, position and entity. Bounded: past {@link #PRUNE_AT} entries the expired ones are
 * dropped, and past {@link #MAX_ENTRIES} all are, which at worst lets an entity fire once early. Server thread only.
 */
public final class CooldownMap {
    /** Size at which expired entries are pruned. */
    public static final int PRUNE_AT = 1024;
    /** Hard bound on the entries kept. */
    public static final int MAX_ENTRIES = 8192;

    private record Key(ResourceKey<Level> dimension, long pos, UUID entity) {}

    private final Map<Key, Long> last = new HashMap<>();

    /**
     * Whether {@code entity} at {@code pos} may fire at game time {@code now} with {@code cooldown} ticks between
     * firings; records the firing when it may. A clock that went backwards (a new world) counts as expired.
     */
    public boolean tryFire(ResourceKey<Level> dimension, BlockPos pos, UUID entity, long now, int cooldown) {
        Key key = new Key(dimension, pos.asLong(), entity);
        Long previous = last.get(key);
        if (previous != null && now - previous < cooldown && now >= previous) {
            return false;
        }
        if (last.size() >= PRUNE_AT) {
            last.values().removeIf(t -> now - t >= cooldown || now < t);
            if (last.size() >= MAX_ENTRIES) {
                last.clear();
            }
        }
        last.put(key, now);
        return true;
    }

    /** Entries held (for GameTests). */
    public int size() {
        return last.size();
    }
}
