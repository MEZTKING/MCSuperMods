package dev.mcsupermods.runtime.loader;

import com.mojang.datafixers.util.Pair;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.DynamicOps;
import com.mojang.serialization.MapCodec;
import java.util.LinkedHashMap;
import java.util.List;
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

    /**
     * A tag reference such as {@code #minecraft:incorrect_for_iron_tool} (mcdoc
     * {@code #[id(registry=..., tags="required")] string}), decoded to the id without the {@code #}.
     */
    public static final Codec<Identifier> TAG_ID = Codec.STRING.comapFlatMap(
            s -> {
                Identifier id = s.startsWith("#") ? Identifier.tryParse(s.substring(1)) : null;
                return id == null
                        ? DataResult.error(() -> "invalid tag reference '" + s + "' (expected #namespace:path)")
                        : DataResult.success(id);
            },
            id -> "#" + id);

    /** An mcdoc {@code float}: any finite number. */
    public static final Codec<Float> FLOAT = Codec.FLOAT.validate(f -> Float.isFinite(f)
            ? DataResult.success(f)
            : DataResult.error(() -> "not a finite number: " + f));

    /**
     * An mcdoc union of a string enum and a struct, such as {@code (ToolTier | ToolMaterial)}: a
     * JSON string decodes with {@code name}, anything else with {@code object}, so each error
     * comes from the branch the value was meant for.
     */
    @SuppressWarnings("unchecked")
    public static <S, A extends S, B extends S> Codec<S> nameOrObject(Class<A> nameType, Codec<A> name, Codec<B> object) {
        return new Codec<>() {
            @Override
            public <T> DataResult<Pair<S, T>> decode(DynamicOps<T> ops, T input) {
                if (ops.getStringValue(input).isSuccess()) {
                    return name.decode(ops, input).map(p -> p.mapFirst(a -> (S) a));
                }
                return object.decode(ops, input).map(p -> p.mapFirst(b -> (S) b));
            }

            @Override
            public <T> DataResult<T> encode(S input, DynamicOps<T> ops, T prefix) {
                return nameType.isInstance(input)
                        ? name.encode(nameType.cast(input), ops, prefix)
                        : object.encode((B) input, ops, prefix);
            }

            @Override
            public String toString() {
                return "NameOrObject[" + name + ", " + object + "]";
            }
        };
    }

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

    /** mcdoc {@code float @ min..max}. */
    public static Codec<Float> floatRange(float min, float max) {
        return Codec.FLOAT.validate(f -> f >= min && f <= max && Float.isFinite(f)
                ? DataResult.success(f)
                : DataResult.error(() -> "out of range: " + f + " (expected " + min + ".." + max + ")"));
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

    /**
     * An mcdoc struct without a spread: a map key outside {@code keys} is an error naming the key, as
     * {@code schema.unknown-field} in TypeScript. Anything that is not a map goes to {@code codec} for its own error.
     */
    public static <A> Codec<A> closed(Codec<A> codec, List<String> keys) {
        return new Codec<>() {
            @Override
            public <T> DataResult<Pair<A, T>> decode(DynamicOps<T> ops, T input) {
                var map = ops.getMap(input);
                if (map.isSuccess()) {
                    List<String> unknown = map.getOrThrow().entries()
                            .map(e -> ops.getStringValue(e.getFirst()).result().orElse(String.valueOf(e.getFirst())))
                            .filter(k -> !keys.contains(k))
                            .sorted()
                            .toList();
                    if (!unknown.isEmpty()) {
                        return DataResult.error(() -> unknown.getFirst() + ": unknown field (expected one of " + String.join(", ", keys) + ")");
                    }
                }
                return codec.decode(ops, input);
            }

            @Override
            public <T> DataResult<T> encode(A input, DynamicOps<T> ops, T prefix) {
                return codec.encode(input, ops, prefix);
            }

            @Override
            public String toString() {
                return "Closed[" + codec + "]";
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
