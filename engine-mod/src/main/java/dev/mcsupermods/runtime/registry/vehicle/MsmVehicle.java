package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.TickLimiter;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.InterpolationHandler;
import net.minecraft.world.entity.LinearInterpolationHandler;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.VehicleEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Explosion;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.Vec3;

/**
 * A project vehicle (ADR 0090 D1): one class for every {@code msm:vehicle} type, built on vanilla's
 * {@link VehicleEntity} (the base of boats and minecarts: its synched hurt time, hurt direction and damage). Not living:
 * no health attribute, effects, AI, breathing, despawning, mob caps, leads or spawn egg. The definition is looked up by
 * entity type ({@link MsmVehicles#entry}) before the first instance exists, and the behaviour lives in per-vehicle
 * modules: {@link VehicleMovement} (who moves it and how), {@link VehicleSeats}, {@link VehicleFuel},
 * {@link VehicleHealth} (damage, repair, destroy), {@link VehicleStorage} ({@link MsmStorageVehicle} only),
 * {@link VehiclePaint}, and B417's {@link VehicleWeapons} and {@link VehicleTurret}.
 *
 * <p>Who moves it (ADR 0090 D4, B406): the first passenger controls it when it is a player
 * ({@link #getControllingPassenger}); the side for which {@link #isLocalInstanceAuthoritative()} is true runs
 * {@link VehiclePhysics}: the driver's client while driven (vanilla sends the result in its move-vehicle packet and the
 * server checks it), the server without a driver; every other side interpolates over three steps. Everything that is not
 * position (fuel, damage, ammunition, storage, seats, paint, events) is decided by the server.
 *
 * <p>Synched data for the dashboard (B416), weapons and turret (B417) and the client renderer (B418), all defined here:
 * {@link #DATA_FUEL}, {@link #DATA_PAINT}, {@link #DATA_STEERING}, {@link #DATA_THROTTLE}, {@link #DATA_TURRET_YAW},
 * {@link #DATA_TURRET_PITCH}, {@link #DATA_AMMO} and {@link #DATA_READY_AT} per weapon index, plus vanilla's damage,
 * hurt time and hurt direction.
 */
public class MsmVehicle extends VehicleEntity {
    /** Ticks of fuel left (0 when the vehicle needs none). */
    public static final EntityDataAccessor<Integer> DATA_FUEL = SynchedEntityData.defineId(MsmVehicle.class, EntityDataSerializers.INT);
    /** The paint: 0 is {@code model.texture}, {@code n} is {@code model.paints[n - 1]} (ADR 0090 D12). */
    public static final EntityDataAccessor<Byte> DATA_PAINT = SynchedEntityData.defineId(MsmVehicle.class, EntityDataSerializers.BYTE);
    /** The driver's steering, -1 (left) to 1 (right), for steering bones. */
    public static final EntityDataAccessor<Float> DATA_STEERING = SynchedEntityData.defineId(MsmVehicle.class, EntityDataSerializers.FLOAT);
    /**
     * The engine's effort for wheels, rotors, propellers, exhaust and the engine sound: -1 to 1 on surfaces (reverse to
     * forwards), the throttle lever 0 to 1 for {@code air}, 1 while a {@code hover} engine runs; 0 with the engine off.
     */
    public static final EntityDataAccessor<Float> DATA_THROTTLE = SynchedEntityData.defineId(MsmVehicle.class, EntityDataSerializers.FLOAT);
    /** The turret's yaw relative to the hull, degrees (written by B417's {@link VehicleTurret}). */
    public static final EntityDataAccessor<Float> DATA_TURRET_YAW = SynchedEntityData.defineId(MsmVehicle.class, EntityDataSerializers.FLOAT);
    /** The turret's pitch, degrees, negative up (written by B417's {@link VehicleTurret}). */
    public static final EntityDataAccessor<Float> DATA_TURRET_PITCH = SynchedEntityData.defineId(MsmVehicle.class, EntityDataSerializers.FLOAT);
    /** Rounds loaded, per weapon index (0 to 7); unused for a weapon without {@code ammo}. */
    public static final List<EntityDataAccessor<Integer>> DATA_AMMO;
    /** The game time at which each weapon may fire again, per weapon index; 0 is ready (written by B417). */
    public static final List<EntityDataAccessor<Long>> DATA_READY_AT;

    static {
        List<EntityDataAccessor<Integer>> ammo = new ArrayList<>();
        List<EntityDataAccessor<Long>> ready = new ArrayList<>();
        for (int i = 0; i < VehicleDefinition.MAX_WEAPONS; i++) {
            ammo.add(SynchedEntityData.defineId(MsmVehicle.class, EntityDataSerializers.INT));
        }
        for (int i = 0; i < VehicleDefinition.MAX_WEAPONS; i++) {
            ready.add(SynchedEntityData.defineId(MsmVehicle.class, EntityDataSerializers.LONG));
        }
        DATA_AMMO = Collections.unmodifiableList(ammo);
        DATA_READY_AT = Collections.unmodifiableList(ready);
    }

