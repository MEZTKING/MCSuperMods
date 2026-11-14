package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

/**
 * Breeding, filled by ADR 0071 D2 ({@code msm:breedable}, {@code MsmAnimal} only): breeding food, offspring,
 * {@code on_breed}, baby scale, variant inheritance. Never overrides or calls {@code canBeABaby} or
 * {@code setAgeLocked} (plan limit M9). Today nothing is food and the offspring is the same type.
 */
public final class MobBreeding {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobBreeding(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** First step of {@code mobInteract} (breeding food reaches vanilla's {@code Animal.mobInteract}); {@code null} passes on. */
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        return null;
    }

    /** {@code Animal.isFood}: nothing yet. */
    public boolean isFood(ItemStack stack) {
        return false;
    }

    /** {@code AgeableMob.getBreedOffspring}: a new mob of the same type. */
    public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob partner) {
        return mob.asMob().getType().create(level, EntitySpawnReason.BREEDING) instanceof AgeableMob child ? child : null;
    }

    /** {@code Animal.spawnChildFromBreeding}: vanilla's. */
    public void spawnChildFromBreeding(ServerLevel level, Animal partner, Runnable vanilla) {
        vanilla.run();
    }

    /** {@code LivingEntity.getAgeScale}. */
    public float getAgeScale(float vanilla) {
        return vanilla;
    }
}
