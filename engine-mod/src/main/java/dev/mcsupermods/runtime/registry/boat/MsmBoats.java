package dev.mcsupermods.runtime.registry.boat;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.loader.BoatParser;
import dev.mcsupermods.runtime.loader.DefinitionException;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.registry.MsmCreativeTabs;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.dispenser.BoatDispenseItemBehavior;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.entity.vehicle.boat.Boat;
import net.minecraft.world.entity.vehicle.boat.ChestBoat;
import net.minecraft.world.entity.vehicle.boat.ChestRaft;
import net.minecraft.world.entity.vehicle.boat.Raft;
import net.minecraft.world.item.BoatItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.level.block.DispenserBlock;

/**
 * Boats and chest boats of project woods (ADR 0110 D1 and its amendment after B524). An item with {@code msm:boat} is
 * vanilla's boat under the item's own id: {@link #itemFor} (called by {@code MsmRegistrar} in place of a plain
 * {@code MsmItem}) registers the entity type {@code <item id>} as vanilla's {@link Boat} (or {@link Raft} with
 * {@code raft}) and returns the {@link MsmBoatItem} that places it; with {@code chest} it also registers the companion
 * {@code <wood>_chest_boat} ({@code _chest_raft}; {@link BoatParser.Boat#chestBoatId}) as an item (vanilla's
 * {@link BoatItem}) and an entity type (vanilla's {@link ChestBoat} or {@link ChestRaft}). Sizes, tracking range and
 * update interval are those of vanilla's oak boat, oak chest boat, bamboo raft and bamboo chest raft, read from
 * {@link EntityTypes} at registration. No class of our own drives a boat: paddling, water and ice, the two seats, the chest
 * menu and the drops on breaking are vanilla's.
 *
 * <p>{@link #register} (from {@code MsmRuntime}, after every item) gives each boat item and chest boat item vanilla's
 * boat dispenser behaviour ({@link BoatDispenseItemBehavior}: a dispenser facing water puts the boat on it, as for
 * vanilla's boats), puts the chest boat into the boat's creative tab right after it, and records the entity types in the
 * report. The client draws them with vanilla's renderer ({@code client.boat.BoatRenderers}).
 */
public final class MsmBoats {
    private MsmBoats() {}

    /**
     * One project boat as registered.
     *
     * @param itemId     the boat item's id, also its entity type's
     * @param boat       the boat's entity type
     * @param boatItem   the boat item
     * @param chest      the chest boat's entity type, if the boat has one
     * @param chestItem  the chest boat item, if the boat has one
     * @param raft       whether both are rafts (drawn and sized as vanilla's bamboo raft)
     * @param wood       the wood the pictures are named after ({@link BoatParser.Boat#woodOf})
     * @param tab        the creative tab of the boat item's definition, if any
     */
    public record Registered(Identifier itemId, EntityType<? extends AbstractBoat> boat, Item boatItem,
            Optional<EntityType<? extends AbstractBoat>> chest, Optional<Item> chestItem, boolean raft, Identifier wood,
            Optional<Identifier> tab) {
        /** The chest boat's id, if the boat has one. */
        public Optional<Identifier> chestId() {
            return chest.map(BuiltInRegistries.ENTITY_TYPE::getKey);
        }
    }

    private static final List<Registered> BOATS = new ArrayList<>();

    /** The boats registered so far, in definition order. */
    public static List<Registered> boats() {
        return List.copyOf(BOATS);
    }

    /** The registered boat whose boat or chest boat entity type is {@code type}, if any. */
    public static Optional<Registered> of(EntityType<?> type) {
        return BOATS.stream().filter(b -> b.boat() == type || b.chest().filter(c -> c == type).isPresent()).findFirst();
    }

