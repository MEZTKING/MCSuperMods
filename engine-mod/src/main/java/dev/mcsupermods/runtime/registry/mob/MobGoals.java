package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.goals.FollowTypesGoal;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.TagKey;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.AvoidEntityGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.GoalSelector;
import net.minecraft.world.entity.ai.goal.LeapAtTargetGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.PanicGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.TemptGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

/**
 * {@code msm:ai_goals} (ADR 0028 D2, ADR 0070 D5) and the float goal of {@code msm:movement.swims}: the body's
 * {@code registerGoals}. {@code tempt}, {@code panic} and {@code leap_at_target} are vanilla's goals (plan F3);
 * {@code wander} asks {@link MobMovement#wanderGoal} (movement modes, ADR 0070 D3) and {@code ranged_attack} hands
 * over to {@link MobRanged#addGoals} (ADR 0070 D4, D5), so those briefs edit only their modules. The goals of the
 * components (ADR 0071 D1, D2: follow owner, sit, defend, breed, follow parent) are the taming and breeding modules'.
 */
public final class MobGoals {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobGoals(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** Matches living entities whose type id is in {@code types}; {@code minecraft:player} matches players. */
    public static Predicate<LivingEntity> ofTypes(List<Identifier> types) {
        Set<Identifier> set = Set.copyOf(types);
        return e -> set.contains(BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()));
    }

    /**
     * Matches item stacks of the listed items; an entry starting with {@code #} is an item tag. For {@code tempt} and the
     * taming and breeding items (ADR 0071 D1, D2).
     */
    public static Predicate<ItemStack> ofItems(List<String> items) {
        Set<Identifier> ids = new java.util.HashSet<>();
        List<TagKey<Item>> tags = new java.util.ArrayList<>();
        for (String entry : items) {
            if (entry.startsWith("#")) {
                tags.add(TagKey.create(Registries.ITEM, Identifier.parse(entry.substring(1))));
            } else {
                ids.add(Identifier.parse(entry));
            }
        }
        return stack -> !stack.isEmpty() && (ids.contains(BuiltInRegistries.ITEM.getKey(stack.getItem()))
                || tags.stream().anyMatch(stack::is));
    }

    /** Runs inside the {@code Mob} constructor; the body passes its protected selectors. */
    public void registerGoals(GoalSelector goalSelector, GoalSelector targetSelector) {
        if (definition == null) {
            return;
        }
        PathfinderMob self = mob.asMob();
        EntityComponents c = definition.components();
        if (c.movementOrDefault().swims()) {
            goalSelector.addGoal(0, new FloatGoal(self));
        }
        List<Goal> goals = c.goals();
        for (int n = 0; n < goals.size(); n++) {
            Goal goal = goals.get(n);
            int priority = goal.priority().orElse(n + 1);
            switch (goal) {
                case Goal.Wander w -> goalSelector.addGoal(priority, mob.driver().movement().wanderGoal(w, () -> w.avoidWater()
                        ? new WaterAvoidingRandomStrollGoal(self, w.speed())
                        : new RandomStrollGoal(self, w.speed())));
                case Goal.LookAtPlayer l -> goalSelector.addGoal(priority, new LookAtPlayerGoal(self, Player.class, l.distance()));
                case Goal.LookAround l -> goalSelector.addGoal(priority, new RandomLookAroundGoal(self));
                case Goal.MeleeAttack m -> {
                    if (c.attack().isEmpty()) {
                        continue; // ADR 0028 D2: without msm:attack the goal is a no-op
                    }
                    goalSelector.addGoal(priority, new MeleeAttackGoal(self, m.speed(), true));
                    if (m.retaliate()) {
                        targetSelector.addGoal(1, new HurtByTargetGoal(self));
                    }
                    if (!m.targets().isEmpty()) {
                        Predicate<LivingEntity> types = ofTypes(m.targets());
                        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(self, LivingEntity.class, m.mustSee(),
                                (target, level) -> types.test(target)));
                    }
                }
                case Goal.Flee f -> {
                    Predicate<LivingEntity> types = ofTypes(f.from());
                    goalSelector.addGoal(priority, new AvoidEntityGoal<>(self, LivingEntity.class, f.distance(), f.speed(), f.sprintSpeed(),
                            types::test));
                }
                case Goal.Follow f -> goalSelector.addGoal(priority,
                        new FollowTypesGoal(self, ofTypes(f.entities()), f.speed(), f.stopDistance(), f.range()));
                case Goal.RangedAttack r -> {
                    if (c.rangedAttack().isEmpty()) {
                        continue; // ADR 0070 D5: without msm:ranged_attack the goal adds nothing, as melee_attack
                    }
                    mob.driver().ranged().addGoals(goalSelector, targetSelector, priority, r, c.rangedAttack().get());
                }
                case Goal.Tempt t -> goalSelector.addGoal(priority, new TemptGoal(self, t.speed(), ofItems(t.items()), t.scared()));
                case Goal.Panic p -> goalSelector.addGoal(priority, new PanicGoal(self, p.speed()));
                case Goal.LeapAtTarget l -> goalSelector.addGoal(priority, new LeapAtTargetGoal(self, l.height()));
            }
        }
        mob.driver().taming().addGoals(goalSelector, targetSelector);
        mob.driver().breeding().addGoals(goalSelector, targetSelector);
    }
}
