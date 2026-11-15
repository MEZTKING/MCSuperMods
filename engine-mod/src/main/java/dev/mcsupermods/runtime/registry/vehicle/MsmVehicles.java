package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.loader.VehicleParser;
import java.util.ArrayList;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.tags.TagKey;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;

/**
 * Project vehicles (ADR 0090 D1, D5): one entity type ({@link MsmVehicle}, or {@link MsmStorageVehicle} with
 * {@code storage}) and one {@link MsmVehicleItem} under the same id per {@code vehicle} definition, the item in vanilla's
 * Tools and Utilities tab beside the boats. A vehicle id that is already an entity type or an item is an error and
 * nothing of it is registered. Registered once, at initialisation (registry freeze: a new vehicle needs a restart).
 */
public final class MsmVehicles {
    /** Chunks; vanilla's boats' tracking range. */
    static final int TRACKING_RANGE = 10;
    /** Vanilla's Tools and Utilities tab, where the boats are. */
    static final ResourceKey<CreativeModeTab> TAB = ResourceKey.create(Registries.CREATIVE_MODE_TAB,
            Identifier.withDefaultNamespace("tools_and_utilities"));

    /** One registered vehicle type. */
    public record Entry(Identifier id, VehicleDefinition definition, VehiclePhysics.Constants constants, EntityType<? extends MsmVehicle> type,
            Item item) {}

    private static final Map<Identifier, Entry> BY_ID = new LinkedHashMap<>();
    private static final Map<EntityType<?>, Entry> BY_TYPE = new IdentityHashMap<>();

    private MsmVehicles() {}

    /**
     * Parses the scanned {@code vehicle} definitions, registers their entity types and items, and returns {@code report}
     * with the vehicle types registered and any errors and warnings; called once from {@code MsmRuntime.onInitialize},
     * after the registrar and before the key binds and HUD elements (which may name a vehicle). Also adds the horn's key
     * listener ({@link VehicleHorn}).
     */
    public static LoadReport register(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, VehicleDefinition> parsed = VehicleParser.parseAll(report.definitions(), errors, warnings);
        List<Identifier> registered = new ArrayList<>();
        for (Map.Entry<Identifier, VehicleDefinition> e : parsed.entrySet()) {
            Identifier id = e.getKey();
            String file = "msm/" + id.getNamespace() + "/vehicle/" + id.getPath() + ".json";
            if (BuiltInRegistries.ENTITY_TYPE.containsKey(id)) {
                errors.add(file + ": entity type " + id + " is already registered; vehicle not registered");
                continue;
            }
            if (BuiltInRegistries.ITEM.containsKey(id)) {
                errors.add(file + ": item " + id + " is already registered; vehicle not registered");
                continue;
            }
            try {
                registerOne(id, e.getValue());
                registered.add(id);
            } catch (RuntimeException ex) {
                errors.add(file + ": " + ex.getMessage() + "; vehicle not registered");
            }
        }
        errors.forEach(message -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message));
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        if (!registered.isEmpty()) {
            CreativeModeTabEvents.modifyOutputEvent(TAB).register(output -> {
                for (Identifier id : registered) {
                    output.accept(BY_ID.get(id).item());
                }
            });
        }
        VehicleHorn.register();
        return report.withVehicles(registered, errors, warnings);
    }

    private static void registerOne(Identifier id, VehicleDefinition def) {
        VehiclePhysics.Constants constants = VehiclePhysics.Constants.of(def.movement());
        ResourceKey<EntityType<?>> typeKey = ResourceKey.create(Registries.ENTITY_TYPE, id);
        EntityType.EntityFactory<MsmVehicle> factory = def.storage().isPresent() ? MsmStorageVehicle::new : MsmVehicle::new;
        EntityType<MsmVehicle> type = EntityType.Builder.of(factory, MobCategory.MISC)
                .noLootTable()
                .sized(def.width(), def.height())
                .clientTrackingRange(TRACKING_RANGE)
                .build(typeKey);
        ResourceKey<Item> itemKey = ResourceKey.create(Registries.ITEM, id);
        Item.Properties properties = new Item.Properties().setId(itemKey).stacksTo(1);
        if (def.item().name().isPresent()) {
            properties = properties.overrideDescription(def.item().name().get());
        }
        MsmVehicleItem item = new MsmVehicleItem(id, properties);
        Entry entry = new Entry(id, def, constants, type, item);
        BY_ID.put(id, entry);
        BY_TYPE.put(type, entry);
        Registry.register(BuiltInRegistries.ENTITY_TYPE, typeKey, type);
        Registry.register(BuiltInRegistries.ITEM, itemKey, item);
    }

    /** The entry of a vehicle entity type; every {@link MsmVehicle} has one. */
    static Entry entry(EntityType<?> type) {
        Entry entry = BY_TYPE.get(type);
        if (entry == null) {
            throw new IllegalStateException("not a vehicle type: " + type);
        }
        return entry;
    }

    /** The registered vehicle {@code id}. */
    public static Optional<Entry> entry(Identifier id) {
        return Optional.ofNullable(BY_ID.get(id));
    }

    /** Every registered vehicle type, by id in scan order. */
    public static Map<Identifier, Entry> all() {
        return Collections.unmodifiableMap(BY_ID);
    }

    /** Whether {@code stack} is the item {@code idOrTag} names (an item id, or {@code #} an item tag). */
    public static boolean matches(ItemStack stack, String idOrTag) {
        if (stack.isEmpty()) {
            return false;
        }
        if (idOrTag.startsWith("#")) {
            Identifier tag = Identifier.tryParse(idOrTag.substring(1));
            return tag != null && stack.is(TagKey.create(Registries.ITEM, tag));
        }
        Identifier id = Identifier.tryParse(idOrTag);
        return id != null && BuiltInRegistries.ITEM.getKey(stack.getItem()).equals(id);
    }
}
