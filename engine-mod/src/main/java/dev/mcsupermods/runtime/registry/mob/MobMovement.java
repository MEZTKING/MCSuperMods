package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.components.EntityComponents.MovementMode;
import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.control.FlyingMoveControl;
import net.minecraft.world.entity.ai.control.SmoothSwimmingLookControl;
import net.minecraft.world.entity.ai.control.SmoothSwimmingMoveControl;
import net.minecraft.world.entity.ai.goal.BreathAirGoal;
import net.minecraft.world.entity.ai.goal.FloatGoal;
import net.minecraft.world.entity.ai.goal.RandomStrollGoal;
import net.minecraft.world.entity.ai.goal.RandomSwimmingGoal;
import net.minecraft.world.entity.ai.goal.TryFindLiquidGoal;
import net.minecraft.world.entity.ai.goal.WaterAvoidingRandomFlyingGoal;
import net.minecraft.world.entity.ai.navigation.AmphibiousPathNavigation;
import net.minecraft.world.entity.ai.navigation.FlyingPathNavigation;
import net.minecraft.world.entity.ai.navigation.PathNavigation;
import net.minecraft.world.entity.ai.navigation.WaterBoundPathNavigation;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.pathfinder.PathType;
import net.minecraft.world.phys.Vec3;

/**
 * Movement modes ({@code msm:movement.mode}, ADR 0070 D3). {@code walk} keeps vanilla's ground mob. {@code fly} is a bee's
 * flight: {@code FlyingMoveControl} (max turn 20, {@code hovers} = hovers in place), {@code FlyingPathNavigation} (no
 * doors, floats), no gravity, no fall damage. {@code swim} is a dolphin's swimming: {@code SmoothSwimmingMoveControl} and
 * {@code SmoothSwimmingLookControl}, {@code WaterBoundPathNavigation}, travel in water through {@code moveRelative} and
 * {@code move}, no float goal, flopping on land and, unless {@code breathes_air}, drying out as vanilla's water animals
 * ({@code breathes_air} instead runs out of air under water and surfaces with {@code BreathAirGoal}). {@code amphibious}
 * keeps the ground move control, paths through water with {@code AmphibiousPathNavigation}, has no float goal and
 * breathes both. Never overrides or calls {@code travelFlying}, {@code checkFallDamage} or {@code jumpInLiquid} (their
 * signatures differ between 26.3 and 26.4; plan limit M9): flight avoids fall damage through {@link #causeFallDamage}.
 * Every class and member used here is the same on both versions ({@code SmoothSwimmingLookControl} is only constructed).
 */
public final class MobMovement {
    /** A bee's flying move control: max turn 20 (vanilla {@code Bee}). */
    static final int FLY_MAX_TURN = 20;
    /** A dolphin's swimming controls (vanilla {@code Dolphin}): max turns 85 and 10, speed factors 0.02 in water and 0.1 out. */
    static final int SWIM_MAX_TURN_X = 85;
    static final int SWIM_MAX_TURN_Y = 10;
    static final float SWIM_IN_WATER_SPEED = 0.02f;
    static final float SWIM_OUT_OF_WATER_SPEED = 0.1f;
    /** The interval of {@code RandomSwimmingGoal} (ADR 0070 D3). */
    static final int SWIM_WANDER_INTERVAL = 40;
    /** Vanilla {@code LivingEntity.shouldTakeDrowningDamage}: air at or below this hurts, then the air restarts at 0. */
    static final int DROWNING_AIR = -20;

    private final MsmMob mob;
    private final EntityComponents.Movement movement;

    MobMovement(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.movement = definition == null ? EntityComponents.Movement.DEFAULT : definition.components().movementOrDefault();
    }

    /** The decoded mode; {@code walk} without {@code msm:movement}. */
    public MovementMode mode() {
        return movement.mode();
    }

    private boolean swimmer() {
        return movement.mode() == MovementMode.SWIM;
    }

    /**
     * The body's constructor tail, after {@code registerGoals}: move and look controls through {@link MsmMob#setControls},
     * gravity, path costs and the goals a mode adds besides {@code msm:ai_goals}. {@code swims} keeps its float goal only for
     * {@code walk} and {@code fly}.
     */
    public void afterConstruct() {
        PathfinderMob self = mob.asMob();
        switch (movement.mode()) {
            case WALK -> {}
            case FLY -> {
                mob.setControls(new FlyingMoveControl<>(self, FLY_MAX_TURN, movement.hovers()), null);
                self.setNoGravity(true);
                // A bee's and a parrot's path costs: no fire, no water.
                self.setPathfindingMalus(PathType.FIRE, -1.0f);
                self.setPathfindingMalus(PathType.FIRE_IN_NEIGHBOR, -1.0f);
                self.setPathfindingMalus(PathType.WATER, -1.0f);
                self.setPathfindingMalus(PathType.WATER_BORDER, 16.0f);
            }
            case SWIM -> {
                mob.setControls(new SmoothSwimmingMoveControl<>(self, SWIM_MAX_TURN_X, SWIM_MAX_TURN_Y, SWIM_IN_WATER_SPEED,
                        SWIM_OUT_OF_WATER_SPEED, true), new SmoothSwimmingLookControl(self, SWIM_MAX_TURN_Y));
                self.setPathfindingMalus(PathType.WATER, 0.0f);
                self.getGoalSelector().removeAllGoals(g -> g instanceof FloatGoal);
                if (movement.breathesAir()) {
                    // A dolphin's: surface for air, and look for water when stranded.
                    self.getGoalSelector().addGoal(0, new BreathAirGoal(self));
                    self.getGoalSelector().addGoal(0, new TryFindLiquidGoal(self, FluidTags.WATER));
                } else {
                    self.setAirSupply(movement.dryOutTicks());
                }
            }
            case AMPHIBIOUS -> {
                self.setPathfindingMalus(PathType.WATER, 0.0f);
                self.getGoalSelector().removeAllGoals(g -> g instanceof FloatGoal);
            }
        }
    }

