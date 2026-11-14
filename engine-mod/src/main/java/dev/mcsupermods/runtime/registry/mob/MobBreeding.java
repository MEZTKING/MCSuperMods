package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.function.Predicate;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.AgeableMob;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.ai.goal.BreedGoal;
import net.minecraft.world.entity.ai.goal.FollowParentGoal;
import net.minecraft.world.entity.ai.goal.GoalSelector;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.animal.Animal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;

/**
 * Breeding and babies (ADR 0071 D2, {@code msm:breedable}, {@code MsmAnimal} only: the parser drops the component on
 * other bases). Ages, love mode, {@code BreedGoal} and the baby's growth are vanilla's {@code Animal}; this module gives
 * them the definition's food, {@code baby_scale}, {@code grow_up_ticks}, {@code on_breed} and the goals. Never overrides
 * or calls {@code canBeABaby} or {@code setAgeLocked} (plan limit M9).
 *
 * <p>Goal priorities follow {@link MobTaming#afterFighting} ({@code n}): {@code BreedGoal} at n + 1, {@code TemptGoal}
 * with the food at n + 2, {@code FollowParentGoal} at n + 3, at a cow's speeds (1.0, 1.25, 1.25).
 */
public final class MobBreeding {
    private static final double BREED_SPEED = 1.0;
    private static final double TEMPT_SPEED = 1.25;
    private static final double FOLLOW_PARENT_SPEED = 1.25;

    private final MsmMob mob;
    private final EntityDefinition definition;
    /** Null without {@code msm:breedable}. */
    private final EntityComponents.Breedable breedable;
    private final Predicate<ItemStack> food;
    /** The child {@link #getBreedOffspring} made last, read back by {@link #spawnChildFromBreeding}. */
    private AgeableMob lastOffspring;

    MobBreeding(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
        this.breedable = definition == null ? null : definition.components().breedable().orElse(null);
        this.food = breedable == null ? stack -> false : MobGoals.ofItems(breedable.items());
    }

    private Animal animal() {
        return mob.asMob() instanceof Animal animal ? animal : null;
    }

    /** Called by {@link MobGoals#registerGoals} after the definition's goals, inside the {@code Mob} constructor. */
    public void addGoals(GoalSelector goalSelector, GoalSelector targetSelector) {
        Animal self = animal();
        if (breedable == null || self == null) {
            return;
        }
        int after = MobTaming.afterFighting(definition.components());
        goalSelector.addGoal(after + 1, new BreedGoal(self, BREED_SPEED));
        if (breedable.tempted()) {
            goalSelector.addGoal(after + 2, new TemptGoal(self, TEMPT_SPEED, food, false));
        }
        if (breedable.followParents()) {
            goalSelector.addGoal(after + 3, new FollowParentGoal(self, FOLLOW_PARENT_SPEED));
        }
    }

    /**
     * First step of {@code mobInteract}: the breeding food does what vanilla's {@code Animal.mobInteract} does (love
     * mode for a grown mob that can fall in love, a growth step for a baby), here rather than in vanilla's so that
     * {@code msm:on_interact}, which answers every other right click, never swallows it. {@code null} passes on.
     */
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        Animal self = animal();
        if (breedable == null || self == null) {
            return null;
        }
        ItemStack stack = player.getItemInHand(hand);
        if (!food.test(stack)) {
            return null;
        }
        int age = self.getAge();
        if (player instanceof ServerPlayer && age == 0 && self.canFallInLove()) {
            stack.consume(1, player);
            self.setInLove(player);
            return InteractionResult.SUCCESS_SERVER;
        }
        if (self.canAgeUp()) {
            stack.consume(1, player);
            self.ageUp(AgeableMob.getSpeedUpSecondsWhenFeeding(-age), true);
            return InteractionResult.SUCCESS;
        }
        return self.level().isClientSide() ? InteractionResult.CONSUME : null;
    }

    /** {@code Animal.isFood}: the {@code items}. */
    public boolean isFood(ItemStack stack) {
        return food.test(stack);
    }

    /**
     * {@code AgeableMob.getBreedOffspring}: a new mob of the same type (also for a spawn egg used on an adult, where the
     * partner is the adult itself), which takes one parent's variant (ADR 0071 D4, {@link MobVariants#inheritFrom}):
     * neither breeding nor a spawn egg on an adult runs {@code finalizeSpawn}.
     */
    public AgeableMob getBreedOffspring(ServerLevel level, AgeableMob partner) {
        AgeableMob child = mob.asMob().getType().create(level, EntitySpawnReason.BREEDING) instanceof AgeableMob made ? made : null;
        if (child instanceof MsmMob childMob) {
            childMob.driver().variants().inheritFrom(mob.asMob(), partner);
        }
        lastOffspring = child;
        return child;
    }

    /**
     * {@code Animal.spawnChildFromBreeding}: vanilla's (the baby, the parents' cooldown, hearts, experience), refused
     * between two types (both share the body class, which is all {@code Animal.canMate} compares); then the baby's
     * grow-up time and {@code on_breed} (self the baby, player the one who fed a parent).
     */
    public void spawnChildFromBreeding(ServerLevel level, Animal partner, Runnable vanilla) {
        Animal self = animal();
        if (breedable == null || self == null) {
            vanilla.run();
            return;
        }
        if (partner.getType() != self.getType()) {
            self.resetLove();
            partner.resetLove();
            return;
        }
        ServerPlayer cause = self.getLoveCause() != null ? self.getLoveCause() : partner.getLoveCause();
        lastOffspring = null;
        vanilla.run();
        AgeableMob child = lastOffspring;
        lastOffspring = null;
        if (child == null || child.isRemoved() || !child.isBaby()) {
            return;
        }
        if (breedable.growUpTicks() != -AgeableMob.BABY_START_AGE) {
            child.setAge(-breedable.growUpTicks());
        }
        if (child instanceof MsmMob childMob) {
            breedable.onBreed().ifPresent(event -> EventRunner.fire(childMob.definitionId(), childMob.definition().events(), event,
                    EventContext.forEntity(level, child, cause)));
        }
    }

    /** {@code LivingEntity.getAgeScale}: {@code baby_scale} for a baby, which also scales the hitbox (vanilla {@code getDefaultDimensions}). */
    public float getAgeScale(float vanilla) {
        Animal self = animal();
        if (breedable == null || self == null) {
            return vanilla;
        }
        return self.isBaby() ? breedable.babyScale() : vanilla;
    }

    /** {@code AgeableMob.getBabyStartAge}: {@code -grow_up_ticks}, so spawn-egg and summoned babies grow up as bred ones do. */
    public int getBabyStartAge(int vanilla) {
        return breedable == null ? vanilla : -breedable.growUpTicks();
    }
}
