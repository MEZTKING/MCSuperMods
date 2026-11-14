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
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.AvoidEntityGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.GoalSelector;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.player.Player;

/**
 * {@code msm:ai_goals} (ADR 0028 D2) and the float goal of {@code msm:movement.swims}: the body's
 * {@code registerGoals}. Later goals (ADR 0070 D3 movement modes, D4 ranged attacks; ADR 0071 D1 and D2 taming and
 * breeding goals) are added here.
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
                case Goal.Wander w -> goalSelector.addGoal(priority, w.avoidWater()
                        ? new WaterAvoidingRandomStrollGoal(self, w.speed())
                        : new RandomStrollGoal(self, w.speed()));
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
            }
        }
    }
}
