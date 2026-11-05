package dev.mcsupermods.runtime.loader;

import com.mojang.datafixers.util.Pair;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.DynamicOps;
import com.mojang.serialization.MapCodec;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import net.minecraft.resources.Identifier;

/**
 * Codec building blocks aligned with MSM mcdoc ({@code packages/schemas/mcdoc/msm/}): strict
 * integers, mcdoc ranges, string enums and fields whose errors name the field.
 */
public final class MsmCodecs {
    private MsmCodecs() {}

    /** An mcdoc {@code int}: a JSON number without a fraction. */
    public static final Codec<Integer> INT = Codec.DOUBLE.comapFlatMap(
            d -> d == Math.rint(d) && d >= Integer.MIN_VALUE && d <= Integer.MAX_VALUE
                    ? DataResult.success((int) (double) d)
                    : DataResult.error(() -> "not an integer: " + d),
            Integer::doubleValue);

    /** A resource location such as {@code minecraft:stone}. */
    public static final Codec<Identifier> ID = Codec.STRING.comapFlatMap(
            s -> {
                Identifier id = Identifier.tryParse(s);
                return id == null ? DataResult.error(() -> "invalid id '" + s + "'") : DataResult.success(id);
            },
            Identifier::toString);

    /** mcdoc {@code int @ min..max}. */
    public static Codec<Integer> intRange(int min, int max) {
        return INT.validate(i -> i >= min && i <= max
                ? DataResult.success(i)
                : DataResult.error(() -> "out of range: " + i + " (expected " + min + ".." + max + ")"));
    }

    /** mcdoc {@code int @ min..}. */
    public static Codec<Integer> intAtLeast(int min) {
        return intRange(min, Integer.MAX_VALUE);
    }

    /** mcdoc {@code float @ min..}. */
    public static Codec<Float> floatAtLeast(float min) {
        return Codec.FLOAT.validate(f -> f >= min && Float.isFinite(f)
                ? DataResult.success(f)
                : DataResult.error(() -> "out of range: " + f + " (expected " + min + "..)"));
    }

    /** An mcdoc {@code enum(string)} mapped onto a Java enum by name. */
    public static <E extends Enum<E>> Codec<E> named(String what, E[] values, Function<E, String> name) {
        Map<String, E> byName = new LinkedHashMap<>();
        for (E e : values) {
            byName.put(name.apply(e), e);
        }
        return Codec.STRING.comapFlatMap(
                s -> {
                    E e = byName.get(s);
                    return e == null
                            ? DataResult.error(() -> "unknown " + what + " '" + s + "' (expected one of "
                                    + String.join(", ", byName.keySet()) + ")")
                            : DataResult.success(e);
                },
                name);
    }

    /** Prefixes every decoding error of {@code codec} with {@code context}, giving path-like messages. */
    public static <A> Codec<A> context(String context, Codec<A> codec) {
        return new Codec<>() {
            @Override
            public <T> DataResult<Pair<A, T>> decode(DynamicOps<T> ops, T input) {
                return codec.decode(ops, input).mapError(e -> context + ": " + e);
            }

            @Override
            public <T> DataResult<T> encode(A input, DynamicOps<T> ops, T prefix) {
                return codec.encode(input, ops, prefix);
            }

            @Override
            public String toString() {
                return codec.toString();
            }
        };
    }

    /** A required field. */
    public static <A> MapCodec<A> required(String name, Codec<A> codec) {
        return context(name, codec).fieldOf(name);
    }

    /** An optional field; a present but invalid value is an error. */
    public static <A> MapCodec<Optional<A>> optional(String name, Codec<A> codec) {
        return context(name, codec).optionalFieldOf(name);
    }

    /** An optional field with a default; a present but invalid value is an error. */
    public static <A> MapCodec<A> optional(String name, Codec<A> codec, A fallback) {
        return context(name, codec).optionalFieldOf(name, fallback);
    }
}
