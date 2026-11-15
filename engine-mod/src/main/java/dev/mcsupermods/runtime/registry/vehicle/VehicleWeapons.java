package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.controls.HeldKeys;
import dev.mcsupermods.runtime.controls.KeyBinds;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.registry.projectile.Projectiles;
import java.util.List;
import java.util.Optional;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;

/**
 * Weapons (ADR 0090 D6), all decided on the server: the ammunition per weapon index in {@link MsmVehicle#DATA_AMMO}
 * (saved by weapon id under {@code Ammo}, kept in the item when picked up) and the game time each weapon may fire again in
 * {@link MsmVehicle#DATA_READY_AT} (0 is ready; the dashboard's reload is {@code readyAt - gameTime}).
 *
 * <ul>
 *   <li><b>Firing.</b> A press of the runtime key {@code fire} or {@code second} (ADR 0088 D5, through a
 *       {@link KeyBinds.KeyListener}, so a one-tick tap fires too) fires, from the presser's seat, every weapon on that key
 *       in the seat's list ({@link VehicleDefinition#weaponsOfSeat}: the seat's {@code weapons}, else every weapon for the
 *       driver and none for the others) that is ready and has ammunition. An {@code automatic} weapon then fires again
 *       each time its cooldown ends while the key stays held ({@link HeldKeys}).</li>
 *   <li><b>A shot</b> ({@link #fireWeapon}): the projectile ({@link Projectiles}: an arrow with {@code damage} as base
 *       damage, a vanilla projectile item, or a project {@code msm:throwable}, whose hit events run, such as a shell's
 *       {@code on_hit_block} with {@code explode}) starts at the muzzle ({@link #muzzle}) with the shooter as owner, so kills
 *       and advancements credit the player, and flies along the aim at {@code speed} with {@code inaccuracy}. Then
 *       {@code per_shot} rounds go, the cooldown starts, the {@code sound} plays (from the server, to everyone near but the
 *       shooter, whose client plays it at once: B418's {@code VehicleInput}), the vehicle is pushed back by
 *       {@code recoil} blocks a tick, {@code on_fire} fires (self the vehicle, player the shooter) and then
 *       {@link VehicleEvents} hears the shot. Arrows of a weapon without {@code ammo} can be picked up in creative only (no free arrows).</li>
 *   <li><b>Aim.</b> A muzzle whose {@code bone} is the turret's {@code pitch_bone} aims along the turret's yaw and pitch, one
 *       on the turret's {@code bone} along its yaw, any other along the hull (its yaw and pitch).</li>
 *   <li><b>Loading.</b> Using a weapon's {@code ammo.item} on the vehicle (seated or not) loads as many as fit from the
 *       stack, up to {@code capacity}, into the first weapon of that ammunition that is not full; a full weapon passes the
 *       click on. Creative players' stacks are not used up.</li>
 * </ul>
 */
public final class VehicleWeapons {
    static {
        KeyBinds.addListener(new KeyBinds.KeyListener() {
            @Override
            public void pressed(ServerPlayer player, Identifier key) {
                VehicleDefinition.WeaponKey weaponKey = weaponKey(key);
                if (weaponKey != null && player.getVehicle() instanceof MsmVehicle vehicle && vehicle.level() instanceof ServerLevel level) {
                    vehicle.weapons().fire(level, player, weaponKey);
                }
            }
        });
    }

    private final MsmVehicle vehicle;

    VehicleWeapons(MsmVehicle vehicle) {
        this.vehicle = vehicle;
    }

    private List<VehicleDefinition.Weapon> weapons() {
        return vehicle.definition().weapons();
    }

    /** The runtime key's id of {@code key}. */
    public static Identifier keyId(VehicleDefinition.WeaponKey key) {
        return switch (key) {
            case FIRE -> KeyBinds.RuntimeKey.FIRE.id();
            case SECOND -> KeyBinds.RuntimeKey.SECOND.id();
        };
    }

    /** The weapon key of a runtime key id, or null. */
    static VehicleDefinition.WeaponKey weaponKey(Identifier id) {
        if (KeyBinds.RuntimeKey.FIRE.id().equals(id)) {
            return VehicleDefinition.WeaponKey.FIRE;
        }
        if (KeyBinds.RuntimeKey.SECOND.id().equals(id)) {
            return VehicleDefinition.WeaponKey.SECOND;
        }
        return null;
    }

