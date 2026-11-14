package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.events.AnimationTarget;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.mob.MobDriver;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.control.LookControl;
import net.minecraft.world.entity.ai.control.MoveControl;

/**
 * Every runtime mob body ({@link MsmEntity}, {@link MsmAnimal}, {@link MsmMonster} and their GeckoLib subclasses;
 * ADR 0070 D2). A body overrides the vanilla callbacks and only delegates to its {@link MobDriver}, which holds the
 * behaviour every body shares; this interface is what the driver and its modules see of the body.
 */
public interface MsmMob extends AnimationTarget {
    /** The body's driver, built on first use from the definition of the body's entity type. */
    MobDriver driver();

    /** The body as a vanilla mob; every body is a {@link PathfinderMob}. */
    default PathfinderMob asMob() {
        return (PathfinderMob) this;
    }

    /** The definition this entity was registered from. */
    default EntityDefinition definition() {
        return driver().definition();
    }

    /** The entity type id, the owner of the definition's events. */
    default Identifier definitionId() {
        return driver().id();
    }

    /** The body class's variant index accessor ({@code DATA_VARIANT}, ADR 0071 D4). */
    EntityDataAccessor<Integer> variantData();

    /** The body class's triggered animation accessor ({@code DATA_ANIM}, ADR 0072 D2). */
    EntityDataAccessor<Integer> animData();

    /** Replaces the protected {@code moveControl} and {@code lookControl} fields (ADR 0070 D3); {@code null} keeps one. */
    void setControls(MoveControl move, LookControl look);

    /** Goes through {@code MobAnimations}; the GeckoLib bodies also trigger the GeckoLib animation. */
    @Override
    default void playAnimation(String controller, String animation) {
        driver().animations().play(controller, animation);
    }
}
