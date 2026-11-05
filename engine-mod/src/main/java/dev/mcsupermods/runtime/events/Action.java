package dev.mcsupermods.runtime.events;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * One action of an event (ADR 0025 D4), selected by {@code type}. Mirrors {@code action.mcdoc}.
 */
public sealed interface Action {
    Type type();

    /** The action kinds; an unknown kind is a load-time error for its event. */
    enum Type {
        RUN_FUNCTION("run_function", RunFunction.CODEC),
        SPAWN_PARTICLE("spawn_particle", SpawnParticle.CODEC),
        SET_BLOCK_STATE("set_block_state", SetBlockState.CODEC),
        GIVE_ITEM("give_item", GiveItem.CODEC),
        PLAY_SOUND("play_sound", PlaySound.CODEC),
        TRIGGER_EVENT("trigger_event", TriggerEvent.CODEC),
        PLAY_ANIMATION("play_animation", PlayAnimation.CODEC),
        RUN_SCRIPT("run_script", RunScript.CODEC),
        APPLY_EFFECT("apply_effect", ApplyEffect.CODEC);

        public final String serialName;
        final MapCodec<? extends Action> codec;

        Type(String serialName, MapCodec<? extends Action> codec) {
            this.serialName = serialName;
            this.codec = codec;
        }

        public static final Codec<Type> CODEC = MsmCodecs.named("action type", values(), t -> t.serialName);
    }

    Codec<Action> CODEC = Type.CODEC.dispatch("type", Action::type, t -> t.codec);

    /** Runs a data pack function at the event position, as the player when there is one, with permission level 2. */
    record RunFunction(Identifier function) implements Action {
        static final MapCodec<RunFunction> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("function", ID).forGetter(RunFunction::function)).apply(i, RunFunction::new));

        @Override
        public Type type() {
            return Type.RUN_FUNCTION;
        }
    }

    /** Server-side particles at the block centre or the player's position. */
    record SpawnParticle(Identifier particle, int count, float spread, float speed) implements Action {
        static final MapCodec<SpawnParticle> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("particle", ID).forGetter(SpawnParticle::particle),
                optional("count", intAtLeast(1), 1).forGetter(SpawnParticle::count),
                optional("spread", floatAtLeast(0), 0.0f).forGetter(SpawnParticle::spread),
                optional("speed", floatAtLeast(0), 0.0f).forGetter(SpawnParticle::speed)).apply(i, SpawnParticle::new));

        @Override
        public Type type() {
            return Type.SPAWN_PARTICLE;
        }
    }

    /** Places a block state at an offset from the event block (the block below the player for item events). */
    record SetBlockState(String state, int dx, int dy, int dz) implements Action {
        private static final Codec<List<Integer>> OFFSET = MsmCodecs.INT.listOf(3, 3);
        static final MapCodec<SetBlockState> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("state", Codec.STRING).forGetter(SetBlockState::state),
                optional("offset", OFFSET, List.of(0, 0, 0)).forGetter(SetBlockState::offset)).apply(i,
                (state, offset) -> new SetBlockState(state, offset.get(0), offset.get(1), offset.get(2))));

        public List<Integer> offset() {
            return List.of(dx, dy, dz);
        }

        @Override
        public Type type() {
            return Type.SET_BLOCK_STATE;
        }
    }

    /** Gives the player an item stack; no-op without a player. */
    record GiveItem(Identifier item, int count) implements Action {
        static final MapCodec<GiveItem> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("item", ID).forGetter(GiveItem::item),
                optional("count", intAtLeast(1), 1).forGetter(GiveItem::count)).apply(i, GiveItem::new));

        @Override
        public Type type() {
            return Type.GIVE_ITEM;
        }
    }

    /** Plays a sound event at the event position. */
    record PlaySound(Identifier sound, float volume, float pitch) implements Action {
        static final MapCodec<PlaySound> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("sound", ID).forGetter(PlaySound::sound),
                optional("volume", floatAtLeast(0), 1.0f).forGetter(PlaySound::volume),
                optional("pitch", floatAtLeast(0), 1.0f).forGetter(PlaySound::pitch)).apply(i, PlaySound::new));

        @Override
        public Type type() {
            return Type.PLAY_SOUND;
        }
    }

    /** Runs another event of the same definition; chains nest at most {@link EventRunner#MAX_DEPTH} deep. */
    record TriggerEvent(Identifier event) implements Action {
        static final MapCodec<TriggerEvent> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("event", ID).forGetter(TriggerEvent::event)).apply(i, TriggerEvent::new));

        @Override
        public Type type() {
            return Type.TRIGGER_EVENT;
        }
    }

    /**
     * Triggers a GeckoLib animation on the event's entity (ADR 0028 D4). Only entity definitions keep
     * it: in a block or item definition it is dropped at load with a warning.
     */
    record PlayAnimation(String animation, String controller) implements Action {
        static final MapCodec<PlayAnimation> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("animation", Codec.STRING).forGetter(PlayAnimation::animation),
                optional("controller", Codec.STRING, "msm_triggered").forGetter(PlayAnimation::controller)).apply(i, PlayAnimation::new));

        @Override
        public Type type() {
            return Type.PLAY_ANIMATION;
        }
    }

    /**
     * Calls the script handler that {@code msm.actions.define(handler, fn)} defined (ADR 0032 D4) with the event
     * context; an undefined handler is logged once per handler id.
     */
    record RunScript(Identifier handler) implements Action {
        static final MapCodec<RunScript> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("handler", ID).forGetter(RunScript::handler)).apply(i, RunScript::new));

        @Override
        public Type type() {
            return Type.RUN_SCRIPT;
        }
    }

    /** Who an {@code apply_effect} action affects ({@code EffectTarget}). */
    enum EffectTarget {
        /** The event's player; in an entity definition without a player, the entity itself. */
        SELF,
        /** The other entity of the event ({@link EventContext#other()}). */
        OTHER;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<EffectTarget> CODEC = MsmCodecs.named("effect target", values(), EffectTarget::serialName);
    }

    /**
     * Gives a vanilla mob effect (ADR 0044 D2) for {@code seconds} at level {@code amplifier + 1}; without a living
     * entity to affect it does nothing.
     */
    record ApplyEffect(Identifier effect, float seconds, int amplifier, EffectTarget target) implements Action {
        static final MapCodec<ApplyEffect> CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                required("effect", ID).forGetter(ApplyEffect::effect),
                required("seconds", floatAtLeast(0)).forGetter(ApplyEffect::seconds),
                optional("amplifier", intRange(0, 255), 0).forGetter(ApplyEffect::amplifier),
                optional("target", EffectTarget.CODEC, EffectTarget.SELF).forGetter(ApplyEffect::target)).apply(i, ApplyEffect::new));

        /** The duration in ticks (20 per second, rounded). */
        public int ticks() {
            return Math.round(seconds * 20);
        }

        @Override
        public Type type() {
            return Type.APPLY_EFFECT;
        }
    }
}
