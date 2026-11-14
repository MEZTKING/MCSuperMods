package dev.mcsupermods.runtime.scripting;

import java.util.Map;
import java.util.WeakHashMap;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;

/**
 * The target of an {@code Entity} wrapper of a non-player (ADR 0065 D7): vanilla re-creates such an entity in the new
 * level when it changes dimension and removes the old one with {@code CHANGED_DIMENSION}, so the handle follows it:
 * first through the moves {@link ScriptBridges} records from Fabric's {@code AFTER_ENTITY_CHANGE_LEVEL} (which also
 * finds an entity in a chunk that is not loaded), then by UUID in the server's levels. Players keep their object
 * across a dimension change and are wrapped directly. Server thread only.
 */
final class EntityHandle implements LiveTarget {
    /** Old entity to the entity that replaced it, held only while the old one is referenced. */
    private static final Map<Entity, Entity> MOVED = new WeakHashMap<>();

    private Entity entity;

    EntityHandle(Entity entity) {
        this.entity = entity;
    }

    /** Fabric {@code AFTER_ENTITY_CHANGE_LEVEL}: {@code from} was re-created as {@code to}. */
    static void moved(Entity from, Entity to) {
        if (from != to) {
            MOVED.put(from, to);
        }
    }

    @Override
    public Entity resolve() {
        if (!entity.isRemoved() || entity.getRemovalReason() != Entity.RemovalReason.CHANGED_DIMENSION) {
            return entity;
        }
        for (int hops = 0; hops < 64; hops++) {
            Entity next = MOVED.get(entity);
            if (next == null) {
                break;
            }
            entity = next;
        }
        if (entity.isRemoved() && entity.getRemovalReason() == Entity.RemovalReason.CHANGED_DIMENSION
                && entity.level() instanceof ServerLevel level) {
            for (ServerLevel l : level.getServer().getAllLevels()) {
                Entity moved = l.getEntity(entity.getUUID());
                if (moved != null && !moved.isRemoved()) {
                    entity = moved;
                    break;
                }
            }
        }
        return entity;
    }
}
