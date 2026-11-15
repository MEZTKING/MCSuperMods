package dev.mcsupermods.runtime.gametest.spike3;

import dev.mcsupermods.runtime.registry.MsmAnimal;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.TamableAnimal;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.Vec3;

/**
 * B469 spike (throwaway): a small runtime {@code animal} body on a player's shoulder (ADR 0098 D4), two ways:
 * <ul>
 *   <li><b>passenger</b>: a real passenger of the player. {@code Entity.startRiding} refuses any vehicle whose type
 *       cannot be saved on the server ({@code EntityType.PLAYER} is {@code noSave}), so {@link #forceRide} sets the
 *       private {@code vehicle} field and calls the protected {@code addPassenger} by reflection. Its own
 *       {@link #getVehicleAttachmentPoint} puts its feet {@link #SIDE} to the right and {@link #HEIGHT} up.</li>
 *   <li><b>follow</b>: not a passenger; a synched {@code perched} flag makes both sides put it at the same spot every
 *       tick from the owner's position and body yaw, without gravity, physics or pushing.</li>
 * </ul>
 */
public class Spike3Pet extends MsmAnimal {
    public static final EntityDataAccessor<Boolean> DATA_PERCHED = SynchedEntityData.defineId(Spike3Pet.class, EntityDataSerializers.BOOLEAN);
    public static volatile boolean turnWithOwner = false;
    public static final double SIDE = 0.4;
    public static final double HEIGHT = 1.35;

    public Spike3Pet(EntityType<? extends TamableAnimal> type, Level level) {
        super(type, level);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(DATA_PERCHED, false);
    }

    /** The shoulder spot relative to the player's feet for a body yaw. */
    public static Vec3 shoulderOffset(float bodyYaw) {
        return new Vec3(-SIDE, HEIGHT, 0).yRot(-bodyYaw * Mth.DEG_TO_RAD);
    }

    public boolean perched() {
        return entityData.get(DATA_PERCHED);
    }

    public void setPerched(boolean perched) {
        entityData.set(DATA_PERCHED, perched);
        setNoGravity(perched);
        noPhysics = perched;
    }

    /** Mode passenger: what startRiding does after its checks, by reflection. */
    public static String forceRide(Entity pet, Entity vehicle) {
        try {
            pet.stopRiding();
            Field field = Entity.class.getDeclaredField("vehicle");
            field.setAccessible(true);
            Method add = Entity.class.getDeclaredMethod("addPassenger", Entity.class);
            add.setAccessible(true);
            field.set(pet, vehicle);
            add.invoke(vehicle, pet);
            return "forced: vehicle " + (pet.getVehicle() == vehicle) + " passengers " + vehicle.getPassengers().size();
        } catch (ReflectiveOperationException e) {
            return "reflection failed: " + e;
        }
    }

    @Override
    public Vec3 getVehicleAttachmentPoint(Entity vehicle) {
        if (vehicle instanceof Player player) {
            // riding position = vehicle position + the vehicle's passenger point; minus this.
            Vec3 passengerPoint = player.getPassengerRidingPosition(this).subtract(player.position());
            return passengerPoint.subtract(shoulderOffset(player.yBodyRot));
        }
        return super.getVehicleAttachmentPoint(vehicle);
    }

    @Override
    public void rideTick() {
        super.rideTick();
        if (turnWithOwner && getVehicle() instanceof Player player) {
            face(player);
        }
    }

    private void face(Player player) {
        setYRot(player.yBodyRot);
        yBodyRot = player.yBodyRot;
        yHeadRot = player.getYHeadRot();
        setXRot(0);
    }

    @Override
    public void tick() {
        super.tick();
        if (perched() && getOwner() instanceof Player owner && owner.level() == level()) {
            setPos(owner.position().add(shoulderOffset(owner.yBodyRot)));
            setDeltaMovement(Vec3.ZERO);
            if (turnWithOwner) {
                face(owner);
            }
        }
    }

    @Override
    public boolean isPushable() {
        return !perched() && super.isPushable();
    }

    @Override
    protected void doPush(Entity entity) {
        if (!perched()) {
            super.doPush(entity);
        }
    }

    public LivingEntity ownerEntity() {
        return getOwner();
    }
}
