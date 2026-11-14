package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.List;
import java.util.function.Predicate;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.ai.goal.FollowOwnerGoal;
import net.minecraft.world.entity.ai.goal.GoalSelector;
import net.minecraft.world.entity.ai.goal.SitWhenOrderedToGoal;
import net.minecraft.world.entity.ai.goal.target.OwnerHurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.OwnerHurtTargetGoal;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.GroundPathNavigation;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Taming (ADR 0071 D1, {@code msm:tameable}, {@code MsmAnimal} only: the parser drops the component on other bases).
 * Vanilla's {@link TamableAnimal} keeps the owner, the sitting flag and their saving; this module adds what a wolf adds
 * on top: the taming food with its chance (used up outside creative, hearts on success, smoke on failure), the owner's
 * sit toggle, {@code tamed_health}, {@code on_tame}, the goals and the owner checks.
 *
 * <p>Goal priorities (the definition's own goals use their list position from 1, {@link MobGoals}): sitting at 0, so
 * it beats every goal; following the owner just after the definition's last fighting or fleeing goal
 * ({@link #afterFighting}), so a pet fights before it follows (a wolf's order); the owner goals at 0 and 1 in the target
 * selector, before {@code retaliate}'s {@code HurtByTargetGoal} (1) and the definition's targets (2).
 */
public final class MobTaming {
    /** {@code TamableAnimal.handleEntityEvent}: 7 shows hearts, 6 smoke (a wolf's taming result). */
    private static final byte HEARTS = 7;
    private static final byte SMOKE = 6;

    private final MsmMob mob;
    private final EntityDefinition definition;
    /** Null without {@code msm:tameable}. */
    private final EntityComponents.Tameable tameable;
    private final Predicate<ItemStack> food;

    MobTaming(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
        this.tameable = definition == null ? null : definition.components().tameable().orElse(null);
        this.food = tameable == null ? stack -> false : MobGoals.ofItems(tameable.items());
    }

    private TamableAnimal animal() {
        return mob.asMob() instanceof TamableAnimal animal ? animal : null;
    }

    /**
     * The priority after the definition's last fighting or fleeing goal ({@code melee_attack} with {@code msm:attack},
     * {@code ranged_attack} with {@code msm:ranged_attack}, {@code flee}, {@code panic}, {@code leap_at_target}), with
     * the priorities {@link MobGoals} gives them; 1 when there is none. Shared with {@link MobBreeding}.
     */
    static int afterFighting(EntityComponents components) {
        List<Goal> goals = components.goals();
        int last = 0;
        for (int n = 0; n < goals.size(); n++) {
            Goal goal = goals.get(n);
            boolean fighting = switch (goal) {
                case Goal.MeleeAttack m -> components.attack().isPresent();
                case Goal.RangedAttack r -> components.rangedAttack().isPresent();
                case Goal.Flee f -> true;
                case Goal.Panic p -> true;
                case Goal.LeapAtTarget l -> true;
                default -> false;
            };
            if (fighting) {
                last = Math.max(last, goal.priority().orElse(n + 1));
            }
        }
        return last + 1;
    }

    /**
     * Called by {@link MobGoals#registerGoals} after the definition's goals, inside the {@code Mob} constructor (the
     * navigation exists by then). {@code FollowOwnerGoal} accepts only ground and flying navigation (it throws
     * otherwise), so a pet with other navigation (a {@code swim} pet) does not follow its owner.
     */
    public void addGoals(GoalSelector goalSelector, GoalSelector targetSelector) {
        TamableAnimal self = animal();
        if (tameable == null || self == null) {
            return;
        }
        if (tameable.sit()) {
            goalSelector.addGoal(0, new SitWhenOrderedToGoal(self));
        }
        if (tameable.followsOwner()) {
            if (self.getNavigation() instanceof GroundPathNavigation || self.getNavigation() instanceof FlyingPathNavigation) {
                EntityComponents.TameableFollow f = tameable.follow();
                goalSelector.addGoal(afterFighting(definition.components()), new FollowOwnerGoal(self, f.speed(), f.startDistance(),
                        f.stopDistance()));
            } else {
                MsmRuntime.LOGGER.debug("[msm_runtime] {}: no FollowOwnerGoal for navigation {}", mob.definitionId(),
                        self.getNavigation().getClass().getSimpleName());
            }
        }
        if (tameable.defendsOwner()) {
            targetSelector.addGoal(0, new OwnerHurtByTargetGoal(self));
            targetSelector.addGoal(1, new OwnerHurtTargetGoal(self));
        }
    }

    /**
     * Second step of {@code mobInteract}: the taming food on a wild mob, then the owner's empty main hand toggling
     * sitting ({@code sit}). On a {@code msm:rideable} mob the owner's empty hand mounts (D3), so sitting needs sneaking
     * there. {@code null} passes on (riding, {@code msm:on_interact}, vanilla).
     */
    public InteractionResult mobInteract(Player player, InteractionHand hand) {
        TamableAnimal self = animal();
        if (tameable == null || self == null) {
            return null;
        }
        ItemStack stack = player.getItemInHand(hand);
        if (!self.isTame()) {
            if (!food.test(stack)) {
                return null;
            }
            if (!(self.level() instanceof ServerLevel level)) {
                return InteractionResult.SUCCESS;
            }
            stack.consume(1, player);
            if (self.getRandom().nextFloat() < tameable.chance()) {
                tame(level, self, player);
            } else {
                level.broadcastEntityEvent(self, SMOKE);
            }
            return InteractionResult.SUCCESS_SERVER;
        }
        boolean rideable = definition.components().rideable().isPresent();
        if (tameable.sit() && self.isOwnedBy(player) && hand == InteractionHand.MAIN_HAND && stack.isEmpty()
                && (!rideable || player.isSecondaryUseActive())) {
            if (!(self.level() instanceof ServerLevel)) {
                return InteractionResult.SUCCESS;
            }
            self.setOrderedToSit(!self.isOrderedToSit());
            self.setJumping(false);
            self.getNavigation().stop();
            self.setTarget(null);
            return InteractionResult.SUCCESS_SERVER;
        }
        return null;
    }

    /** A wolf's taming: owner, {@code tamed_health} (healed to full), sitting when {@code sit}, hearts, {@code on_tame}. */
    private void tame(ServerLevel level, TamableAnimal self, Player player) {
        self.tame(player);
        tameable.tamedHealth().ifPresent(health -> {
            AttributeInstance max = self.getAttribute(Attributes.MAX_HEALTH);
            if (max != null) {
                max.setBaseValue(health);
            }
            self.setHealth(self.getMaxHealth());
        });
        self.getNavigation().stop();
        self.setTarget(null);
        if (tameable.sit()) {
            self.setOrderedToSit(true);
        }
        level.broadcastEntityEvent(self, HEARTS);
        tameable.onTame().ifPresent(event -> EventRunner.fire(mob.definitionId(), definition.events(), event,
                EventContext.forEntity(level, self, player)));
    }

    /** {@code TamableAnimal.canFlyToOwner}: {@code mode} {@code fly} pets teleport to an owner in the air. */
    public boolean canFlyToOwner(boolean vanilla) {
        return vanilla || (tameable != null && definition.components().movementOrDefault().mode() == EntityComponents.MovementMode.FLY);
    }

    /**
     * {@code TamableAnimal.wantsToAttack} (asked by the owner target goals): never the owner, another pet of the same
     * owner, or a player the owner may not hurt (a wolf's rule).
     */
    public boolean wantsToAttack(LivingEntity target, LivingEntity owner, boolean vanilla) {
        if (!vanilla || tameable == null) {
            return vanilla;
        }
        if (target == owner) {
            return false;
        }
        if (target instanceof TamableAnimal pet && pet.isTame() && pet.getOwner() == owner) {
            return false;
        }
        return !(target instanceof Player targetPlayer && owner instanceof Player ownerPlayer && !ownerPlayer.canHarmPlayer(targetPlayer));
    }

    /** A tamed mob is kept (vanilla's {@code Animal.removeWhenFarAway} is already false; persistence makes it explicit). */
    public boolean requiresCustomPersistence(boolean vanilla) {
        TamableAnimal self = animal();
        return vanilla || (tameable != null && self != null && self.isTame());
    }

    /** Vanilla's {@code TamableAnimal} saves the owner and sitting; {@code tamed_health} lives in the saved attributes. */
    public void addAdditionalSaveData(ValueOutput output) {}

    public void readAdditionalSaveData(ValueInput input) {}
}
