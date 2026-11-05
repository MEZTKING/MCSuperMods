package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.events.AnimationTarget;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.goals.FollowTypesGoal;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.AvoidEntityGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.LookAtPlayerGoal;
import net.minecraft.world.entity.ai.goal.MeleeAttackGoal;
import net.minecraft.world.entity.ai.goal.RandomLookAroundGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomStrollGoal;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/**
 * Driver class for every {@code msm/<ns>/entity/*.json} mob (ADR 0028 D5): attributes come from the
 * registrar, goals and event dispatch from the definition, looked up by entity type because
 * {@code registerGoals} runs inside the {@code Mob} constructor, before any field of this class is
 * assigned. Vanilla overrides cover every trigger, so no Mixin is needed.
 */
public class MsmEntity extends PathfinderMob implements AnimationTarget {
    public MsmEntity(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
    }

    /** The definition this entity was registered from. */
    public EntityDefinition definition() {
        return MsmEntityRegistrar.definition(getType()).orElseThrow();
    }

    /** The entity type id, the owner of the definition's events. */
    public Identifier definitionId() {
        return BuiltInRegistries.ENTITY_TYPE.getKey(getType());
    }

    /** Plays nothing; {@code MsmGeoEntity} triggers the GeckoLib animation. */
    @Override
    public void playAnimation(String controller, String animation) {}

    /** Matches living entities whose type id is in {@code types}; {@code minecraft:player} matches players. */
    public static Predicate<LivingEntity> ofTypes(List<Identifier> types) {
        Set<Identifier> set = Set.copyOf(types);
        return e -> set.contains(BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()));
    }

    @Override
    protected void registerGoals() {
        EntityDefinition def = MsmEntityRegistrar.definition(getType()).orElse(null);
        if (def == null) {
            return;
        }
        EntityComponents c = def.components();
        if (c.movementOrDefault().swims()) {
            goalSelector.addGoal(0, new FloatGoal(this));
        }
        List<Goal> goals = c.goals();
        for (int n = 0; n < goals.size(); n++) {
            Goal goal = goals.get(n);
            int priority = goal.priority().orElse(n + 1);
            switch (goal) {
                case Goal.Wander w -> goalSelector.addGoal(priority, w.avoidWater()
                        ? new WaterAvoidingRandomStrollGoal(this, w.speed())
                        : new RandomStrollGoal(this, w.speed()));
                case Goal.LookAtPlayer l -> goalSelector.addGoal(priority, new LookAtPlayerGoal(this, Player.class, l.distance()));
                case Goal.LookAround l -> goalSelector.addGoal(priority, new RandomLookAroundGoal(this));
                case Goal.MeleeAttack m -> {
                    if (c.attack().isEmpty()) {
                        continue; // ADR 0028 D2: without msm:attack the goal is a no-op
                    }
                    goalSelector.addGoal(priority, new MeleeAttackGoal(this, m.speed(), true));
                    if (m.retaliate()) {
                        targetSelector.addGoal(1, new HurtByTargetGoal(this));
                    }
                    if (!m.targets().isEmpty()) {
                        Predicate<LivingEntity> types = ofTypes(m.targets());
                        targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(this, LivingEntity.class, m.mustSee(),
                                (target, level) -> types.test(target)));
                    }
                }
                case Goal.Flee f -> {
                    Predicate<LivingEntity> types = ofTypes(f.from());
                    goalSelector.addGoal(priority, new AvoidEntityGoal<>(this, LivingEntity.class, f.distance(), f.speed(), f.sprintSpeed(),
                            types::test));
                }
                case Goal.Follow f -> goalSelector.addGoal(priority,
                        new FollowTypesGoal(this, ofTypes(f.entities()), f.speed(), f.stopDistance(), f.range()));
            }
        }
    }

    private void fire(ServerLevel level, Identifier event, Player player) {
        EventRunner.fire(definitionId(), definition().events(), event, EventContext.forEntity(level, this, player));
    }

    /** Plays the {@code attack} animation and fires {@code msm:attack.on_attack} after a successful melee hit. */
    @Override
    public boolean doHurtTarget(ServerLevel level, Entity target) {
        boolean hit = super.doHurtTarget(level, target);
        if (hit) {
            EntityDefinition def = definition();
            def.components().animatedModel().attack().ifPresent(a -> playAnimation(EntityDefinition.TRIGGERED_CONTROLLER, a));
            def.components().attack().flatMap(EntityComponents.Attack::onAttack)
                    .ifPresent(e -> fire(level, e, target instanceof Player p ? p : null));
        }
        return hit;
    }

    /** Fires {@code msm:on_hurt} after damage is applied when the entity survives (a lethal hit fires {@code msm:on_death}). */
    @Override
    public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
        boolean hurt = super.hurtServer(level, source, amount);
        if (hurt && isAlive()) {
            definition().components().onHurt().ifPresent(c -> fire(level, c.event(), source.getEntity() instanceof Player p ? p : null));
        }
        return hurt;
    }

    /** Fires {@code msm:on_death} once, on the logical server. */
    @Override
    public void die(DamageSource source) {
        boolean wasDead = dead;
        super.die(source);
        if (!wasDead && dead && level() instanceof ServerLevel level) {
            definition().components().onDeath().ifPresent(c -> fire(level, c.event(), source.getEntity() instanceof Player p ? p : null));
        }
    }

    /** Fires {@code msm:on_interact} when a player right-clicks the entity. */
    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        var onInteract = definition().components().onInteract();
        if (onInteract.isEmpty()) {
            return super.mobInteract(player, hand);
        }
        if (level() instanceof ServerLevel level) {
            fire(level, onInteract.get().event(), player);
        }
        return InteractionResult.SUCCESS;
    }

    /** The definition's {@code loot_table}, or vanilla's default {@code <ns>:entities/<path>}. */
    @Override
    protected void dropFromLootTable(ServerLevel level, DamageSource source, boolean playerKill) {
        var lootTable = definition().lootTable();
        if (lootTable.isPresent()) {
            dropFromLootTable(level, source, playerKill, ResourceKey.create(Registries.LOOT_TABLE, lootTable.get()));
        } else {
            super.dropFromLootTable(level, source, playerKill);
        }
    }
}
