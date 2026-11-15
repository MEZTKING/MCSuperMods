package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.util.List;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundSource;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.entity.ai.attributes.AttributeInstance;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.DismountHelper;
import net.minecraft.world.phys.Vec3;

/**
 * Seats (ADR 0090 D2, D8): players only (plan limit V15), up to the definition's seats; seat {@code i} is the
 * {@code i}-th passenger, the first drives. {@code offset} is in blocks from the vehicle's position, x right and z
 * forwards, turned with the hull; the default seat sits on top of the hitbox at its centre. Getting in fires
 * {@code on_mount}, plays {@code engine.start_sound} for the driver and adds the {@code camera.distance} modifier;
 * getting out fires {@code on_dismount} and removes it; {@link VehicleEvents} hears both after the definition's event. The player gets out beside the seat's side of the hull (then the
 * other side, the front and the back), on a spot vanilla's {@link DismountHelper} accepts.
 */
public final class VehicleSeats {
    /** The transient modifier of the seated player's {@code camera_distance} attribute (ADR 0090 D8, B406 S5). */
    public static final Identifier CAMERA_MODIFIER = Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, "vehicle_camera");
    /** Gap between the hull and a dismounting player, in blocks. */
    static final double DISMOUNT_GAP = 0.2;

    private final MsmVehicle vehicle;

    VehicleSeats(MsmVehicle vehicle) {
        this.vehicle = vehicle;
    }

    private VehicleDefinition definition() {
        return vehicle.definition();
    }

    /** Players only, while a seat is free. */
    boolean canAdd(Entity passenger) {
        return passenger instanceof Player && vehicle.getPassengers().size() < definition().seatCount();
    }

    /** The seat index of {@code passenger}, or -1. */
    public int seatOf(Entity passenger) {
        return vehicle.getPassengers().indexOf(passenger);
    }

    /** The offset of seat {@code seat} in the hull's frame: x right, y up, z forwards. */
    public Vec3 seatOffset(int seat) {
        List<VehicleDefinition.Seat> seats = definition().seats();
        if (seats.isEmpty() || seat < 0 || seat >= seats.size()) {
            return new Vec3(0, definition().height(), 0);
        }
        List<Float> o = seats.get(seat).offset();
        return new Vec3(o.get(0), o.get(1), o.get(2));
    }

    /** A point in the hull's frame (x right, z forwards) turned into the world's frame by the vehicle's yaw. */
    public static Vec3 toWorld(Vec3 local, float yaw) {
        return new Vec3(-local.x, local.y, local.z).yRot(-yaw * Mth.DEG_TO_RAD);
    }

    Vec3 attachmentPoint(Entity passenger) {
        return toWorld(seatOffset(Math.max(0, seatOf(passenger))), vehicle.getYRot());
    }

    /**
     * Surface vehicles without a turret turn their passengers' look with the hull (a car's camera follows the car); planes
     * and hovering vehicles follow the driver's look instead, and a turret's gunner keeps aiming (ADR 0090 D7).
     */
    void turnWithHull(Entity passenger) {
        if (!(passenger instanceof Player) || definition().turret().isPresent()) {
            return;
        }
        VehicleDefinition.Mode mode = definition().movement().mode();
        if (mode == VehicleDefinition.Mode.AIR || mode == VehicleDefinition.Mode.HOVER) {
            return;
        }
        float turn = Mth.wrapDegrees(vehicle.getYRot() - vehicle.yRotO);
        if (turn != 0) {
            passenger.setYRot(passenger.getYRot() + turn);
            passenger.setYHeadRot(passenger.getYHeadRot() + turn);
        }
    }

    /**
     * Beside the hull on the side of the passenger's seat, then the other side, the front and the back, {@link #DISMOUNT_GAP}
     * from the hull: the first of those spots (on the floor there, or a block up or down) where vanilla's
     * {@link DismountHelper} says the passenger fits. Null when there is none (vanilla's default then).
     */
    Vec3 dismountLocation(LivingEntity passenger) {
        float yaw = vehicle.getYRot();
        Vec3 relative = passenger.position().subtract(vehicle.position());
        double rad = yaw * Mth.DEG_TO_RAD;
        double localX = relative.x * -Math.cos(rad) + relative.z * -Math.sin(rad);
        double side = localX >= 0 ? 1 : -1;
        double reach = vehicle.getBbWidth() / 2 + passenger.getBbWidth() / 2 + DISMOUNT_GAP;
        Vec3[] candidates = {
            new Vec3(side * reach, 0, 0), new Vec3(-side * reach, 0, 0), new Vec3(0, 0, reach), new Vec3(0, 0, -reach)
        };
        for (Vec3 local : candidates) {
            Vec3 world = vehicle.position().add(toWorld(local, yaw));
            BlockPos base = BlockPos.containing(world.x, vehicle.getY(), world.z);
            for (BlockPos pos : new BlockPos[] {base, base.above(), base.below()}) {
                double floor = vehicle.level().getBlockFloorHeight(pos);
                if (!DismountHelper.isBlockFloorValid(floor)) {
                    continue;
                }
                Vec3 spot = new Vec3(world.x, pos.getY() + floor, world.z);
                for (Pose pose : passenger.getDismountPoses()) {
                    if (DismountHelper.canDismountTo(vehicle.level(), spot, passenger, pose)) {
                        passenger.setPose(pose);
                        return spot;
                    }
                }
            }
        }
        return null;
    }

    /** After vanilla added {@code passenger}: the camera modifier, {@code on_mount} and the driver's start sound. */
    void onAdded(Entity passenger) {
        if (!(vehicle.level() instanceof ServerLevel level) || !(passenger instanceof Player player)) {
            return;
        }
        definition().cameraDistance().ifPresent(distance -> {
            AttributeInstance camera = player.getAttribute(Attributes.CAMERA_DISTANCE);
            if (camera != null) {
                camera.addOrUpdateTransientModifier(new AttributeModifier(CAMERA_MODIFIER, distance - camera.getBaseValue(),
                        AttributeModifier.Operation.ADD_VALUE));
            }
        });
        if (vehicle.getFirstPassenger() == player) {
            definition().engine().flatMap(VehicleDefinition.Engine::startSound)
                    .flatMap(BuiltInRegistries.SOUND_EVENT::getOptional)
                    .ifPresent(sound -> level.playSound(null, vehicle.getX(), vehicle.getY(), vehicle.getZ(), sound, SoundSource.NEUTRAL, 1, 1));
        }
        definition().onMount().ifPresent(event -> vehicle.fire(level, event, player));
        VehicleEvents.mounted(level, vehicle, player);
    }

    /** After vanilla removed {@code passenger}: the camera modifier goes and {@code on_dismount} fires. */
    void onRemoved(Entity passenger) {
        if (!(vehicle.level() instanceof ServerLevel level) || !(passenger instanceof Player player)) {
            return;
        }
        AttributeInstance camera = player.getAttribute(Attributes.CAMERA_DISTANCE);
        if (camera != null) {
            camera.removeModifier(CAMERA_MODIFIER);
        }
        definition().onDismount().ifPresent(event -> vehicle.fire(level, event, player));
        VehicleEvents.dismounted(level, vehicle, player);
    }
}
