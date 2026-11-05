package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
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
 * position in the list.
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
        FOLLOW("follow", Follow.CODEC);

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

    /** Every entity type id named by {@code goals}. */
    static Stream<Identifier> entityTypes(List<Goal> goals) {
        return goals.stream().flatMap(g -> g.entityTypes().stream());
    }
}
