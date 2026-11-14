package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * Movement modes, filled by ADR 0070 D3 ({@code msm:movement.mode}: walk, fly, swim, amphibious). Today every hook
 * keeps vanilla's behaviour. Never overrides or calls {@code travelFlying}, {@code checkFallDamage} or
 * {@code jumpInLiquid} (their signatures differ between 26.3 and 26.4; plan limit M9): flight avoids fall damage
 * through {@link #causeFallDamage}.
 */
public final class MobMovement {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobMovement(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** The body's constructor tail: move and look controls through {@link MsmMob#setControls}, no gravity. Nothing yet. */
    public void afterConstruct() {}

    /**
     * The goal a {@code wander} entry adds (from {@code MobGoals}, inside the {@code Mob} constructor): {@code fly} makes it
     * {@code WaterAvoidingRandomFlyingGoal}, {@code swim} {@code RandomSwimmingGoal} (ADR 0070 D3). Today the walking
     * stroll {@code vanilla} builds ({@code WaterAvoidingRandomStrollGoal}, or {@code RandomStrollGoal} without
     * {@code avoid_water}).
     */
    public net.minecraft.world.entity.ai.goal.Goal wanderGoal(Goal.Wander wander,
            Supplier<net.minecraft.world.entity.ai.goal.Goal> vanilla) {
        return vanilla.get();
    }

    /** Runs inside the {@code Mob} constructor. Vanilla's ground navigation. */
    public PathNavigation createNavigation(Level level, Supplier<PathNavigation> vanilla) {
        return vanilla.get();
    }

    /** Vanilla's travel. */
    public void travel(Vec3 input, Runnable vanilla) {
        vanilla.run();
    }

    /** Vanilla's fall damage. */
    public boolean causeFallDamage(double fallDistance, float multiplier, DamageSource source, BooleanSupplier vanilla) {
        return vanilla.getAsBoolean();
    }

    public boolean canBreatheUnderwater(boolean vanilla) {
        return vanilla;
    }

    /** Vanilla's base tick (air supply, drying out for swimmers later). */
    public void baseTick(Runnable vanilla) {
        vanilla.run();
    }

    public boolean isPushedByFluid(boolean vanilla) {
        return vanilla;
    }
}
