package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.Events;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.DefinitionException;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.MsmRarity;
import dev.mcsupermods.runtime.loader.MsmSoundType;
import dev.mcsupermods.runtime.loader.ParseResult;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.Registry;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.ToolMaterial;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockBehaviour;

/** Turns parsed definitions into registry entries. Runs once, from {@code onInitialize}. */
public final class MsmRegistrar {
    /** Ids checked after start-up, when every mod's content and the data packs exist. */
    private record LateCheck(String file, String what, Identifier id) {}

    private static final List<LateCheck> LATE = new ArrayList<>();
    private static final Map<String, List<String>> LATE_STATES = new LinkedHashMap<>();

    private MsmRegistrar() {}

    public static LoadReport registerAll(LoadReport scanned) {
        List<Identifier> blocks = new ArrayList<>();
        List<Identifier> items = new ArrayList<>();
        List<String> errors = new ArrayList<>(scanned.errors());
        List<String> warnings = new ArrayList<>(scanned.warnings());
        // Blocks first, so a block's item exists before any item definition could collide with it.
        for (RawDefinition raw : scanned.definitions()) {
            if (!raw.kind().equals("block")) {
                continue;
            }
            ParseResult<BlockDefinition> parsed = DefinitionParser.parseBlock(raw.json());
            report(raw, parsed, errors, warnings);
            if (parsed.definition().isEmpty()) {
                continue;
            }
            try {
                BlockDefinition def = parsed.definition().get();
                checkEvents(raw, def.events(), errors);
                registerBlock(raw, def, items);
                blocks.add(raw.id());
            } catch (RuntimeException e) {
                fail(errors, raw, e);
            }
        }
        for (RawDefinition raw : scanned.definitions()) {
            if (!raw.kind().equals("item")) {
                continue;
            }
            ParseResult<ItemDefinition> parsed = DefinitionParser.parseItem(raw.json());
            report(raw, parsed, errors, warnings);
            if (parsed.definition().isEmpty()) {
                continue;
            }
            try {
                if (BuiltInRegistries.ITEM.containsKey(raw.id())) {
                    throw new DefinitionException("item id " + raw.id() + " is already registered");
                }
                ItemDefinition def = parsed.definition().get();
                checkEvents(raw, def.events(), errors);
                registerItem(raw, def, warnings);
                items.add(raw.id());
            } catch (DefinitionException | RuntimeException e) {
                fail(errors, raw, e);
            }
        }
        // Entities last: their spawn eggs count as items and must not collide with item definitions.
        MsmEntityRegistrar.registerAll(scanned.definitions(), items, errors);
        return new LoadReport(scanned.filesRead(), scanned.definitions(), List.copyOf(blocks), List.copyOf(items),
                List.copyOf(errors), List.copyOf(warnings));
    }

    private static void report(RawDefinition raw, ParseResult<?> parsed, List<String> errors, List<String> warnings) {
        for (String e : parsed.errors()) {
            String message = raw.describe() + ": " + e;
            errors.add(message);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
        }
        for (String w : parsed.warnings()) {
            String message = raw.describe() + ": " + w;
            warnings.add(message);
            MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
        }
    }

