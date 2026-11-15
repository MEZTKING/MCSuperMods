package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.mojang.serialization.Codec;
import com.mojang.serialization.MapCodec;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.components.ItemComponents;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/**
 * Item inventories (ADR 0095 D1, D4): the components {@code msm:item_inventory} (a bag with its own slots) and
 * {@code msm:bundle} (a vanilla-like bundle), decoded as one group of {@link ItemComponents}, and the load rules that
 * need the whole item ({@link #check}). Pure: no registry is touched.
 */
public final class ItemInventoryParser {
    private ItemInventoryParser() {}

    /** The component keys, in the order of {@link ItemComponents#KEYS}. */
    public static final List<String> KEYS = List.of("msm:item_inventory", "msm:bundle");

    /** The rows of a chest bag without {@code rows} (27 slots, the shulker box menu). */
    public static final int DEFAULT_ROWS = 3;

    /** A bag's menu layout. */
    public enum Layout {
        CHEST("chest"),
        HOPPER("hopper"),
        DISPENSER("dispenser");

        public static final Codec<Layout> CODEC = MsmCodecs.named("layout", values(), Layout::serialName);
        private final String serialName;

        Layout(String serialName) {
            this.serialName = serialName;
        }

        public String serialName() {
            return serialName;
        }
    }

    /** When a use opens the bag: any right-click ({@code use}) or only a sneaking one ({@code sneak_use}). */
    public enum OpenMode {
        USE("use"),
        SNEAK_USE("sneak_use");

        public static final Codec<OpenMode> CODEC = MsmCodecs.named("open", values(), OpenMode::serialName);
        private final String serialName;

        OpenMode(String serialName) {
            this.serialName = serialName;
        }

        public String serialName() {
            return serialName;
        }
    }