    /** Rounds loaded in weapon {@code index}. */
    public int ammo(int index) {
        return vehicle.ammo(index);
    }

    /** Sets the rounds of weapon {@code index}, clamped to 0..its capacity (0 for a weapon without {@code ammo}). */
    public void setAmmo(int index, int rounds) {
        if (index < 0 || index >= weapons().size()) {
            return;
        }
        int capacity = weapons().get(index).ammo().map(VehicleDefinition.Ammo::capacity).orElse(0);
        vehicle.setAmmo(index, Math.max(0, Math.min(rounds, capacity)));
    }

    /** Whether weapon {@code index} may fire at {@code gameTime}: its cooldown is over and it has a shot's ammunition. */
    public boolean ready(int index, long gameTime) {
        VehicleDefinition.Weapon weapon = weapons().get(index);
        return gameTime >= vehicle.readyAt(index) && weapon.ammo().map(a -> ammo(index) >= a.perShot()).orElse(true);
    }

    /** Whether {@code seat} fires weapon {@code index}. */
    public boolean seatFires(int seat, int index) {
        return seat >= 0 && vehicle.definition().weaponsOfSeat(seat).contains(weapons().get(index).id());
    }

    /**
     * An ammunition item in the hand: loads the first weapon of that ammunition with room (server) and answers SUCCESS;
     * null (pass on) when the item is no weapon's ammunition or every such weapon is full.
     */
    InteractionResult load(Player player, ItemStack stack) {
        for (int i = 0; i < weapons().size(); i++) {
            Optional<VehicleDefinition.Ammo> ammo = weapons().get(i).ammo();
            if (ammo.isEmpty() || !MsmVehicles.matches(stack, ammo.get().item())) {
                continue;
            }
            int room = ammo.get().capacity() - ammo(i);
            if (room <= 0) {
                continue;
            }
            if (!vehicle.level().isClientSide()) {
                boolean creative = player.hasInfiniteMaterials();
                int loaded = creative ? room : Math.min(room, stack.getCount());
                setAmmo(i, ammo(i) + loaded);
                if (!creative) {
                    stack.shrink(loaded);
                }
                vehicle.level().playSound(null, vehicle.getX(), vehicle.getY(), vehicle.getZ(), SoundEvents.CROSSBOW_LOADING_END.value(),
                        SoundSource.NEUTRAL, 1, 1);
            }
            return InteractionResult.SUCCESS;
        }
        return null;
    }

    /** Automatic fire, on the server each tick: every ready automatic weapon whose key a player in its seat holds fires. */
    void tick(ServerLevel level) {
        List<Entity> passengers = vehicle.getPassengers();
        for (int i = 0; i < weapons().size(); i++) {
            VehicleDefinition.Weapon weapon = weapons().get(i);
            if (!weapon.automatic() || !ready(i, level.getGameTime())) {
                continue;
            }
            for (int seat = 0; seat < passengers.size(); seat++) {
                if (passengers.get(seat) instanceof Player player && seatFires(seat, i) && HeldKeys.isHeld(player, keyId(weapon.key()))) {
                    fireWeapon(level, i, player);
                    break;
                }
            }
        }
    }

    /**
     * A press of a runtime fire key by {@code shooter}: every weapon on {@code key} of the shooter's seat that is ready
     * fires. Returns the number of shots; 0 when the shooter is not seated in this vehicle.
     */
    public int fire(ServerLevel level, Player shooter, VehicleDefinition.WeaponKey key) {
        int seat = vehicle.seats().seatOf(shooter);
        if (seat < 0) {
            return 0;
        }
        int shots = 0;
        for (int i = 0; i < weapons().size(); i++) {
            if (weapons().get(i).key() == key && seatFires(seat, i) && fireWeapon(level, i, shooter)) {
                shots++;
            }
        }
        return shots;
    }