    /**
     * The goal a {@code wander} entry adds (from {@code MobGoals}, inside the {@code Mob} constructor): {@code fly} makes it
     * {@code WaterAvoidingRandomFlyingGoal}, {@code swim} {@code RandomSwimmingGoal} (interval 40), {@code amphibious} the
     * plain {@code RandomStrollGoal} (water is not avoided), {@code walk} the stroll {@code vanilla} builds.
     */
    public net.minecraft.world.entity.ai.goal.Goal wanderGoal(Goal.Wander wander,
            Supplier<net.minecraft.world.entity.ai.goal.Goal> vanilla) {
        PathfinderMob self = mob.asMob();
        return switch (movement.mode()) {
            case WALK -> vanilla.get();
            case FLY -> new WaterAvoidingRandomFlyingGoal(self, wander.speed());
            case SWIM -> new RandomSwimmingGoal(self, wander.speed(), SWIM_WANDER_INTERVAL);
            case AMPHIBIOUS -> new RandomStrollGoal(self, wander.speed());
        };
    }

    /** Runs inside the {@code Mob} constructor (the driver is built there, so the movement is already decoded). */
    public PathNavigation createNavigation(Level level, Supplier<PathNavigation> vanilla) {
        PathfinderMob self = mob.asMob();
        return switch (movement.mode()) {
            case WALK -> vanilla.get();
            case FLY -> {
                FlyingPathNavigation navigation = new FlyingPathNavigation(self, level);
                navigation.setCanOpenDoors(false);
                navigation.setCanFloat(true);
                yield navigation;
            }
            case SWIM -> new WaterBoundPathNavigation(self, level);
            case AMPHIBIOUS -> new AmphibiousPathNavigation(self, level);
        };
    }

    /**
     * A swimmer in water moves as a dolphin ({@code Dolphin.travelInWater}, repeated through {@code moveRelative} and
     * {@code move}, the same on both versions): the move control's speed, friction 0.9, a slow sink without a target.
     * Everything else is vanilla's travel (a flier without gravity uses vanilla's air travel, as a bee does).
     */
    public void travel(Vec3 input, Runnable vanilla) {
        PathfinderMob self = mob.asMob();
        if (swimmer() && self.isInWater()) {
            self.moveRelative(self.getSpeed(), input);
            self.move(MoverType.SELF, self.getDeltaMovement());
            self.setDeltaMovement(self.getDeltaMovement().scale(0.9));
            if (self.getTarget() == null) {
                self.setDeltaMovement(self.getDeltaMovement().add(0.0, -0.005, 0.0));
            }
            return;
        }
        vanilla.run();
    }

    /** Fliers take no fall damage (a bee's and a parrot's empty {@code checkFallDamage}, reached without overriding it). */
    public boolean causeFallDamage(double fallDistance, float multiplier, DamageSource source, BooleanSupplier vanilla) {
        if (movement.mode() == MovementMode.FLY) {
            return false;
        }
        return vanilla.getAsBoolean();
    }

    /** Swimmers breathe water unless {@code breathes_air}; amphibious mobs breathe both. */
    public boolean canBreatheUnderwater(boolean vanilla) {
        return switch (movement.mode()) {
            case WALK, FLY -> vanilla;
            case SWIM -> !movement.breathesAir();
            case AMPHIBIOUS -> true;
        };
    }

    /**
     * Vanilla's base tick, then for a swimmer out of water: flopping on the ground ({@code AbstractFish.aiStep}) and, without
     * {@code breathes_air}, drying out ({@code WaterAnimal.baseTick} and {@code handleAirSupply}: the air supply starts at
     * {@code dry_out_ticks} and drops by one each tick out of water; at -20 the mob takes 2 drowning damage and the air
     * restarts at 0, so the first hurt comes {@code dry_out_ticks + 20} ticks after leaving the water, then every 20 ticks).
     */
    public void baseTick(Runnable vanilla) {
        PathfinderMob self = mob.asMob();
        int air = self.getAirSupply();
        vanilla.run();
        if (!swimmer() || !(self.level() instanceof ServerLevel level) || !self.isAlive()) {
            return;
        }
        boolean inWater = self.isInWater();
        if (!inWater && self.onGround() && self.verticalCollision) {
            var random = self.getRandom();
            self.setDeltaMovement(self.getDeltaMovement().add((random.nextFloat() * 2.0f - 1.0f) * 0.05f, 0.4,
                    (random.nextFloat() * 2.0f - 1.0f) * 0.05f));
            self.setOnGround(false);
            self.makeSound(movement.breathesAir() ? SoundEvents.DOLPHIN_JUMP : SoundEvents.COD_FLOP);
        }
        if (!movement.breathesAir()) {
            if (inWater) {
                self.setAirSupply(movement.dryOutTicks());
            } else {
                air--;
                if (air <= DROWNING_AIR) {
                    air = 0;
                    self.hurtServer(level, self.damageSources().drown(), 2.0f);
                }
                self.setAirSupply(air);
            }
        }
    }

    /** Swimmers are not pushed by currents (vanilla {@code WaterAnimal}). */
    public boolean isPushedByFluid(boolean vanilla) {
        return !swimmer() && vanilla;
    }
}
