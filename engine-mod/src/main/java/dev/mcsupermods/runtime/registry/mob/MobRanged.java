package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.world.entity.LivingEntity;

/** Ranged attacks, filled by ADR 0070 D4 and D5 ({@code msm:ranged_attack}). Every body implements {@code RangedAttackMob}. */
public final class MobRanged {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobRanged(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** {@code RangedAttackMob.performRangedAttack}; no ranged goal calls it yet, so nothing happens. */
    public void performRangedAttack(LivingEntity target, float power) {}
}
