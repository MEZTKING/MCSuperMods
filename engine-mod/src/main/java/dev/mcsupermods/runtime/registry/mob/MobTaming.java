package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Taming, filled by ADR 0071 D1 ({@code msm:tameable}, {@code MsmAnimal} only): taming food, the owner's sit toggle,
 * {@code tamed_health}, {@code on_tame}, flying to the owner, persistence once tamed. Today every hook keeps
 * vanilla's behaviour.
 */
public final class MobTaming {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobTaming(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** Second step of {@code mobInteract} (taming food, then the owner's sit toggle); {@code null} passes on. */
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        return null;
    }

    /** {@code TamableAnimal.canFlyToOwner}. */
    public boolean canFlyToOwner(boolean vanilla) {
        return vanilla;
    }

    /** {@code TamableAnimal.wantsToAttack}. */
    public boolean wantsToAttack(LivingEntity target, LivingEntity owner, boolean vanilla) {
        return vanilla;
    }

    public boolean requiresCustomPersistence(boolean vanilla) {
        return vanilla;
    }

    public void addAdditionalSaveData(ValueOutput output) {}

    public void readAdditionalSaveData(ValueInput input) {}
}
