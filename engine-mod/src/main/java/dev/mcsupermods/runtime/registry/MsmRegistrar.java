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
import dev.mcsupermods.runtime.loader.ParseResult;
import dev.mcsupermods.runtime.loader.RawDefinition;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.particles.SimpleParticleType;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.TagKey;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.ToolMaterial;
import net.minecraft.world.item.equipment.ArmorMaterial;
import net.minecraft.world.item.equipment.ArmorMaterials;
import net.minecraft.world.item.equipment.ArmorType;
import net.minecraft.world.item.equipment.EquipmentAssets;
import net.minecraft.world.level.block.Block;
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
        List<Identifier> entities = MsmEntityRegistrar.registerAll(scanned.definitions(), items, errors, warnings);
        return new LoadReport(scanned.filesRead(), scanned.definitions(), List.copyOf(blocks), List.copyOf(items),
                List.copyOf(entities), List.copyOf(errors), List.copyOf(warnings));
    }

    static void report(RawDefinition raw, ParseResult<?> parsed, List<String> errors, List<String> warnings) {
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

    static void fail(List<String> errors, RawDefinition raw, Exception e) {
        String message = raw.describe() + ": " + e.getMessage();
        errors.add(message);
        MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message, e instanceof DefinitionException ? null : e);
    }

    /**
     * Checks ids that vanilla has already bootstrapped (sounds, particles) and queues the rest
     * (items, block states, functions) for {@link #checkAfterStart}: they may name content of mods
     * registered later, or data pack files.
     */
    static void checkEvents(RawDefinition raw, Events events, List<String> errors) {
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
                .lightLevel(state -> light);
        props = BlockSounds.apply(props, def.soundType()); // version seam (ADR 0038 D2)
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
            props = tool(props, id, c.tool().get());
        }
        if (c.armor().isPresent()) {
            props = armor(props, raw, c.armor().get(), warnings);
        }
        if (c.durability().isPresent()) {
            props = props.durability(c.durability().get().max()); // after tool() and armor(): overrides the material's durability
        }
        MsmItem item = Registry.register(BuiltInRegistries.ITEM, key, new MsmItem(id, def, props));
        def.creativeTab().ifPresent(tab -> addToTab(raw, tab, item));
    }

    /**
     * {@code msm:tool} through the vanilla tool helpers on {@code Item.Properties} (checked against
     * the 26.3 and 26.4 jars). Attack damage and speed default to the vanilla base values per tool
     * type, which {@code attack_damage} and {@code attack_speed} override; the material adds its
     * own damage bonus, speed, durability and drop tier.
     */
    static Item.Properties tool(Item.Properties props, Identifier itemId, ItemComponents.Tool tool) {
        ToolMaterial material = switch (tool.tier()) {
            case ItemComponents.ToolTier.WOOD -> ToolMaterial.WOOD;
            case ItemComponents.ToolTier.STONE -> ToolMaterial.STONE;
            case ItemComponents.ToolTier.COPPER -> ToolMaterial.COPPER;
            case ItemComponents.ToolTier.IRON -> ToolMaterial.IRON;
            case ItemComponents.ToolTier.DIAMOND -> ToolMaterial.DIAMOND;
            case ItemComponents.ToolTier.GOLD -> ToolMaterial.GOLD;
            case ItemComponents.ToolTier.NETHERITE -> ToolMaterial.NETHERITE;
            case ItemComponents.ToolMaterialSpec m -> new ToolMaterial(
                    TagKey.create(Registries.BLOCK, m.incorrectBlocksForDrops()),
                    m.durability(),
                    m.speed(),
                    m.attackDamageBonus(),
                    Math.max(1, m.enchantmentValue()), // vanilla rejects 0; removed again below
                    TagKey.create(Registries.ITEM, m.repairItems().orElseGet(() -> noRepairTag(itemId))));
        };
        float damage = tool.attackDamage().orElse(switch (tool.type()) {
            case PICKAXE -> 1.0f;
            case AXE -> 6.0f;
            case SHOVEL -> 1.5f;
            case HOE -> -2.0f;
            case SWORD -> 3.0f;
        });
        float speed = tool.attackSpeed().orElse(switch (tool.type()) {
            case PICKAXE -> -2.8f;
            case AXE -> -3.1f;
            case SHOVEL -> -3.0f;
            case HOE -> -1.0f;
            case SWORD -> -2.4f;
        });
        props = switch (tool.type()) {
            case PICKAXE -> props.pickaxe(material, damage, speed);
            case AXE -> props.axe(material, damage, speed);
            case SHOVEL -> props.shovel(material, damage, speed);
            case HOE -> props.hoe(material, damage, speed);
            case SWORD -> props.sword(material, damage, speed);
        };
        return tool.tier() instanceof ItemComponents.ToolMaterialSpec m && m.enchantmentValue() == 0 ? notEnchantable(props) : props;
    }

    /**
     * {@code enchantment_value: 0} means "not enchantable": vanilla's {@code Enchantable} requires
     * a positive value, so the material is built with 1 and the component is removed afterwards.
     */
    private static Item.Properties notEnchantable(Item.Properties props) {
        return props.component(DataComponents.ENCHANTABLE, null);
    }

    /**
     * {@code msm:armor} through {@code Item.Properties.humanoidArmor(material, type)}, which sets
     * vanilla's {@code equippable}, {@code attribute_modifiers}, {@code max_damage},
     * {@code repairable} and {@code enchantable} components (ADR 0042 D5).
     */
    static Item.Properties armor(Item.Properties props, RawDefinition raw, ItemComponents.Armor armor, List<String> warnings) {
        ArmorType type = switch (armor.slot()) {
            case HELMET -> ArmorType.HELMET;
            case CHESTPLATE -> ArmorType.CHESTPLATE;
            case LEGGINGS -> ArmorType.LEGGINGS;
            case BOOTS -> ArmorType.BOOTS;
        };
        props = props.humanoidArmor(armorMaterial(raw, armor.material(), warnings), type);
        return armor.material() instanceof ItemComponents.CustomArmorMaterial m && m.enchantmentValue() == 0 ? notEnchantable(props) : props;
    }

    private static ArmorMaterial armorMaterial(RawDefinition raw, ItemComponents.ArmorMaterialSpec spec, List<String> warnings) {
        return switch (spec) {
            case ItemComponents.ArmorMaterialName.LEATHER -> ArmorMaterials.LEATHER;
            case ItemComponents.ArmorMaterialName.COPPER -> ArmorMaterials.COPPER;
            case ItemComponents.ArmorMaterialName.CHAINMAIL -> ArmorMaterials.CHAINMAIL;
            case ItemComponents.ArmorMaterialName.IRON -> ArmorMaterials.IRON;
            case ItemComponents.ArmorMaterialName.GOLD -> ArmorMaterials.GOLD;
            case ItemComponents.ArmorMaterialName.DIAMOND -> ArmorMaterials.DIAMOND;
            case ItemComponents.ArmorMaterialName.NETHERITE -> ArmorMaterials.NETHERITE;
            case ItemComponents.ArmorMaterialName.TURTLE_SCUTE -> ArmorMaterials.TURTLE_SCUTE;
            case ItemComponents.ArmorMaterialName.ARMADILLO_SCUTE -> ArmorMaterials.ARMADILLO_SCUTE;
            case ItemComponents.CustomArmorMaterial m -> {
                Map<ArmorType, Integer> defense = new EnumMap<>(ArmorType.class);
                defense.put(ArmorType.HELMET, m.defense().helmet());
                defense.put(ArmorType.CHESTPLATE, m.defense().chestplate());
                defense.put(ArmorType.LEGGINGS, m.defense().leggings());
                defense.put(ArmorType.BOOTS, m.defense().boots());
                defense.put(ArmorType.BODY, m.defense().chestplate()); // never used by humanoid armour
                Holder<SoundEvent> sound = SoundEvents.ARMOR_EQUIP_GENERIC;
                if (m.equipSound().isPresent()) {
                    Optional<Holder.Reference<SoundEvent>> found = BuiltInRegistries.SOUND_EVENT.get(m.equipSound().get());
                    if (found.isPresent()) {
                        sound = found.get();
                    } else {
                        String message = raw.describe() + ": msm:armor: unknown equip_sound " + m.equipSound().get()
                                + "; the generic armour equip sound is used";
                        warnings.add(message);
                        MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
                    }
                }
                yield new ArmorMaterial(
                        m.durability(),
                        Map.copyOf(defense),
                        Math.max(1, m.enchantmentValue()), // vanilla rejects 0; removed again in armor()
                        sound,
                        m.toughness(),
                        m.knockbackResistance(),
                        TagKey.create(Registries.ITEM, m.repairItems().orElseGet(() -> noRepairTag(raw.id()))),
                        ResourceKey.create(EquipmentAssets.ROOT_ID, m.equipmentAsset()));
            }
        };
    }

    /**
     * The repair tag of a custom material without {@code repair_items}: a project-specific item
     * tag that no data pack fills unless the project adds it, so nothing repairs the item.
     */
    static Identifier noRepairTag(Identifier itemId) {
        return Identifier.fromNamespaceAndPath(itemId.getNamespace(), "msm_repairs/" + itemId.getPath());
    }

    private static Rarity rarity(MsmRarity rarity) {
        return switch (rarity) {
            case COMMON -> Rarity.COMMON;
            case UNCOMMON -> Rarity.UNCOMMON;
            case RARE -> Rarity.RARE;
            case EPIC -> Rarity.EPIC;
        };
    }

    private static final List<LateCheck> TABS = new ArrayList<>();

    static void addToTab(RawDefinition raw, Identifier tab, Item item) {
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
        warnings.addAll(MsmEntityRegistrar.checkAfterStart(server));
        for (String w : warnings) {
            MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, w);
        }
        return warnings;
    }
}
