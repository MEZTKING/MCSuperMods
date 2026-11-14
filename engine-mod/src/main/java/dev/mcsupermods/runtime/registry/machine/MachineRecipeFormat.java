package dev.mcsupermods.runtime.registry.machine;

import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import java.util.List;
import java.util.Optional;

/**
 * The fields of a machine recipe file ({@code ::msm::recipe::MachineRecipe}, ADR 0075 D2) with their ranges and defaults,
 * closed, independent of how the ingredient and the result are decoded: the runtime plugs in vanilla's
 * {@code Ingredient.CODEC} and {@code ItemStackTemplate.MAP_CODEC} ({@link MsmMachineRecipe}), and the JUnit corpus test
 * plugs in registry-free stand-ins. Pure: it touches no Minecraft registry.
 *
 * <p>{@code type} is consumed by vanilla's recipe dispatch, which hands the whole map to the recipe's codec, so it is an
 * allowed key here but not a field.
 */
public final class MachineRecipeFormat {
    /** Every key of a recipe file, {@code type} included. */
    public static final List<String> KEYS = List.of("type", "ingredient", "count", "result", "time", "experience");
    /** The highest {@code time} (and machine {@code default_time}): menu data is 16-bit (limit C5). */
    public static final int MAX_TIME = 32767;

    private MachineRecipeFormat() {}

    /** The decoded fields of a recipe. */
    public interface Fields<I, R> {
        /** What the input slot must hold. */
        I ingredient();

        /** Inputs used per output, 1 to 64; default 1. */
        int count();

        /** The output. */
        R result();

        /** Ticks at speed 1, 1 to 32767; absent means the machine's {@code default_time}. */
        Optional<Integer> time();

        /** Experience stored per output, at least 0; default 0. */
        float experience();
    }

    /** Builds a recipe from its decoded fields. */
    @FunctionalInterface
    public interface Factory<I, R, X> {
        X create(I ingredient, int count, R result, Optional<Integer> time, float experience);
    }

    /** The recipe's map codec: {@code ingredient} and {@code result} required, the rest optional, unknown keys errors. */
    public static <I, R, X extends Fields<I, R>> MapCodec<X> mapCodec(Codec<I> ingredient, Codec<R> result, Factory<I, R, X> factory) {
        return MsmCodecs.closedMap(RecordCodecBuilder.mapCodec(i -> i.group(
                required("ingredient", ingredient).forGetter((X x) -> x.ingredient()),
                optional("count", intRange(1, 64), 1).forGetter((X x) -> x.count()),
                required("result", result).forGetter((X x) -> x.result()),
                optional("time", intRange(1, MAX_TIME)).forGetter((X x) -> x.time()),
                optional("experience", floatAtLeast(0), 0f).forGetter((X x) -> x.experience()))
                .apply(i, factory::create)), KEYS);
    }
}
