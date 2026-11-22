package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/creative_tab/<path>.json} definitions (ADR 0096 D2, {@code ::msm::definition::CreativeTab}).
 * Pure: no registry is touched, so JUnit runs it over the conformance corpus. {@code format} is required (another value
 * than 1 is an error); the struct is closed, so an unknown key ({@code display_name} belongs to the element), a missing
 * or non-string {@code icon} or an unknown {@code order} is an error and no tab is registered. Whether {@code icon} names
 * an item is checked when the server has started ({@code registry.MsmCreativeTabs}). Since ADR 0111 D7 (B527's format)
 * {@code order} {@code by_hand} lists the tab's items by hand in {@code items} (1 to 1024 ids): {@code items} under
 * another order is ignored with a warning, and {@code by_hand} without {@code items} is {@code as_listed} with a warning.
 * B533 builds the hand order.
 */
public final class CreativeTabParser {
    /** The scanner's kind folder. */
    public static final String KIND = "creative_tab";

    private CreativeTabParser() {}

    /** {@code CreativeTabOrder}. */
    public enum Order {
        /** Registration order: block items, then items, then spawn eggs, each in scan order. */
        AS_LISTED,
        /** By display name. */
        BY_NAME,
        /** In the order of {@code items}, then the tab's other items in registration order (ADR 0111 D7). */
        BY_HAND;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        public static final Codec<Order> CODEC = MsmCodecs.named("order", values(), Order::serialName);
    }

    /**
     * A creative tab definition v1.
     *
     * @param icon  the item whose picture the tab shows
     * @param title the language key of the title; empty means {@link #titleKey(Identifier)}
     * @param order the order of the items
     * @param items with {@link Order#BY_HAND}: the items in the order the tab shows them; empty otherwise
     */
    public record Tab(Identifier icon, Optional<String> title, Order order, List<Identifier> items) {
        public static final List<String> KEYS = List.of("format", "icon", "title", "order", "items");

        public static final Codec<Tab> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("icon", ID).forGetter(Tab::icon),
                optional("title", Codec.STRING).forGetter(Tab::title),
                optional("order", Order.CODEC, Order.AS_LISTED).forGetter(Tab::order),
                optional("items", listOfLength(ID, 1, 1024), List.of()).forGetter(Tab::items)).apply(i, Tab::new)), KEYS);

        /** The title's language key: {@code title}, or {@link #titleKey(Identifier)}. */
        public String translationKey(Identifier id) {
            return title.orElseGet(() -> titleKey(id));
        }
    }

    /**
     * The default title key of a tab (B456's lowering rule, vanilla's {@code itemGroup.} prefix):
     * {@code itemGroup.<ns>.<path>} with every {@code /} written as {@code .}.
     */
    public static String titleKey(Identifier id) {
        return "itemGroup." + id.getNamespace() + "." + id.getPath().replace('/', '.');
    }

    /**
     * The creative tab definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, Tab> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, Tab> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<Tab> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one creative tab file. */
    public static ParseResult<Tab> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = CommandParser.checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<Tab> decoded = Tab.CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        Tab tab = decoded.getOrThrow();
        if (tab.order() == Order.BY_HAND && tab.items().isEmpty()) {
            return new ParseResult<>(Optional.of(new Tab(tab.icon(), tab.title(), Order.AS_LISTED, List.of())), List.of(),
                    List.of("order: by_hand without items; the tab keeps the registration order"));
        }
        if (tab.order() != Order.BY_HAND && !tab.items().isEmpty()) {
            return new ParseResult<>(Optional.of(new Tab(tab.icon(), tab.title(), tab.order(), List.of())), List.of(),
                    List.of("items: only read with order by_hand; ignored"));
        }
        return new ParseResult<>(Optional.of(tab), List.of(), List.of());
    }
}
