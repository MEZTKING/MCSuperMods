package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.ID_OR_TAG;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * One AI goal of {@code msm:ai_goals}, selected by {@code type} (dispatcher {@code msm:ai_goal} in
 * {@code definition.mcdoc}). Every goal takes an optional {@code priority}; absent means its
 * position in the list. The goals of ADR 0070 D5 ({@code ranged_attack}, {@code tempt}, {@code panic},
 * {@code leap_at_target}) are closed: an unknown key drops the goal with an error naming the key.
 */
public sealed interface Goal {
    Type type();

    /** Explicit priority, lower runs first. */
    Optional<Integer> priority();

    /** Entity types the goal names (targets, threats, leaders); checked after start-up. */
    default List<Identifier> entityTypes() {
        return List.of();
    }

    /** The goal kinds. */
    enum Type {
        WANDER("wander", Wander.CODEC),
        LOOK_AT_PLAYER("look_at_player", LookAtPlayer.CODEC),
        LOOK_AROUND("look_around", LookAround.CODEC),
        MELEE_ATTACK("melee_attack", MeleeAttack.CODEC),
        FLEE("flee", Flee.CODEC),
        FOLLOW("follow", Follow.CODEC),
        RANGED_ATTACK("ranged_attack", RangedAttack.CODEC),
        TEMPT("tempt", Tempt.CODEC),
        PANIC("panic", Panic.CODEC),
        LEAP_AT_TARGET("leap_at_target", LeapAtTarget.CODEC);

        public final String serialName;
        final MapCodec<? extends Goal> codec;

        Type(String serialName, MapCodec<? extends Goal> codec) {
            this.serialName = serialName;
            this.codec = codec;
        }

        public static final Codec<Type> CODEC = MsmCodecs.named("goal type", values(), t -> t.serialName);
    }

    Codec<Goal> CODEC = Type.CODEC.dispatch("type", Goal::type, t -> t.codec);

    private static MapCodec<Optional<Integer>> priorityField() {
        return optional("priority", intAtLeast(0));
    }

