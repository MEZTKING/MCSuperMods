package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.goals.MsmRangedAttackGoal;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.mob.MobAnimations;
import dev.mcsupermods.runtime.registry.mob.MobRanged;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageTypes;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.goal.WrappedGoal;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.entity.projectile.throwableitemprojectile.Snowball;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Ranged attacks (ADR 0070 D4, D5; B291) on the {@code rg_*} definitions in {@code msm/msm_test/entity/} and the
 * throwable {@code msm/msm_test/item/rg_thrown_dart.json}. The shooters list no {@code targets} and get their target
 * set directly, so a mob of a neighbouring test is never picked; {@code rg_lookout} checks the target goals.
 */
public class MsmMobRangedGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final BlockPos WEST = new BlockPos(2, 1, 5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static <T extends Mob> EntityType<T> type(String path) {
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    /** Records the events of {@code owner}'s definition whose context entity is {@code self}. */
    private static final class Recorder implements EventListener, AutoCloseable {
        final List<String> fired = Collections.synchronizedList(new ArrayList<>());
        final List<EventContext> contexts = Collections.synchronizedList(new ArrayList<>());
        private final Identifier owner;
        private final Mob self;

        Recorder(Identifier owner, Mob self) {
            this.owner = owner;
            this.self = self;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.equals(this.owner) && ctx.entity() == self) {
                fired.add(event.getPath());
                contexts.add(ctx);
            }
        }

        long count(String event) {
            synchronized (fired) {
                return fired.stream().filter(event::equals).count();
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    /** Projectiles of {@code type} near {@code shooter} that it owns. */
    private static <P extends Projectile> List<P> shotBy(GameTestHelper helper, Mob shooter, Class<P> type) {
        return helper.getLevel().getEntitiesOfClass(type, new AABB(shooter.blockPosition()).inflate(16), p -> p.getOwner() == shooter);
    }

    private static Mob shooter(GameTestHelper helper, String path, BlockPos at, LivingEntity target) {
        Mob mob = helper.spawn(type(path), at);
        mob.setTarget(target);
        return mob;
    }

    @GameTest
    public void projectileKinds(GameTestHelper helper) {
        for (String arrow : List.of("arrow", "tipped_arrow", "spectral_arrow")) {
            helper.assertValueEqual(MobRanged.kind(Identifier.withDefaultNamespace(arrow)), MobRanged.Projectiles.ARROW, arrow);
        }
        for (String item : List.of("snowball", "egg", "experience_bottle", "fire_charge", "firework_rocket", "splash_potion",
                "lingering_potion", "trident", "wind_charge")) {
            helper.assertValueEqual(MobRanged.kind(Identifier.withDefaultNamespace(item)), MobRanged.Projectiles.ITEM, item);
        }
        Identifier iceBall = Identifier.withDefaultNamespace("ice_ball"); // 26.4 only (B283)
        if (BuiltInRegistries.ITEM.containsKey(iceBall)) {
            helper.assertValueEqual(MobRanged.kind(iceBall), MobRanged.Projectiles.ITEM, "ice_ball");
        }
        helper.assertValueEqual(MobRanged.kind(id("rg_thrown_dart")), MobRanged.Projectiles.THROWABLE, "rg_thrown_dart");
        helper.assertValueEqual(MobRanged.kind(Identifier.withDefaultNamespace("stone")), MobRanged.Projectiles.NONE, "stone");
        helper.assertValueEqual(MobRanged.kind(Identifier.withDefaultNamespace("potion")), MobRanged.Projectiles.NONE, "potion");
        helper.assertValueEqual(MobRanged.kind(id("no_such_item")), MobRanged.Projectiles.NONE, "unknown item");
        helper.succeed();
    }

    @GameTest(structure = ARENA, maxTicks = 100)
    public void rangedGoalWithTargetsPicksAListedType(GameTestHelper helper) {
        Mob zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, WEST.east(5));
        Mob mob = helper.spawn(type("rg_lookout"), WEST);
        List<MsmRangedAttackGoal<?>> ranged = mob.getGoalSelector().getAvailableGoals().stream().map(WrappedGoal::getGoal)
                .filter(g -> g instanceof MsmRangedAttackGoal<?>).<MsmRangedAttackGoal<?>>map(g -> (MsmRangedAttackGoal<?>) g).toList();
        helper.assertValueEqual(ranged.size(), 1, "MsmRangedAttackGoal count");
        helper.assertTrue(ranged.getFirst().strafes(), "strafe not passed on");
        helper.succeedWhen(() -> helper.assertTrue(mob.getTarget() == zombie, "rg_lookout's target is " + mob.getTarget()));
    }

    @GameTest(structure = ARENA, maxTicks = 60)
    public void rangedGoalRetaliates(GameTestHelper helper) {
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, WEST.east(4));
        Mob mob = helper.spawn(type("rg_lookout"), WEST);
        helper.runAfterDelay(2, () -> helper.hurt(mob, helper.getLevel().damageSources().mobAttack(cow), 1.0f));
        helper.succeedWhen(() -> helper.assertTrue(mob.getTarget() == cow, "rg_lookout's target is " + mob.getTarget()));
    }

    @GameTest(structure = ARENA, maxTicks = 100)
    public void archerHitsAPigWithAnArrow(GameTestHelper helper) {
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, WEST.east(6));
        Mob archer = shooter(helper, "rg_archer", WEST, pig);
        float full = pig.getHealth();
        int animStart = archer.getEntityData().get(((MsmMob) archer).animData());
        Recorder r = new Recorder(id("rg_archer"), archer);
        boolean[] aimed = {false};
        DamageSource[] hit = {null};
        helper.onEachTick(() -> {
            if (archer.isAggressive() && r.count("rg_shot") == 0) {
                aimed[0] = true;
            }
            if (hit[0] == null && pig.getHealth() < full) {
                hit[0] = pig.getLastDamageSource();
            }
        });
        helper.succeedWhen(() -> {
            helper.assertTrue(hit[0] != null, "the pig has not been hit (shots: " + r.count("rg_shot") + ")");
            DamageSource source = hit[0];
            helper.assertTrue(source.is(DamageTypes.ARROW) && source.getEntity() == archer,
                    "the pig has not been hit by the archer's arrow: " + source);
            helper.assertTrue(full - pig.getHealth() >= 3.0f, "the arrow dealt " + (full - pig.getHealth()) + ", less than damage 3");
            helper.assertTrue(aimed[0], "the archer was never aggressive while aiming");
            helper.assertTrue(r.count("rg_shot") >= 1, "on_shoot never fired");
            helper.assertTrue(r.contexts.getFirst().other() == pig, "on_shoot other is not the target: " + r.contexts.getFirst().other());
            // shoot is triggerable here through the rg_pose play_animation, so a shot moves DATA_ANIM's counter on
            int anim = archer.getEntityData().get(((MsmMob) archer).animData());
            helper.assertTrue(MobAnimations.counter(anim) != MobAnimations.counter(animStart), "the shoot animation did not play");
            MsmRuntime.LOGGER.info("[msm_runtime] entity: rg_archer's arrow dealt {} to the pig", full - pig.getHealth());
            r.close();
        });
    }

    @GameTest(structure = ARENA, maxTicks = 100)
    public void snowballShooterSpawnsASnowball(GameTestHelper helper) {
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, WEST.east(5));
        Mob mob = shooter(helper, "rg_snowman", WEST, cow);
        helper.succeedWhen(() -> {
            helper.assertFalse(shotBy(helper, mob, Snowball.class).isEmpty(), "no snowball shot by rg_snowman");
            helper.assertTrue(shotBy(helper, mob, AbstractArrow.class).isEmpty(), "rg_snowman shot an arrow");
        });
    }

    @GameTest(structure = ARENA, maxTicks = 100)
    public void projectThrowableFiresItsHitEventWithTheMobAsThrower(GameTestHelper helper) {
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, WEST.east(4));
        Mob mob = shooter(helper, "rg_dart_thrower", WEST, cow);
        Recorder r = new Recorder(id("rg_thrown_dart"), mob);
        helper.succeedWhen(() -> {
            helper.assertTrue(r.count("rg_dart_hit") >= 1, "on_hit_entity of rg_thrown_dart never fired with the mob as thrower");
            EventContext ctx = r.contexts.getFirst();
            helper.assertTrue(ctx.other() == cow, "the hit entity is not the cow: " + ctx.other());
            helper.assertTrue(ctx.player() == null, "a player in the context");
            DamageSource source = cow.getLastDamageSource();
            helper.assertTrue(source != null && source.is(DamageTypeTags.IS_PROJECTILE) && source.getEntity() == mob,
                    "the dart's thrown damage does not name the mob: " + source);
            r.close();
        });
    }

    @GameTest(structure = ARENA, maxTicks = 120)
    public void intervalLimitsTheShotsAndOnShootRunsOncePerShot(GameTestHelper helper) {
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, WEST.east(6));
        Mob mob = shooter(helper, "rg_slow", WEST, cow);
        Recorder r = new Recorder(id("rg_slow"), mob);
        Set<UUID> seen = new HashSet<>();
        helper.onEachTick(() -> shotBy(helper, mob, Snowball.class).forEach(s -> seen.add(s.getUUID())));
        helper.runAfterDelay(100, () -> {
            long shots = r.count("rg_shot");
            r.close();
            helper.assertTrue(shots >= 1 && shots <= 2, "interval 60 with charge 20: " + shots + " shots in 100 ticks");
            helper.assertValueEqual((long) seen.size(), shots, "snowballs seen against on_shoot events");
            helper.succeed();
        });
    }

    @GameTest(structure = ARENA, maxTicks = 160)
    public void noShotBeyondRange(GameTestHelper helper) {
        Mob cow = helper.spawnWithNoFreeWill(EntityTypes.COW, WEST.east(7));
        Mob mob = shooter(helper, "rg_short", WEST, cow);
        Recorder r = new Recorder(id("rg_short"), mob);
        helper.runAfterDelay(60, () -> {
            helper.assertValueEqual(r.count("rg_shot"), 0L, "shots at a target 7 blocks away with range 4");
            helper.assertTrue(mob.distanceTo(cow) > 4.0f, "rg_short (goal speed 0) walked into range: " + mob.distanceTo(cow));
            Vec3 near = helper.absoluteVec(Vec3.atBottomCenterOf(WEST.east(3)));
            cow.snapTo(near.x, near.y, near.z);
            helper.succeedWhen(() -> {
                helper.assertTrue(r.count("rg_shot") >= 1, "no shot once the target is 3 blocks away");
                r.close();
            });
        });
    }
}