    /**
     * One shot of weapon {@code index} by {@code shooter} when it is ready (no seat check: {@link #fire} and {@link #tick}
     * make it). False when it is not ready or its projectile shoots nothing (logged once per id).
     */
    public boolean fireWeapon(ServerLevel level, int index, Player shooter) {
        if (index < 0 || index >= weapons().size() || !ready(index, level.getGameTime())) {
            return false;
        }
        VehicleDefinition.Weapon weapon = weapons().get(index);
        Projectiles.Kind kind = Projectiles.kind(weapon.projectile());
        if (kind == Projectiles.Kind.NONE) {
            Projectiles.reportOnce(weapon.projectile(), vehicle.definitionId(), "weapons[" + index + "]", "the weapon shoots nothing");
            return false;
        }
        Aim aim = aim(weapon);
        Vec3 start = muzzle(weapon, aim);
        Vec3 direction = Vec3.directionFromRotation(aim.pitch(), aim.yaw());
        ItemStack stack = new ItemStack(BuiltInRegistries.ITEM.getValue(weapon.projectile()));
        Projectile projectile = Projectiles.at(level, shooter, kind, stack, start, direction, weapon.damage(), weapon.ammo().isPresent());
        Projectiles.launch(level, projectile, kind, stack, direction.x, direction.y, direction.z, weapon.speed(), weapon.inaccuracy());

        weapon.ammo().ifPresent(a -> setAmmo(index, ammo(index) - a.perShot()));
        vehicle.setReadyAt(index, level.getGameTime() + weapon.cooldownTicks());
        weapon.sound().flatMap(BuiltInRegistries.SOUND_EVENT::getOptional).ifPresent(sound ->
                level.playSound(shooter, start.x, start.y, start.z, sound, SoundSource.NEUTRAL, 1, 1));
        if (weapon.recoil() > 0) {
            Vec3 back = new Vec3(-direction.x, 0, -direction.z);
            if (back.lengthSqr() > 1e-8) {
                vehicle.setDeltaMovement(vehicle.getDeltaMovement().add(back.normalize().scale(weapon.recoil())));
                vehicle.markHurtForHealth(); // Entity.markHurt: sends the new motion to the clients
            }
        }
        weapon.onFire().ifPresent(event -> vehicle.fire(level, event, shooter));
        VehicleEvents.fired(level, vehicle, index, shooter);
        return true;
    }

    /** Where a weapon aims, in the world's degrees: the yaw and pitch (negative up). */
    public record Aim(float yaw, float pitch) {}

    /** The aim of {@code weapon}: along the turret's yaw (and pitch for the pitch bone) or along the hull. */
    public Aim aim(VehicleDefinition.Weapon weapon) {
        Optional<String> bone = weapon.muzzle().flatMap(VehicleDefinition.Muzzle::bone);
        Optional<VehicleDefinition.Turret> turret = vehicle.definition().turret();
        if (bone.isPresent() && turret.isPresent()) {
            if (turret.get().pitchBone().equals(bone)) {
                return new Aim(vehicle.getYRot() + vehicle.turretYaw(), vehicle.turretPitch());
            }
            if (turret.get().bone().equals(bone.get())) {
                return new Aim(vehicle.getYRot() + vehicle.turretYaw(), 0);
            }
        }
        return new Aim(vehicle.getYRot(), vehicle.getXRot());
    }

    /**
     * Where {@code weapon}'s shot starts, in the world: {@code muzzle.offset} (x right, y up, z forwards, in blocks from the
     * vehicle's position; default the front of the hitbox at half its height), pitched about a point on the vehicle's
     * upright axis at the muzzle's own height and then turned by the aim's yaw.
     */
    public Vec3 muzzle(VehicleDefinition.Weapon weapon, Aim aim) {
        Vec3 local = weapon.muzzle().map(m -> new Vec3(m.offset().get(0), m.offset().get(1), m.offset().get(2)))
                .orElseGet(() -> new Vec3(0, vehicle.definition().height() / 2.0, vehicle.definition().width() / 2.0));
        return vehicle.position().add(VehicleSeats.toWorld(pitched(local, aim.pitch()), aim.yaw()));
    }

    /** {@code local} pitched by {@code pitch} degrees (negative up) about the point {@code (0, local.y, 0)}. */
    static Vec3 pitched(Vec3 local, float pitch) {
        double rad = Math.toRadians(pitch);
        return new Vec3(local.x, local.y - local.z * Math.sin(rad), local.z * Math.cos(rad));
    }

    void save(ValueOutput output) {
        ValueOutput ammo = output.child("Ammo");
        for (int i = 0; i < weapons().size(); i++) {
            if (weapons().get(i).ammo().isPresent()) {
                ammo.putInt(weapons().get(i).id(), ammo(i));
            }
        }
    }

    void load(ValueInput input) {
        ValueInput ammo = input.childOrEmpty("Ammo");
        for (int i = 0; i < weapons().size(); i++) {
            setAmmo(i, ammo.getIntOr(weapons().get(i).id(), 0));
        }
    }
}
