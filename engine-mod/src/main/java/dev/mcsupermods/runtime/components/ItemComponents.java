package dev.mcsupermods.runtime.components;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.FLOAT;
import static dev.mcsupermods.runtime.loader.MsmCodecs.TAG_ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.floatRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intAtLeast;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.mojang.serialization.Codec;
import com.mojang.serialization.Dynamic;
import com.mojang.serialization.JsonOps;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.loader.MsmCodecs;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import net.minecraft.resources.Identifier;

/** Runtime item components ({@code ::msm::definition::ItemComponents}). */
public record ItemComponents(
        Optional<Food> food,
        Optional<Tool> tool,
        Optional<Durability> durability,
        Optional<OnUse> onUse,
        Optional<Armor> armor,
        Optional<Consumable> consumable,
        Optional<RangedWeapon> rangedWeapon,
        Optional<Shield> shield,
        Optional<DeathProtection> deathProtection,
        Optional<Throwable> throwable,
        Optional<OnHit> onHit,
        Optional<OnUseOnBlock> onUseOnBlock,
        Optional<WhileHeld> whileHeld,
        Optional<WhileWorn> whileWorn,
        Map<Identifier, JsonElement> vanilla) {

    public static final List<String> KEYS = List.of("msm:food", "msm:tool", "msm:durability", "msm:on_use", "msm:armor",
            "msm:consumable", "msm:ranged_weapon", "msm:shield", "msm:death_protection", "msm:throwable", "msm:on_hit", "msm:on_use_on_block",
            "msm:while_held", "msm:while_worn", "msm:components");
    public static final ItemComponents NONE = new ItemComponents(Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
            Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(),
            Optional.empty(), Optional.empty(), Optional.empty(), Map.of());

    /**
     * {@code msm:components} (ADR 0044 D1): vanilla data component ids to their vanilla JSON, kept as JSON here
     * (parsing stays pure) and decoded with the component's own Codec by {@code ComponentPassthrough} at registration.
     */
    public static final Codec<Map<Identifier, JsonElement>> VANILLA_CODEC = Codec.unboundedMap(ID, Codec.PASSTHROUGH).xmap(
            m -> {
                Map<Identifier, JsonElement> out = new LinkedHashMap<>();
                m.forEach((k, v) -> out.put(k, v.convert(JsonOps.INSTANCE).getValue()));
                return Collections.unmodifiableMap(out);
            },
            m -> {
                Map<Identifier, Dynamic<?>> out = new LinkedHashMap<>();
                m.forEach((k, v) -> out.put(k, new Dynamic<>(JsonOps.INSTANCE, v)));
                return out;
            });

    public static final Codec<ItemComponents> CODEC = RecordCodecBuilder.create(i -> i.group(
            optional("msm:food", Food.CODEC).forGetter(ItemComponents::food),
            optional("msm:tool", Tool.CODEC).forGetter(ItemComponents::tool),
            optional("msm:durability", Durability.CODEC).forGetter(ItemComponents::durability),
            optional("msm:on_use", OnUse.CODEC).forGetter(ItemComponents::onUse),
            optional("msm:armor", Armor.CODEC).forGetter(ItemComponents::armor),
            optional("msm:consumable", Consumable.CODEC).forGetter(ItemComponents::consumable),
            optional("msm:ranged_weapon", RangedWeapon.CODEC).forGetter(ItemComponents::rangedWeapon),
            optional("msm:shield", Shield.CODEC).forGetter(ItemComponents::shield),
            optional("msm:death_protection", DeathProtection.CODEC).forGetter(ItemComponents::deathProtection),
            optional("msm:throwable", Throwable.CODEC).forGetter(ItemComponents::throwable),
            optional("msm:on_hit", OnHit.CODEC).forGetter(ItemComponents::onHit),
            optional("msm:on_use_on_block", OnUseOnBlock.CODEC).forGetter(ItemComponents::onUseOnBlock),
            optional("msm:while_held", WhileHeld.CODEC).forGetter(ItemComponents::whileHeld),
            optional("msm:while_worn", WhileWorn.CODEC).forGetter(ItemComponents::whileWorn),
            optional("msm:components", VANILLA_CODEC, Map.of()).forGetter(ItemComponents::vanilla)).apply(i, ItemComponents::new));

    /**
     * The mutually exclusive components present ({@code msm:armor}, {@code msm:tool}, {@code msm:ranged_weapon},
     * {@code msm:shield}; ADR 0042 D1, ADR 0044 D3), in that order.
     */
    public List<String> exclusivePresent() {
        List<String> present = new ArrayList<>();
        if (armor.isPresent()) {
            present.add("msm:armor");
        }
        if (tool.isPresent()) {
            present.add("msm:tool");
        }
        if (rangedWeapon.isPresent()) {
            present.add("msm:ranged_weapon");
        }
        if (shield.isPresent()) {
            present.add("msm:shield");
        }
        return present;
    }

    /** These components without the mutually exclusive ones (used when more than one is present). */
    public ItemComponents withoutExclusive() {
        return new ItemComponents(food, Optional.empty(), durability, onUse, Optional.empty(), consumable, Optional.empty(),
                Optional.empty(), deathProtection, throwable, onHit, onUseOnBlock, whileHeld, whileWorn, vanilla);
    }

    /**
     * The components present that cannot be combined with {@code msm:throwable} (ADR 0056 D2): {@code msm:armor},
     * {@code msm:ranged_weapon}, {@code msm:shield}, {@code msm:consumable}, {@code msm:food} and a {@code mace}
     * {@code msm:tool}, in that order; empty without {@code msm:throwable}.
     */
    public List<String> throwableConflicts() {
        List<String> present = new ArrayList<>();
        if (throwable.isEmpty()) {
            return present;
        }
        if (armor.isPresent()) {
            present.add("msm:armor");
        }
        if (rangedWeapon.isPresent()) {
            present.add("msm:ranged_weapon");
        }
        if (shield.isPresent()) {
            present.add("msm:shield");
        }
        if (consumable.isPresent()) {
            present.add("msm:consumable");
        }
        if (food.isPresent()) {
            present.add("msm:food");
        }
        if (tool.isPresent() && tool.get().type() == ToolType.MACE) {
            present.add("msm:tool");
        }
        return present;
    }

    /** These components without {@code msm:throwable} and the components it conflicts with. */
    public ItemComponents withoutThrowableConflicts() {
        boolean dropTool = tool.isPresent() && tool.get().type() == ToolType.MACE;
        return new ItemComponents(Optional.empty(), dropTool ? Optional.empty() : tool, durability, onUse, Optional.empty(),
                Optional.empty(), Optional.empty(), Optional.empty(), deathProtection, Optional.empty(), onHit, onUseOnBlock, whileHeld,
                whileWorn, vanilla);
    }

    /** These components without {@code msm:while_worn} (used when there is no {@code msm:armor} to wear; ADR 0061 D1). */
    public ItemComponents withoutWhileWorn() {
        return new ItemComponents(food, tool, durability, onUse, armor, consumable, rangedWeapon, shield, deathProtection, throwable,
                onHit, onUseOnBlock, whileHeld, Optional.empty(), vanilla);
    }

    /** Every event id a component names, with the component for messages. */
    public Stream<String[]> eventReferences() {
        Stream<String[]> use = onUse.stream().map(c -> new String[] {"msm:on_use", c.event().toString()});
        Stream<String[]> thrown = throwable.stream().flatMap(t -> Stream.of(
                t.onHitEntity().map(h -> new String[] {"msm:throwable on_hit_entity", h.event().toString()}),
                t.onHitBlock().map(h -> new String[] {"msm:throwable on_hit_block", h.event().toString()})).flatMap(Optional::stream));
        Stream<String[]> triggers = Stream.of(
                onHit.map(c -> new String[] {"msm:on_hit", c.event().toString()}),
                onUseOnBlock.map(c -> new String[] {"msm:on_use_on_block", c.event().toString()}),
                whileHeld.map(c -> new String[] {"msm:while_held", c.event().toString()}),
                whileWorn.map(c -> new String[] {"msm:while_worn", c.event().toString()})).flatMap(Optional::stream);
        return Stream.concat(Stream.concat(use, thrown), triggers);
    }

    /** Whether {@code inventoryTick} has work: {@code msm:while_held} or {@code msm:while_worn}. */
    public boolean ticksInInventory() {
        return whileHeld.isPresent() || whileWorn.isPresent();
    }

    /**
     * Fires an event after the item hits a living entity (ADR 0061 D1); self is the attacker, player or mob, and
     * {@code other} the entity hit. Closed, as every trigger struct.
     */
    public record OnHit(Identifier event) {
        public static final Codec<OnHit> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnHit::event)).apply(i, OnHit::new)), List.of("event"));
    }

    /** Fires an event when a player uses the item on a block, then starts the cooldown (ADR 0061 D1). */
    public record OnUseOnBlock(Identifier event, int cooldownTicks) {
        public static final Codec<OnUseOnBlock> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnUseOnBlock::event),
                optional("cooldown_ticks", intAtLeast(0), 0).forGetter(OnUseOnBlock::cooldownTicks)).apply(i, OnUseOnBlock::new)),
                List.of("event", "cooldown_ticks"));
    }

    /** The hand a held item fires in ({@code HeldHand}). */
    public enum HeldHand {
        MAIN, OFF, EITHER;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<HeldHand> CODEC = MsmCodecs.named("hand", values(), HeldHand::serialName);
    }

    /** The shortest interval of a tick trigger (ADR 0061 D4), and the default. */
    public static final int MIN_INTERVAL_TICKS = 5;
    public static final int DEFAULT_INTERVAL_TICKS = 20;

    /** Fires an event every {@code interval_ticks} while an entity holds the item in {@code hand} (ADR 0061 D1). */
    public record WhileHeld(Identifier event, int intervalTicks, HeldHand hand) {
        public static final Codec<WhileHeld> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(WhileHeld::event),
                optional("interval_ticks", intAtLeast(MIN_INTERVAL_TICKS), DEFAULT_INTERVAL_TICKS).forGetter(WhileHeld::intervalTicks),
                optional("hand", HeldHand.CODEC, HeldHand.MAIN).forGetter(WhileHeld::hand)).apply(i, WhileHeld::new)),
                List.of("event", "interval_ticks", "hand"));
    }

    /** Fires an event every {@code interval_ticks} while an entity wears the item in its {@code msm:armor} slot (ADR 0061 D1). */
    public record WhileWorn(Identifier event, int intervalTicks) {
        public static final Codec<WhileWorn> CODEC = MsmCodecs.closed(RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(WhileWorn::event),
                optional("interval_ticks", intAtLeast(MIN_INTERVAL_TICKS), DEFAULT_INTERVAL_TICKS).forGetter(WhileWorn::intervalTicks))
                .apply(i, WhileWorn::new)), List.of("event", "interval_ticks"));
    }

    /** What happens to a thrown item when it lands ({@code AfterThrow}, ADR 0056 D1). */
    public enum AfterThrow {
        /** One item of the stack is used, as a snowball. */
        CONSUME,
        /** The stack keeps its item; the thrown copy disappears when it lands. */
        KEEP,
        /** The thrown item drops where it lands. */
        DROP,
        /** The thrown item goes back into the thrower's inventory when it lands, or drops at their feet. */
        RETURN;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<AfterThrow> CODEC = MsmCodecs.named("after_throw mode", values(), AfterThrow::serialName);
    }

    /** An event fired when a thrown item hits something ({@code OnThrownHit}). */
    public record OnThrownHit(Identifier event) {
        public static final Codec<OnThrownHit> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnThrownHit::event)).apply(i, OnThrownHit::new));
    }

    /**
     * Makes the item throwable (ADR 0056 D1): the thrown copy flies as {@code msm_runtime:thrown_item}. Defaults are the
     * snowball's ({@code speed} 1.5, {@code inaccuracy} 1, {@code gravity} 0.03, {@code consume}).
     */
    public record Throwable(
            float speed,
            float inaccuracy,
            float gravity,
            float damage,
            int chargeTicks,
            AfterThrow afterThrow,
            int cooldownTicks,
            Optional<Identifier> sound,
            boolean dispensable,
            Optional<OnThrownHit> onHitEntity,
            Optional<OnThrownHit> onHitBlock) {
        public static final float DEFAULT_SPEED = 1.5f;
        public static final float DEFAULT_GRAVITY = 0.03f;

        public static final Codec<Throwable> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("speed", floatRange(0.1f, 5), DEFAULT_SPEED).forGetter(Throwable::speed),
                optional("inaccuracy", floatRange(0, 10), 1.0f).forGetter(Throwable::inaccuracy),
                optional("gravity", floatRange(0, 1), DEFAULT_GRAVITY).forGetter(Throwable::gravity),
                optional("damage", floatAtLeast(0), 0.0f).forGetter(Throwable::damage),
                optional("charge_ticks", intRange(0, 200), 0).forGetter(Throwable::chargeTicks),
                optional("after_throw", AfterThrow.CODEC, AfterThrow.CONSUME).forGetter(Throwable::afterThrow),
                optional("cooldown_ticks", intAtLeast(0), 0).forGetter(Throwable::cooldownTicks),
                optional("sound", ID).forGetter(Throwable::sound),
                optional("dispensable", Codec.BOOL, true).forGetter(Throwable::dispensable),
                optional("on_hit_entity", OnThrownHit.CODEC).forGetter(Throwable::onHitEntity),
                optional("on_hit_block", OnThrownHit.CODEC).forGetter(Throwable::onHitBlock)).apply(i, Throwable::new));
    }

    /** Whether the item is damageable, which forces a stack size of 1. */
    public boolean damageable() {
        return tool.isPresent() || armor.isPresent() || durability.isPresent() || rangedWeapon.isPresent() || shield.isPresent();
    }

    /** Makes the item edible; {@code saturation} is the vanilla saturation modifier. */
    public record Food(int nutrition, float saturation, boolean canAlwaysEat) {
        public static final Codec<Food> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("nutrition", intAtLeast(0)).forGetter(Food::nutrition),
                required("saturation", floatAtLeast(0)).forGetter(Food::saturation),
                optional("can_always_eat", Codec.BOOL, false).forGetter(Food::canAlwaysEat)).apply(i, Food::new));
    }

    /** Tool kinds. */
    public enum ToolType {
        PICKAXE, AXE, SHOVEL, HOE, SWORD, SPEAR, MACE;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<ToolType> CODEC = MsmCodecs.named("tool type", values(), ToolType::serialName);
    }

    /** A tool tier: a vanilla {@link ToolTier} by name or a custom {@link ToolMaterialSpec} (ADR 0042 D3). */
    public sealed interface ToolTierSpec permits ToolTier, ToolMaterialSpec {
        Codec<ToolTierSpec> CODEC = MsmCodecs.nameOrObject(ToolTier.class, ToolTier.CODEC, ToolMaterialSpec.CODEC);
    }

    /** Tool tiers; each maps onto a vanilla {@code ToolMaterial} constant of the same name. */
    public enum ToolTier implements ToolTierSpec {
        WOOD, STONE, COPPER, IRON, DIAMOND, GOLD, NETHERITE;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<ToolTier> CODEC = MsmCodecs.named("tool tier", values(), ToolTier::serialName);
    }

    /**
     * A custom tool material ({@code ::msm::definition::ToolMaterial}); the runtime builds a
     * vanilla {@code ToolMaterial} from it. Tags are ids without the leading {@code #}.
     */
    public record ToolMaterialSpec(
            int durability,
            float speed,
            float attackDamageBonus,
            int enchantmentValue,
            Identifier incorrectBlocksForDrops,
            Optional<Identifier> repairItems) implements ToolTierSpec {
        public static final Codec<ToolMaterialSpec> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("durability", intAtLeast(1)).forGetter(ToolMaterialSpec::durability),
                required("speed", floatAtLeast(0)).forGetter(ToolMaterialSpec::speed),
                required("attack_damage_bonus", FLOAT).forGetter(ToolMaterialSpec::attackDamageBonus),
                required("enchantment_value", intAtLeast(0)).forGetter(ToolMaterialSpec::enchantmentValue),
                required("incorrect_blocks_for_drops", TAG_ID).forGetter(ToolMaterialSpec::incorrectBlocksForDrops),
                optional("repair_items", TAG_ID).forGetter(ToolMaterialSpec::repairItems)).apply(i, ToolMaterialSpec::new));
    }

    /**
     * Makes the item a tool of a kind and tier; {@code attack_damage} and {@code attack_speed}
     * override the type's base values (the material's bonus is still added to the damage).
     */
    public record Tool(ToolType type, ToolTierSpec tier, Optional<Float> attackDamage, Optional<Float> attackSpeed) {
        public static final Codec<Tool> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("type", ToolType.CODEC).forGetter(Tool::type),
                required("tier", ToolTierSpec.CODEC).forGetter(Tool::tier),
                optional("attack_damage", FLOAT).forGetter(Tool::attackDamage),
                optional("attack_speed", FLOAT).forGetter(Tool::attackSpeed)).apply(i, Tool::new));
    }

    /** Armour slots: four humanoid slots, and horse and wolf body armour (ADR 0044 D5). */
    public enum ArmorSlot {
        HELMET, CHESTPLATE, LEGGINGS, BOOTS, HORSE, WOLF;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<ArmorSlot> CODEC = MsmCodecs.named("armor slot", values(), ArmorSlot::serialName);
    }

    /** An armour material: a vanilla {@link ArmorMaterialName} or a {@link CustomArmorMaterial} (ADR 0042 D1). */
    public sealed interface ArmorMaterialSpec permits ArmorMaterialName, CustomArmorMaterial {
        Codec<ArmorMaterialSpec> CODEC = MsmCodecs.nameOrObject(ArmorMaterialName.class, ArmorMaterialName.CODEC, CustomArmorMaterial.CODEC);
    }

    /** Vanilla armour materials; each maps onto the {@code ArmorMaterials} constant of the same name. */
    public enum ArmorMaterialName implements ArmorMaterialSpec {
        LEATHER, COPPER, CHAINMAIL, IRON, GOLD, DIAMOND, NETHERITE, TURTLE_SCUTE, ARMADILLO_SCUTE;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<ArmorMaterialName> CODEC = MsmCodecs.named("armor material", values(), ArmorMaterialName::serialName);
    }

    /** Defence points per slot; {@code body} (horse and wolf armour) defaults to {@code chestplate} (ADR 0050 D4). */
    public record Defense(int helmet, int chestplate, int leggings, int boots, Optional<Integer> body) {
        public static final Codec<Defense> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("helmet", intAtLeast(0)).forGetter(Defense::helmet),
                required("chestplate", intAtLeast(0)).forGetter(Defense::chestplate),
                required("leggings", intAtLeast(0)).forGetter(Defense::leggings),
                required("boots", intAtLeast(0)).forGetter(Defense::boots),
                optional("body", intAtLeast(0)).forGetter(Defense::body)).apply(i, Defense::new));

        /** The defence of horse and wolf armour: {@code body}, else {@code chestplate}. */
        public int bodyOrChestplate() {
            return body.orElse(chestplate);
        }
    }

    /**
     * A custom armour material ({@code ::msm::definition::ArmorMaterial}). {@code durability} is
     * the base that each slot multiplies (helmet 11, chestplate 16, leggings 15, boots 13).
     */
    public record CustomArmorMaterial(
            int durability,
            Defense defense,
            int enchantmentValue,
            float toughness,
            float knockbackResistance,
            Optional<Identifier> equipSound,
            Optional<Identifier> repairItems,
            Identifier equipmentAsset) implements ArmorMaterialSpec {
        public static final Codec<CustomArmorMaterial> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("durability", intAtLeast(1)).forGetter(CustomArmorMaterial::durability),
                required("defense", Defense.CODEC).forGetter(CustomArmorMaterial::defense),
                required("enchantment_value", intAtLeast(0)).forGetter(CustomArmorMaterial::enchantmentValue),
                required("toughness", floatAtLeast(0)).forGetter(CustomArmorMaterial::toughness),
                required("knockback_resistance", floatRange(0, 1)).forGetter(CustomArmorMaterial::knockbackResistance),
                optional("equip_sound", ID).forGetter(CustomArmorMaterial::equipSound),
                optional("repair_items", TAG_ID).forGetter(CustomArmorMaterial::repairItems),
                required("equipment_asset", ID).forGetter(CustomArmorMaterial::equipmentAsset)).apply(i, CustomArmorMaterial::new));
    }

    /** Makes the item an armour piece for a slot (horse and wolf armour use the {@code chestplate} defence). */
    public record Armor(ArmorSlot slot, ArmorMaterialSpec material) {
        public static final Codec<Armor> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("slot", ArmorSlot.CODEC).forGetter(Armor::slot),
                required("material", ArmorMaterialSpec.CODEC).forGetter(Armor::material)).apply(i, Armor::new));
    }

    /** Uses before the item breaks. */
    public record Durability(int max) {
        public static final Codec<Durability> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("max", intAtLeast(1)).forGetter(Durability::max)).apply(i, Durability::new));
    }

    /** Fires an event when a player uses the item, then puts it on cooldown. */
    public record OnUse(Identifier event, int cooldownTicks) {
        public static final Codec<OnUse> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("event", ID).forGetter(OnUse::event),
                optional("cooldown_ticks", intAtLeast(0), 0).forGetter(OnUse::cooldownTicks)).apply(i, OnUse::new));
    }

    /** How a consumable is used ({@code ConsumeAnimation}). */
    public enum ConsumeAnimation {
        EAT, DRINK, NONE;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<ConsumeAnimation> CODEC = MsmCodecs.named("consume animation", values(), ConsumeAnimation::serialName);
    }

    /** One vanilla mob effect ({@code ConsumeEffect}): {@code chance} 0 to 1, {@code amplifier} is the level minus one. */
    public record ConsumeEffect(Identifier effect, float seconds, int amplifier, float chance) {
        public static final Codec<ConsumeEffect> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("effect", ID).forGetter(ConsumeEffect::effect),
                required("seconds", floatAtLeast(0)).forGetter(ConsumeEffect::seconds),
                optional("amplifier", intRange(0, 255), 0).forGetter(ConsumeEffect::amplifier),
                optional("chance", floatRange(0, 1), 1.0f).forGetter(ConsumeEffect::chance)).apply(i, ConsumeEffect::new));

        /** The duration in ticks (20 per second, rounded). */
        public int ticks() {
            return Math.round(seconds * 20);
        }
    }

    /**
     * Makes the item consumable (ADR 0044 D2): with {@code msm:food} it is food with these extras, alone a drink or
     * another consumable that restores no hunger.
     */
    public record Consumable(
            float seconds,
            ConsumeAnimation animation,
            List<ConsumeEffect> effects,
            Optional<Identifier> sound,
            Optional<Boolean> particles,
            Optional<Identifier> convertsTo,
            Optional<Float> cooldownSeconds) {
        public static final Codec<Consumable> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("seconds", floatAtLeast(0)).forGetter(Consumable::seconds),
                required("animation", ConsumeAnimation.CODEC).forGetter(Consumable::animation),
                optional("effects", ConsumeEffect.CODEC.listOf(), List.of()).forGetter(Consumable::effects),
                optional("sound", ID).forGetter(Consumable::sound),
                optional("particles", Codec.BOOL).forGetter(Consumable::particles),
                optional("converts_to", ID).forGetter(Consumable::convertsTo),
                optional("cooldown_seconds", floatAtLeast(0)).forGetter(Consumable::cooldownSeconds)).apply(i, Consumable::new));
    }

    /** Ranged weapon kinds. */
    public enum RangedWeaponType {
        BOW, CROSSBOW;

        public String serialName() {
            return name().toLowerCase(java.util.Locale.ROOT);
        }

        public static final Codec<RangedWeaponType> CODEC = MsmCodecs.named("ranged weapon type", values(), RangedWeaponType::serialName);
    }

    /**
     * A bow or crossbow shooting vanilla arrows (ADR 0044 D3); {@code draw_speed}, {@code velocity} and
     * {@code damage_multiplier} are factors on vanilla's values, {@code inaccuracy} replaces vanilla's 1.
     */
    public record RangedWeapon(RangedWeaponType type, float drawSpeed, float velocity, float damageMultiplier, float inaccuracy) {
        public static final Codec<RangedWeapon> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("type", RangedWeaponType.CODEC).forGetter(RangedWeapon::type),
                optional("draw_speed", floatRange(0.1f, 10), 1.0f).forGetter(RangedWeapon::drawSpeed),
                optional("velocity", floatRange(0.1f, 10), 1.0f).forGetter(RangedWeapon::velocity),
                optional("damage_multiplier", floatRange(0, 10), 1.0f).forGetter(RangedWeapon::damageMultiplier),
                optional("inaccuracy", floatRange(0, 10), 1.0f).forGetter(RangedWeapon::inaccuracy)).apply(i, RangedWeapon::new));
    }

    /** Blocks attacks while held up (ADR 0044 D3), lowered to vanilla {@code blocks_attacks}; defaults are the vanilla shield's. */
    public record Shield(float blockDelaySeconds, float damageReduction, float disableCooldownScale, Optional<Identifier> bypassedBy) {
        public static final Codec<Shield> CODEC = RecordCodecBuilder.create(i -> i.group(
                optional("block_delay_seconds", floatAtLeast(0), 0.25f).forGetter(Shield::blockDelaySeconds),
                optional("damage_reduction", floatRange(0, 1), 1.0f).forGetter(Shield::damageReduction),
                optional("disable_cooldown_scale", floatAtLeast(0), 1.0f).forGetter(Shield::disableCooldownScale),
                optional("bypassed_by", TAG_ID).forGetter(Shield::bypassedBy)).apply(i, Shield::new));
    }

    /** Saves the holder from death like a totem of undying (ADR 0044 D4). */
    public record DeathProtection(List<ConsumeEffect> effects, boolean clearEffects) {
        public static final Codec<DeathProtection> CODEC = RecordCodecBuilder.create(i -> i.group(
                required("effects", ConsumeEffect.CODEC.listOf()).forGetter(DeathProtection::effects),
                optional("clear_effects", Codec.BOOL, false).forGetter(DeathProtection::clearEffects)).apply(i, DeathProtection::new));
    }
}