    private static void fail(List<String> errors, RawDefinition raw, Exception e) {
        String message = raw.describe() + ": " + e.getMessage();
        errors.add(message);
        MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message, e instanceof DefinitionException ? null : e);
    }

    /**
     * Checks ids that vanilla has already bootstrapped (sounds, particles) and queues the rest
     * (items, block states, functions) for {@link #checkAfterStart}: they may name content of mods
     * registered later, or data pack files.
     */
    private static void checkEvents(RawDefinition raw, Events events, List<String> errors) {
        events.byId().forEach((eventId, event) -> {
            for (Action action : event.actions()) {
                String where = raw.describe() + ": events: " + eventId + ": ";
                switch (action) {
                    case Action.PlaySound a when !BuiltInRegistries.SOUND_EVENT.containsKey(a.sound()) -> {
                        errors.add(where + "unknown sound " + a.sound());
                        MsmRuntime.LOGGER.error("[{}] {}unknown sound {}", MsmRuntime.MOD_ID, where, a.sound());
                    }
                    case Action.SpawnParticle a when !(BuiltInRegistries.PARTICLE_TYPE.containsKey(a.particle())
                            && BuiltInRegistries.PARTICLE_TYPE.getValue(a.particle()) instanceof SimpleParticleType) -> {
                        errors.add(where + a.particle() + " is not a particle type without options");
                        MsmRuntime.LOGGER.error("[{}] {}{} is not a particle type without options", MsmRuntime.MOD_ID, where, a.particle());
                    }
                    case Action.GiveItem a -> LATE.add(new LateCheck(raw.describe(), "give_item item", a.item()));
                    case Action.RunFunction a -> LATE.add(new LateCheck(raw.describe(), "run_function function", a.function()));
                    case Action.SetBlockState a -> LATE_STATES.computeIfAbsent(a.state(), s -> new ArrayList<>()).add(raw.describe());
                    default -> {}
                }
            }
        });
    }

    private static void registerBlock(RawDefinition raw, BlockDefinition def, List<Identifier> items) {
        Identifier id = raw.id();
        BlockComponents c = def.components();
        BlockComponents.Breakable breakable = c.breakable().orElse(BlockComponents.Breakable.DEFAULT);
        int light = c.lightEmitter().map(BlockComponents.LightEmitter::level).orElse(0);
        ResourceKey<Block> blockKey = ResourceKey.create(Registries.BLOCK, id);
        BlockBehaviour.Properties props = BlockBehaviour.Properties.of()
                .setId(blockKey) // required since 1.21.2: the constructor reads the id from the properties
                .strength(breakable.hardness(), breakable.resistance())
                .sound(soundType(def.soundType()))
                .lightLevel(state -> light);
        if (breakable.requiresTool()) {
            props = props.requiresCorrectToolForDrops();
        }
        if (def.lootTable().isPresent()) {
            props = props.overrideLootTable(Optional.of(ResourceKey.create(Registries.LOOT_TABLE, def.lootTable().get())));
        }
        MsmBlock block = Registry.register(BuiltInRegistries.BLOCK, blockKey, MsmBlock.create(id, def, props));

        if (def.item().isEmpty()) {
            return; // "item": false
        }
        BlockDefinition.ItemSettings settings = def.item().get();
        ResourceKey<Item> itemKey = ResourceKey.create(Registries.ITEM, id);
        Item.Properties itemProps = new Item.Properties()
                .setId(itemKey)
                .useBlockDescriptionPrefix() // name from block.<ns>.<path>, as vanilla block items do
                .stacksTo(settings.maxStackSize())
                .rarity(rarity(settings.rarity()));
        BlockItem item = Registry.register(BuiltInRegistries.ITEM, itemKey, new BlockItem(block, itemProps));
        items.add(id);
        settings.creativeTab().ifPresent(tab -> addToTab(raw, tab, item));
    }

    private static void registerItem(RawDefinition raw, ItemDefinition def, List<String> warnings) {
        Identifier id = raw.id();
        ItemComponents c = def.components();
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, id);
        Item.Properties props = new Item.Properties().setId(key).rarity(rarity(def.rarity()));
        if (c.damageable()) {
            if (def.maxStackSize() != 1 && raw.json().has("max_stack_size")) {
                String message = raw.describe() + ": max_stack_size " + def.maxStackSize() + " ignored; tools and items with durability stack to 1";
                warnings.add(message);
                MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
            }
        } else {
            props = props.stacksTo(def.maxStackSize());
        }
        if (c.food().isPresent()) {
            ItemComponents.Food food = c.food().get();
            FoodProperties.Builder builder = new FoodProperties.Builder()
                    .nutrition(food.nutrition())
                    .saturationModifier(food.saturation());
            if (food.canAlwaysEat()) {
                builder = builder.alwaysEdible();
            }
            props = props.food(builder.build());
        }
        if (c.tool().isPresent()) {
            props = tool(props, c.tool().get());
        }
        if (c.durability().isPresent()) {
            props = props.durability(c.durability().get().max()); // after tool(): overrides the tier's durability
        }
        MsmItem item = Registry.register(BuiltInRegistries.ITEM, key, new MsmItem(id, def, props));
        def.creativeTab().ifPresent(tab -> addToTab(raw, tab, item));
    }

    /**
     * {@code msm:tool} through the vanilla tool helpers on {@code Item.Properties} (checked against
     * the 26.3 jar). Attack damage and speed are the vanilla iron-tier base values per tool type;
     * the tier's material adds its own bonus, speed, durability and drop tier.
     */
    private static Item.Properties tool(Item.Properties props, ItemComponents.Tool tool) {
        ToolMaterial material = switch (tool.tier()) {
            case WOOD -> ToolMaterial.WOOD;
            case STONE -> ToolMaterial.STONE;
            case COPPER -> ToolMaterial.COPPER;
            case IRON -> ToolMaterial.IRON;
            case DIAMOND -> ToolMaterial.DIAMOND;
            case GOLD -> ToolMaterial.GOLD;
            case NETHERITE -> ToolMaterial.NETHERITE;
        };
        return switch (tool.type()) {
            case PICKAXE -> props.pickaxe(material, 1.0f, -2.8f);
            case AXE -> props.axe(material, 6.0f, -3.1f);
            case SHOVEL -> props.shovel(material, 1.5f, -3.0f);
            case HOE -> props.hoe(material, -2.0f, -1.0f);
            case SWORD -> props.sword(material, 3.0f, -2.4f);
        };
    }

    private static Rarity rarity(MsmRarity rarity) {
        return switch (rarity) {
            case COMMON -> Rarity.COMMON;
            case UNCOMMON -> Rarity.UNCOMMON;
            case RARE -> Rarity.RARE;
            case EPIC -> Rarity.EPIC;
        };
    }

    private static final Map<MsmSoundType, SoundType> SOUND_TYPES = new EnumMap<>(MsmSoundType.class);

    /** Maps each mcdoc sound type onto the vanilla constant of the same name. */
    private static SoundType soundType(MsmSoundType type) {
        if (SOUND_TYPES.isEmpty()) {
            for (MsmSoundType t : MsmSoundType.values()) {
                SOUND_TYPES.put(t, switch (t) {
                    case STONE -> SoundType.STONE;
                    case WOOD -> SoundType.WOOD;
                    case GRAVEL -> SoundType.GRAVEL;
                    case GRASS -> SoundType.GRASS;
                    case METAL -> SoundType.METAL;
                    case GLASS -> SoundType.GLASS;
                    case WOOL -> SoundType.WOOL;
                    case SAND -> SoundType.SAND;
                    case SNOW -> SoundType.SNOW;
                    case LADDER -> SoundType.LADDER;
                    case ANVIL -> SoundType.ANVIL;
                    case SLIME_BLOCK -> SoundType.SLIME_BLOCK;
                    case HONEY_BLOCK -> SoundType.HONEY_BLOCK;
                    case CORAL_BLOCK -> SoundType.CORAL_BLOCK;
                    case BAMBOO -> SoundType.BAMBOO;
                    case BAMBOO_WOOD -> SoundType.BAMBOO_WOOD;
                    case CHERRY_WOOD -> SoundType.CHERRY_WOOD;
                    case NETHER_WOOD -> SoundType.NETHER_WOOD;
                    case NETHERRACK -> SoundType.NETHERRACK;
                    case NETHER_BRICKS -> SoundType.NETHER_BRICKS;
                    case NETHER_ORE -> SoundType.NETHER_ORE;
                    case BASALT -> SoundType.BASALT;
                    case BONE_BLOCK -> SoundType.BONE_BLOCK;
                    case SOUL_SAND -> SoundType.SOUL_SAND;
                    case SOUL_SOIL -> SoundType.SOUL_SOIL;
                    case AMETHYST -> SoundType.AMETHYST;
                    case AMETHYST_CLUSTER -> SoundType.AMETHYST_CLUSTER;
                    case CALCITE -> SoundType.CALCITE;
                    case TUFF -> SoundType.TUFF;
                    case DEEPSLATE -> SoundType.DEEPSLATE;
                    case DEEPSLATE_BRICKS -> SoundType.DEEPSLATE_BRICKS;
                    case DEEPSLATE_TILES -> SoundType.DEEPSLATE_TILES;
                    case POLISHED_DEEPSLATE -> SoundType.POLISHED_DEEPSLATE;
                    case COPPER -> SoundType.COPPER;
                    case MUD -> SoundType.MUD;
                    case MUD_BRICKS -> SoundType.MUD_BRICKS;
                    case PACKED_MUD -> SoundType.PACKED_MUD;
                    case MOSS -> SoundType.MOSS;
                    case LANTERN -> SoundType.LANTERN;
                    case SCULK -> SoundType.SCULK;
                });
            }
        }
        return SOUND_TYPES.get(type);
    }

    private static final List<LateCheck> TABS = new ArrayList<>();

    private static void addToTab(RawDefinition raw, Identifier tab, Item item) {
        TABS.add(new LateCheck(raw.describe(), "creative_tab", tab));
        // Tabs are resolved by key when the tab is built; an unknown key never fires (checked after start-up).
        CreativeModeTabEvents.modifyOutputEvent(ResourceKey.create(Registries.CREATIVE_MODE_TAB, tab))
                .register(output -> output.accept(item));
    }

    /**
     * Warns about ids that could not be checked at initialisation: creative tabs (other mods may
     * add tabs after us), items, block states and functions. Runs once the server has started.
     */
    public static List<String> checkAfterStart(MinecraftServer server) {
        List<String> warnings = new ArrayList<>();
        for (LateCheck tab : TABS) {
            if (!BuiltInRegistries.CREATIVE_MODE_TAB.containsKey(tab.id())) {
                warnings.add(tab.file() + ": unknown creative_tab " + tab.id() + "; the item is in no tab");
            }
        }
        for (LateCheck check : LATE) {
            boolean known = switch (check.what()) {
                case "give_item item" -> BuiltInRegistries.ITEM.containsKey(check.id());
                case "run_function function" -> server.getFunctions().get(check.id()).isPresent();
                default -> true;
            };
            if (!known) {
                warnings.add(check.file() + ": unknown " + check.what() + " " + check.id());
            }
        }
        LATE_STATES.forEach((state, files) -> {
            if (EventRunner.parseState(state).isEmpty()) {
                for (String file : files) {
                    warnings.add(file + ": invalid set_block_state state '" + state + "'");
                }
            }
        });
        for (String w : warnings) {
            MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, w);
        }
        return warnings;
    }
}
