package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * Riding, filled by ADR 0071 D3 ({@code msm:rideable}): saddle, control, steering, jumping, seats, {@code on_mount}.
 * Every body implements {@code PlayerRideableJumping}; vanilla reads it only after {@link #canJump()}, which is false
 * until then. Never implements {@code ItemSteerable} and never constructs {@code Equippable} (plan limit M9).
 * Today every hook keeps vanilla's behaviour.
 */
public final class MobRiding {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobRiding(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** Third step of {@code mobInteract} (mounting); {@code null} passes on. */
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        return null;
    }

    public LivingEntity getControllingPassenger(LivingEntity vanilla) {
        return vanilla;
    }

    public void tickRidden(Player rider, Vec3 input, Runnable vanilla) {
        vanilla.run();
    }

    public Vec3 getRiddenInput(Player rider, Vec3 input, Vec3 vanilla) {
        return vanilla;
    }

    public float getRiddenSpeed(Player rider, float vanilla) {
        return vanilla;
    }

    public Vec3 getPassengerAttachmentPoint(Entity passenger, EntityDimensions dimensions, float scale, Vec3 vanilla) {
        return vanilla;
    }

    public boolean canAddPassenger(Entity passenger, boolean vanilla) {
        return vanilla;
    }

    public boolean canUseSlot(EquipmentSlot slot, boolean vanilla) {
        return vanilla;
    }

    /** {@code PlayerRideableJumping.onPlayerJump}. */
    public void onPlayerJump(int strength) {}

    /** {@code PlayerRideableJumping.canJump}: false, so vanilla shows no jump bar and sends no jumps. */
    public boolean canJump() {
        return false;
    }

    /** {@code PlayerRideableJumping.handleStartJump}. */
    public void handleStartJump(int strength) {}

    /** {@code PlayerRideableJumping.handleStopJump}. */
    public void handleStopJump() {}
}