    /** Interpolation steps for sides that do not move the vehicle (B406). */
    static final int INTERPOLATION_STEPS = 3;

    private final MsmVehicles.Entry entry;
    private final VehicleMovement movement;
    private final VehicleSeats seats;
    private final VehicleFuel fuel;
    private final VehicleHealth health;
    private final VehiclePaint paint;
    private final VehicleWeapons weapons;
    private final VehicleTurret turret;

    public MsmVehicle(EntityType<? extends MsmVehicle> type, Level level) {
        super(type, level);
        this.entry = MsmVehicles.entry(type);
        this.movement = new VehicleMovement(this);
        this.seats = new VehicleSeats(this);
        this.fuel = new VehicleFuel(this);
        this.health = new VehicleHealth(this);
        this.paint = new VehiclePaint(this);
        this.weapons = new VehicleWeapons(this);
        this.turret = new VehicleTurret(this);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(DATA_FUEL, 0);
        builder.define(DATA_PAINT, (byte) 0);
        builder.define(DATA_STEERING, 0f);
        builder.define(DATA_THROTTLE, 0f);
        builder.define(DATA_TURRET_YAW, 0f);
        builder.define(DATA_TURRET_PITCH, 0f);
        for (EntityDataAccessor<Integer> ammo : DATA_AMMO) {
            builder.define(ammo, 0);
        }
        for (EntityDataAccessor<Long> ready : DATA_READY_AT) {
            builder.define(ready, 0L);
        }
    }

    // The type

    /** The vehicle type's id (also its item's id). */
    public Identifier definitionId() {
        return entry.id();
    }

    public VehicleDefinition definition() {
        return entry.definition();
    }

    /** The movement with every default resolved. */
    public VehiclePhysics.Constants constants() {
        return entry.constants();
    }

    public VehicleMovement movement() {
        return movement;
    }

    public VehicleSeats seats() {
        return seats;
    }

    public VehicleFuel fuel() {
        return fuel;
    }

    public VehicleHealth health() {
        return health;
    }

    public VehiclePaint paint() {
        return paint;
    }

    public VehicleWeapons weapons() {
        return weapons;
    }

    public VehicleTurret turret() {
        return turret;
    }

    /** The storage; absent unless the definition has {@code storage} ({@link MsmStorageVehicle}). */
    public Optional<VehicleStorage> storage() {
        return Optional.empty();
    }

    /** The vehicle's item (registered under the same id). */
    public Item item() {
        return entry.item();
    }

    @Override
    protected Item getDropItem() {
        return entry.item();
    }

    @Override
    public ItemStack getPickResult() {
        return new ItemStack(entry.item());
    }

    /** {@code name} when given, else vanilla's {@code entity.<ns>.<path>}. */
    @Override
    protected Component getTypeName() {
        return definition().name().<Component>map(Component::translatable).orElseGet(super::getTypeName);
    }

    // Synched values

    public int ammo(int weapon) {
        return entityData.get(DATA_AMMO.get(weapon));
    }

    public void setAmmo(int weapon, int rounds) {
        entityData.set(DATA_AMMO.get(weapon), rounds);
    }

    public long readyAt(int weapon) {
        return entityData.get(DATA_READY_AT.get(weapon));
    }

    public void setReadyAt(int weapon, long gameTime) {
        entityData.set(DATA_READY_AT.get(weapon), gameTime);
    }

    public float steering() {
        return entityData.get(DATA_STEERING);
    }

    public float throttle() {
        return entityData.get(DATA_THROTTLE);
    }

    void setSteeringAndThrottle(float steering, float throttle) {
        entityData.set(DATA_STEERING, steering);
        entityData.set(DATA_THROTTLE, throttle);
    }

    public float turretYaw() {
        return entityData.get(DATA_TURRET_YAW);
    }

    public float turretPitch() {
        return entityData.get(DATA_TURRET_PITCH);
    }

    public void setTurret(float yaw, float pitch) {
        entityData.set(DATA_TURRET_YAW, yaw);
        entityData.set(DATA_TURRET_PITCH, pitch);
    }

    /** {@link VehicleEntity}'s synched data, for the modules. */
    SynchedEntityData data() {
        return entityData;
    }

    // Driving

    /** The first passenger controls the vehicle when it is a player (ADR 0090 D2: the first seat drives). */
    @Override
    public LivingEntity getControllingPassenger() {
        return getFirstPassenger() instanceof Player player ? player : null;
    }

    /** The driver, or null. */
    public Player driver() {
        return getControllingPassenger() instanceof Player player ? player : null;
    }

    @Override
    protected InterpolationHandler createInterpolationHandler() {
        return LinearInterpolationHandler.create(this, INTERPOLATION_STEPS);
    }

    @Override
    public float maxUpStep() {
        return (float) constants().stepHeight();
    }