    /** {@code msm:item_inventory} (closed). */
    public record Bag(
            Layout layout,
            Optional<Integer> rows,
            OpenMode open,
            Optional<Identifier> openSound,
            Optional<Identifier> closeSound,
            Optional<Identifier> onOpen,
            Optional<Identifier> onClose) {
        public static final List<String> FIELDS = List.of("layout", "rows", "open", "open_sound", "close_sound", "on_open", "on_close");

        public static final Codec<Bag> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("layout", Layout.CODEC, Layout.CHEST).forGetter(Bag::layout),
                optional("rows", intRange(1, 6)).forGetter(Bag::rows),
                optional("open", OpenMode.CODEC, OpenMode.USE).forGetter(Bag::open),
                optional("open_sound", ID).forGetter(Bag::openSound),
                optional("close_sound", ID).forGetter(Bag::closeSound),
                optional("on_open", ID).forGetter(Bag::onOpen),
                optional("on_close", ID).forGetter(Bag::onClose)).apply(i, Bag::new)), FIELDS);

        /** The chest rows: {@code rows}, else {@link #DEFAULT_ROWS}; 0 for the other layouts. */
        public int chestRows() {
            return layout == Layout.CHEST ? rows.orElse(DEFAULT_ROWS) : 0;
        }

        /** The number of slots: nine a chest row, five for a hopper, nine for a dispenser. */
        public int slots() {
            return switch (layout) {
                case CHEST -> 9 * chestRows();
                case HOPPER -> 5;
                case DISPENSER -> 9;
            };
        }

        /** Whether the bag opens in vanilla's shulker box menu (a three-row chest, ADR 0095 D2). */
        public boolean shulkerMenu() {
            return layout == Layout.CHEST && chestRows() == 3;
        }

        Bag withoutRows() {
            return new Bag(layout, Optional.empty(), open, openSound, closeSound, onOpen, onClose);
        }
    }

    /** {@code msm:bundle {}} (closed, no fields: vanilla's capacity, limit Q15). */
    public record Bundle() {
        public static final Codec<Bundle> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.point(new Bundle())), List.of());
    }

    /** Both components of one item; either, both or neither may be present before {@link #check}. */
    public record Inventory(Optional<Bag> bag, Optional<Bundle> bundle) {
        public static final Inventory NONE = new Inventory(Optional.empty(), Optional.empty());

        /** Whether the item is a bag or a bundle. */
        public boolean any() {
            return bag.isPresent() || bundle.isPresent();
        }

        /** The event ids the bag names, with the field for messages. */
        public Stream<String[]> eventReferences() {
            return bag.stream().flatMap(b -> Stream.of(
                    b.onOpen().map(e -> new String[] {"msm:item_inventory on_open", e.toString()}),
                    b.onClose().map(e -> new String[] {"msm:item_inventory on_close", e.toString()})).flatMap(Optional::stream));
        }
    }

    /** The two components as fields of the item components map. */
    public static final MapCodec<Inventory> MAP_CODEC = RecordCodecBuilder.mapCodec(i -> i.group(
            optional("msm:item_inventory", Bag.CODEC).forGetter(Inventory::bag),
            optional("msm:bundle", Bundle.CODEC).forGetter(Inventory::bundle)).apply(i, Inventory::new));

    /**
     * The load rules of ADR 0095 D1 that need the whole item, run after the other item rules of
     * {@link DefinitionParser#parseItem}:
     * <ul>
     *   <li>{@code msm:item_inventory} and {@code msm:bundle} together: an error, neither is applied;
     *   <li>either with {@code msm:tool}, {@code msm:ranged_weapon}, {@code msm:armor}, {@code msm:shield},
     *       {@code msm:throwable}, {@code msm:food} or {@code msm:consumable} (the plugin's
     *       {@code blocks-items.component-conflict} list): an error, the bag or bundle is not applied and the others are;
     *   <li>{@code rows} on a hopper or dispenser bag: a warning, ignored;
     *   <li>{@code max_stack_size} above 1 on a bag or bundle: a warning, it stacks to 1.
     * </ul>
     */
    public static ParseResult<ItemDefinition> check(ParseResult<ItemDefinition> result, JsonElement json) {
        if (result.definition().isEmpty() || !result.definition().get().components().inventory().any()) {
            return result;
        }
        ItemDefinition def = result.definition().get();
        ItemComponents c = def.components();
        Inventory inv = c.inventory();
        List<String> errors = new ArrayList<>(result.errors());
        List<String> warnings = new ArrayList<>(result.warnings());
        if (inv.bag().isPresent() && inv.bundle().isPresent()) {
            errors.add("components: msm:item_inventory and msm:bundle on one item; neither is applied");
            return new ParseResult<>(Optional.of(def.withComponents(c.withInventory(Inventory.NONE))), List.copyOf(errors),
                    List.copyOf(warnings));
        }
        String name = inv.bag().isPresent() ? "msm:item_inventory" : "msm:bundle";
        List<String> conflicts = conflicts(c);
        if (!conflicts.isEmpty()) {
            errors.add("components: " + name + " cannot be combined with " + String.join(", ", conflicts) + "; " + name
                    + " is not applied");
            return new ParseResult<>(Optional.of(def.withComponents(c.withInventory(Inventory.NONE))), List.copyOf(errors),
                    List.copyOf(warnings));
        }
        if (inv.bag().isPresent() && inv.bag().get().layout() != Layout.CHEST && inv.bag().get().rows().isPresent()) {
            warnings.add("components: msm:item_inventory: rows is only for the chest layout; ignored for "
                    + inv.bag().get().layout().serialName());
            def = def.withComponents(c.withInventory(new Inventory(Optional.of(inv.bag().get().withoutRows()), Optional.empty())));
        }
        if (def.maxStackSize() > 1 && json instanceof JsonObject object && object.has("max_stack_size")) {
            warnings.add("max_stack_size " + def.maxStackSize() + " ignored; " + (inv.bag().isPresent() ? "a bag" : "a bundle")
                    + " stacks to 1");
        }
        return new ParseResult<>(Optional.of(def), List.copyOf(errors), List.copyOf(warnings));
    }

    /** The components present that a bag or bundle cannot have, in the plugin's order. */
    static List<String> conflicts(ItemComponents c) {
        List<String> present = new ArrayList<>();
        if (c.tool().isPresent()) {
            present.add("msm:tool");
        }
        if (c.rangedWeapon().isPresent()) {
            present.add("msm:ranged_weapon");
        }
        if (c.armor().isPresent()) {
            present.add("msm:armor");
        }
        if (c.shield().isPresent()) {
            present.add("msm:shield");
        }
        if (c.throwable().isPresent()) {
            present.add("msm:throwable");
        }
        if (c.food().isPresent()) {
            present.add("msm:food");
        }
        if (c.consumable().isPresent()) {
            present.add("msm:consumable");
        }
        return present;
    }
}
