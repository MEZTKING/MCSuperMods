package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/** Runtime block components ({@code ::msm::definition::BlockComponents}). */
public record BlockComponents(
        Optional<Breakable> breakable,
        Optional<LightEmitter> lightEmitter,
        Optional<OnInteract> onInteract,
        Optional<OnStep> onStep,
        Optional<Redstone> redstone,
        Optional<Shape> shape,
        Optional<OnBreak> onBreak,
        Optional<OnPlace> onPlace,
        Optional<OnRandomTick> onRandomTick,
        Optional<OnEntityInside> onEntityInside,
        Optional<Flammable> flammable,
        Optional<Strippable> strippable,
        Optional<Container> container,
        Optional<Machine> machine) {

    public static final List<String> KEYS = List.of("msm:breakable", "msm:light_emitter", "msm:on_interact", "msm:on_step", "msm:redstone",
            "msm:shape", "msm:on_break", "msm:on_place", "msm:on_random_tick", "msm:on_entity_inside",
            "msm:flammable", "msm:strippable", "msm:container", "msm:machine");
    public static final BlockComponents NONE = new BlockComponents(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
            Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
            Optional.empty(), Optional.empty(), Optional.empty());

    /** 14 of the 16 fields a {@code RecordCodecBuilder} group takes (limit C18): a later component needs a nested group. */
    public static final Codec<BlockComponents> CODEC = RecordCodecBuilder.create(i -> i.group(
            optional("msm:breakable", Breakable.CODEC).forGetter(BlockComponents::breakable),
            optional("msm:light_emitter", LightEmitter.CODEC).forGetter(BlockComponents::lightEmitter),
            optional("msm:on_interact", OnInteract.CODEC).forGetter(BlockComponents::onInteract),
            optional("msm:on_step", OnStep.CODEC).forGetter(BlockComponents::onStep),
            optional("msm:redstone", Redstone.CODEC).forGetter(BlockComponents::redstone),
            optional("msm:shape", Shape.CODEC).forGetter(BlockComponents::shape),
            optional("msm:on_break", OnBreak.CODEC).forGetter(BlockComponents::onBreak),
            optional("msm:on_place", OnPlace.CODEC).forGetter(BlockComponents::onPlace),
            optional("msm:on_random_tick", OnRandomTick.CODEC).forGetter(BlockComponents::onRandomTick),
            optional("msm:on_entity_inside", OnEntityInside.CODEC).forGetter(BlockComponents::onEntityInside),
            optional("msm:flammable", Flammable.CODEC).forGetter(BlockComponents::flammable),
            optional("msm:strippable", Strippable.CODEC).forGetter(BlockComponents::strippable),
            optional("msm:container", Container.CODEC).forGetter(BlockComponents::container),
            optional("msm:machine", Machine.CODEC).forGetter(BlockComponents::machine))
            .apply(i, BlockComponents::new));

    /** The keys of the components present, in {@link #KEYS} order. */
    public List<String> present() {
        List<Optional<?>> values = List.of(breakable, lightEmitter, onInteract, onStep, redstone, shape, onBreak, onPlace, onRandomTick,
                onEntityInside, flammable, strippable, container, machine);
        List<String> out = new ArrayList<>();
        for (int n = 0; n < KEYS.size(); n++) {
            if (values.get(n).isPresent()) {
                out.add(KEYS.get(n));
            }
        }
        return List.copyOf(out);
    }

    /** These components without the ones named in {@code keys} (a component not allowed for the block type, ADR 0067 D3). */
    public BlockComponents without(Collection<String> keys) {
        return new BlockComponents(
                keys.contains("msm:breakable") ? Optional.empty() : breakable,
                keys.contains("msm:light_emitter") ? Optional.empty() : lightEmitter,
                keys.contains("msm:on_interact") ? Optional.empty() : onInteract,
                keys.contains("msm:on_step") ? Optional.empty() : onStep,
                keys.contains("msm:redstone") ? Optional.empty() : redstone,
                keys.contains("msm:shape") ? Optional.empty() : shape,
                keys.contains("msm:on_break") ? Optional.empty() : onBreak,
                keys.contains("msm:on_place") ? Optional.empty() : onPlace,
                keys.contains("msm:on_random_tick") ? Optional.empty() : onRandomTick,
                keys.contains("msm:on_entity_inside") ? Optional.empty() : onEntityInside,
                keys.contains("msm:flammable") ? Optional.empty() : flammable,
                keys.contains("msm:strippable") ? Optional.empty() : strippable,
                keys.contains("msm:container") ? Optional.empty() : container,
                keys.contains("msm:machine") ? Optional.empty() : machine);
    }

    /** These components with {@code msm:container} replaced (empty removes it). */
    public BlockComponents withContainer(Optional<Container> other) {
        return new BlockComponents(breakable, lightEmitter, onInteract, onStep, redstone, shape, onBreak, onPlace, onRandomTick,
                onEntityInside, flammable, strippable, other, machine);
    }

    /**
     * The load-time rule of {@code msm:machine} (ADR 0075 D1): with {@code msm:container} on the same block it is an
     * error and {@code msm:container} is not applied (a machine has its own three slots). Problems are added to
     * {@code errors}.
     */
    public BlockComponents checkMachine(List<String> errors) {
        if (machine.isEmpty() || container.isEmpty()) {
            return this;
        }
        errors.add("components: msm:machine and msm:container are not allowed together (a machine has its own three slots);"
                + " msm:container is not applied");
        return withContainer(Optional.empty());
    }

    /**
     * The load-time rules of {@code msm:container} that the Codec cannot express (ADR 0074 D1, D6; the layout dispatch of
     * {@code ::msm::definition::Container}): {@code rows} outside layout {@code chest} or {@code size} outside layout
     * {@code none} is an error and the component is not applied; {@code keep_contents} outside a 3-row chest is an error
     * and the option is turned off. Problems are added to {@code errors}.
     */
    public BlockComponents checkContainer(List<String> errors) {
        if (container.isEmpty()) {
            return this;
        }
        Container c = container.get();
        if (c.layout() != ContainerLayout.CHEST && c.rowsSetting().isPresent()) {
            errors.add("components: msm:container: rows is only for layout 'chest', not '" + c.layout().id()
                    + "'; the component is not applied");
            return withContainer(Optional.empty());
        }
        if (c.layout() != ContainerLayout.NONE && c.sizeSetting().isPresent()) {
            errors.add("components: msm:container: size is only for layout 'none', not '" + c.layout().id()
                    + "'; the component is not applied");
            return withContainer(Optional.empty());
        }
        boolean keepMisplaced = c.keepContentsSetting().isPresent() && c.layout() != ContainerLayout.CHEST;
        boolean keepWrongRows = c.keepContents() && c.rows() != 3;
        if (keepMisplaced || keepWrongRows) {
            errors.add("components: msm:container: keep_contents needs layout 'chest' with 3 rows (layout '" + c.layout().id()
                    + "'" + (c.layout() == ContainerLayout.CHEST ? ", " + c.rows() + " rows" : "") + "); it is turned off");
            return withContainer(Optional.of(c.withoutKeepContents()));
        }
        return this;
    }

    /** Every event id a component names, with the component for messages. */
    public Stream<String[]> eventReferences() {
        Stream.Builder<String[]> out = Stream.builder();
        onInteract.ifPresent(c -> out.add(new String[] {"msm:on_interact", c.event().toString()}));
        onStep.ifPresent(c -> out.add(new String[] {"msm:on_step", c.event().toString()}));
        redstone.ifPresent(c -> {
            c.onPowered().ifPresent(e -> out.add(new String[] {"msm:redstone.on_powered", e.toString()}));
            c.onUnpowered().ifPresent(e -> out.add(new String[] {"msm:redstone.on_unpowered", e.toString()}));
        });
        onBreak.ifPresent(c -> out.add(new String[] {"msm:on_break", c.event().toString()}));
        onPlace.ifPresent(c -> out.add(new String[] {"msm:on_place", c.event().toString()}));
        onRandomTick.ifPresent(c -> out.add(new String[] {"msm:on_random_tick", c.event().toString()}));
        onEntityInside.ifPresent(c -> out.add(new String[] {"msm:on_entity_inside", c.event().toString()}));
        container.ifPresent(c -> {
            c.onOpen().ifPresent(e -> out.add(new String[] {"msm:container.on_open", e.toString()}));
            c.onClose().ifPresent(e -> out.add(new String[] {"msm:container.on_close", e.toString()}));
        });
        machine.ifPresent(c -> {
            c.onStart().ifPresent(e -> out.add(new String[] {"msm:machine.on_start", e.toString()}));
            c.onFinish().ifPresent(e -> out.add(new String[] {"msm:machine.on_finish", e.toString()}));
        });
        return out.build();
    }

    /** Whether the block tracks its powered state (it has {@code on_powered} or {@code on_unpowered}). */
    public boolean reactsToRedstone() {
        return redstone.map(r -> r.onPowered().isPresent() || r.onUnpowered().isPresent()).orElse(false);
    }

    /** Constant signal strength, 0 when absent. */
    public int emit() {
        return redstone.map(Redstone::emit).orElse(0);
    }

    /** How hard the block is to break; absent means hardness 1.5, resistance 6 and no tool needed. */
    public record Breakable(float hardness, float resistance, boolean requiresTool) {
        public static final Breakable DEFAULT = new Breakable(1.5f, 6.0f, false);
        public static final Codec<Breakable> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("hardness", floatAtLeast(-1), 1.5f).forGetter(Breakable::hardness),
                optional("resistance", floatAtLeast(0), 6.0f).forGetter(Breakable::resistance),
                optional("requires_tool", Codec.BOOL, false).forGetter(Breakable::requiresTool)).apply(i, Breakable::new));
    }

    /** Light level 0 to 15. */
    public record LightEmitter(int level) {
        public static final Codec<LightEmitter> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("level", intRange(0, 15)).forGetter(LightEmitter::level)).apply(i, LightEmitter::new));
    }

    /** Fires an event when a player uses the block. */
    public record OnInteract(Identifier event) {
        public static final Codec<OnInteract> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnInteract::event)).apply(i, OnInteract::new));
    }

    /** Fires an event when an entity steps on the block, at most once per {@code cooldownTicks} per entity. */
    public record OnStep(Identifier event, int cooldownTicks) {
        public static final Codec<OnStep> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnStep::event),
                optional("cooldown_ticks", intAtLeast(0), 0).forGetter(OnStep::cooldownTicks)).apply(i, OnStep::new));
    }

    /** Fires an event when a player is about to break the block ({@code playerWillDestroy}, ADR 0061 D2), in any game mode. */
    public record OnBreak(Identifier event) {
        public static final Codec<OnBreak> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnBreak::event)).apply(i, OnBreak::new)), List.of("event"));
    }

    /** Fires an event when the block is placed ({@code setPlacedBy}, ADR 0061 D2); the placer, when there is one, is self. */
    public record OnPlace(Identifier event) {
        public static final Codec<OnPlace> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnPlace::event)).apply(i, OnPlace::new)), List.of("event"));
    }

    /**
     * Fires an event on a random tick with probability {@code chance} (ADR 0061 D2); the block gets random ticks only
     * with this component.
     */
    public record OnRandomTick(Identifier event, float chance) {
        public static final Codec<OnRandomTick> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnRandomTick::event),
                optional("chance", floatRange(0, 1), 1.0f).forGetter(OnRandomTick::chance)).apply(i, OnRandomTick::new)),
                List.of("event", "chance"));
    }

    /** Fires an event while an entity is inside the block, at most once per {@code cooldown_ticks} per entity (ADR 0061 D2). */
    public record OnEntityInside(Identifier event, int cooldownTicks) {
        public static final Codec<OnEntityInside> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnEntityInside::event),
                optional("cooldown_ticks", intAtLeast(5), 20).forGetter(OnEntityInside::cooldownTicks)).apply(i, OnEntityInside::new)),
                List.of("event", "cooldown_ticks"));
    }

    /**
     * Fire odds (ADR 0067 D3), registered with Fabric's flammable block registry: {@code burn_odds} (how readily fire
     * spreads to the block) and {@code ignite_odds} (how readily it burns away), each 0 to 300.
     */
    public record Flammable(int burnOdds, int igniteOdds) {
        public static final Codec<Flammable> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("burn_odds", intRange(0, 300)).forGetter(Flammable::burnOdds),
                required("ignite_odds", intRange(0, 300)).forGetter(Flammable::igniteOdds)).apply(i, Flammable::new)),
                List.of("burn_odds", "ignite_odds"));
    }

    /** An axe strips the block into {@code into} (ADR 0067 D3, D4); the axis is copied when both blocks have one. */
    public record Strippable(Identifier into) {
        public static final Codec<Strippable> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("into", ID).forGetter(Strippable::into)).apply(i, Strippable::new)), List.of("into"));
    }

    /** Constant signal source ({@code emit}) and events on neighbour-update power transitions. */
    public record Redstone(int emit, Optional<Identifier> onPowered, Optional<Identifier> onUnpowered) {
        public static final Codec<Redstone> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("emit", intRange(0, 15), 0).forGetter(Redstone::emit),
                optional("on_powered", ID).forGetter(Redstone::onPowered),
                optional("on_unpowered", ID).forGetter(Redstone::onUnpowered)).apply(i, Redstone::new));
    }

    /**
     * Outline and collision shape (ADR 0059 D1, {@code ::msm::definition::Shape}): pixel boxes
     * {@code [x1, y1, z1, x2, y2, z2]} from 0 to 16 (1 to 16 boxes), {@code collision} (default true) and
     * {@code see_through}. The struct is closed: the editor-only {@code preset} is an error here.
     *
     * @param boxes the boxes; empty means the full cube
     * @param seeThroughSetting {@code see_through} as written; {@link #seeThrough()} applies the default
     */
    public record Shape(Optional<List<List<Float>>> boxes, boolean collision, Optional<Boolean> seeThroughSetting) {
        public static final List<String> KEYS = List.of("boxes", "collision", "see_through");
        public static final List<Float> FULL_CUBE = List.of(0f, 0f, 0f, 16f, 16f, 16f);

        private static final Codec<List<Float>> BOX = floatRange(0, 16).listOf().validate(box -> box.size() == 6
                ? DataResult.success(box)
                : DataResult.error(() -> "a box has 6 numbers [x1, y1, z1, x2, y2, z2], not " + box.size()));
        private static final Codec<List<List<Float>>> BOXES = BOX.listOf().validate(list -> !list.isEmpty() && list.size() <= 16
                ? DataResult.success(list)
                : DataResult.error(() -> "expected 1 to 16 boxes, not " + list.size()));

        public static final Codec<Shape> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("boxes", BOXES).forGetter(Shape::boxes),
                optional("collision", Codec.BOOL, true).forGetter(Shape::collision),
                optional("see_through", Codec.BOOL).forGetter(Shape::seeThroughSetting)).apply(i, Shape::new)), KEYS);

        /** The boxes to build, the full cube when {@code boxes} is absent. */
        public List<List<Float>> boxesOrFullCube() {
            return boxes.orElse(List.of(FULL_CUBE));
        }

        /**
         * Whether the block is see-through: {@code see_through} when written, else true when {@code boxes} is
         * present and is not the single full cube (the plugin's {@code isSeeThroughBlock} rule).
         */
        public boolean seeThrough() {
            return seeThroughSetting.orElseGet(() -> boxes.isPresent()
                    && !(boxes.get().size() == 1 && isFullCube(boxes.get().getFirst())));
        }

        /** Numeric comparison, so {@code -0} counts as {@code 0} as in TypeScript. */
        private static boolean isFullCube(List<Float> box) {
            for (int n = 0; n < 6; n++) {
                if (box.get(n).floatValue() != FULL_CUBE.get(n).floatValue()) {
                    return false;
                }
            }
            return true;
        }
    }

    /** The vanilla screen a container opens ({@code ::msm::definition::ContainerLayout}, ADR 0074 D1). */
    public enum ContainerLayout {
        CHEST("chest"),
        HOPPER("hopper"),
        DISPENSER("dispenser"),
        NONE("none");

        public static final Codec<ContainerLayout> CODEC = MsmCodecs.named("container layout", values(), ContainerLayout::id);
        private final String id;

        ContainerLayout(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /**
     * Holds items in a vanilla screen ({@code ::msm::definition::Container}, ADR 0074 D1); closed. The layout-dependent
     * fields are decoded for every layout and checked by {@link BlockComponents#checkContainer}.
     *
     * @param rowsSetting {@code rows} as written (1 to 6); {@link #rows()} applies the default 3
     * @param sizeSetting {@code size} as written (1 to 9); {@link #size()} applies the default 1
     * @param keepContentsSetting {@code keep_contents} as written; {@link #keepContents()} applies the default false
     * @param openSound absent: the barrel's open sound
     * @param closeSound absent: the barrel's close sound
     */
    public record Container(ContainerLayout layout, Optional<Integer> rowsSetting, Optional<Integer> sizeSetting,
            Optional<Boolean> keepContentsSetting, boolean hoppers, boolean comparator, Optional<Identifier> openSound,
            Optional<Identifier> closeSound, Optional<Identifier> onOpen, Optional<Identifier> onClose) {
        public static final List<String> KEYS = List.of("layout", "rows", "size", "keep_contents", "hoppers", "comparator",
                "open_sound", "close_sound", "on_open", "on_close");

        public static final Codec<Container> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("layout", ContainerLayout.CODEC, ContainerLayout.CHEST).forGetter(Container::layout),
                optional("rows", intRange(1, 6)).forGetter(Container::rowsSetting),
                optional("size", intRange(1, 9)).forGetter(Container::sizeSetting),
                optional("keep_contents", Codec.BOOL).forGetter(Container::keepContentsSetting),
                optional("hoppers", Codec.BOOL, true).forGetter(Container::hoppers),
                optional("comparator", Codec.BOOL, true).forGetter(Container::comparator),
                optional("open_sound", ID).forGetter(Container::openSound),
                optional("close_sound", ID).forGetter(Container::closeSound),
                optional("on_open", ID).forGetter(Container::onOpen),
                optional("on_close", ID).forGetter(Container::onClose)).apply(i, Container::new)), KEYS);

        /** Rows of nine of a {@code chest} layout: as written, else 3. */
        public int rows() {
            return rowsSetting.orElse(3);
        }

        /** Slots of a {@code none} layout (a holder): as written, else 1. */
        public int size() {
            return sizeSetting.orElse(1);
        }

        /** Whether the block keeps its contents when broken (ADR 0074 D6), as a shulker box. */
        public boolean keepContents() {
            return keepContentsSetting.orElse(false);
        }

        /** The number of slots: {@code 9 * rows} (chest), 5 (hopper), 9 (dispenser) or {@code size} (none). */
        public int slotCount() {
            return switch (layout) {
                case CHEST -> 9 * rows();
                case HOPPER -> 5;
                case DISPENSER -> 9;
                case NONE -> size();
            };
        }

        /** This container with {@code keep_contents} turned off. */
        public Container withoutKeepContents() {
            return new Container(layout, rowsSetting, sizeSetting, Optional.empty(), hoppers, comparator, openSound, closeSound,
                    onOpen, onClose);
        }
    }

    /** How a machine is powered ({@code ::msm::definition::MachinePower}, ADR 0075 D1). */
    public enum MachinePower {
        /** Burns {@code minecraft:cooking_fuel} items from the fuel slot, as a furnace. */
        FUEL("fuel"),
        /** Works only while the block receives a redstone signal; takes no fuel. */
        REDSTONE("redstone"),
        /** Works whenever it has a matching input. */
        ALWAYS("always");

        public static final Codec<MachinePower> CODEC = MsmCodecs.named("machine power", values(), MachinePower::id);
        private final String id;

        MachinePower(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /** The vanilla screen a machine opens ({@code ::msm::definition::MachineMenu}, ADR 0075 D4). */
    public enum MachineMenu {
        FURNACE("furnace"),
        BLAST_FURNACE("blast_furnace"),
        SMOKER("smoker");

        public static final Codec<MachineMenu> CODEC = MsmCodecs.named("machine menu", values(), MachineMenu::id);
        private final String id;

        MachineMenu(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /** What comparators read from a machine ({@code ::msm::definition::MachineComparator}, ADR 0075 D5). */
    public enum MachineComparator {
        /** The container formula, as a furnace. */
        CONTENTS("contents"),
        /** {@code ceil(15 * progress / total)} while working, else 0. */
        PROGRESS("progress"),
        /** No signal. */
        NONE("none");

        public static final Codec<MachineComparator> CODEC = MsmCodecs.named("machine comparator", values(), MachineComparator::id);
        private final String id;

        MachineComparator(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    /**
     * Processes items over time in a furnace screen ({@code ::msm::definition::Machine}, ADR 0075 D1); closed. Three slots:
     * input (0), fuel (1), output (2).
     *
     * @param recipeTypesSetting {@code recipe_types} as written (1 to 5 ids); {@link #recipeTypes} applies the default
     * @param power default {@code fuel}
     * @param speed multiplies progress per tick, 0.1 to 10; default 1
     * @param defaultTime ticks of a recipe without its own {@code time}, 1 to 32767; default 200
     * @param menuSetting {@code menu} as written; {@link #menu} applies the default
     * @param hoppers default true: a furnace's faces (ADR 0075 D5)
     * @param comparator default {@code contents}
     * @param litLight light while working, 0 to 15; default 13
     * @param onStart event when a recipe starts, at the block with no actor
     * @param onFinish event when an output is made, at the block with no actor
     */
    public record Machine(Optional<List<Identifier>> recipeTypesSetting, MachinePower power, float speed, int defaultTime,
            Optional<MachineMenu> menuSetting, boolean hoppers, MachineComparator comparator, int litLight,
            Optional<Identifier> onStart, Optional<Identifier> onFinish) {
        public static final List<String> KEYS = List.of("recipe_types", "power", "speed", "default_time", "menu", "hoppers",
                "comparator", "lit_light", "on_start", "on_finish");
        /** The vanilla cooking recipe types a machine may take (the target fact {@code BlockFacts.machineRecipeTypes}). */
        public static final List<Identifier> COOKING_TYPES = List.of(Identifier.withDefaultNamespace("smelting"),
                Identifier.withDefaultNamespace("blasting"), Identifier.withDefaultNamespace("smoking"),
                Identifier.withDefaultNamespace("campfire_cooking"));

        public static final Codec<Machine> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                optional("recipe_types", MsmCodecs.listOfLength(ID, 1, 5)).forGetter(Machine::recipeTypesSetting),
                optional("power", MachinePower.CODEC, MachinePower.FUEL).forGetter(Machine::power),
                optional("speed", floatRange(0.1f, 10f), 1.0f).forGetter(Machine::speed),
                optional("default_time", intRange(1, 32767), 200).forGetter(Machine::defaultTime),
                optional("menu", MachineMenu.CODEC).forGetter(Machine::menuSetting),
                optional("hoppers", Codec.BOOL, true).forGetter(Machine::hoppers),
                optional("comparator", MachineComparator.CODEC, MachineComparator.CONTENTS).forGetter(Machine::comparator),
                optional("lit_light", intRange(0, 15), 13).forGetter(Machine::litLight),
                optional("on_start", ID).forGetter(Machine::onStart),
                optional("on_finish", ID).forGetter(Machine::onFinish)).apply(i, Machine::new)), KEYS);

        /** The recipe types the machine processes, in order: as written, else the machine's own id {@code self}. */
        public List<Identifier> recipeTypes(Identifier self) {
            return recipeTypesSetting.orElse(List.of(self));
        }

        /**
         * The screen: as written, else from the first vanilla cooking type in {@link #recipeTypes} ({@code blasting} a
         * blast furnace, {@code smoking} a smoker), otherwise a furnace.
         */
        public MachineMenu menu(Identifier self) {
            if (menuSetting.isPresent()) {
                return menuSetting.get();
            }
            for (Identifier type : recipeTypes(self)) {
                if (COOKING_TYPES.contains(type)) {
                    return switch (type.getPath()) {
                        case "blasting" -> MachineMenu.BLAST_FURNACE;
                        case "smoking" -> MachineMenu.SMOKER;
                        default -> MachineMenu.FURNACE;
                    };
                }
            }
            return MachineMenu.FURNACE;
        }
    }
}
