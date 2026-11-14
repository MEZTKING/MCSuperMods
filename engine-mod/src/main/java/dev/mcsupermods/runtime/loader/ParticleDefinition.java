package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.datafixers.util.Pair;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.DynamicOps;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Particle definition v1 ({@code ::msm::definition::Particle}, ADR 0080 D1), {@code msm/<ns>/particle/<path>.json}: one
 * option-less entry of the {@code particle_type} registry. Closed throughout (ADR 0080 D3), so an unknown key or a value
 * out of range is an error and nothing is registered; {@code lifetime.min} above {@code max} is an error.
 *
 * <p>Absent fields stay empty here, so this class has no defaults of its own and no client types: the client resolves
 * them into {@code ParticleLook.Spec} ({@code MsmParticles.spec}), which holds the one copy of the defaults. A
 * dedicated server reads only {@link #alwaysShow()}.
 *
 * @param textures sprite ids in the particle atlas, in frame order (1 to 64); the client reads its frames from the
 *                 description {@code assets/<ns>/particles/<path>.json}, not from here
 * @param life     the fields of how the particle lives and moves
 * @param looks    the fields of how it is drawn
 */
public record ParticleDefinition(int format, List<Identifier> textures, Life life, Looks looks) {
    public static final List<String> KEYS = List.of("format", "textures", "animation", "frame_ticks", "lifetime", "size", "size_end",
            "gravity", "friction", "collision", "color", "color_end", "alpha", "fade", "emissive", "translucent", "spin", "always_show");

    /** The most frames one particle may have (mcdoc {@code @ 1..64}). */
    public static final int MAX_TEXTURES = 64;
    /** The longest lifetime in ticks (mcdoc {@code @ 1..6000}). */
    public static final int MAX_LIFETIME = 6000;
    /** The values of {@code animation}, as {@code ParticleLook.Animation}'s serialised names. */
    public static final List<String> ANIMATIONS = List.of("age", "loop", "random");
    /** The values of {@code fade}, as {@code ParticleLook.Fade}'s serialised names. */
    public static final List<String> FADES = List.of("none", "out", "in_out");

    /** {@code lifetime}: a fixed number of ticks (min = max) or a range drawn per particle. */
    public record Lifetime(int min, int max) {
        static final Codec<Lifetime> RANGE = closed(RecordCodecBuilder.<Lifetime>create(i -> i.group(
                required("min", intRange(1, MAX_LIFETIME)).forGetter(Lifetime::min),
                required("max", intRange(1, MAX_LIFETIME)).forGetter(Lifetime::max)).apply(i, Lifetime::new)), List.of("min", "max"))
                .validate(l -> l.min() <= l.max()
                        ? DataResult.success(l)
                        : DataResult.error(() -> "max: " + l.max() + " is below min " + l.min()));

        private static final Codec<Integer> FIXED = intRange(1, MAX_LIFETIME);

        /** A JSON number is a fixed lifetime; anything else decodes as {@code { min, max }}, so each error names its branch. */
        static final Codec<Lifetime> CODEC = new Codec<>() {
            @Override
            public <T> DataResult<Pair<Lifetime, T>> decode(DynamicOps<T> ops, T input) {
                if (ops.getNumberValue(input).isSuccess()) {
                    return FIXED.decode(ops, input).map(p -> p.mapFirst(n -> new Lifetime(n, n)));
                }
                return RANGE.decode(ops, input);
            }

            @Override
            public <T> DataResult<T> encode(Lifetime input, DynamicOps<T> ops, T prefix) {
                return input.min() == input.max() ? FIXED.encode(input.min(), ops, prefix) : RANGE.encode(input, ops, prefix);
            }

            @Override
            public String toString() {
                return "ParticleLifetime";
            }
        };
    }

    /** {@code animation}, {@code frame_ticks}, {@code lifetime}, {@code size}, {@code size_end}, {@code gravity}, {@code friction}, {@code collision}. */
    public record Life(
            Optional<String> animation,
            Optional<Integer> frameTicks,
            Optional<Lifetime> lifetime,
            Optional<Float> size,
            Optional<Float> sizeEnd,
            Optional<Float> gravity,
            Optional<Float> friction,
            Optional<Boolean> collision) {
        static final MapCodec<Life> MAP_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("animation", oneOf("animation", ANIMATIONS)).forGetter(Life::animation),
                optional("frame_ticks", intRange(1, 1200)).forGetter(Life::frameTicks),
                optional("lifetime", Lifetime.CODEC).forGetter(Life::lifetime),
                optional("size", floatRange(0.01f, 16f)).forGetter(Life::size),
                optional("size_end", floatRange(0f, 16f)).forGetter(Life::sizeEnd),
                optional("gravity", floatRange(-16f, 16f)).forGetter(Life::gravity),
                optional("friction", floatRange(0f, 1f)).forGetter(Life::friction),
                optional("collision", Codec.BOOL).forGetter(Life::collision)).apply(i, Life::new));
    }

    /** {@code color}, {@code color_end}, {@code alpha}, {@code fade}, {@code emissive}, {@code translucent}, {@code spin}, {@code always_show}. */
    public record Looks(
            Optional<Integer> color,
            Optional<Integer> colorEnd,
            Optional<Float> alpha,
            Optional<String> fade,
            Optional<Boolean> emissive,
            Optional<Boolean> translucent,
            Optional<Float> spin,
            Optional<Boolean> alwaysShow) {
        static final MapCodec<Looks> MAP_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
                optional("color", intRange(0, 0xFFFFFF)).forGetter(Looks::color),
                optional("color_end", intRange(0, 0xFFFFFF)).forGetter(Looks::colorEnd),
                optional("alpha", floatRange(0f, 1f)).forGetter(Looks::alpha),
                optional("fade", oneOf("fade", FADES)).forGetter(Looks::fade),
                optional("emissive", Codec.BOOL).forGetter(Looks::emissive),
                optional("translucent", Codec.BOOL).forGetter(Looks::translucent),
                optional("spin", floatRange(-360f, 360f)).forGetter(Looks::spin),
                optional("always_show", Codec.BOOL).forGetter(Looks::alwaysShow)).apply(i, Looks::new));
    }

    public static final Codec<ParticleDefinition> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
            required("format", intRange(1, 1)).forGetter(ParticleDefinition::format),
            required("textures", listOfLength(ID, 1, MAX_TEXTURES)).forGetter(ParticleDefinition::textures),
            Life.MAP_CODEC.forGetter(ParticleDefinition::life),
            Looks.MAP_CODEC.forGetter(ParticleDefinition::looks)).apply(i, ParticleDefinition::new)), KEYS);

    /** {@code always_show} (default false): the type's {@code getOverrideLimiter()}, the one field a server uses. */
    public boolean alwaysShow() {
        return looks.alwaysShow().orElse(false);
    }

    /** An mcdoc string enum kept as its name. */
    private static Codec<String> oneOf(String what, List<String> names) {
        return Codec.STRING.validate(s -> names.contains(s)
                ? DataResult.success(s)
                : DataResult.error(() -> "unknown " + what + " '" + s + "' (expected one of " + String.join(", ", names) + ")"));
    }
}
