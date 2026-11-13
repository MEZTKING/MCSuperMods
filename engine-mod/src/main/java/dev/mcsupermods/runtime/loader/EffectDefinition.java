package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.FLOAT;
import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.components.EffectComponents;
import dev.mcsupermods.runtime.events.Events;
import java.util.List;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Mob effect definition v1 ({@code ::msm::definition::Effect}, ADR 0055 D2), {@code msm/<ns>/effect/<path>.json}.
 *
 * @param color    {@code 0xRRGGBB}, the particle and potion bar colour
 * @param particle a particle type without options shown instead of the tinted swirl
 * @param sound    played when the effect is added
 */
public record EffectDefinition(
        int format,
        Category category,
        int color,
        Optional<Identifier> particle,
        Optional<Identifier> sound,
        List<Modifier> attributeModifiers,
        EffectComponents components,
        Events events) {

    public static final List<String> KEYS = List.of("format", "category", "color", "particle", "sound", "attribute_modifiers",
            "components", "events");

    /** {@code EffectCategory}; maps onto the vanilla {@code MobEffectCategory} of the same name. */
    public enum Category {
        BENEFICIAL, HARMFUL, NEUTRAL;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<Category> CODEC = MsmCodecs.named("effect category", values(), Category::serialName);
    }

    /** {@code AttributeOperation}; maps onto the vanilla {@code AttributeModifier.Operation} of the same name. */
    public enum Operation {
        ADD_VALUE, ADD_MULTIPLIED_BASE, ADD_MULTIPLIED_TOTAL;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<Operation> CODEC = MsmCodecs.named("attribute operation", values(), Operation::serialName);
    }

    /** {@code EffectAttributeModifier}: {@code amount} at level I; vanilla multiplies it by the level. */
    public record Modifier(Identifier attribute, float amount, Operation operation) {
        public static final Codec<Modifier> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("attribute", ID).forGetter(Modifier::attribute),
                required("amount", FLOAT).forGetter(Modifier::amount),
                required("operation", Operation.CODEC).forGetter(Modifier::operation)).apply(i, Modifier::new));
    }

    public static final Codec<EffectDefinition> CODEC = RecordCodecBuilder.create(i -> i.group(
            required("format", intRange(1, 1)).forGetter(EffectDefinition::format),
            required("category", Category.CODEC).forGetter(EffectDefinition::category),
            required("color", intRange(0, 0xFFFFFF)).forGetter(EffectDefinition::color),
            optional("particle", ID).forGetter(EffectDefinition::particle),
            optional("sound", ID).forGetter(EffectDefinition::sound),
            optional("attribute_modifiers", Modifier.CODEC.listOf(), List.of()).forGetter(EffectDefinition::attributeModifiers),
            optional("components", EffectComponents.CODEC, EffectComponents.NONE).forGetter(EffectDefinition::components),
            optional("events", Events.CODEC, Events.NONE).forGetter(EffectDefinition::events)).apply(i, EffectDefinition::new));

    /** This definition with other events. */
    public EffectDefinition withEvents(Events other) {
        return new EffectDefinition(format, category, color, particle, sound, attributeModifiers, components, other);
    }
}