    /** {@code WaterAvoidingRandomStrollGoal}, or {@code RandomStrollGoal} when {@code avoid_water} is false. */
    record Wander(Optional<Integer> priority, float speed, boolean avoidWater) implements Goal {
        static final MapCodec<Wander> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(Wander::priority),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(Wander::speed),
                optional("avoid_water", Codec.BOOL, true).forGetter(Wander::avoidWater)).apply(i, Wander::new));

        @Override
        public Type type() {
            return Type.WANDER;
        }
    }

    /** {@code LookAtPlayerGoal}. */
    record LookAtPlayer(Optional<Integer> priority, float distance) implements Goal {
        static final MapCodec<LookAtPlayer> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(LookAtPlayer::priority),
                optional("distance", floatAtLeast(0), 8.0f).forGetter(LookAtPlayer::distance)).apply(i, LookAtPlayer::new));

        @Override
        public Type type() {
            return Type.LOOK_AT_PLAYER;
        }
    }

    /** {@code RandomLookAroundGoal}. */
    record LookAround(Optional<Integer> priority) implements Goal {
        static final MapCodec<LookAround> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(LookAround::priority)).apply(i, LookAround::new));

        @Override
        public Type type() {
            return Type.LOOK_AROUND;
        }
    }

    /** {@code MeleeAttackGoal} plus target goals for the listed types and, with {@code retaliate}, the attacker. */
    record MeleeAttack(Optional<Integer> priority, float speed, List<Identifier> targets, boolean mustSee, boolean retaliate)
            implements Goal {
        static final MapCodec<MeleeAttack> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(MeleeAttack::priority),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(MeleeAttack::speed),
                optional("targets", ID.listOf(), List.of()).forGetter(MeleeAttack::targets),
                optional("must_see", Codec.BOOL, true).forGetter(MeleeAttack::mustSee),
                optional("retaliate", Codec.BOOL, false).forGetter(MeleeAttack::retaliate)).apply(i, MeleeAttack::new));

        @Override
        public Type type() {
            return Type.MELEE_ATTACK;
        }

        @Override
        public List<Identifier> entityTypes() {
            return targets;
        }
    }

    /** {@code AvoidEntityGoal} with a type predicate. */
    record Flee(Optional<Integer> priority, List<Identifier> from, float distance, float speed, float sprintSpeed) implements Goal {
        static final MapCodec<Flee> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(Flee::priority),
                required("from", ID.listOf()).forGetter(Flee::from),
                optional("distance", floatAtLeast(0), 6.0f).forGetter(Flee::distance),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(Flee::speed),
                optional("sprint_speed", floatAtLeast(0), 1.2f).forGetter(Flee::sprintSpeed)).apply(i, Flee::new));

        @Override
        public Type type() {
            return Type.FLEE;
        }

        @Override
        public List<Identifier> entityTypes() {
            return from;
        }
    }

    /** The runtime's {@code FollowTypesGoal}. */
    record Follow(Optional<Integer> priority, List<Identifier> entities, float speed, float stopDistance, float range) implements Goal {
        static final MapCodec<Follow> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(Follow::priority),
                required("entities", ID.listOf()).forGetter(Follow::entities),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(Follow::speed),
                optional("stop_distance", floatAtLeast(0), 2.0f).forGetter(Follow::stopDistance),
                optional("range", floatAtLeast(0), 16.0f).forGetter(Follow::range)).apply(i, Follow::new));

        @Override
        public Type type() {
            return Type.FOLLOW;
        }

        @Override
        public List<Identifier> entityTypes() {
            return entities;
        }
    }

    /** The closed form of a goal's codec: its own keys plus {@code type} and {@code priority}. */
    private static <G extends Goal> MapCodec<G> closed(MapCodec<G> codec, String... keys) {
        List<String> all = new java.util.ArrayList<>(List.of("type", "priority"));
        all.addAll(List.of(keys));
        return MsmCodecs.closedMap(codec, List.copyOf(all));
    }

    /**
     * The runtime's {@code MsmRangedAttackGoal} with the mob's {@code msm:ranged_attack} (ADR 0070 D5; B291), plus target
     * goals as {@code melee_attack}; adds nothing without {@code msm:ranged_attack}.
     */
    record RangedAttack(Optional<Integer> priority, float speed, boolean strafe, List<Identifier> targets, boolean mustSee,
            boolean retaliate) implements Goal {
        static final MapCodec<RangedAttack> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(RangedAttack::priority),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(RangedAttack::speed),
                optional("strafe", Codec.BOOL, false).forGetter(RangedAttack::strafe),
                optional("targets", ID.listOf(), List.of()).forGetter(RangedAttack::targets),
                optional("must_see", Codec.BOOL, true).forGetter(RangedAttack::mustSee),
                optional("retaliate", Codec.BOOL, false).forGetter(RangedAttack::retaliate)).apply(i, RangedAttack::new)),
                "speed", "strafe", "targets", "must_see", "retaliate");

        @Override
        public Type type() {
            return Type.RANGED_ATTACK;
        }

        @Override
        public List<Identifier> entityTypes() {
            return targets;
        }
    }

    /** {@code TemptGoal}: follows players holding one of {@code items} (ids or {@code #}-prefixed item tags). */
    record Tempt(Optional<Integer> priority, List<String> items, float speed, boolean scared) implements Goal {
        static final MapCodec<Tempt> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(Tempt::priority),
                required("items", ID_OR_TAG.listOf()).forGetter(Tempt::items),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(Tempt::speed),
                optional("scared", Codec.BOOL, false).forGetter(Tempt::scared)).apply(i, Tempt::new)),
                "items", "speed", "scared");

        @Override
        public Type type() {
            return Type.TEMPT;
        }
    }

    /** {@code PanicGoal}: runs about when hurt or burning; speed defaults to 1.25. */
    record Panic(Optional<Integer> priority, float speed) implements Goal {
        static final MapCodec<Panic> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(Panic::priority),
                optional("speed", floatAtLeast(0), 1.25f).forGetter(Panic::speed)).apply(i, Panic::new)),
                "speed");

        @Override
        public Type type() {
            return Type.PANIC;
        }
    }

    /** {@code LeapAtTargetGoal}: leaps at the attack target; {@code height} (upward speed) defaults to 0.4. */
    record LeapAtTarget(Optional<Integer> priority, float height) implements Goal {
        static final MapCodec<LeapAtTarget> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(LeapAtTarget::priority),
                optional("height", floatAtLeast(0), 0.4f).forGetter(LeapAtTarget::height)).apply(i, LeapAtTarget::new)),
                "height");

        @Override
        public Type type() {
            return Type.LEAP_AT_TARGET;
        }
    }

    /** Every entity type id named by {@code goals}. */
    static Stream<Identifier> entityTypes(List<Goal> goals) {
        return goals.stream().flatMap(g -> g.entityTypes().stream());
    }
}