    @Override
    public void tick() {
        super.tick();
        if (!level().isClientSide() && getHurtTime() > 0) {
            setHurtTime(getHurtTime() - 1);
        }
        movement.tick();
        // A driven plane or hovering vehicle flies under control: its height loss is no fall (vanilla passes a
        // vehicle's fall on to its passengers when it lands).
        VehicleDefinition.Mode mode = definition().movement().mode();
        if (driver() != null && (mode == VehicleDefinition.Mode.AIR || mode == VehicleDefinition.Mode.HOVER)) {
            resetFallDistance();
        }
        if (level() instanceof ServerLevel server && !isRemoved()) {
            serverTick(server);
        }
    }

    /** The server's own work each tick: fuel, the synched steering and throttle, {@code on_tick}, ramming, B417's hooks. */
    private void serverTick(ServerLevel level) {
        Player driver = driver();
        Input input = VehicleDriver.serverInput(driver);
        fuel.tick(driver, input);
        movement.serverTick(level, driver, input);
        definition().onTick().ifPresent(onTick -> {
            if (driver != null && (level.getGameTime() + getId()) % onTick.interval() == 0 && TickLimiter.tryFire(level)) {
                fire(level, onTick.event(), driver);
            }
        });
        turret.tick(level);
        weapons.tick(level);
    }

    // Interaction

    @Override
    public boolean isPickable() {
        return !isRemoved();
    }

    /** Solid as a boat: players stand on it and other entities bump into it; its own passengers do not. */
    @Override
    public boolean canBeCollidedWith(Entity entity) {
        return !isRemoved();
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    /**
     * A sneaking use opens the storage ({@link MsmStorageVehicle}); a fuel, repair, dye or ammunition item is used on the
     * vehicle; anything else gets in when a seat is free. The client answers the same way from synched data, so the
     * hand swings only when the server will act.
     */
    @Override
    public InteractionResult interact(Player player, InteractionHand hand, Vec3 location) {
        if (player.isSecondaryUseActive()) {
            return storage().map(s -> s.open(player)).orElse(InteractionResult.PASS);
        }
        ItemStack stack = player.getItemInHand(hand);
        if (!stack.isEmpty()) {
            InteractionResult used = fuel.use(player, stack);
            if (used == null) {
                used = health.repair(player, stack);
            }
            if (used == null) {
                used = paint.use(player, stack);
            }
            if (used == null) {
                used = weapons.load(player, stack);
            }
            if (used != null) {
                return used;
            }
        }
        if (player.getVehicle() == this || !canAddPassenger(player)) {
            return InteractionResult.PASS;
        }
        if (!level().isClientSide()) {
            return player.startRiding(this) ? InteractionResult.SUCCESS : InteractionResult.PASS;
        }
        return InteractionResult.SUCCESS;
    }

    @Override
    public boolean hurtServer(ServerLevel level, DamageSource source, float amount) {
        return health.hurt(level, source, amount);
    }

    /** The vehicle's own explosions (destroyed with {@code health.explodes}, or an {@code explode} action) spare it. */
    @Override
    public boolean ignoreExplosion(Explosion explosion) {
        return explosion.getDirectSourceEntity() == this || super.ignoreExplosion(explosion);
    }

    /** {@link Entity#isInvulnerableToBase}, for {@link VehicleHealth}. */
    boolean invulnerableTo(DamageSource source) {
        return isInvulnerableToBase(source);
    }

    /** {@link Entity#markHurt}, for {@link VehicleHealth}. */
    void markHurtForHealth() {
        markHurt();
    }

    // Seats

    @Override
    protected boolean canAddPassenger(Entity passenger) {
        return seats.canAdd(passenger);
    }

    @Override
    protected Vec3 getPassengerAttachmentPoint(Entity passenger, EntityDimensions dimensions, float scale) {
        return seats.attachmentPoint(passenger);
    }

    @Override
    protected void positionRider(Entity passenger, MoveFunction move) {
        super.positionRider(passenger, move);
        seats.turnWithHull(passenger);
    }

    @Override
    public Vec3 getDismountLocationForPassenger(LivingEntity passenger) {
        Vec3 spot = seats.dismountLocation(passenger);
        return spot != null ? spot : super.getDismountLocationForPassenger(passenger);
    }

    @Override
    protected void addPassenger(Entity passenger) {
        super.addPassenger(passenger);
        seats.onAdded(passenger);
    }

    @Override
    protected void removePassenger(Entity passenger) {
        super.removePassenger(passenger);
        seats.onRemoved(passenger);
    }

    // Events

    /** Fires {@code event} (an id in {@code events}) with the vehicle as self and {@code player}, when given, as the player. */
    void fire(ServerLevel level, String event, Player player) {
        Identifier id = Identifier.tryParse(event);
        if (id == null) {
            return; // a load error already
        }
        EventRunner.fire(entry.id(), definition().events(), id, EventContext.forEntity(level, this, player));
    }

    // Saving

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        output.putFloat("Damage", getDamage());
        fuel.save(output);
        paint.save(output);
        weapons.save(output);
        turret.save(output);
        storage().ifPresent(s -> s.save(output));
    }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        setDamage(Math.max(0, Math.min(input.getFloatOr("Damage", 0), definition().health().max() - 0.001f)));
        fuel.load(input);
        paint.load(input);
        weapons.load(input);
        turret.load(input);
        storage().ifPresent(s -> s.load(input));
    }
}