    /**
     * The boat item of an item definition with {@code msm:boat}, its entity type registered and, with {@code chest}, the
     * chest boat's item and entity type registered too. The returned item is not registered yet: the caller registers it
     * under {@code raw.id()} (as every other item). An entity type id that is taken is an error: the whole item then fails;
     * a chest boat whose item or entity type id is taken is an error too, and the boat comes without it.
     *
     * @throws DefinitionException when the boat's entity type id is already registered
     */
    public static Item itemFor(RawDefinition raw, ItemDefinition definition, Item.Properties properties, List<String> errors,
            List<String> warnings) throws DefinitionException {
        Identifier id = raw.id();
        BoatParser.Boat spec = definition.components().boat().orElseThrow();
        if (BuiltInRegistries.ENTITY_TYPE.containsKey(id)) {
            throw new DefinitionException("msm:boat: entity type id " + id + " is already registered");
        }
        List<String> ignored = ignoredComponents(definition.components());
        if (!ignored.isEmpty()) {
            warn(warnings, raw.describe() + ": msm:boat: " + String.join(", ", ignored)
                    + " ignored; using a boat item places the boat");
        }
        AtomicReference<Item> boatItem = new AtomicReference<>();
        EntityType<? extends AbstractBoat> boatType = spec.raft()
                ? MsmBoats.<Raft>type(id, (t, level) -> new Raft(t, level, boatItem::get), EntityTypes.BAMBOO_RAFT)
                : MsmBoats.<Boat>type(id, (t, level) -> new Boat(t, level, boatItem::get), EntityTypes.OAK_BOAT);
        MsmBoatItem item = new MsmBoatItem(id, definition, boatType, properties);
        boatItem.set(item);

        Optional<EntityType<? extends AbstractBoat>> chestType = Optional.empty();
        Optional<Item> chestItem = Optional.empty();
        if (spec.chest()) {
            Identifier chestId = spec.chestBoatId(id);
            if (BuiltInRegistries.ITEM.containsKey(chestId) || BuiltInRegistries.ENTITY_TYPE.containsKey(chestId)) {
                error(errors, raw.describe() + ": msm:boat: chest boat id " + chestId + " is already registered; the boat has no chest boat");
            } else {
                AtomicReference<Item> chestRef = new AtomicReference<>();
                EntityType<? extends AbstractBoat> type = spec.raft()
                        ? MsmBoats.<ChestRaft>type(chestId, (t, level) -> new ChestRaft(t, level, chestRef::get), EntityTypes.BAMBOO_CHEST_RAFT)
                        : MsmBoats.<ChestBoat>type(chestId, (t, level) -> new ChestBoat(t, level, chestRef::get), EntityTypes.OAK_CHEST_BOAT);
                ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, chestId);
                Item chest = Registry.register(BuiltInRegistries.ITEM, key, new BoatItem(type, new Item.Properties().setId(key).stacksTo(1)));
                chestRef.set(chest);
                chestType = Optional.of(type);
                chestItem = Optional.of(chest);
            }
        }
        BOATS.add(new Registered(id, boatType, item, chestType, chestItem, spec.raft(), spec.woodOf(id), definition.creativeTab()));
        return item;
    }

    /**
     * The dispenser behaviour of every boat and chest boat item, the chest boats in their boat's creative tab, and the
     * report with the registered entity types (boats and chest boats).
     */
    public static LoadReport register(LoadReport report) {
        List<Identifier> ids = new ArrayList<>();
        for (Registered boat : BOATS) {
            if (!BuiltInRegistries.ITEM.containsKey(boat.itemId()) || BuiltInRegistries.ITEM.getValue(boat.itemId()) != boat.boatItem()) {
                continue; // the item itself failed to register (an error was logged for it)
            }
            DispenserBlock.registerBehavior(boat.boatItem(), new BoatDispenseItemBehavior(boat.boat()));
            ids.add(boat.itemId());
            if (boat.chest().isPresent() && boat.chestItem().isPresent()) {
                Item chest = boat.chestItem().get();
                DispenserBlock.registerBehavior(chest, new BoatDispenseItemBehavior(boat.chest().get()));
                ids.add(boat.chestId().orElseThrow());
                // After MsmRegistrar's listener for the boat item, so the chest boat comes right after it.
                boat.tab().ifPresent(tab -> CreativeModeTabEvents.modifyOutputEvent(
                        ResourceKey.create(Registries.CREATIVE_MODE_TAB, MsmCreativeTabs.resolve(tab).orElse(tab)))
                        .register(output -> output.accept(chest)));
            }
        }
        // Errors and warnings of itemFor went into MsmRegistrar's lists (and the report) with the item.
        return report.withBoats(ids, List.of(), List.of());
    }

    private static <T extends AbstractBoat> EntityType<T> type(Identifier id, EntityType.EntityFactory<T> factory, EntityType<?> like) {
        ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, id);
        EntityDimensions size = like.getDimensions();
        return Registry.register(BuiltInRegistries.ENTITY_TYPE, key, EntityType.Builder.of(factory, MobCategory.MISC)
                .noLootTable()
                .sized(size.width(), size.height())
                .eyeHeight(size.eyeHeight())
                .clientTrackingRange(like.clientTrackingRange())
                .updateInterval(like.updateInterval())
                .build(key));
    }

    /** The components a boat item cannot honour: each would own the item's class or its use. */
    private static List<String> ignoredComponents(ItemComponents c) {
        List<String> ignored = new ArrayList<>();
        c.throwable().ifPresent(x -> ignored.add("msm:throwable"));
        c.rangedWeapon().ifPresent(x -> ignored.add("msm:ranged_weapon"));
        c.tool().filter(t -> t.type() == ItemComponents.ToolType.MACE).ifPresent(x -> ignored.add("msm:tool (mace)"));
        return ignored;
    }

    private static void error(List<String> errors, String message) {
        errors.add(message);
        MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
    }

    private static void warn(List<String> warnings, String message) {
        warnings.add(message);
        MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
    }
}
