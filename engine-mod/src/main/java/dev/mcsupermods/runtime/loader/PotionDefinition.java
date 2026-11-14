package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Potion definition v1 ({@code ::msm::definition::Potion}, ADR 0063 D2), {@code msm/<ns>/potion/<path>.json}: one entry
 * of the {@code potion} registry. Closed throughout, so an unknown key (an editor field such as {@code display_name} or
 * {@code brewing}) is an error. Brewing recipes are vanilla data ({@code minecraft:brewing}) and not part of this file.
 *
 * @param name    the name key part of the item name ({@code item.minecraft.potion.effect.<name>}); see {@link #name(Identifier)}
 * @param effects one to eight effects
 */
public record PotionDefinition(int format, Optional<String> name, List<Effect> effects) {
    public static final List<String> KEYS = List.of("format", "name", "effects");

    /** The most effects one potion may carry (mcdoc {@code @ 1..8}). */
    public static final int MAX_EFFECTS = 8;

    /**
     * {@code PotionEffect}: a vanilla {@code MobEffectInstance}. Defaults as vanilla's three-argument constructor:
     * level I, not ambient, particles and icon shown.
     *
     * @param amplifier the effect level minus one
     */
    public record Effect(Identifier id, int durationTicks, int amplifier, boolean ambient, boolean showParticles, boolean showIcon) {
        public static final List<String> KEYS = List.of("id", "duration_ticks", "amplifier", "ambient", "show_particles", "show_icon");

        public static final Codec<Effect> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("id", ID).forGetter(Effect::id),
                required("duration_ticks", intAtLeast(1)).forGetter(Effect::durationTicks),
                optional("amplifier", intRange(0, 255), 0).forGetter(Effect::amplifier),
                optional("ambient", Codec.BOOL, false).forGetter(Effect::ambient),
                optional("show_particles", Codec.BOOL, true).forGetter(Effect::showParticles),
                optional("show_icon", Codec.BOOL, true).forGetter(Effect::showIcon)).apply(i, Effect::new)), KEYS);
    }

    private static final Codec<List<Effect>> EFFECTS = MsmCodecs.nonEmptyList(Effect.CODEC).validate(list -> list.size() <= MAX_EFFECTS
            ? DataResult.success(list)
            : DataResult.error(() -> "too many effects: " + list.size() + " (expected 1.." + MAX_EFFECTS + ")"));

    public static final Codec<PotionDefinition> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
            required("format", intRange(1, 1)).forGetter(PotionDefinition::format),
            optional("name", Codec.STRING).forGetter(PotionDefinition::name),
            required("effects", EFFECTS).forGetter(PotionDefinition::effects)).apply(i, PotionDefinition::new)), KEYS);

    /**
     * The registered {@code Potion.name()}: {@code name} when given, else {@link #defaultName(Identifier)}. The long and
     * strong variants of one potion are separate definitions that state the same {@code name}.
     */
    public String name(Identifier id) {
        return name.orElseGet(() -> defaultName(id));
    }

    /** {@code <ns>.<path>} (ADR 0063 D2): the namespace keeps two mods' potions of the same path apart. */
    public static String defaultName(Identifier id) {
        return id.getNamespace() + "." + id.getPath();
    }
}
