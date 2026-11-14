package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.goal.GoalSelector;

/** Ranged attacks, filled by ADR 0070 D4 and D5 ({@code msm:ranged_attack}). Every body implements {@code RangedAttackMob}. */
public final class MobRanged {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobRanged(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /**
     * A {@code ranged_attack} goal entry of a mob with {@code msm:ranged_attack} (from {@code MobGoals}, inside the
     * {@code Mob} constructor; without the component {@code MobGoals} adds nothing): the shooting goal at
     * {@code priority} and the target goals of {@code goal} ({@code targets}, {@code must_see}, {@code retaliate}), as
     * {@code melee_attack} (ADR 0070 D5). Nothing yet (B291).
     */
    public void addGoals(GoalSelector goalSelector, GoalSelector targetSelector, int priority, Goal.RangedAttack goal,
            EntityComponents.RangedAttack attack) {}

    /** {@code RangedAttackMob.performRangedAttack}; no ranged goal calls it yet, so nothing happens. */
    public void performRangedAttack(LivingEntity target, float power) {}
}
