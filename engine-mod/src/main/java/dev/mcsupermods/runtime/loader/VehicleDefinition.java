package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.ID_OR_TAG;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.nonEmptyList;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.datafixers.util.Pair;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.events.Events;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * Vehicle definition v1 ({@code ::msm::definition::Vehicle}, ADR 0090 D2), {@code msm/<ns>/vehicle/<path>.json}: an
 * entity type of the runtime's vehicle class and an item under the same id. Closed throughout, as {@code vehicle.mcdoc}
 * (an unknown key is an error and nothing is registered). Fields whose default depends on {@code movement.mode} stay
 * empty here; {@code VehiclePhysics.Constants.of} resolves them. Pure: no registry is touched, so JUnit runs it over the
 * conformance corpus.
 *
 * @param seats   one to eight seats; empty means the default seat on top of the hitbox at its centre
 * @param weapons zero to eight weapons (fired by B417's {@code VehicleWeapons})
 */
public record VehicleDefinition(
        Optional<String> name,
        Model model,
        float width,
        float height,
        Movement movement,
        List<Seat> seats,
        Optional<Engine> engine,
        Health health,
        List<Weapon> weapons,
        Optional<Turret> turret,
        Optional<Parts> parts,
        Optional<Storage> storage,
        ItemSettings item,
        boolean pickUp,
        Optional<RamDamage> ramDamage,
        Optional<Float> cameraDistance,
        Optional<Exhaust> exhaust,
        boolean hud,
        Events events,
        Optional<String> onPlace,
        Optional<String> onMount,
        Optional<String> onDismount,
        Optional<String> onDestroy,
        Optional<OnTick> onTick) {
    public static final List<String> KEYS = List.of("format", "name", "model", "size", "movement", "seats", "engine", "health", "weapons",
            "turret", "parts", "storage", "item", "pick_up", "ram_damage", "camera", "exhaust", "hud", "events", "on_place", "on_mount",
            "on_dismount", "on_destroy", "on_tick");

    /** A boat's hitbox (ADR 0090 D2). */
    public static final float DEFAULT_WIDTH = 1.375f;
    public static final float DEFAULT_HEIGHT = 0.5625f;
    /** Most seats, weapons and paints (mcdoc bounds; synched data is defined per index). */
    public static final int MAX_SEATS = 8;
    public static final int MAX_WEAPONS = 8;
    public static final int MAX_PAINTS = 16;
    /** {@code health.max} default (ADR 0090 D9). */
    public static final float DEFAULT_MAX_HEALTH = 40;
    /** {@code on_tick.interval} default. */
    public static final int DEFAULT_TICK_INTERVAL = 20;
    /** {@code ammo.capacity} default. */
    public static final int DEFAULT_AMMO_CAPACITY = 64;

    /** A non-empty string (mcdoc {@code string @ 1..}). */
    static final Codec<String> NAME = Codec.STRING.validate(s -> s.isEmpty()
            ? DataResult.error(() -> "must not be empty")
            : DataResult.success(s));

    private static Codec<List<Float>> floats(float min, float max, int count) {
        return listOfLength(floatRange(min, max), count, count);
    }

    /** {@code VehicleMode} (ADR 0090 D3). */
    public enum Mode {
        GROUND, WATER, AMPHIBIOUS, AIR, HOVER;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Mode> CODEC = MsmCodecs.named("movement mode", values(), Mode::serialName);
    }

    /** {@code VehiclePaint}. */
    public record Paint(String id, Identifier texture, Optional<Identifier> dye) {
        static final Codec<Paint> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("id", NAME).forGetter(Paint::id),
                required("texture", ID).forGetter(Paint::texture),
                optional("dye", ID).forGetter(Paint::dye)).apply(i, Paint::new)), List.of("id", "texture", "dye"));
    }

    /** {@code VehicleModel}: read by the client renderer (B418). */
    public record Model(String geometry, Identifier texture, List<Paint> paints, Optional<String> animations, float scale) {
        static final Codec<Model> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("geometry", Codec.STRING).forGetter(Model::geometry),
                required("texture", ID).forGetter(Model::texture),
                optional("paints", listOfLength(Paint.CODEC, 1, MAX_PAINTS), List.of()).forGetter(Model::paints),
                optional("animations", Codec.STRING).forGetter(Model::animations),
                optional("scale", floatRange(0.1f, 8), 1f).forGetter(Model::scale)).apply(i, Model::new)),
                List.of("geometry", "texture", "paints", "animations", "scale"));
    }

    /**
     * {@code VehicleMovement}. Absent numbers are resolved by mode in {@code VehiclePhysics.Constants.of}; booleans
     * default to false.
     */
    public record Movement(Mode mode, Optional<Float> maxSpeed, Optional<Float> reverseFactor, Optional<Float> acceleration,
            Optional<Float> braking, Optional<Float> turnRate, boolean turnsInPlace, Optional<Float> stepHeight, Optional<Float> grip,
            Optional<Float> liftSpeed, Optional<Float> takeoffSpeed, boolean floats) {
        static final List<String> KEYS = List.of("mode", "max_speed", "reverse_factor", "acceleration", "braking", "turn_rate",
                "turns_in_place", "step_height", "grip", "lift_speed", "takeoff_speed", "floats");

        static final Codec<Movement> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("mode", Mode.CODEC).forGetter(Movement::mode),
                optional("max_speed", floatRange(0.01f, 3)).forGetter(Movement::maxSpeed),
                optional("reverse_factor", floatRange(0, 1)).forGetter(Movement::reverseFactor),
                optional("acceleration", floatRange(0.001f, 1)).forGetter(Movement::acceleration),
                optional("braking", floatRange(0.001f, 1)).forGetter(Movement::braking),
                optional("turn_rate", floatRange(0.5f, 30)).forGetter(Movement::turnRate),
                optional("turns_in_place", Codec.BOOL, false).forGetter(Movement::turnsInPlace),
                optional("step_height", floatRange(0, 2)).forGetter(Movement::stepHeight),
                optional("grip", floatRange(0, 1)).forGetter(Movement::grip),
                optional("lift_speed", floatRange(0, 1)).forGetter(Movement::liftSpeed),
                optional("takeoff_speed", floatRange(0, 3)).forGetter(Movement::takeoffSpeed),
                optional("floats", Codec.BOOL, false).forGetter(Movement::floats)).apply(i, Movement::new)), KEYS);
    }

    /**
     * {@code VehicleSeat}: {@code offset} {@code [x, y, z]} in blocks, x right and z forwards, turned with the hull.
     *
     * @param weapons the weapon ids fired from this seat; empty when absent (every weapon for the first seat, none for the
     *                others: {@link VehicleDefinition#weaponsOfSeat})
     */
    public record Seat(List<Float> offset, Optional<List<String>> weapons) {
        static final Codec<Seat> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("offset", floats(-16, 16, 3)).forGetter(Seat::offset),
                optional("weapons", NAME.listOf()).forGetter(Seat::weapons)).apply(i, Seat::new)), List.of("offset", "weapons"));
    }

    /** {@code VehicleFuelItem}: an item or {@code #} item tag and the ticks of driving one gives. */
    public record FuelItem(String item, int ticks) {
        static final Codec<FuelItem> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("item", ID_OR_TAG).forGetter(FuelItem::item),
                required("ticks", intAtLeast(1)).forGetter(FuelItem::ticks)).apply(i, FuelItem::new)), List.of("item", "ticks"));
    }

    /** {@code VehicleFuel}. */
    public record Fuel(List<FuelItem> items, Optional<Integer> capacity) {
        static final Codec<Fuel> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("items", nonEmptyList(FuelItem.CODEC)).forGetter(Fuel::items),
                optional("capacity", intAtLeast(1)).forGetter(Fuel::capacity)).apply(i, Fuel::new)), List.of("items", "capacity"));

        /** Ticks of fuel the tank holds: {@code capacity}, else 10 times the largest item's {@code ticks} (ADR 0090 D9). */
        public int capacityOrDefault() {
            return capacity.orElseGet(() -> (int) Math.min(Integer.MAX_VALUE,
                    10L * items.stream().mapToInt(FuelItem::ticks).max().orElse(1)));
        }
    }

    /** {@code VehicleEngine}. */
    public record Engine(Optional<Fuel> fuel, Optional<Identifier> sound, Optional<Identifier> startSound, Optional<Identifier> horn) {
        static final Codec<Engine> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("fuel", Fuel.CODEC).forGetter(Engine::fuel),
                optional("sound", ID).forGetter(Engine::sound),
                optional("start_sound", ID).forGetter(Engine::startSound),
                optional("horn", ID).forGetter(Engine::horn)).apply(i, Engine::new)), List.of("fuel", "sound", "start_sound", "horn"));
    }

    /** {@code VehicleRepair}. */
    public record Repair(String item, float amount) {
        static final Codec<Repair> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("item", ID_OR_TAG).forGetter(Repair::item),
                required("amount", floatAtLeast(0)).forGetter(Repair::amount)).apply(i, Repair::new)), List.of("item", "amount"));
    }

    /** {@code VehicleHealth}. */
    public record Health(float max, List<Repair> repair, Optional<Float> explodes, List<String> immuneTo) {
        public static final Health DEFAULT = new Health(DEFAULT_MAX_HEALTH, List.of(), Optional.empty(), List.of());

        static final Codec<Health> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("max", floatRange(1, 1024), DEFAULT_MAX_HEALTH).forGetter(Health::max),
                optional("repair", Repair.CODEC.listOf(), List.of()).forGetter(Health::repair),
                optional("explodes", floatRange(0, 8)).forGetter(Health::explodes),
                optional("immune_to", ID_OR_TAG.listOf(), List.of()).forGetter(Health::immuneTo)).apply(i, Health::new)),
                List.of("max", "repair", "explodes", "immune_to"));
    }

    /** {@code VehicleWeaponKey}. */
    public enum WeaponKey {
        FIRE, SECOND;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        static final Codec<WeaponKey> CODEC = MsmCodecs.named("weapon key", values(), WeaponKey::serialName);
    }

    /** {@code VehicleAmmo}. */
    public record Ammo(String item, int perShot, int capacity) {
        static final Codec<Ammo> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("item", ID_OR_TAG).forGetter(Ammo::item),
                optional("per_shot", intAtLeast(1), 1).forGetter(Ammo::perShot),
                optional("capacity", intAtLeast(1), DEFAULT_AMMO_CAPACITY).forGetter(Ammo::capacity)).apply(i, Ammo::new)),
                List.of("item", "per_shot", "capacity"));
    }

    /** {@code VehicleMuzzle}. */
    public record Muzzle(Optional<String> bone, List<Float> offset) {
        static final Codec<Muzzle> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("bone", NAME).forGetter(Muzzle::bone),
                required("offset", floats(-16, 16, 3)).forGetter(Muzzle::offset)).apply(i, Muzzle::new)), List.of("bone", "offset"));
    }

    /** {@code VehicleWeapon} (ADR 0090 D6), fired by B417. */
    public record Weapon(String id, WeaponKey key, Identifier projectile, float speed, float inaccuracy, float damage, int cooldownTicks,
            boolean automatic, Optional<Ammo> ammo, Optional<Muzzle> muzzle, Optional<Identifier> sound, float recoil,
            Optional<String> onFire) {
        static final List<String> KEYS = List.of("id", "key", "projectile", "speed", "inaccuracy", "damage", "cooldown_ticks", "automatic",
                "ammo", "muzzle", "sound", "recoil", "on_fire");

        static final Codec<Weapon> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("id", NAME).forGetter(Weapon::id),
                optional("key", WeaponKey.CODEC, WeaponKey.FIRE).forGetter(Weapon::key),
                required("projectile", ID).forGetter(Weapon::projectile),
                optional("speed", floatRange(0.1f, 5), 1.6f).forGetter(Weapon::speed),
                optional("inaccuracy", floatRange(0, 20), 1f).forGetter(Weapon::inaccuracy),
                optional("damage", floatAtLeast(0), 2f).forGetter(Weapon::damage),
                optional("cooldown_ticks", intRange(1, 1200), 20).forGetter(Weapon::cooldownTicks),
                optional("automatic", Codec.BOOL, false).forGetter(Weapon::automatic),
                optional("ammo", Ammo.CODEC).forGetter(Weapon::ammo),
                optional("muzzle", Muzzle.CODEC).forGetter(Weapon::muzzle),
                optional("sound", ID).forGetter(Weapon::sound),
                optional("recoil", floatRange(0, 1), 0f).forGetter(Weapon::recoil),
                optional("on_fire", Codec.STRING).forGetter(Weapon::onFire)).apply(i, Weapon::new)), KEYS);
    }

    /** {@code VehicleTurret} (ADR 0090 D7), turned by B417. */
    public record Turret(String bone, Optional<String> pitchBone, Optional<List<Float>> yawLimit, Optional<List<Float>> pitchLimit,
            float turnRate, int seat) {
        static final Codec<Turret> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("bone", NAME).forGetter(Turret::bone),
                optional("pitch_bone", NAME).forGetter(Turret::pitchBone),
                optional("yaw_limit", floats(-180, 180, 2)).forGetter(Turret::yawLimit),
                optional("pitch_limit", floats(-90, 90, 2)).forGetter(Turret::pitchLimit),
                optional("turn_rate", floatRange(1, 45), 6f).forGetter(Turret::turnRate),
                optional("seat", intRange(0, MAX_SEATS - 1), 0).forGetter(Turret::seat)).apply(i, Turret::new)),
                List.of("bone", "pitch_bone", "yaw_limit", "pitch_limit", "turn_rate", "seat"));
    }

    /** {@code VehicleParts}: bones the renderer (B418) turns. */
    public record Parts(List<String> wheels, float wheelRadius, List<String> steering, List<String> rotors, List<String> propellers) {
        static final Codec<Parts> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("wheels", NAME.listOf(), List.of()).forGetter(Parts::wheels),
                optional("wheel_radius", floatRange(0.01f, 4), 0.5f).forGetter(Parts::wheelRadius),
                optional("steering", NAME.listOf(), List.of()).forGetter(Parts::steering),
                optional("rotors", NAME.listOf(), List.of()).forGetter(Parts::rotors),
                optional("propellers", NAME.listOf(), List.of()).forGetter(Parts::propellers)).apply(i, Parts::new)),
                List.of("wheels", "wheel_radius", "steering", "rotors", "propellers"));
    }

    /** {@code VehicleStorage}. */
    public record Storage(int rows) {
        static final Codec<Storage> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("rows", intRange(1, 6)).forGetter(Storage::rows)).apply(i, Storage::new)), List.of("rows"));

        public int slots() {
            return rows * 9;
        }
    }

    /** {@code VehiclePlacesOn} (ADR 0090 D5). */
    public enum PlacesOn {
        GROUND, WATER, ANY;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        static final Codec<PlacesOn> CODEC = MsmCodecs.named("places_on", values(), PlacesOn::serialName);
    }

    /** {@code VehicleItem}; {@code places_on} absent is resolved by {@link VehicleDefinition#placesOn()}. */
    public record ItemSettings(Optional<String> name, Optional<Identifier> model, Optional<Identifier> texture, Optional<PlacesOn> placesOn) {
        public static final ItemSettings DEFAULT = new ItemSettings(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty());

        static final Codec<ItemSettings> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                optional("name", Codec.STRING).forGetter(ItemSettings::name),
                optional("model", ID).forGetter(ItemSettings::model),
                optional("texture", ID).forGetter(ItemSettings::texture),
                optional("places_on", PlacesOn.CODEC).forGetter(ItemSettings::placesOn)).apply(i, ItemSettings::new)),
                List.of("name", "model", "texture", "places_on"));
    }

    /** {@code VehicleRamDamage}. */
    public record RamDamage(float damage, float minSpeed) {
        static final Codec<RamDamage> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("damage", floatAtLeast(0)).forGetter(RamDamage::damage),
                optional("min_speed", floatRange(0, 3), 0.2f).forGetter(RamDamage::minSpeed)).apply(i, RamDamage::new)),
                List.of("damage", "min_speed"));
    }

    /** {@code VehicleExhaust}: drawn by the client (B418). */
    public record Exhaust(Identifier particle, List<Float> offset, int everyTicks) {
        static final Codec<Exhaust> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("particle", ID).forGetter(Exhaust::particle),
                required("offset", floats(-16, 16, 3)).forGetter(Exhaust::offset),
                optional("every_ticks", intAtLeast(1), 2).forGetter(Exhaust::everyTicks)).apply(i, Exhaust::new)),
                List.of("particle", "offset", "every_ticks"));
    }

    /** {@code VehicleOnTick}. */
    public record OnTick(String event, int interval) {
        static final Codec<OnTick> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("event", Codec.STRING).forGetter(OnTick::event),
                optional("interval", intAtLeast(1), DEFAULT_TICK_INTERVAL).forGetter(OnTick::interval)).apply(i, OnTick::new)),
                List.of("event", "interval"));
    }

    private static final Codec<Optional<Float>> CAMERA = closed(RecordCodecBuilder.create(i -> i.group(
            optional("distance", floatRange(1, 32)).forGetter((Optional<Float> d) -> d)).apply(i, d -> d)), List.of("distance"));

    /** The first fourteen top-level keys (a record codec takes at most sixteen fields). */
    private record Head(int format, Optional<String> name, Model model, List<Float> size, Movement movement, List<Seat> seats,
            Optional<Engine> engine, Health health, List<Weapon> weapons, Optional<Turret> turret, Optional<Parts> parts,
            Optional<Storage> storage, ItemSettings item, boolean pickUp) {
        static final MapCodec<Head> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("format", intRange(1, 1)).forGetter(Head::format),
                optional("name", Codec.STRING).forGetter(Head::name),
                required("model", Model.CODEC).forGetter(Head::model),
                optional("size", floats(0.1f, 16, 2), List.of(DEFAULT_WIDTH, DEFAULT_HEIGHT)).forGetter(Head::size),
                required("movement", Movement.CODEC).forGetter(Head::movement),
                optional("seats", listOfLength(Seat.CODEC, 1, MAX_SEATS), List.of()).forGetter(Head::seats),
                optional("engine", Engine.CODEC).forGetter(Head::engine),
                optional("health", Health.CODEC, Health.DEFAULT).forGetter(Head::health),
                optional("weapons", listOfLength(Weapon.CODEC, 1, MAX_WEAPONS), List.of()).forGetter(Head::weapons),
                optional("turret", Turret.CODEC).forGetter(Head::turret),
                optional("parts", Parts.CODEC).forGetter(Head::parts),
                optional("storage", Storage.CODEC).forGetter(Head::storage),
                optional("item", ItemSettings.CODEC, ItemSettings.DEFAULT).forGetter(Head::item),
                optional("pick_up", Codec.BOOL, true).forGetter(Head::pickUp)).apply(i, Head::new));
    }

    /** The other ten top-level keys. */
    private record Tail(Optional<RamDamage> ramDamage, Optional<Float> camera, Optional<Exhaust> exhaust, boolean hud, Events events,
            Optional<String> onPlace, Optional<String> onMount, Optional<String> onDismount, Optional<String> onDestroy,
            Optional<OnTick> onTick) {
        static final MapCodec<Tail> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("ram_damage", RamDamage.CODEC).forGetter(Tail::ramDamage),
                optional("camera", CAMERA, Optional.empty()).forGetter(Tail::camera),
                optional("exhaust", Exhaust.CODEC).forGetter(Tail::exhaust),
                optional("hud", Codec.BOOL, true).forGetter(Tail::hud),
                optional("events", Events.CODEC, Events.NONE).forGetter(Tail::events),
                optional("on_place", Codec.STRING).forGetter(Tail::onPlace),
                optional("on_mount", Codec.STRING).forGetter(Tail::onMount),
                optional("on_dismount", Codec.STRING).forGetter(Tail::onDismount),
                optional("on_destroy", Codec.STRING).forGetter(Tail::onDestroy),
                optional("on_tick", OnTick.CODEC).forGetter(Tail::onTick)).apply(i, Tail::new));
    }

    public static final Codec<VehicleDefinition> CODEC = closed(Codec.mapPair(Head.CODEC, Tail.CODEC).codec().xmap(
            p -> of(p.getFirst(), p.getSecond()),
            d -> Pair.of(d.head(), d.tail())), KEYS);

    private static VehicleDefinition of(Head h, Tail t) {
        return new VehicleDefinition(h.name(), h.model(), h.size().get(0), h.size().get(1), h.movement(), h.seats(), h.engine(), h.health(),
                h.weapons(), h.turret(), h.parts(), h.storage(), h.item(), h.pickUp(), t.ramDamage(), t.camera(), t.exhaust(), t.hud(),
                t.events(), t.onPlace(), t.onMount(), t.onDismount(), t.onDestroy(), t.onTick());
    }

    private Head head() {
        return new Head(1, name, model, List.of(width, height), movement, seats, engine, health, weapons, turret, parts, storage, item, pickUp);
    }

    private Tail tail() {
        return new Tail(ramDamage, cameraDistance, exhaust, hud, events, onPlace, onMount, onDismount, onDestroy, onTick);
    }

    /** This definition with other events (the parser drops {@code play_animation}). */
    public VehicleDefinition withEvents(Events events) {
        return new VehicleDefinition(name, model, width, height, movement, seats, engine, health, weapons, turret, parts, storage, item, pickUp,
                ramDamage, cameraDistance, exhaust, hud, events, onPlace, onMount, onDismount, onDestroy, onTick);
    }

    /** The number of seats: the listed ones, or the one default seat. */
    public int seatCount() {
        return seats.isEmpty() ? 1 : seats.size();
    }

    /** Fuel, when the engine needs it; absent means the vehicle drives without fuel. */
    public Optional<Fuel> fuel() {
        return engine.flatMap(Engine::fuel);
    }

    /**
     * Where the item places the vehicle (ADR 0090 D5): {@code item.places_on}, else {@code water} for the {@code water}
     * mode, {@code any} for {@code amphibious} and {@code hover} (it holds its height over water) and {@code ground} for
     * {@code ground} and {@code air}.
     */
    public PlacesOn placesOn() {
        return item.placesOn().orElseGet(() -> switch (movement.mode()) {
            case WATER -> PlacesOn.WATER;
            case AMPHIBIOUS, HOVER -> PlacesOn.ANY;
            case GROUND, AIR -> PlacesOn.GROUND;
        });
    }

    /**
     * The weapon ids fired from seat {@code seat}: the seat's {@code weapons}, else every weapon for the first seat and none
     * for the others (ADR 0090 D2).
     */
    public List<String> weaponsOfSeat(int seat) {
        if (!seats.isEmpty() && seat < seats.size() && seats.get(seat).weapons().isPresent()) {
            return seats.get(seat).weapons().get();
        }
        return seat == 0 ? weapons.stream().map(Weapon::id).toList() : List.of();
    }

    /** The index of the paint {@code id} in {@code model.paints}, or -1. */
    public int paintIndex(String id) {
        for (int i = 0; i < model.paints().size(); i++) {
            if (model.paints().get(i).id().equals(id)) {
                return i;
            }
        }
        return -1;
    }

    /** The index of the weapon {@code id}, or -1. */
    public int weaponIndex(String id) {
        for (int i = 0; i < weapons.size(); i++) {
            if (weapons.get(i).id().equals(id)) {
                return i;
            }
        }
        return -1;
    }

    /** Every event id the definition names outside {@code events}, with where it is named. */
    Stream<String[]> eventReferences() {
        List<String[]> refs = new ArrayList<>();
        onPlace.ifPresent(e -> refs.add(new String[] {"on_place", e}));
        onMount.ifPresent(e -> refs.add(new String[] {"on_mount", e}));
        onDismount.ifPresent(e -> refs.add(new String[] {"on_dismount", e}));
        onDestroy.ifPresent(e -> refs.add(new String[] {"on_destroy", e}));
        onTick.ifPresent(t -> refs.add(new String[] {"on_tick", t.event()}));
        for (int i = 0; i < weapons.size(); i++) {
            int index = i;
            weapons.get(i).onFire().ifPresent(e -> refs.add(new String[] {"weapons[" + index + "].on_fire", e}));
        }
        return refs.stream();
    }
}
