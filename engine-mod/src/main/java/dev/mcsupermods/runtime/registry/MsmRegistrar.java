package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.Events;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import dev.mcsupermods.runtime.loader.BlockType;
import dev.mcsupermods.runtime.loader.DefinitionException;
import dev.mcsupermods.runtime.loader.DefinitionParser;
import dev.mcsupermods.runtime.loader.EffectDefinition;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.MsmRarity;
import dev.mcsupermods.runtime.loader.ParseResult;
import dev.mcsupermods.runtime.loader.PotionDefinition;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.registry.container.BlockEntityHooks;
import dev.mcsupermods.runtime.registry.types.BlockTypes;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.EquipmentSlotGroup;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.AttributeModifier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.item.ItemStackTemplate;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.MaceItem;
import net.minecraft.world.item.component.BlocksAttacks;
import net.minecraft.world.item.component.ChargedProjectiles;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.item.component.Consumables;
import net.minecraft.world.item.component.DeathProtection;
import net.minecraft.world.item.component.ItemAttributeModifiers;
import net.minecraft.world.item.component.UseRemainder;
import net.minecraft.world.item.component.Weapon;
import net.minecraft.world.item.consume_effects.ApplyStatusEffectsConsumeEffect;
import net.minecraft.world.item.consume_effects.ClearAllStatusEffectsConsumeEffect;
import net.minecraft.world.item.consume_effects.ConsumeEffect;
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
import net.minecraft.world.item.DoubleHighBlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.alchemy.Potion;
import net.minecraft.world.item.ToolMaterial;
import net.minecraft.world.item.equipment.ArmorMaterial;
import net.minecraft.world.item.equipment.ArmorMaterials;
import net.minecraft.world.item.equipment.ArmorType;
import net.minecraft.world.item.equipment.EquipmentAssets;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.BlockState;

/** Turns parsed definitions into registry entries. Runs once, from {@code onInitialize}. */
public final class MsmRegistrar {
    /** Ids checked after start-up, when every mod's content and the data packs exist. */
    private record LateCheck(String file, String what, Identifier id) {}

    private static final List<LateCheck> LATE = new ArrayList<>();
    private static final Map<String, List<String>> LATE_STATES = new LinkedHashMap<>();

    private MsmRegistrar() {}

    private static boolean hooksInstalled;

