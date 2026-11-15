package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.events.Events;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * Key bind definition v1 ({@code ::msm::definition::KeyBind}, ADR 0088 D3), {@code msm/<ns>/key_bind/<path>.json}: one
 * key mapping on the client and the press, release and hold events on the server. Closed, as {@code controls.mcdoc}
 * (an unknown key is an error and nothing is registered). Pure: no registry is touched, so JUnit runs it over the
 * conformance corpus.
 *
 * @param name              the translation key shown in Controls; empty means {@link #nameKey(Identifier)}
 * @param defaultKey        vanilla's {@code InputConstants} name of the default key; {@link #UNBOUND} leaves it unbound
 * @param category          the path of the Controls category id in the definition's namespace (default {@code keys})
 * @param vehicle           with {@code in_vehicle} or {@code driving}: only this vehicle type
 * @param cooldownTicks     ticks between two presses that fire (0..1200)
 * @param holdIntervalTicks ticks between two {@code msm:while_held} firings (1..1200)
 */
public record KeyBindDefinition(
        Optional<String> name,
        String defaultKey,
        String category,
        When when,
        Optional<Identifier> vehicle,
        int cooldownTicks,
        int holdIntervalTicks,
        Events events,
        Optional<String> onPress,
        Optional<String> onRelease,
        Optional<String> whileHeld) {
    public static final List<String> KEYS = List.of("format", "name", "default_key", "category", "when", "vehicle", "cooldown_ticks",
            "hold_interval_ticks", "events", "msm:on_press", "msm:on_release", "msm:while_held");

    /** Vanilla's name for no key (B409): the mapping registers unbound. */
    public static final String UNBOUND = "key.keyboard.unknown";
    /** {@code category} default. */
    public static final String DEFAULT_CATEGORY = "keys";
    /** {@code hold_interval_ticks} default. */
    public static final int DEFAULT_HOLD_INTERVAL = 10;
    /** {@code cooldown_ticks} and {@code hold_interval_ticks} upper bound (a minute). */
    public static final int MAX_TICKS = 1200;

    /** {@code KeyBindWhen}: checked on the server at press time (ADR 0088 D4). */
    public enum When {
        ALWAYS, ON_FOOT, IN_VEHICLE, DRIVING;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        /** Whether {@code vehicle} means anything with this value. */
        public boolean namesVehicle() {
            return this == IN_VEHICLE || this == DRIVING;
        }

        public static final Codec<When> CODEC = MsmCodecs.named("when", values(), When::serialName);
    }

    /** A category path: lowercase letters, digits and {@code _ - . /} (a valid id path, not empty). */
    static final Codec<String> CATEGORY = Codec.STRING.validate(s -> !s.isEmpty() && Identifier.isValidPath(s)
            ? DataResult.success(s)
            : DataResult.error(() -> "invalid category '" + s + "' (lowercase letters, digits and _ - . / only)"));

    public static final Codec<KeyBindDefinition> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
            optional("name", Codec.STRING).forGetter(KeyBindDefinition::name),
            required("default_key", Codec.STRING).forGetter(KeyBindDefinition::defaultKey),
            optional("category", CATEGORY, DEFAULT_CATEGORY).forGetter(KeyBindDefinition::category),
            optional("when", When.CODEC, When.ALWAYS).forGetter(KeyBindDefinition::when),
            optional("vehicle", ID).forGetter(KeyBindDefinition::vehicle),
            optional("cooldown_ticks", intRange(0, MAX_TICKS), 0).forGetter(KeyBindDefinition::cooldownTicks),
            optional("hold_interval_ticks", intRange(1, MAX_TICKS), DEFAULT_HOLD_INTERVAL).forGetter(KeyBindDefinition::holdIntervalTicks),
            optional("events", Events.CODEC, Events.NONE).forGetter(KeyBindDefinition::events),
            optional("msm:on_press", Codec.STRING).forGetter(KeyBindDefinition::onPress),
            optional("msm:on_release", Codec.STRING).forGetter(KeyBindDefinition::onRelease),
            optional("msm:while_held", Codec.STRING).forGetter(KeyBindDefinition::whileHeld)).apply(i, KeyBindDefinition::new)),
            KEYS);

    /** This definition with other events (the parser drops {@code play_animation}). */
    public KeyBindDefinition withEvents(Events events) {
        return new KeyBindDefinition(name, defaultKey, category, when, vehicle, cooldownTicks, holdIntervalTicks, events, onPress, onRelease,
                whileHeld);
    }

    /** This definition without {@code vehicle} (ignored with a warning when {@code when} does not name one). */
    public KeyBindDefinition withoutVehicle() {
        return new KeyBindDefinition(name, defaultKey, category, when, Optional.empty(), cooldownTicks, holdIntervalTicks, events, onPress,
                onRelease, whileHeld);
    }

    /** The translation key shown in Controls: {@code name}, or {@link #nameKey(Identifier)}. */
    public String translationKey(Identifier id) {
        return name.orElseGet(() -> nameKey(id));
    }

    /** The category id {@code <ns>:<category>} of a definition with id {@code id}. */
    public Identifier categoryId(Identifier id) {
        return Identifier.fromNamespaceAndPath(id.getNamespace(), category);
    }

    /** Whether the default key is {@link #UNBOUND}. */
    public boolean unbound() {
        return defaultKey.equals(UNBOUND);
    }

    /**
     * The default name key of a key bind (B413's lowering rule): {@code key.<ns>.<path>} with every {@code /} written as
     * {@code .}.
     */
    public static String nameKey(Identifier id) {
        return "key." + id.getNamespace() + "." + id.getPath().replace('/', '.');
    }

    /**
     * The translation key of a category (vanilla's rule, B406): {@code key.category.<ns>.<path>} with every {@code /}
     * written as {@code .}.
     */
    public static String categoryKey(Identifier category) {
        return "key.category." + category.getNamespace() + "." + category.getPath().replace('/', '.');
    }

    /** The trigger fields that name an event, as {@code {field, event id}} pairs. */
    Stream<String[]> eventReferences() {
        List<String[]> refs = new ArrayList<>();
        onPress.ifPresent(e -> refs.add(new String[] {"msm:on_press", e}));
        onRelease.ifPresent(e -> refs.add(new String[] {"msm:on_release", e}));
        whileHeld.ifPresent(e -> refs.add(new String[] {"msm:while_held", e}));
        return refs.stream();
    }
}
