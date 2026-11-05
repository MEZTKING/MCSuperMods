package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.EntitySpikeDefinition;
import java.util.List;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/**
 * Driver class for every {@code msm/<ns>/entity/*.json} mob (ADR 0028 D5). Goals come from the
 * definition, looked up by entity type: {@code registerGoals} runs inside the {@code Mob}
 * constructor, before any field of this class is assigned.
 */
public class MsmEntity extends PathfinderMob {
    public MsmEntity(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
    }

    /** The definition this entity was registered from. */
    public EntitySpikeDefinition definition() {
        return MsmEntityRegistrar.definition(getType()).orElseThrow();
    }

    @Override
    protected void registerGoals() {
        EntitySpikeDefinition def = MsmEntityRegistrar.definition(getType()).orElse(null);
        if (def == null) {
            return;
        }
        int priority = 1;
        for (EntitySpikeDefinition.Goal goal : def.goals()) {
            switch (goal) {
                case EntitySpikeDefinition.Goal.Wander w -> goalSelector.addGoal(priority, new WaterAvoidingRandomStrollGoal(this, w.speed()));
                case EntitySpikeDefinition.Goal.LookAtPlayer l -> goalSelector.addGoal(priority, new LookAtPlayerGoal(this, Player.class, l.distance()));
                case EntitySpikeDefinition.Goal.MeleeAttack m -> {
                    goalSelector.addGoal(priority, new MeleeAttackGoal(this, m.speed(), true));
                    List<Identifier> targets = m.targets();
                    targetSelector.addGoal(priority, new NearestAttackableTargetGoal<>(this, net.minecraft.world.entity.LivingEntity.class, false,
                            (target, level) -> targets.contains(BuiltInRegistries.ENTITY_TYPE.getKey(target.getType()))));
                }
            }
            priority++;
        }
    }
}
