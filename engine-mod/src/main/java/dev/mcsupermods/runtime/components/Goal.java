package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.ID_OR_TAG;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
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
 * {@code leap_at_target}) are closed: an unknown key drops the goal with an error naming the key. So are the goals of
 * ADR 0109 D3, D4 ({@code swoop}, {@code roost}, {@code collect_items}, {@code dig_items}, {@code play_dead},
 * {@code barter}; B527's format, built by B532: until then {@code MobGoals} adds nothing for them).
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
        LEAP_AT_TARGET("leap_at_target", LeapAtTarget.CODEC),
        SWOOP("swoop", Swoop.CODEC),
        ROOST("roost", Roost.CODEC),
        COLLECT_ITEMS("collect_items", CollectItems.CODEC),
        DIG_ITEMS("dig_items", DigItems.CODEC),
        PLAY_DEAD("play_dead", PlayDead.CODEC),
        BARTER("barter", Barter.CODEC);

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

    /**
     * Circles {@code height} blocks above its target, then dives at it with the mob's {@code msm:attack}, as a phantom
     * (ADR 0109 D3). Speed 1, height 2 to 32 (default 12, verify at implementation), targets and the two flags as
     * {@code melee_attack}.
     */
    record Swoop(Optional<Integer> priority, float speed, float height, List<Identifier> targets, boolean mustSee, boolean retaliate)
            implements Goal {
        public static final float DEFAULT_HEIGHT = 12.0f;
        static final MapCodec<Swoop> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(Swoop::priority),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(Swoop::speed),
                optional("height", floatRange(2.0f, 32.0f), DEFAULT_HEIGHT).forGetter(Swoop::height),
                optional("targets", ID.listOf(), List.of()).forGetter(Swoop::targets),
                optional("must_see", Codec.BOOL, true).forGetter(Swoop::mustSee),
                optional("retaliate", Codec.BOOL, false).forGetter(Swoop::retaliate)).apply(i, Swoop::new)),
                "speed", "height", "targets", "must_see", "retaliate");

        @Override
        public Type type() {
            return Type.SWOOP;
        }

        @Override
        public List<Identifier> entityTypes() {
            return targets;
        }
    }

    /**
     * Hangs upside down under a block, as a bat (ADR 0109 D3 as amended: one synced flag). {@code daylight} default true,
     * {@code when_idle} default false, {@code range} 1 to 16 (default 8).
     */
    record Roost(Optional<Integer> priority, boolean daylight, boolean whenIdle, int range) implements Goal {
        static final MapCodec<Roost> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(Roost::priority),
                optional("daylight", Codec.BOOL, true).forGetter(Roost::daylight),
                optional("when_idle", Codec.BOOL, false).forGetter(Roost::whenIdle),
                optional("range", intRange(1, 16), 8).forGetter(Roost::range)).apply(i, Roost::new)),
                "daylight", "when_idle", "range");

        @Override
        public Type type() {
            return Type.ROOST;
        }
    }

    /**
     * Brings items like the one it was given to its owner or a note block it heard, as an allay (ADR 0109 D4). Speed 1,
     * {@code range} 1 to 64 (default 32), {@code note_blocks} default true.
     */
    record CollectItems(Optional<Integer> priority, float speed, float range, boolean noteBlocks) implements Goal {
        static final MapCodec<CollectItems> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(CollectItems::priority),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(CollectItems::speed),
                optional("range", floatRange(1.0f, 64.0f), 32.0f).forGetter(CollectItems::range),
                optional("note_blocks", Codec.BOOL, true).forGetter(CollectItems::noteBlocks)).apply(i, CollectItems::new)),
                "speed", "range", "note_blocks");

        @Override
        public Type type() {
            return Type.COLLECT_ITEMS;
        }
    }

    /**
     * Digs on its {@code dig_blocks} (1 to 64 ids or {@code #}-prefixed tags) and drops a roll of {@code loot_table}, as a
     * sniffer (ADR 0109 D4). {@code interval_ticks} at least 20 (default 240, verify at implementation), speed 1.
     */
    record DigItems(Optional<Integer> priority, List<String> digBlocks, Identifier lootTable, int intervalTicks, float speed)
            implements Goal {
        public static final int DEFAULT_INTERVAL_TICKS = 240;
        static final MapCodec<DigItems> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(DigItems::priority),
                required("dig_blocks", listOfLength(ID_OR_TAG, 1, 64)).forGetter(DigItems::digBlocks),
                required("loot_table", ID).forGetter(DigItems::lootTable),
                optional("interval_ticks", intAtLeast(20), DEFAULT_INTERVAL_TICKS).forGetter(DigItems::intervalTicks),
                optional("speed", floatAtLeast(0), 1.0f).forGetter(DigItems::speed)).apply(i, DigItems::new)),
                "dig_blocks", "loot_table", "interval_ticks", "speed");

        @Override
        public Type type() {
            return Type.DIG_ITEMS;
        }
    }

    /**
     * Plays dead when hurt below {@code below_health} of its maximum health (0.01 to 1, default 0.5, verify at
     * implementation), for {@code ticks} (20 to 1200, default 200), regenerating unless {@code regenerates} is false, as an
     * axolotl (ADR 0109 D4).
     */
    record PlayDead(Optional<Integer> priority, float belowHealth, int ticks, boolean regenerates) implements Goal {
        public static final float DEFAULT_BELOW_HEALTH = 0.5f;
        public static final int DEFAULT_TICKS = 200;
        static final MapCodec<PlayDead> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(PlayDead::priority),
                optional("below_health", floatRange(0.01f, 1.0f), DEFAULT_BELOW_HEALTH).forGetter(PlayDead::belowHealth),
                optional("ticks", intRange(20, 1200), DEFAULT_TICKS).forGetter(PlayDead::ticks),
                optional("regenerates", Codec.BOOL, true).forGetter(PlayDead::regenerates)).apply(i, PlayDead::new)),
                "below_health", "ticks", "regenerates");

        @Override
        public Type type() {
            return Type.PLAY_DEAD;
        }
    }

    /**
     * Takes {@code item} (an id or {@code #}-prefixed tag) and after {@code ticks} (1 to 1200, default 120) drops a roll of
     * {@code loot_table}, as a piglin (ADR 0109 D4 as amended: the {@code barter} loot context with the mob only).
     * {@code from_ground} default true.
     */
    record Barter(Optional<Integer> priority, String item, Identifier lootTable, int ticks, boolean fromGround) implements Goal {
        public static final int DEFAULT_TICKS = 120;
        static final MapCodec<Barter> CODEC = closed(RecordCodecBuilder.mapCodec(i -> i.group(
                priorityField().forGetter(Barter::priority),
                required("item", ID_OR_TAG).forGetter(Barter::item),
                required("loot_table", ID).forGetter(Barter::lootTable),
                optional("ticks", intRange(1, 1200), DEFAULT_TICKS).forGetter(Barter::ticks),
                optional("from_ground", Codec.BOOL, true).forGetter(Barter::fromGround)).apply(i, Barter::new)),
                "item", "loot_table", "ticks", "from_ground");

        @Override
        public Type type() {
            return Type.BARTER;
        }
    }

    /** Every entity type id named by {@code goals}. */
    static Stream<Identifier> entityTypes(List<Goal> goals) {
        return goals.stream().flatMap(g -> g.entityTypes().stream());
    }
}
