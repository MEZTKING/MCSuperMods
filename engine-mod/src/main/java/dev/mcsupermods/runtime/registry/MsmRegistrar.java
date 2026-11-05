package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.DefinitionException;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;

/** Turns parsed definitions into registry entries. Runs once, from {@code onInitialize}. */
public final class MsmRegistrar {
    /** Spike subset of the vanilla {@link SoundType} constants; B93 completes the table. */
    private static final Map<String, SoundType> SOUND_TYPES = Map.of(
            "stone", SoundType.STONE,
            "wood", SoundType.WOOD,
            "metal", SoundType.METAL,
            "glass", SoundType.GLASS,
            "gravel", SoundType.GRAVEL,
            "grass", SoundType.GRASS,
            "sand", SoundType.SAND,
            "wool", SoundType.WOOL,
            "amethyst", SoundType.AMETHYST);

    private MsmRegistrar() {}

    public static LoadReport registerAll(LoadReport scanned) {
        List<Identifier> blocks = new ArrayList<>();
        List<Identifier> items = new ArrayList<>();
        List<String> errors = new ArrayList<>(scanned.errors());
        // Blocks first, so a block's item exists before any item definition could collide with it.
        for (RawDefinition raw : scanned.definitions()) {
            if (!raw.kind().equals("block")) {
                continue;
            }
            try {
                registerBlock(raw.id(), BlockDefinition.parse(raw.json()), items);
                blocks.add(raw.id());
            } catch (DefinitionException | RuntimeException e) {
                fail(errors, raw, e);
            }
        }
        for (RawDefinition raw : scanned.definitions()) {
            if (!raw.kind().equals("item")) {
                continue;
            }
            try {
                if (BuiltInRegistries.ITEM.containsKey(raw.id())) {
                    throw new DefinitionException("item id " + raw.id() + " is already registered");
                }
                registerItem(raw.id(), ItemDefinition.parse(raw.json()));
                items.add(raw.id());
            } catch (DefinitionException | RuntimeException e) {
                fail(errors, raw, e);
            }
        }
        return new LoadReport(scanned.filesRead(), scanned.definitions(), List.copyOf(blocks), List.copyOf(items), List.copyOf(errors));
    }

    private static void fail(List<String> errors, RawDefinition raw, Exception e) {
        String message = raw.describe() + ": " + e.getMessage();
        errors.add(message);
        MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message, e instanceof DefinitionException ? null : e);
    }

    private static void registerBlock(Identifier id, BlockDefinition def, List<Identifier> items) throws DefinitionException {
        SoundType sound = SOUND_TYPES.get(def.soundType());
        if (sound == null) {
            throw new DefinitionException("unknown sound_type '" + def.soundType() + "'");
        }
        ResourceKey<Block> blockKey = ResourceKey.create(Registries.BLOCK, id);
        int light = def.lightLevel();
        BlockBehaviour.Properties props = BlockBehaviour.Properties.of()
                .setId(blockKey) // required since 1.21.2: the constructor reads the id from the properties
                .strength(def.hardness(), def.resistance())
                .sound(sound)
                .lightLevel(state -> light);
        if (def.requiresTool()) {
            props = props.requiresCorrectToolForDrops();
        }
        MsmBlock block = Registry.register(BuiltInRegistries.BLOCK, blockKey, new MsmBlock(id, def, props));

        BlockDefinition.ItemSettings settings = def.item();
        if (settings == null) {
            return;
        }
        ResourceKey<Item> itemKey = ResourceKey.create(Registries.ITEM, id);
        Item.Properties itemProps = new Item.Properties()
                .setId(itemKey)
                .useBlockDescriptionPrefix() // name from block.<ns>.<path>, as vanilla block items do
                .stacksTo(settings.maxStackSize())
                .rarity(rarity(settings.rarity()));
        BlockItem item = Registry.register(BuiltInRegistries.ITEM, itemKey, new BlockItem(block, itemProps));
        items.add(id);
        addToTab(settings.creativeTab(), item);
    }

    private static void registerItem(Identifier id, ItemDefinition def) throws DefinitionException {
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, id);
        Item.Properties props = new Item.Properties()
                .setId(key)
                .stacksTo(def.maxStackSize())
                .rarity(rarity(def.rarity()));
        MsmItem item = Registry.register(BuiltInRegistries.ITEM, key, new MsmItem(def, props));
        addToTab(def.creativeTab(), item);
    }

    private static Rarity rarity(String name) throws DefinitionException {
        return switch (name.toLowerCase(Locale.ROOT)) {
            case "common" -> Rarity.COMMON;
            case "uncommon" -> Rarity.UNCOMMON;
            case "rare" -> Rarity.RARE;
            case "epic" -> Rarity.EPIC;
            default -> throw new DefinitionException("unknown rarity '" + name + "'");
        };
    }

    private static void addToTab(Identifier tab, Item item) {
        if (tab == null) {
            return;
        }
        // Tabs are resolved by key when the tab is built; an unknown tab key simply never fires.
        CreativeModeTabEvents.modifyOutputEvent(ResourceKey.create(Registries.CREATIVE_MODE_TAB, tab))
                .register(output -> output.accept(item));
    }
}
