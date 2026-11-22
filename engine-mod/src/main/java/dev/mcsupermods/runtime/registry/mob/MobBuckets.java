package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.Item;

/**
 * Fish buckets of project mobs (ADR 0109 D1 and its amendment after B524): the {@code Bucketable} contract and the bucket item.
 * A stub from B526: the entity registrar asks here after a mob is registered; B532 fills it in.
 */
public final class MobBuckets {
    private MobBuckets() {}

    /** The bucket item registered for a definition with {@code msm:bucketable}; empty for every other mob (always, until B532). */
    public static Optional<Item> itemFor(Identifier id, EntityDefinition definition, EntityType<? extends Mob> type) {
        return Optional.empty();
    }
}
