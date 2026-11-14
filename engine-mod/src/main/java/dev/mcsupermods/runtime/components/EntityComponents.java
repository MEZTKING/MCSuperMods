package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
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
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/** Runtime entity components ({@code ::msm::definition::EntityComponents}); {@code msm:animated_model} is required. */
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
        Optional<OnSpawn> onSpawn) {

    public static final List<String> KEYS = List.of("msm:animated_model", "msm:health", "msm:movement", "msm:attack", "msm:ai_goals",
            "msm:on_hurt", "msm:on_death", "msm:on_interact", "msm:on_tick", "msm:on_spawn");

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
            optional("msm:on_spawn", OnSpawn.CODEC).forGetter(EntityComponents::onSpawn))
            .apply(i, EntityComponents::new));

    /** Every event id a component names, with the component for messages. */
    public Stream<String[]> eventReferences() {
        Stream.Builder<String[]> out = Stream.builder();
        attack.flatMap(Attack::onAttack).ifPresent(e -> out.add(new String[] {"msm:attack.on_attack", e.toString()}));
        onHurt.ifPresent(c -> out.add(new String[] {"msm:on_hurt", c.event().toString()}));
        onDeath.ifPresent(c -> out.add(new String[] {"msm:on_death", c.event().toString()}));
        onInteract.ifPresent(c -> out.add(new String[] {"msm:on_interact", c.event().toString()}));
        onTick.ifPresent(c -> out.add(new String[] {"msm:on_tick", c.event().toString()}));
        onSpawn.ifPresent(c -> out.add(new String[] {"msm:on_spawn", c.event().toString()}));
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

    /** Movement attributes; absent means speed 0.25, follow range 16, no knockback resistance, swims, not fire immune. */
    public record Movement(float speed, float followRange, float knockbackResistance, boolean swims, boolean fireImmune) {
        public static final Movement DEFAULT = new Movement(0.25f, 16.0f, 0.0f, true, false);
        public static final Codec<Movement> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("speed", floatAtLeast(0), 0.25f).forGetter(Movement::speed),
                optional("follow_range", floatAtLeast(0), 16.0f).forGetter(Movement::followRange),
                optional("knockback_resistance", floatRange(0, 1), 0.0f).forGetter(Movement::knockbackResistance),
                optional("swims", Codec.BOOL, true).forGetter(Movement::swims),
                optional("fire_immune", Codec.BOOL, false).forGetter(Movement::fireImmune)).apply(i, Movement::new));
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

    /**
     * The GeckoLib model, animations and texture (ADR 0028 D2, ADR 0029). {@code idle}, {@code walk}
     * and {@code attack} name animations in the animation file; absent means none.
     */
    public record AnimatedModel(Identifier model, Optional<Identifier> animations, Identifier texture, float scale, Optional<String> idle,
            Optional<String> walk, Optional<String> attack, int transitionTicks) {
        public static final Codec<AnimatedModel> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("model", ID).forGetter(AnimatedModel::model),
                optional("animations", ID).forGetter(AnimatedModel::animations),
                required("texture", ID).forGetter(AnimatedModel::texture),
                optional("scale", floatAtLeast(0.01f), 1.0f).forGetter(AnimatedModel::scale),
                optional("idle", Codec.STRING).forGetter(AnimatedModel::idle),
                optional("walk", Codec.STRING).forGetter(AnimatedModel::walk),
                optional("attack", Codec.STRING).forGetter(AnimatedModel::attack),
                optional("transition_ticks", intAtLeast(0), 0).forGetter(AnimatedModel::transitionTicks)).apply(i, AnimatedModel::new));
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
}
