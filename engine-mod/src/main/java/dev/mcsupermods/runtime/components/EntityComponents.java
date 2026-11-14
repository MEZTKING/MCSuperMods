package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.FLOAT;
import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.ID_OR_TAG;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.Dynamic;
import com.mojang.serialization.JsonOps;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * Runtime entity components ({@code ::msm::definition::EntityComponents}); {@code msm:animated_model} is required. The
 * mob components of ADR 0070 and ADR 0071 ({@code msm:ranged_attack}, {@code msm:tameable}, {@code msm:breedable},
 * {@code msm:rideable}, {@code msm:variants}, {@code msm:boss_bar}) are closed structs, as the trigger structs of
 * ADR 0061: an unknown key is an error naming the key. {@code msm:movement} and {@code msm:animated_model} stay open, as
 * before (older runtimes ignore their new fields).
 */
public record EntityComponents(
        AnimatedModel animatedModel,
        Optional<Health> health,
        Optional<Movement> movement,
        Optional<Attack> attack,
        Optional<AiGoals> aiGoals,
        Optional<OnHurt> onHurt,
        Optional<OnDeath> onDeath,
        Optional<BlockComponents.OnInteract> onInteract,
        Optional<OnTick> onTick,
        Optional<OnSpawn> onSpawn,
        Optional<RangedAttack> rangedAttack,
        Optional<Tameable> tameable,
        Optional<Breedable> breedable,
        Optional<Rideable> rideable,
        Optional<Variants> variants,
        Optional<BossBar> bossBar) {

    public static final List<String> KEYS = List.of("msm:animated_model", "msm:health", "msm:movement", "msm:attack", "msm:ai_goals",
            "msm:on_hurt", "msm:on_death", "msm:on_interact", "msm:on_tick", "msm:on_spawn", "msm:ranged_attack", "msm:tameable",
            "msm:breedable", "msm:rideable", "msm:variants", "msm:boss_bar");

    /** Components that need {@code base} {@code animal} (ADR 0071 D1, D2). */
    public static final List<String> ANIMAL_ONLY = List.of("msm:tameable", "msm:breedable");

    public static final Codec<EntityComponents> CODEC = RecordCodecBuilder.create(i -> i.group(
            required("msm:animated_model", AnimatedModel.CODEC).forGetter(EntityComponents::animatedModel),
            optional("msm:health", Health.CODEC).forGetter(EntityComponents::health),
            optional("msm:movement", Movement.CODEC).forGetter(EntityComponents::movement),
            optional("msm:attack", Attack.CODEC).forGetter(EntityComponents::attack),
            optional("msm:ai_goals", AiGoals.CODEC).forGetter(EntityComponents::aiGoals),
            optional("msm:on_hurt", OnHurt.CODEC).forGetter(EntityComponents::onHurt),
            optional("msm:on_death", OnDeath.CODEC).forGetter(EntityComponents::onDeath),
            optional("msm:on_interact", BlockComponents.OnInteract.CODEC).forGetter(EntityComponents::onInteract),
            optional("msm:on_tick", OnTick.CODEC).forGetter(EntityComponents::onTick),
            optional("msm:on_spawn", OnSpawn.CODEC).forGetter(EntityComponents::onSpawn),
            optional("msm:ranged_attack", RangedAttack.CODEC).forGetter(EntityComponents::rangedAttack),
            optional("msm:tameable", Tameable.CODEC).forGetter(EntityComponents::tameable),
            optional("msm:breedable", Breedable.CODEC).forGetter(EntityComponents::breedable),
            optional("msm:rideable", Rideable.CODEC).forGetter(EntityComponents::rideable),
            optional("msm:variants", Variants.CODEC).forGetter(EntityComponents::variants),
            optional("msm:boss_bar", BossBar.CODEC).forGetter(EntityComponents::bossBar))
            .apply(i, EntityComponents::new));

    /** The keys of {@link #ANIMAL_ONLY} present here. */
    public List<String> animalOnlyPresent() {
        List<String> out = new ArrayList<>();
        tameable.ifPresent(t -> out.add("msm:tameable"));
        breedable.ifPresent(b -> out.add("msm:breedable"));
        return out;
    }

    /** A copy without {@code msm:tameable} and {@code msm:breedable} (dropped on a base other than {@code animal}). */
    public EntityComponents withoutAnimalOnly() {
        return new EntityComponents(animatedModel, health, movement, attack, aiGoals, onHurt, onDeath, onInteract, onTick, onSpawn,
                rangedAttack, Optional.empty(), Optional.empty(), rideable, variants, bossBar);
    }

    /** Every event id a component names, with the component for messages. */
    public Stream<String[]> eventReferences() {
        Stream.Builder<String[]> out = Stream.builder();
        attack.flatMap(Attack::onAttack).ifPresent(e -> out.add(new String[] {"msm:attack.on_attack", e.toString()}));
        onHurt.ifPresent(c -> out.add(new String[] {"msm:on_hurt", c.event().toString()}));
        onDeath.ifPresent(c -> out.add(new String[] {"msm:on_death", c.event().toString()}));
        onInteract.ifPresent(c -> out.add(new String[] {"msm:on_interact", c.event().toString()}));
        onTick.ifPresent(c -> out.add(new String[] {"msm:on_tick", c.event().toString()}));
        onSpawn.ifPresent(c -> out.add(new String[] {"msm:on_spawn", c.event().toString()}));
        rangedAttack.flatMap(RangedAttack::onShoot).ifPresent(e -> out.add(new String[] {"msm:ranged_attack.on_shoot", e.toString()}));
        tameable.flatMap(Tameable::onTame).ifPresent(e -> out.add(new String[] {"msm:tameable.on_tame", e.toString()}));
        breedable.flatMap(Breedable::onBreed).ifPresent(e -> out.add(new String[] {"msm:breedable.on_breed", e.toString()}));
        rideable.flatMap(Rideable::onMount).ifPresent(e -> out.add(new String[] {"msm:rideable.on_mount", e.toString()}));
        return out.build();
    }

    /** The goals that decoded, in list order. */
    public List<Goal> goals() {
        return aiGoals.map(AiGoals::goals).orElse(List.of());
    }

    /** One message per dropped goal. */
    public List<String> goalErrors() {
        return aiGoals.map(AiGoals::errors).orElse(List.of());
    }

    public double maxHealth() {
        return health.map(Health::max).orElse(20.0f);
    }

    public Movement movementOrDefault() {
        return movement.orElse(Movement.DEFAULT);
    }

    /** Maximum health in half hearts; absent means 20. */
    public record Health(float max) {
        public static final Codec<Health> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("max", floatAtLeast(1)).forGetter(Health::max)).apply(i, Health::new));
    }

    /** How a mob moves ({@code ::msm::definition::MovementMode}, ADR 0070 D3). */
    public enum MovementMode {
        WALK, FLY, SWIM, AMPHIBIOUS;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<MovementMode> CODEC = MsmCodecs.named("movement mode", values(), MovementMode::serialName);
    }

    /** The {@code flying_speed} default (ADR 0070 D3: a parrot's; a bee's is 0.6). */
    public static final float DEFAULT_FLYING_SPEED = 0.4f;
    /** The {@code dry_out_ticks} default (ADR 0070 D3: vanilla's water animals; verify at implementation). */
    public static final int DEFAULT_DRY_OUT_TICKS = 300;

    /**
     * Movement attributes; absent means speed 0.25, follow range 16, no knockback resistance, swims, not fire immune and
     * walking (ADR 0070 D3: {@code mode}, {@code flying_speed} 0.4, {@code hovers} true, {@code breathes_air} false,
     * {@code dry_out_ticks} 300, {@code step_height} absent keeps vanilla's 0.6). Open, as before: unknown keys pass.
     */
    public record Movement(float speed, float followRange, float knockbackResistance, boolean swims, boolean fireImmune,
            MovementMode mode, float flyingSpeed, boolean hovers, boolean breathesAir, int dryOutTicks, Optional<Float> stepHeight) {
        public static final Movement DEFAULT = new Movement(0.25f, 16.0f, 0.0f, true, false, MovementMode.WALK, DEFAULT_FLYING_SPEED, true,
                false, DEFAULT_DRY_OUT_TICKS, Optional.empty());
        public static final Codec<Movement> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("speed", floatAtLeast(0), 0.25f).forGetter(Movement::speed),
                optional("follow_range", floatAtLeast(0), 16.0f).forGetter(Movement::followRange),
                optional("knockback_resistance", floatRange(0, 1), 0.0f).forGetter(Movement::knockbackResistance),
                optional("swims", Codec.BOOL, true).forGetter(Movement::swims),
                optional("fire_immune", Codec.BOOL, false).forGetter(Movement::fireImmune),
                optional("mode", MovementMode.CODEC, MovementMode.WALK).forGetter(Movement::mode),
                optional("flying_speed", floatAtLeast(0), DEFAULT_FLYING_SPEED).forGetter(Movement::flyingSpeed),
                optional("hovers", Codec.BOOL, true).forGetter(Movement::hovers),
                optional("breathes_air", Codec.BOOL, false).forGetter(Movement::breathesAir),
                optional("dry_out_ticks", intAtLeast(20), DEFAULT_DRY_OUT_TICKS).forGetter(Movement::dryOutTicks),
                optional("step_height", floatRange(0, 10)).forGetter(Movement::stepHeight)).apply(i, Movement::new));
    }

    /** Melee attack attributes; absent means no melee attacks. */
    public record Attack(float damage, float knockback, Optional<Identifier> onAttack) {
        public static final Codec<Attack> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("damage", floatAtLeast(0)).forGetter(Attack::damage),
                optional("knockback", floatAtLeast(0), 0.0f).forGetter(Attack::knockback),
                optional("on_attack", ID).forGetter(Attack::onAttack)).apply(i, Attack::new));
    }

    /**
     * {@code msm:ai_goals}. Each goal decodes on its own, as events do (ADR 0025 D4): a goal that
     * fails (an unknown type from a newer format, a bad field) is dropped with an error and the
     * entity registers with the others.
     */
    public record AiGoals(List<Goal> goals, List<String> errors) {
        private static final Codec<AiGoals> LIST = Codec.PASSTHROUGH.listOf().xmap(AiGoals::decodeEach, AiGoals::encodeEach);
        public static final Codec<AiGoals> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("goals", LIST).forGetter(g -> g)).apply(i, g -> g));

        private static AiGoals decodeEach(List<Dynamic<?>> raw) {
            List<Goal> goals = new ArrayList<>();
            List<String> errors = new ArrayList<>();
            for (int n = 0; n < raw.size(); n++) {
                DataResult<Goal> result = Goal.CODEC.parse(raw.get(n));
                result.result().ifPresent(goals::add);
                int index = n;
                result.error().ifPresent(e -> errors.add("components: msm:ai_goals: goals[" + index + "]: " + e.message() + "; goal dropped"));
            }
            return new AiGoals(List.copyOf(goals), List.copyOf(errors));
        }

        private static List<Dynamic<?>> encodeEach(AiGoals goals) {
            List<Dynamic<?>> out = new ArrayList<>();
            for (Goal goal : goals.goals) {
                JsonElement json = Goal.CODEC.encodeStart(JsonOps.INSTANCE, goal).getOrThrow();
                out.add(new Dynamic<>(JsonOps.INSTANCE, json));
            }
            return out;
        }
    }

    /** Which renderer draws the entity ({@code ::msm::definition::EntityRenderer}, ADR 0072 D4). */
    public enum Renderer {
        /** GeckoLib when it is loaded, the runtime's vanilla renderer otherwise. */
        AUTO,
        /** GeckoLib only: without GeckoLib the entity does not register. */
        GECKOLIB,
        /** The runtime's vanilla renderer, never GeckoLib. */
        VANILLA;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Renderer> CODEC = MsmCodecs.named("entity renderer", values(), Renderer::serialName);
    }

    /**
     * The model, animations and texture (ADR 0028 D2, ADR 0029); the GeckoLib resources serve both renderers (ADR 0072
     * D1). {@code idle}, {@code walk}, {@code attack} and the state animations {@code sit}, {@code fly}, {@code swim} and
     * {@code shoot} (ADR 0071 D6) name animations in the animation file; absent means none. {@code renderer} defaults to
     * {@code auto}.
     */
    public record AnimatedModel(Identifier model, Optional<Identifier> animations, Identifier texture, float scale, Optional<String> idle,
            Optional<String> walk, Optional<String> attack, int transitionTicks, Renderer renderer, Optional<String> sit,
            Optional<String> fly, Optional<String> swim, Optional<String> shoot) {
        public static final Codec<AnimatedModel> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("model", ID).forGetter(AnimatedModel::model),
                optional("animations", ID).forGetter(AnimatedModel::animations),
                required("texture", ID).forGetter(AnimatedModel::texture),
                optional("scale", floatAtLeast(0.01f), 1.0f).forGetter(AnimatedModel::scale),
                optional("idle", Codec.STRING).forGetter(AnimatedModel::idle),
                optional("walk", Codec.STRING).forGetter(AnimatedModel::walk),
                optional("attack", Codec.STRING).forGetter(AnimatedModel::attack),
                optional("transition_ticks", intAtLeast(0), 0).forGetter(AnimatedModel::transitionTicks),
                optional("renderer", Renderer.CODEC, Renderer.AUTO).forGetter(AnimatedModel::renderer),
                optional("sit", Codec.STRING).forGetter(AnimatedModel::sit),
                optional("fly", Codec.STRING).forGetter(AnimatedModel::fly),
                optional("swim", Codec.STRING).forGetter(AnimatedModel::swim),
                optional("shoot", Codec.STRING).forGetter(AnimatedModel::shoot)).apply(i, AnimatedModel::new));
    }

    /** Fires an event after the entity takes damage and survives. */
    public record OnHurt(Identifier event) {
        public static final Codec<OnHurt> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnHurt::event)).apply(i, OnHurt::new));
    }

    /** Fires an event when the entity dies. */
    public record OnDeath(Identifier event) {
        public static final Codec<OnDeath> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnDeath::event)).apply(i, OnDeath::new));
    }

    /**
     * Fires an event every {@code interval_ticks} while the mob's AI runs ({@code customServerAiStep}, ADR 0061 D3;
     * {@code OnEntityTick}, not the effect's {@code msm:on_tick}). Closed, as every trigger struct.
     */
    public record OnTick(Identifier event, int intervalTicks) {
        public static final Codec<OnTick> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnTick::event),
                optional("interval_ticks", intAtLeast(ItemComponents.MIN_INTERVAL_TICKS), ItemComponents.DEFAULT_INTERVAL_TICKS)
                        .forGetter(OnTick::intervalTicks)).apply(i, OnTick::new)), List.of("event", "interval_ticks"));
    }

    /** Fires an event once when the mob spawns ({@code finalizeSpawn}: natural, egg, spawner; not on chunk load; ADR 0061 D3). */
    public record OnSpawn(Identifier event) {
        public static final Codec<OnSpawn> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnSpawn::event)).apply(i, OnSpawn::new)), List.of("event"));
    }

    /**
     * {@code msm:ranged_attack} (ADR 0070 D4), used by the {@code ranged_attack} goal as {@code msm:attack} is by
     * {@code melee_attack}; defaults copy a skeleton: damage 2, speed 1.6, inaccuracy 6, interval 40, charge 20, range 15.
     * Whether {@code projectile} is a vanilla projectile item or a project throwable is known only once items register
     * (B291).
     */
    public record RangedAttack(Identifier projectile, float damage, float speed, float inaccuracy, int intervalTicks, int chargeTicks,
            float range, Identifier sound, Optional<Identifier> onShoot) {
        /** The sound default (ADR 0070 D4: a skeleton's); here, not in the outer class, which initialises after. */
        public static final Identifier DEFAULT_SOUND = Identifier.withDefaultNamespace("entity.skeleton.shoot");
        public static final List<String> KEYS = List.of("projectile", "damage", "speed", "inaccuracy", "interval_ticks", "charge_ticks",
                "range", "sound", "on_shoot");
        public static final Codec<RangedAttack> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("projectile", ID).forGetter(RangedAttack::projectile),
                optional("damage", floatAtLeast(0), 2.0f).forGetter(RangedAttack::damage),
                optional("speed", floatRange(0.1f, 5.0f), 1.6f).forGetter(RangedAttack::speed),
                optional("inaccuracy", floatRange(0, 20), 6.0f).forGetter(RangedAttack::inaccuracy),
                optional("interval_ticks", intAtLeast(5), 40).forGetter(RangedAttack::intervalTicks),
                optional("charge_ticks", intRange(0, 200), 20).forGetter(RangedAttack::chargeTicks),
                optional("range", floatRange(1, 64), 15.0f).forGetter(RangedAttack::range),
                optional("sound", ID, DEFAULT_SOUND).forGetter(RangedAttack::sound),
                optional("on_shoot", ID).forGetter(RangedAttack::onShoot)).apply(i, RangedAttack::new)), KEYS);
    }

    /** How a tamed mob follows its owner (vanilla {@code FollowOwnerGoal}); defaults a wolf's: speed 1, start 10, stop 2. */
    public record TameableFollow(float speed, float startDistance, float stopDistance) {
        public static final TameableFollow DEFAULT = new TameableFollow(1.0f, 10.0f, 2.0f);
        public static final List<String> KEYS = List.of("speed", "start_distance", "stop_distance");
        public static final Codec<TameableFollow> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("speed", floatAtLeast(0), 1.0f).forGetter(TameableFollow::speed),
                optional("start_distance", floatAtLeast(0), 10.0f).forGetter(TameableFollow::startDistance),
                optional("stop_distance", floatAtLeast(0), 2.0f).forGetter(TameableFollow::stopDistance))
                .apply(i, TameableFollow::new)), KEYS);
    }

    /**
     * {@code msm:tameable} (ADR 0071 D1); needs {@code base} {@code animal} ({@code DefinitionParser} drops it otherwise).
     * {@code items} are item ids or {@code #}-prefixed item tags, kept as written.
     */
    public record Tameable(List<String> items, float chance, boolean sit, boolean followsOwner, TameableFollow follow,
            boolean defendsOwner, Optional<Float> tamedHealth, Optional<Identifier> onTame) {
        public static final List<String> KEYS = List.of("items", "chance", "sit", "follows_owner", "follow", "defends_owner",
                "tamed_health", "on_tame");
        public static final Codec<Tameable> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("items", ID_OR_TAG.listOf()).forGetter(Tameable::items),
                optional("chance", floatRange(0, 1), 0.33f).forGetter(Tameable::chance),
                optional("sit", Codec.BOOL, true).forGetter(Tameable::sit),
                optional("follows_owner", Codec.BOOL, true).forGetter(Tameable::followsOwner),
                optional("follow", TameableFollow.CODEC, TameableFollow.DEFAULT).forGetter(Tameable::follow),
                optional("defends_owner", Codec.BOOL, true).forGetter(Tameable::defendsOwner),
                optional("tamed_health", floatAtLeast(1)).forGetter(Tameable::tamedHealth),
                optional("on_tame", ID).forGetter(Tameable::onTame)).apply(i, Tameable::new)), KEYS);
    }

    /** {@code msm:breedable} (ADR 0071 D2); needs {@code base} {@code animal}. Defaults: baby scale 0.5, 24000 ticks to grow. */
    public record Breedable(List<String> items, float babyScale, int growUpTicks, boolean tempted, boolean followParents,
            Optional<Identifier> onBreed) {
        public static final List<String> KEYS = List.of("items", "baby_scale", "grow_up_ticks", "tempted", "follow_parents", "on_breed");
        public static final Codec<Breedable> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("items", ID_OR_TAG.listOf()).forGetter(Breedable::items),
                optional("baby_scale", floatRange(0.1f, 1.0f), 0.5f).forGetter(Breedable::babyScale),
                optional("grow_up_ticks", intAtLeast(1), 24000).forGetter(Breedable::growUpTicks),
                optional("tempted", Codec.BOOL, true).forGetter(Breedable::tempted),
                optional("follow_parents", Codec.BOOL, true).forGetter(Breedable::followParents),
                optional("on_breed", ID).forGetter(Breedable::onBreed)).apply(i, Breedable::new)), KEYS);
    }

    /** Who may steer a ridden mob ({@code ::msm::definition::RideControl}). */
    public enum RideControl {
        ANYONE, OWNER;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<RideControl> CODEC = MsmCodecs.named("ride control", values(), RideControl::serialName);
    }

    /**
     * {@code msm:rideable} (ADR 0071 D3), any base. Defaults: saddle needed, anyone steers, speed 1, no jump, one rider,
     * the seat on top of the hitbox ({@code riderOffset} empty).
     */
    public record Rideable(boolean saddle, RideControl controlledBy, float speed, float jump, int passengers,
            Optional<List<Float>> riderOffset, Optional<String> saddleBone, Optional<Identifier> onMount) {
        public static final List<String> KEYS = List.of("saddle", "controlled_by", "speed", "jump", "passengers", "rider_offset",
                "saddle_bone", "on_mount");
        public static final Codec<Rideable> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("saddle", Codec.BOOL, true).forGetter(Rideable::saddle),
                optional("controlled_by", RideControl.CODEC, RideControl.ANYONE).forGetter(Rideable::controlledBy),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(Rideable::speed),
                optional("jump", floatAtLeast(0), 0.0f).forGetter(Rideable::jump),
                optional("passengers", intRange(1, 4), 1).forGetter(Rideable::passengers),
                optional("rider_offset", listOfLength(FLOAT, 3, 3)).forGetter(Rideable::riderOffset),
                optional("saddle_bone", Codec.STRING).forGetter(Rideable::saddleBone),
                optional("on_mount", ID).forGetter(Rideable::onMount)).apply(i, Rideable::new)), KEYS);
    }

    /** How a variant is picked ({@code ::msm::definition::VariantChoice}). */
    public enum VariantChoice {
        RANDOM, BIOME;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<VariantChoice> CODEC = MsmCodecs.named("variant choice", values(), VariantChoice::serialName);
    }

    /** One texture variant; {@code biomes} are biome ids or {@code #}-prefixed biome tags, kept as written. */
    public record Variant(String id, Identifier texture, int weight, List<String> biomes) {
        public static final List<String> KEYS = List.of("id", "texture", "weight", "biomes");
        public static final Codec<Variant> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("id", Codec.STRING).forGetter(Variant::id),
                required("texture", ID).forGetter(Variant::texture),
                optional("weight", intAtLeast(1), 1).forGetter(Variant::weight),
                optional("biomes", ID_OR_TAG.listOf(), List.of()).forGetter(Variant::biomes)).apply(i, Variant::new)), KEYS);
    }

    /** {@code msm:variants} (ADR 0071 D4): one to 32 variants, picked at random unless {@code choose} is {@code biome}. */
    public record Variants(VariantChoice choose, List<Variant> variants) {
        public static final List<String> KEYS = List.of("choose", "variants");
        public static final Codec<Variants> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("choose", VariantChoice.CODEC, VariantChoice.RANDOM).forGetter(Variants::choose),
                required("variants", listOfLength(Variant.CODEC, 1, 32)).forGetter(Variants::variants)).apply(i, Variants::new)), KEYS);
    }

    /** {@code BossEvent.BossBarColor} in lower case ({@code ::msm::definition::BossBarColour}). */
    public enum BossBarColour {
        PINK, BLUE, RED, GREEN, YELLOW, PURPLE, WHITE;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<BossBarColour> CODEC = MsmCodecs.named("boss bar colour", values(), BossBarColour::serialName);
    }

    /** {@code BossEvent.BossBarOverlay} in lower case ({@code ::msm::definition::BossBarOverlay}). */
    public enum BossBarOverlay {
        PROGRESS, NOTCHED_6, NOTCHED_10, NOTCHED_12, NOTCHED_20;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<BossBarOverlay> CODEC = MsmCodecs.named("boss bar overlay", values(), BossBarOverlay::serialName);
    }

    /**
     * {@code msm:boss_bar} (ADR 0071 D5): purple progress bar by default, no darkened sky, fog or music; {@code range}
     * empty means every player tracking the mob. The registrar gives the type a client tracking range of 10 chunks.
     */
    public record BossBar(BossBarColour colour, BossBarOverlay overlay, boolean darkenSky, boolean fog, boolean music,
            Optional<Float> range) {
        public static final List<String> KEYS = List.of("colour", "overlay", "darken_sky", "fog", "music", "range");
        public static final Codec<BossBar> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("colour", BossBarColour.CODEC, BossBarColour.PURPLE).forGetter(BossBar::colour),
                optional("overlay", BossBarOverlay.CODEC, BossBarOverlay.PROGRESS).forGetter(BossBar::overlay),
                optional("darken_sky", Codec.BOOL, false).forGetter(BossBar::darkenSky),
                optional("fog", Codec.BOOL, false).forGetter(BossBar::fog),
                optional("music", Codec.BOOL, false).forGetter(BossBar::music),
                optional("range", floatRange(8, 256)).forGetter(BossBar::range)).apply(i, BossBar::new)), KEYS);
    }
}