    public static LoadReport registerAll(LoadReport scanned) {
        List<Identifier> blocks = new ArrayList<>();
        List<Identifier> items = new ArrayList<>();
        List<Identifier> effects = new ArrayList<>();
        List<Identifier> potions = new ArrayList<>();
        List<String> errors = new ArrayList<>(scanned.errors());
        List<String> warnings = new ArrayList<>(scanned.warnings());
        if (!hooksInstalled) {
            hooksInstalled = true;
            // ADR 0056 D3: one projectile type for every throwable, registered always so both sides agree.
            MsmThrownItem.register();
            MsmMobEffect.registerHooks();
        }
        // Sound events before everything else (ADR 0057 D1): effects, items, events and entities resolve sound ids.
        List<Identifier> sounds = registerSounds(scanned.sounds());
        // Effects first (ADR 0055 D3): items (consumables, death protection) resolve effect ids while registering.
        for (RawDefinition raw : scanned.definitions()) {
            if (!raw.kind().equals("effect")) {
                continue;
            }
            ParseResult<EffectDefinition> parsed = DefinitionParser.parseEffect(raw.json());
            report(raw, parsed, errors, warnings);
            if (parsed.definition().isEmpty()) {
                continue;
            }
            try {
                if (BuiltInRegistries.MOB_EFFECT.containsKey(raw.id())) {
                    throw new DefinitionException("mob effect id " + raw.id() + " is already registered");
                }
                EffectDefinition def = parsed.definition().get();
                checkEvents(raw, def.events(), errors);
                registerEffect(raw, def, errors, warnings);
                effects.add(raw.id());
            } catch (DefinitionException | RuntimeException e) {
                fail(errors, raw, e);
            }
        }
        // Potions after effects (they name project effects) and before blocks and items (ADR 0063 D4): an item's
        // minecraft:potion_contents passthrough may then name a project potion without a delayed component.
        for (RawDefinition raw : scanned.definitions()) {
            if (!raw.kind().equals("potion")) {
                continue;
            }
            ParseResult<PotionDefinition> parsed = DefinitionParser.parsePotion(raw.json());
            report(raw, parsed, errors, warnings);
            if (parsed.definition().isEmpty()) {
                continue;
            }
            try {
                if (BuiltInRegistries.POTION.containsKey(raw.id())) {
                    throw new DefinitionException("potion id " + raw.id() + " is already registered");
                }
                if (registerPotion(raw, parsed.definition().get(), errors)) {
                    potions.add(raw.id());
                }
            } catch (DefinitionException | RuntimeException e) {
                fail(errors, raw, e);
            }
        }
        MsmRuntime.LOGGER.info("[{}] registered {} potion(s)", MsmRuntime.MOD_ID, potions.size());
        // Blocks first, so a block's item exists before any item definition could collide with it. Stairs come after
        // every other block, in dependency order, because a stair copies its registered base block (ADR 0067 D4).
        List<Map.Entry<RawDefinition, BlockDefinition>> stairs = new ArrayList<>();
        Map<BlockType, Integer> typeCounts = new EnumMap<>(BlockType.class);
        for (RawDefinition raw : scanned.definitions()) {
            if (!raw.kind().equals("block")) {
                continue;
            }
            ParseResult<BlockDefinition> parsed = DefinitionParser.parseBlock(raw.json());
            report(raw, parsed, errors, warnings);
            if (parsed.definition().isEmpty()) {
                continue;
            }
            BlockDefinition def = parsed.definition().get();
            if (def.type() == BlockType.STAIRS) {
                stairs.add(Map.entry(raw, def));
                continue;
            }
            if (tryRegisterBlock(raw, def, null, items, errors, warnings)) {
                blocks.add(raw.id());
                typeCounts.merge(def.type(), 1, Integer::sum);
            }
        }
        registerStairs(stairs, blocks, items, errors, warnings, typeCounts);
        MsmRuntime.LOGGER.info("[{}] registered blocks by type: {}", MsmRuntime.MOD_ID, typeCounts.isEmpty() ? "none"
                : String.join(", ", typeCounts.entrySet().stream().map(e -> e.getKey().id() + " " + e.getValue()).toList()));
        MsmRuntime.LOGGER.info("[{}] registered {} block entity type(s) and {} machine recipe type(s)", MsmRuntime.MOD_ID,
                BlockEntityHooks.blockEntityTypes(), BlockEntityHooks.machineRecipeTypes());
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
                registerItem(raw, def, errors, warnings);
                items.add(raw.id());
            } catch (DefinitionException | RuntimeException e) {
                fail(errors, raw, e);
            }
        }
        // Entities last: their spawn eggs count as items and must not collide with item definitions.
        List<Identifier> entities = MsmEntityRegistrar.registerAll(scanned.definitions(), items, errors, warnings);
        // Additions to vanilla content last (ADR 0060 D2, D3): they name ids that are resolved when a server runs.
        List<Identifier> biomeAdditions = MsmAdditions.registerBiomeAdditions(scanned.definitions(), errors, warnings);
        List<Identifier> lootAdditions = MsmAdditions.registerLootAdditions(scanned.definitions(), errors, warnings);
        MsmRuntime.LOGGER.info("[{}] registered {} biome addition(s) and {} loot addition(s)", MsmRuntime.MOD_ID, biomeAdditions.size(),
                lootAdditions.size());
        return new LoadReport(scanned.filesRead(), scanned.definitions(), List.copyOf(blocks), List.copyOf(items),
                List.copyOf(entities), List.copyOf(effects), List.copyOf(potions), sounds, biomeAdditions, lootAdditions, List.copyOf(errors), List.copyOf(warnings));
    }

    /**
     * One variable-range {@link SoundEvent} per key (ADR 0057 D1); a key already registered (by vanilla or another mod)
     * is skipped silently. Returns the ids registered here, in the scanner's sorted order.
     */
    static List<Identifier> registerSounds(List<Identifier> keys) {
        List<Identifier> registered = new ArrayList<>();
        for (Identifier id : keys) {
            if (BuiltInRegistries.SOUND_EVENT.containsKey(id)) {
                continue;
            }
            Registry.register(BuiltInRegistries.SOUND_EVENT, id, SoundEvent.createVariableRangeEvent(id));
            registered.add(id);
        }
        return List.copyOf(registered);
    }

    /**
     * {@code msm/<ns>/effect/*.json} as an {@link MsmMobEffect} (ADR 0055 D3). Particle types, sounds and attributes
     * are built-in registries that vanilla has bootstrapped, so they are checked here: an unknown particle keeps the
     * tinted swirl and an unknown sound plays nothing (warnings); an unknown attribute skips that modifier (an error).
     * Modifier ids are {@code <ns>:effect.<path>.<index>}.
     */
    private static void registerEffect(RawDefinition raw, EffectDefinition def, List<String> errors, List<String> warnings) {
        MobEffectCategory category = switch (def.category()) {
            case BENEFICIAL -> MobEffectCategory.BENEFICIAL;
            case HARMFUL -> MobEffectCategory.HARMFUL;
            case NEUTRAL -> MobEffectCategory.NEUTRAL;
        };
        SimpleParticleType particle = null;
        if (def.particle().isPresent()) {
            Identifier p = def.particle().get();
            if (BuiltInRegistries.PARTICLE_TYPE.containsKey(p) && BuiltInRegistries.PARTICLE_TYPE.getValue(p) instanceof SimpleParticleType simple) {
                particle = simple;
            } else {
                warn(warnings, raw.describe() + ": particle " + p + " is not a particle type without options; the tinted swirl is used");
            }
        }
        MsmMobEffect effect = particle == null ? new MsmMobEffect(raw.id(), def, category) : new MsmMobEffect(raw.id(), def, category, particle);
        if (def.sound().isPresent()) {
            Optional<SoundEvent> sound = BuiltInRegistries.SOUND_EVENT.getOptional(def.sound().get());
            if (sound.isPresent()) {
                effect.withSoundOnAdded(sound.get());
            } else {
                warn(warnings, raw.describe() + ": unknown sound " + def.sound().get() + "; no sound is played when the effect is added");
            }
        }
        List<EffectDefinition.Modifier> modifiers = def.attributeModifiers();
        for (int index = 0; index < modifiers.size(); index++) {
            EffectDefinition.Modifier m = modifiers.get(index);
            Optional<Holder.Reference<Attribute>> attribute = BuiltInRegistries.ATTRIBUTE.get(m.attribute());
            if (attribute.isEmpty()) {
                String message = raw.describe() + ": attribute_modifiers[" + index + "]: unknown attribute " + m.attribute()
                        + "; the modifier is skipped";
                errors.add(message);
                MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
                continue;
            }
            AttributeModifier.Operation operation = switch (m.operation()) {
                case ADD_VALUE -> AttributeModifier.Operation.ADD_VALUE;
                case ADD_MULTIPLIED_BASE -> AttributeModifier.Operation.ADD_MULTIPLIED_BASE;
                case ADD_MULTIPLIED_TOTAL -> AttributeModifier.Operation.ADD_MULTIPLIED_TOTAL;
            };
            effect.addAttributeModifier(attribute.get(), modifierId(raw.id(), index), m.amount(), operation);
        }
        Registry.register(BuiltInRegistries.MOB_EFFECT, ResourceKey.create(Registries.MOB_EFFECT, raw.id()), effect);
    }

    /**
     * {@code msm/<ns>/potion/*.json} as a vanilla {@link Potion} (ADR 0063 D4) named {@link PotionDefinition#name}. Every
     * effect id must be registered already (vanilla, or a project effect registered just before); otherwise the potion
     * is skipped with one error naming all unknown ids. Returns whether the potion was registered.
     */
    private static boolean registerPotion(RawDefinition raw, PotionDefinition def, List<String> errors) {
        List<MobEffectInstance> instances = new ArrayList<>();
        List<String> unknown = new ArrayList<>();
        for (PotionDefinition.Effect e : def.effects()) {
            Optional<Holder.Reference<MobEffect>> holder = BuiltInRegistries.MOB_EFFECT.get(e.id());
            if (holder.isEmpty()) {
                unknown.add(e.id().toString());
                continue;
            }
            instances.add(new MobEffectInstance(holder.get(), e.durationTicks(), e.amplifier(), e.ambient(), e.showParticles(),
                    e.showIcon()));
        }
        if (!unknown.isEmpty()) {
            String message = raw.describe() + ": effects: unknown mob effect " + String.join(", ", unknown) + "; the potion is skipped";
            errors.add(message);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
            return false;
        }
        Potion potion = new Potion(def.name(raw.id()), instances.toArray(MobEffectInstance[]::new));
        Registry.register(BuiltInRegistries.POTION, ResourceKey.create(Registries.POTION, raw.id()), potion);
        return true;
    }

    /** The id of an effect's attribute modifier: {@code <ns>:effect.<path>.<index>} (ADR 0055 D3). */
    public static Identifier modifierId(Identifier effect, int index) {
        return Identifier.fromNamespaceAndPath(effect.getNamespace(), "effect." + effect.getPath() + "." + index);
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
                    case Action.ApplyEffect a -> LATE.add(new LateCheck(raw.describe(), "apply_effect effect", a.effect()));
                    default -> {}
                }
            }
        });
    }

    /** {@link #registerBlock} with its events checked; a failure is a load error. Returns whether the block registered. */
    private static boolean tryRegisterBlock(RawDefinition raw, BlockDefinition def, BlockState stairsBase, List<Identifier> items,
            List<String> errors, List<String> warnings) {
        try {
            checkEvents(raw, def.events(), errors);
            registerBlock(raw, def, stairsBase, items, errors, warnings);
            return true;
        } catch (DefinitionException | RuntimeException e) {
            fail(errors, raw, e);
            return false;
        }
    }

    /**
     * Stairs after every other block (ADR 0067 D4): rounds over the pending stairs, registering each whose base is in the
     * block registry, until a round registers none. A base that never appears (unknown, a block of a mod that registers
     * after {@code msm_runtime}, a failed definition or a cycle of stairs) is a load error that skips the stairs.
     */
    private static void registerStairs(List<Map.Entry<RawDefinition, BlockDefinition>> pending, List<Identifier> blocks,
            List<Identifier> items, List<String> errors, List<String> warnings, Map<BlockType, Integer> typeCounts) {
        List<Map.Entry<RawDefinition, BlockDefinition>> left = new ArrayList<>(pending);
        boolean progress = true;
        while (progress && !left.isEmpty()) {
            progress = false;
            for (var it = left.iterator(); it.hasNext(); ) {
                var entry = it.next();
                Identifier base = ((BlockType.Stairs) entry.getValue().typeFields()).baseBlock();
                if (!BuiltInRegistries.BLOCK.containsKey(base)) {
                    continue;
                }
                it.remove();
                progress = true;
                if (tryRegisterBlock(entry.getKey(), entry.getValue(), BuiltInRegistries.BLOCK.getValue(base).defaultBlockState(), items,
                        errors, warnings)) {
                    blocks.add(entry.getKey().id());
                    typeCounts.merge(BlockType.STAIRS, 1, Integer::sum);
                }
            }
        }
        for (var entry : left) {
            Identifier base = ((BlockType.Stairs) entry.getValue().typeFields()).baseBlock();
            String message = entry.getKey().describe() + ": base_block " + base
                    + " is not a registered block (unknown, failed, part of a cycle of stairs, or from a mod that registers after "
                    + MsmRuntime.MOD_ID + "); the stairs are skipped";
            errors.add(message);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
        }
    }

    private static void registerBlock(RawDefinition raw, BlockDefinition def, BlockState stairsBase, List<Identifier> items,
            List<String> errors, List<String> warnings) throws DefinitionException {
        Identifier id = raw.id();
        // The block item's own id (ADR 0068 D2), such as seeds planting a crop; default the block's id. A clash with a
        // registered item is a load error that skips the whole definition (nothing is registered).
        Optional<Identifier> itemId = def.item().map(settings -> settings.id().orElse(id));
        if (itemId.isPresent() && BuiltInRegistries.ITEM.containsKey(itemId.get())) {
            throw new DefinitionException("item id " + itemId.get() + " is already registered"
                    + (itemId.get().equals(id) ? "" : " (item.id)") + "; the block is skipped");
        }
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
        props = MsmBlock.shapeProperties(props, c); // msm:shape (ADR 0059 D3)
        props = BlockTypes.properties(def.type(), props); // the family's own vanilla properties (ADR 0067 D4)
        if (c.flammable().isPresent()) {
            props = props.ignitedByLava(); // as vanilla's planks, logs, fences, gates, doors and plates (ADR 0067 D3)
        }
        if (c.onRandomTick().isPresent()) {
            props = props.randomTicks(); // msm:on_random_tick (ADR 0061 D2): random ticks only with the component
        }
        if (def.lootTable().isPresent()) {
            props = props.overrideLootTable(Optional.of(ResourceKey.create(Registries.LOOT_TABLE, def.lootTable().get())));
        }
        Block block = Registry.register(BuiltInRegistries.BLOCK, blockKey,
                BlockTypes.create(id, def, props, stairsBase, w -> warn(warnings, raw.describe() + ": " + w)));
        BlockEntityHooks.afterBlockRegistered(raw, def, block, errors); // ADR 0074 D2, ADR 0075 D3
        BlockExtras.apply(block, c); // msm:flammable, msm:strippable (ADR 0067 D3, D4)
        c.strippable().ifPresent(strip -> LATE.add(new LateCheck(raw.describe(), "msm:strippable into", strip.into())));

        if (def.item().isEmpty()) {
            return; // "item": false
        }
        BlockDefinition.ItemSettings settings = def.item().get();
        ResourceKey<Item> itemKey = ResourceKey.create(Registries.ITEM, itemId.get());
        Item.Properties itemProps = new Item.Properties().setId(itemKey);
        // Name from block.<ns>.<path>, as vanilla block items do; an item with its own id (seeds) is named
        // item.<ns>.<path> of that id, as vanilla's wheat seeds (ADR 0068 D2).
        itemProps = itemId.get().equals(id) ? itemProps.useBlockDescriptionPrefix() : itemProps.useItemDescriptionPrefix();
        // item.components."msm:components" (ADR 0060 D4) first: the block item's own fields below win on a clash.
        itemProps = ComponentPassthrough.apply(itemProps, raw, settings.components(), errors)
                .stacksTo(settings.maxStackSize())
                .rarity(rarity(settings.rarity()));
        // A door's item places both halves (ADR 0067 D4), as vanilla's door items; a keep-contents container's item
        // cannot go inside container items (ADR 0074 D6).
        BlockItem item = Registry.register(BuiltInRegistries.ITEM, itemKey,
                def.type() == BlockType.DOOR ? new DoubleHighBlockItem(block, itemProps) : BlockEntityHooks.blockItem(block, itemProps));
        items.add(itemId.get());
        settings.creativeTab().ifPresent(tab -> addToTab(raw, tab, item));
    }

    private static void registerItem(RawDefinition raw, ItemDefinition def, List<String> errors, List<String> warnings)
            throws DefinitionException {
        Identifier id = raw.id();
        ItemComponents c = def.components();
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, id);
        Item.Properties props = new Item.Properties().setId(key).rarity(rarity(def.rarity()));
        // msm:components first: MSM's own components below win on a clash (ADR 0044 D1).
        props = ComponentPassthrough.apply(props, raw, c.vanilla(), errors);
        if (c.damageable()) {
            if (def.maxStackSize() != 1 && raw.json().has("max_stack_size")) {
                String message = raw.describe() + ": max_stack_size " + def.maxStackSize() + " ignored; tools and items with durability stack to 1";
                warnings.add(message);
                MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
            }
        } else {
            props = props.stacksTo(def.maxStackSize());
        }
        Optional<Consumable> consumable = c.consumable().map(spec -> consumable(raw, spec, errors, warnings));
        if (c.food().isPresent()) {
            ItemComponents.Food food = c.food().get();
            FoodProperties.Builder builder = new FoodProperties.Builder()
                    .nutrition(food.nutrition())
                    .saturationModifier(food.saturation());
            if (food.canAlwaysEat()) {
                builder = builder.alwaysEdible();
            }
            props = consumable.isPresent() ? props.food(builder.build(), consumable.get()) : props.food(builder.build());
        } else if (consumable.isPresent()) {
            props = props.component(DataComponents.CONSUMABLE, consumable.get());
        }
        if (c.consumable().isPresent()) {
            props = consumableExtras(props, raw, c.consumable().get());
        }
        if (c.tool().isPresent()) {
            props = tool(props, id, c.tool().get());
        }
        if (c.armor().isPresent()) {
            props = armor(props, raw, c.armor().get(), warnings);
        }
        if (c.rangedWeapon().isPresent()) {
            // Vanilla's bow (384) and crossbow (465) durability and enchantability.
            props = switch (c.rangedWeapon().get().type()) {
                case BOW -> props.durability(384).enchantable(1);
                case CROSSBOW -> props.durability(465).enchantable(1).component(DataComponents.CHARGED_PROJECTILES, ChargedProjectiles.EMPTY);
            };
        }
        if (c.shield().isPresent()) {
            props = shield(props, raw, c.shield().get());
        }
        if (c.deathProtection().isPresent()) {
            props = props.component(DataComponents.DEATH_PROTECTION, deathProtection(raw, c.deathProtection().get(), errors));
        }
        if (c.durability().isPresent()) {
            props = props.durability(c.durability().get().max()); // after the others: overrides the material's durability
        }
        Item item;
        if (c.throwable().isPresent()) {
            item = new MsmThrowableItem(id, def, throwSound(raw, c.throwable().get(), warnings), props);
        } else if (c.rangedWeapon().isPresent()) {
            item = switch (c.rangedWeapon().get().type()) {
                case BOW -> new MsmBowItem(id, def, props);
                case CROSSBOW -> new MsmCrossbowItem(id, def, props);
            };
        } else if (c.tool().isPresent() && c.tool().get().type() == ItemComponents.ToolType.MACE) {
            item = new MsmMaceItem(id, def, props);
        } else {
            item = new MsmItem(id, def, props);
        }
        Item registered = Registry.register(BuiltInRegistries.ITEM, key, item);
        def.creativeTab().ifPresent(tab -> addToTab(raw, tab, registered));
        if (c.throwable().isPresent() && c.throwable().get().dispensable()) {
            DispenserBlock.registerProjectileBehavior(registered); // ADR 0056 D3, through ProjectileItem
        }
    }

    /** The throw sound of {@code msm:throwable}: {@code sound}, else the snowball's; an unknown sound is a warning. */
    private static SoundEvent throwSound(RawDefinition raw, ItemComponents.Throwable throwable, List<String> warnings) {
        if (throwable.sound().isPresent()) {
            Optional<SoundEvent> sound = BuiltInRegistries.SOUND_EVENT.getOptional(throwable.sound().get());
            if (sound.isPresent()) {
                return sound.get();
            }
            warn(warnings, raw.describe() + ": msm:throwable: unknown sound " + throwable.sound().get() + "; the snowball sound is used");
        }
        return SoundEvents.SNOWBALL_THROW;
    }

    /**
     * {@code msm:consumable} as a vanilla {@code Consumable} (ADR 0044 D2), started from vanilla's food or drink
     * defaults; an unknown effect is an error and is skipped, an unknown sound a warning (the default sound stays).
     */
    static Consumable consumable(RawDefinition raw, ItemComponents.Consumable spec, List<String> errors, List<String> warnings) {
        Consumable.Builder builder = switch (spec.animation()) {
            case EAT -> Consumables.defaultFood();
            case DRINK -> Consumables.defaultDrink();
            case NONE -> Consumable.builder().animation(ItemUseAnimation.NONE);
        };
        builder = builder.consumeSeconds(spec.seconds()).hasConsumeParticles(spec.particles().orElse(true));
        if (spec.sound().isPresent()) {
            Optional<Holder.Reference<SoundEvent>> sound = BuiltInRegistries.SOUND_EVENT.get(spec.sound().get());
            if (sound.isPresent()) {
                builder = builder.sound(sound.get());
            } else {
                warn(warnings, raw.describe() + ": msm:consumable: unknown sound " + spec.sound().get() + "; the default sound is used");
            }
        }
        for (ItemComponents.ConsumeEffect effect : spec.effects()) {
            Optional<MobEffectInstance> instance = effectInstance(raw, "msm:consumable", effect, errors);
            if (instance.isPresent()) {
                builder = builder.onConsume(new ApplyStatusEffectsConsumeEffect(instance.get(), effect.chance()));
            }
        }
        return builder.build();
    }

    /**
     * {@code cooldown_seconds} as {@code use_cooldown}, {@code converts_to} as {@code use_remainder}; the remainder item
     * is looked up once registries are complete (it may be another mod's or a later definition's item).
     */
    private static Item.Properties consumableExtras(Item.Properties props, RawDefinition raw, ItemComponents.Consumable spec) {
        if (spec.cooldownSeconds().isPresent() && spec.cooldownSeconds().get() > 0) {
            props = props.useCooldown(spec.cooldownSeconds().get());
        }
        if (spec.convertsTo().isPresent()) {
            Identifier remainder = spec.convertsTo().get();
            props = props.delayedComponent(DataComponents.USE_REMAINDER, provider -> {
                Optional<Item> item = BuiltInRegistries.ITEM.getOptional(remainder);
                if (item.isEmpty() || item.get() == Items.AIR) {
                    MsmRuntime.LOGGER.error("[{}] {}: msm:consumable: unknown converts_to item {}; nothing is left over", MsmRuntime.MOD_ID,
                            raw.describe(), remainder);
                    return null;
                }
                return new UseRemainder(new ItemStackTemplate(item.get()));
            });
        }
        return props;
    }

    /** A vanilla effect instance for an MSM {@code ConsumeEffect}; an unknown effect is an error. */
    private static Optional<MobEffectInstance> effectInstance(RawDefinition raw, String component, ItemComponents.ConsumeEffect effect,
            List<String> errors) {
        Optional<Holder.Reference<MobEffect>> holder = BuiltInRegistries.MOB_EFFECT.get(effect.effect());
        if (holder.isEmpty()) {
            String message = raw.describe() + ": " + component + ": unknown mob effect " + effect.effect() + "; the effect is skipped";
            errors.add(message);
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
            return Optional.empty();
        }
        return Optional.of(new MobEffectInstance(holder.get(), effect.ticks(), effect.amplifier()));
    }

    /** {@code msm:death_protection} (ADR 0044 D4): clear all effects first when asked (as the totem does), then the effects. */
    static DeathProtection deathProtection(RawDefinition raw, ItemComponents.DeathProtection spec, List<String> errors) {
        List<ConsumeEffect> effects = new ArrayList<>();
        if (spec.clearEffects()) {
            effects.add(new ClearAllStatusEffectsConsumeEffect());
        }
        for (ItemComponents.ConsumeEffect effect : spec.effects()) {
            effectInstance(raw, "msm:death_protection", effect, errors)
                    .ifPresent(instance -> effects.add(new ApplyStatusEffectsConsumeEffect(instance, effect.chance())));
        }
        return new DeathProtection(List.copyOf(effects));
    }

    /**
     * {@code msm:shield} (ADR 0044 D3) as vanilla's shield setup: {@code blocks_attacks} (a plain item with it blocks;
     * {@code Item.use} starts using it), 336 durability, enchantable 1, off-hand equippable without swapping, the shield sounds. The
     * component is delayed like vanilla's because {@code bypassed_by} is a tag of the data pack registry
     * {@code damage_type}.
     */
    static Item.Properties shield(Item.Properties props, RawDefinition raw, ItemComponents.Shield spec) {
        TagKey<DamageType> bypass = TagKey.create(Registries.DAMAGE_TYPE,
                spec.bypassedBy().orElse(Identifier.withDefaultNamespace("bypasses_shield")));
        Holder<SoundEvent> blockSound = SoundEvents.SHIELD_BLOCK;
        Holder<SoundEvent> breakSound = SoundEvents.SHIELD_BREAK;
        return props.durability(336)
                .enchantable(1) // vanilla's shield has none; B186's lowering adds the enchanting tags (unbreaking, mending)
                .equippableUnswappable(EquipmentSlot.OFFHAND)
                .component(DataComponents.BREAK_SOUND, breakSound)
                .delayedComponent(DataComponents.BLOCKS_ATTACKS, provider -> {
                    Optional<HolderSet<DamageType>> bypassedBy = provider.lookupOrThrow(Registries.DAMAGE_TYPE).get(bypass)
                            .map(set -> (HolderSet<DamageType>) set);
                    if (bypassedBy.isEmpty()) {
                        MsmRuntime.LOGGER.warn("[{}] {}: msm:shield: unknown damage type tag #{}; nothing bypasses the block",
                                MsmRuntime.MOD_ID, raw.describe(), bypass.location());
                    }
                    return new BlocksAttacks(spec.blockDelaySeconds(), spec.disableCooldownScale(),
                            List.of(new BlocksAttacks.DamageReduction(90.0f, Optional.empty(), 0.0f, spec.damageReduction())),
                            new BlocksAttacks.ItemDamageFunction(3.0f, 1.0f, 1.0f), bypassedBy, Optional.of(blockSound),
                            Optional.of(breakSound));
                });
    }

    private static void warn(List<String> warnings, String message) {
        warnings.add(message);
        MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message);
    }

    /**
     * {@code msm:tool} through the vanilla tool helpers on {@code Item.Properties} (checked against
     * the 26.3 and 26.4 jars). Attack damage and speed default to the vanilla base values per tool
     * type, which {@code attack_damage} and {@code attack_speed} override; the material adds its
     * own damage bonus, speed, durability and drop tier.
     */
    static Item.Properties tool(Item.Properties props, Identifier itemId, ItemComponents.Tool tool) throws DefinitionException {
        ToolMaterial material = toolMaterial(itemId, tool.tier());
        if (tool.type() == ItemComponents.ToolType.SPEAR) {
            props = spear(props, tool, material);
        } else if (tool.type() == ItemComponents.ToolType.MACE) {
            props = mace(props, tool, material);
        } else {
            float damage = tool.attackDamage().orElse(switch (tool.type()) {
                case PICKAXE -> 1.0f;
                case AXE -> 6.0f;
                case SHOVEL -> 1.5f;
                case HOE -> -2.0f;
                default -> 3.0f; // sword
            });
            float speed = tool.attackSpeed().orElse(switch (tool.type()) {
                case PICKAXE -> -2.8f;
                case AXE -> -3.1f;
                case SHOVEL -> -3.0f;
                case HOE -> -1.0f;
                default -> -2.4f; // sword
            });
            props = switch (tool.type()) {
                case PICKAXE -> props.pickaxe(material, damage, speed);
                case AXE -> props.axe(material, damage, speed);
                case SHOVEL -> props.shovel(material, damage, speed);
                case HOE -> props.hoe(material, damage, speed);
                default -> props.sword(material, damage, speed);
            };
        }
        return tool.tier() instanceof ItemComponents.ToolMaterialSpec m && m.enchantmentValue() == 0 ? notEnchantable(props) : props;
    }

    /** A vanilla {@code ToolMaterial} constant by tier name, or a new one for a custom material. */
    static ToolMaterial toolMaterial(Identifier itemId, ItemComponents.ToolTierSpec tier) {
        return switch (tier) {
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
                    Math.max(1, m.enchantmentValue()), // vanilla rejects 0; removed again in tool()
                    TagKey.create(Registries.ITEM, m.repairItems().orElseGet(() -> noRepairTag(itemId))));
        };
    }

    /**
     * The nine floats vanilla passes to {@code Item.Properties.spear} per tier, read from {@code Items.<clinit>} of the
     * 26.3 jar (ADR 0044 D3): attack duration (seconds), kinetic damage multiplier, kinetic delay (seconds), dismount
     * max duration and min speed, knockback max duration and min speed, damage max duration and min relative speed. A
     * custom material uses iron's.
     */
    static final Map<ItemComponents.ToolTier, float[]> SPEAR_CONSTANTS = Map.of(
            ItemComponents.ToolTier.WOOD, new float[] {0.65f, 0.7f, 0.75f, 5.0f, 14.0f, 10.0f, 5.1f, 15.0f, 4.6f},
            ItemComponents.ToolTier.STONE, new float[] {0.75f, 0.82f, 0.7f, 4.5f, 13.0f, 9.0f, 5.1f, 13.75f, 4.6f},
            ItemComponents.ToolTier.COPPER, new float[] {0.85f, 0.82f, 0.65f, 4.0f, 12.0f, 8.25f, 5.1f, 12.5f, 4.6f},
            ItemComponents.ToolTier.IRON, new float[] {0.95f, 0.95f, 0.6f, 2.5f, 11.0f, 6.75f, 5.1f, 11.25f, 4.6f},
            ItemComponents.ToolTier.GOLD, new float[] {0.95f, 0.7f, 0.7f, 3.5f, 13.0f, 8.5f, 5.1f, 13.75f, 4.6f},
            ItemComponents.ToolTier.DIAMOND, new float[] {1.05f, 1.075f, 0.5f, 3.0f, 10.0f, 6.5f, 5.1f, 10.0f, 4.6f},
            ItemComponents.ToolTier.NETHERITE, new float[] {1.15f, 1.2f, 0.4f, 2.5f, 9.0f, 5.5f, 5.1f, 8.75f, 4.6f});

    /**
     * A spear through {@code Item.Properties.spear} with the tier's vanilla constants. {@code attack_speed} sets the
     * attack duration ({@code 1 / (attack_speed + 4)} seconds, as vanilla derives the speed modifier from it), so it must
     * be above -4; {@code attack_damage} replaces vanilla's base of 0 (the material's bonus is still added).
     */
    static Item.Properties spear(Item.Properties props, ItemComponents.Tool tool, ToolMaterial material) throws DefinitionException {
        float[] k = tool.tier() instanceof ItemComponents.ToolTier t ? SPEAR_CONSTANTS.get(t) : SPEAR_CONSTANTS.get(ItemComponents.ToolTier.IRON);
        float duration = k[0];
        if (tool.attackSpeed().isPresent()) {
            float speed = tool.attackSpeed().get();
            if (speed <= -4.0f) {
                throw new DefinitionException("msm:tool: attack_speed of a spear must be above -4, got " + speed);
            }
            duration = 1.0f / (speed + 4.0f);
        }
        props = props.spear(material, duration, k[1], k[2], k[3], k[4], k[5], k[6], k[7], k[8]);
        if (tool.attackDamage().isPresent()) {
            props = props.attributes(attackAttributes(tool.attackDamage().get() + material.attackDamageBonus(), 1.0f / duration - 4.0f));
        }
        return props;
    }

    /**
     * A mace as vanilla's ({@code Items.MACE}): the tier's durability, repair items and enchantment value, vanilla's
     * mace tool rule and {@code weapon} component, and vanilla's attack values (damage 5, speed -3.4) unless
     * {@code attack_damage} or {@code attack_speed} override them. The material's damage bonus is not added (the
     * vanilla mace has none).
     */
    static Item.Properties mace(Item.Properties props, ItemComponents.Tool tool, ToolMaterial material) {
        ItemAttributeModifiers attributes = tool.attackDamage().isEmpty() && tool.attackSpeed().isEmpty()
                ? MaceItem.createAttributes()
                : attackAttributes(tool.attackDamage().orElse(5.0f), tool.attackSpeed().orElse(-3.4f));
        return props.durability(material.durability())
                .component(DataComponents.TOOL, MaceItem.createToolProperties())
                .repairable(material.repairItems())
                .attributes(attributes)
                .enchantable(material.enchantmentValue())
                .component(DataComponents.WEAPON, new Weapon(1));
    }

    /** Main-hand attack damage and speed modifiers with vanilla's base modifier ids. */
    private static ItemAttributeModifiers attackAttributes(float damage, float speed) {
        return ItemAttributeModifiers.builder()
                .add(Attributes.ATTACK_DAMAGE, new AttributeModifier(Item.BASE_ATTACK_DAMAGE_ID, damage, AttributeModifier.Operation.ADD_VALUE),
                        EquipmentSlotGroup.MAINHAND)
                .add(Attributes.ATTACK_SPEED, new AttributeModifier(Item.BASE_ATTACK_SPEED_ID, speed, AttributeModifier.Operation.ADD_VALUE),
                        EquipmentSlotGroup.MAINHAND)
                .build();
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
     * {@code repairable} and {@code enchantable} components (ADR 0042 D5), or through
     * {@code horseArmor(material)} and {@code wolfArmor(material)} (ADR 0044 D5).
     */
    static Item.Properties armor(Item.Properties props, RawDefinition raw, ItemComponents.Armor armor, List<String> warnings) {
        ArmorMaterial material = armorMaterial(raw, armor.material(), warnings);
        props = switch (armor.slot()) {
            case HELMET -> props.humanoidArmor(material, ArmorType.HELMET);
            case CHESTPLATE -> props.humanoidArmor(material, ArmorType.CHESTPLATE);
            case LEGGINGS -> props.humanoidArmor(material, ArmorType.LEGGINGS);
            case BOOTS -> props.humanoidArmor(material, ArmorType.BOOTS);
            case HORSE -> props.horseArmor(material); // ADR 0044 D5; defence of ArmorType.BODY
            case WOLF -> props.wolfArmor(material);
        };
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
                defense.put(ArmorType.BODY, m.defense().bodyOrChestplate()); // horse and wolf armour (ADR 0044 D5, ADR 0050 D4)
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
     * add tabs after us), items, block states, functions, the ids named by additions to vanilla content and the trees of
     * project saplings. Runs once the server has started.
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
                case "apply_effect effect" -> BuiltInRegistries.MOB_EFFECT.containsKey(check.id());
                case "msm:strippable into" -> BuiltInRegistries.BLOCK.containsKey(check.id());
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
        warnings.addAll(MsmAdditions.checkAfterStart(server));
        warnings.addAll(SaplingCheck.check(server)); // ADR 0068 D4: tree features resolve only when a sapling grows
        for (String w : warnings) {
            MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, w);
        }
        return warnings;
    }
}
