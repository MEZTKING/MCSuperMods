package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.util.List;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntitySelector;
import net.minecraft.world.entity.InterpolationHandler;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * Who moves a vehicle and how (ADR 0090 D3, D4; B406): on the side for which {@code isLocalInstanceAuthoritative()} is
 * true (the driver's client while driven, the server without a driver) one {@link VehiclePhysics} step per tick from the
 * driver's input and two facts both sides know (on the ground after the last move, the depth of the hitbox's bottom in
 * water), then the game's own {@code move} with its collision and {@code step_height}; every other side interpolates.
 * The server also keeps the synched steering and throttle, the plane's throttle lever from the driver's keys, and ramming.
 */
public final class VehicleMovement {
    private final MsmVehicle vehicle;
    /** The plane's throttle lever (0 to 1) on the side that moves it; the server's copy follows the driver's keys. */
    private double lever;
    /** The result of the last physics step on this side, for the dashboard and tests. */
    private VehiclePhysics.State last = VehiclePhysics.State.at(0);
    /** Where the vehicle was on the server's previous tick (ramming speed). */
    private Vec3 previous;

    VehicleMovement(MsmVehicle vehicle) {
        this.vehicle = vehicle;
    }

    /** The last physics step on this side (zero velocity before the first). */
    public VehiclePhysics.State last() {
        return last;
    }

    /** The throttle lever of an {@code air} vehicle on this side. */
    public double lever() {
        return lever;
    }

    /** What the physics needs to know about where the vehicle is. */
    public VehiclePhysics.Env env(boolean engine) {
        return new VehiclePhysics.Env(vehicle.onGround(), vehicle.getFluidHeight(FluidTags.WATER), engine);
    }

    /** Every tick, on every side. */
    void tick() {
        if (vehicle.isLocalInstanceAuthoritative()) {
            Player driver = vehicle.driver();
            VehiclePhysics.Input input = driver != null
                    ? VehicleDriver.physicsInput(driver, vehicle)
                    : VehiclePhysics.Input.idle(vehicle.getYRot(), vehicle.getXRot());
            step(input, driver != null && vehicle.fuel().canRun());
        } else if (vehicle.level().isClientSide()) {
            InterpolationHandler handler = vehicle.getInterpolation();
            if (handler != null && handler.hasActiveInterpolation()) {
                handler.interpolate();
            }
        }
    }

    /** One physics step with {@code input}, then the game's move; public for GameTests that drive on the server. */
    public VehiclePhysics.State step(VehiclePhysics.Input input, boolean engine) {
        Vec3 motion = vehicle.getDeltaMovement();
        VehiclePhysics.State before = new VehiclePhysics.State(motion.x, motion.y, motion.z, vehicle.getYRot(), vehicle.getXRot(), lever, 0, 0);
        VehiclePhysics.State after = VehiclePhysics.step(vehicle.constants(), before, input, env(engine));
        lever = vehicle.constants().mode() == VehicleDefinition.Mode.AIR ? after.throttle() : 0;
        vehicle.setYRot((float) after.yaw());
        vehicle.setXRot((float) after.pitch());
        vehicle.setDeltaMovement(after.vx(), after.vy(), after.vz());
        vehicle.move(MoverType.SELF, vehicle.getDeltaMovement());
        last = after;
        if (!vehicle.level().isClientSide()) {
            vehicle.setSteeringAndThrottle((float) after.steering(), (float) after.throttle());
        }
        return after;
    }

    /**
     * The server's part while a player drives (the position comes from the driver's client): the synched steering and
     * throttle from the driver's keys as the server knows them, the plane's lever, and ramming in either case.
     */
    void serverTick(ServerLevel level, Player driver, Input keys) {
        if (driver != null && !vehicle.isLocalInstanceAuthoritative()) {
            boolean engine = vehicle.fuel().canRun();
            float steering = (keys.right() ? 1 : 0) - (keys.left() ? 1 : 0);
            float throttle = switch (vehicle.constants().mode()) {
                case AIR -> {
                    if (keys.forward() && !keys.backward()) {
                        lever = Math.min(1, lever + VehiclePhysics.THROTTLE_STEP);
                    } else if (keys.backward() && !keys.forward()) {
                        lever = Math.max(0, lever - VehiclePhysics.THROTTLE_STEP);
                    }
                    yield (float) lever;
                }
                case HOVER -> engine ? 1 : 0;
                default -> !engine ? 0 : keys.forward() && !keys.backward() ? 1 : keys.backward() && !keys.forward() ? -1 : 0;
            };
            vehicle.setSteeringAndThrottle(steering, throttle);
        } else if (driver == null && vehicle.constants().mode() != VehicleDefinition.Mode.AIR) {
            lever = 0;
        }
        Vec3 now = vehicle.position();
        double speed = previous == null ? 0 : now.subtract(previous).horizontalDistance();
        previous = now;
        ram(level, driver, speed);
    }

    /** {@code ram_damage}: living entities in the way at {@code min_speed} or faster (ADR 0090 D2). */
    private void ram(ServerLevel level, Player driver, double speed) {
        VehicleDefinition.RamDamage ram = vehicle.definition().ramDamage().orElse(null);
        if (ram == null || ram.damage() <= 0 || speed < ram.minSpeed()) {
            return;
        }
        List<LivingEntity> hit = level.getEntitiesOfClass(LivingEntity.class, vehicle.getBoundingBox().inflate(0.2),
                e -> e.isAlive() && !e.isPassengerOfSameVehicle(vehicle) && e.getVehicle() != vehicle && EntitySelector.NO_SPECTATORS.test(e));
        if (hit.isEmpty()) {
            return;
        }
        DamageSource source = driver != null ? level.damageSources().mobAttack(driver) : level.damageSources().generic();
        for (LivingEntity entity : hit) {
            entity.hurtServer(level, source, ram.damage());
        }
    }
}
