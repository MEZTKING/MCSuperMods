package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmBowItem;
import dev.mcsupermods.runtime.registry.MsmCrossbowItem;
import dev.mcsupermods.runtime.registry.MsmItem;
import dev.mcsupermods.runtime.registry.MsmMaceItem;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponentType;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.MaceItem;
import net.minecraft.world.item.component.BlocksAttacks;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.item.enchantment.Enchantable;
import net.minecraft.world.item.equipment.Equippable;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;

/**
 * Gear, weapons and consumables (ADR 0044, B187) on the definitions in {@code msm/msm_test/item/}: ranged weapons,
 * shields, spears, maces, consumables, the {@code apply_effect} action, death protection, horse and wolf armour and the
 * {@code msm:components} passthrough.
 */
public class MsmGearGameTest {
    private static final BlockPos AT = new BlockPos(2, 1, 2);

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(Identifier.fromNamespaceAndPath("msm_test", path));
    }

    private static void assertClose(GameTestHelper helper, double actual, double expected, String what) {
        helper.assertTrue(Math.abs(actual - expected) < 1.0e-3, what + ": expected " + expected + ", got " + actual);
    }

    private static double modifier(ItemStack stack, EquipmentSlot slot, Holder<Attribute> attribute) {
        double[] sum = {0};
        stack.forEachModifier(slot, (a, m) -> {
            if (a.equals(attribute)) {
                sum[0] += m.amount();
            }
        });
        return sum[0];
    }

    /** Arrows near {@code shooter}, removed from the level once found. */
    private static List<AbstractArrow> takeArrows(ServerLevel level, LivingEntity shooter) {
        List<AbstractArrow> arrows = level.getEntitiesOfClass(AbstractArrow.class, new AABB(shooter.blockPosition()).inflate(4));
        arrows.forEach(AbstractArrow::discard);
        return arrows;
    }

    /** An arrow's base damage, read from its saved data ({@code AbstractArrow} has no getter). */
    private static double baseDamage(ServerLevel level, AbstractArrow arrow) {
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        arrow.saveWithoutId(out);
        return out.buildResult().getDoubleOr("damage", -1);
    }

    private static Player archer(GameTestHelper helper) {
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.getInventory().setItem(9, new ItemStack(Items.ARROW, 32)); // not the selected slot, which holds the weapon
        return player;
    }

    @GameTest
    public void bowShootsFasterArrows(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Player player = archer(helper);
        ItemStack bow = new ItemStack(item("ruby_bow"));
        helper.assertTrue(bow.getItem() instanceof MsmBowItem, "ruby_bow is not an MsmBowItem");
        helper.assertValueEqual(bow.getMaxDamage(), 384, "vanilla bow durability");
        helper.assertTrue(bow.has(DataComponents.ENCHANTABLE), "a bow is enchantable");
        int duration = bow.getUseDuration(player);
        takeArrows(level, player);

        // 10 ticks drawn at draw_speed 2 count as 20: full power (3.0) times velocity 1.5.
        player.setItemInHand(InteractionHand.MAIN_HAND, bow);
        helper.assertTrue(bow.getItem().releaseUsing(bow, level, player, duration - 10), "ruby_bow did not shoot");
        List<AbstractArrow> ours = takeArrows(level, player);
        helper.assertValueEqual(ours.size(), 1, "arrows shot by ruby_bow");

        ItemStack vanilla = new ItemStack(Items.BOW);
        player.setItemInHand(InteractionHand.MAIN_HAND, vanilla);
        helper.assertTrue(vanilla.getItem().releaseUsing(vanilla, level, player, duration - 10), "the vanilla bow did not shoot");
        List<AbstractArrow> theirs = takeArrows(level, player);
        helper.assertValueEqual(theirs.size(), 1, "arrows shot by the vanilla bow");

        double fast = ours.getFirst().getDeltaMovement().length();
        double slow = theirs.getFirst().getDeltaMovement().length();
        helper.assertTrue(Math.abs(fast - 4.5) < 0.3, "ruby_bow arrow speed: expected about 4.5, got " + fast);
        helper.assertTrue(Math.abs(slow - 1.25) < 0.3, "vanilla bow arrow speed after 10 ticks: expected about 1.25, got " + slow);
        assertClose(helper, baseDamage(level, ours.getFirst()), 2.0, "damage_multiplier 1 keeps vanilla's base damage");
        helper.succeed();
    }

    @GameTest
    public void crossbowDamageMultiplier(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Player player = archer(helper);
        ItemStack ours = new ItemStack(item("ruby_crossbow"));
        helper.assertTrue(ours.getItem() instanceof MsmCrossbowItem, "ruby_crossbow is not an MsmCrossbowItem");
        helper.assertValueEqual(ours.getMaxDamage(), 900, "msm:durability overrides the crossbow's 465");
        int duration = ours.getUseDuration(player);

        // 13 ticks of charging at draw_speed 2 count as 26, past vanilla's 25.
        player.setItemInHand(InteractionHand.MAIN_HAND, ours);
        ours.getItem().onUseTick(level, player, ours, duration - 13);
        helper.assertTrue(CrossbowItem.isCharged(ours), "ruby_crossbow is not charged after 13 ticks at draw_speed 2");
        ItemStack vanilla = new ItemStack(Items.CROSSBOW);
        player.setItemInHand(InteractionHand.MAIN_HAND, vanilla);
        vanilla.getItem().onUseTick(level, player, vanilla, duration - 13);
        helper.assertFalse(CrossbowItem.isCharged(vanilla), "the vanilla crossbow is charged after 13 ticks");

        takeArrows(level, player);
        player.setItemInHand(InteractionHand.MAIN_HAND, ours);
        ours.getItem().use(level, player, InteractionHand.MAIN_HAND);
        List<AbstractArrow> arrows = takeArrows(level, player);
        helper.assertValueEqual(arrows.size(), 1, "arrows shot by ruby_crossbow");
        assertClose(helper, baseDamage(level, arrows.getFirst()), 2.0 * 2.5, "arrow base damage times damage_multiplier");
        helper.succeed();
    }

    @GameTest
    public void shieldBlocks(GameTestHelper helper) {
        ItemStack shield = new ItemStack(item("ruby_shield"));
        helper.assertTrue(shield.getItem().getClass() == MsmItem.class, "a plain MsmItem carries msm:shield");
        BlocksAttacks blocks = shield.get(DataComponents.BLOCKS_ATTACKS);
        helper.assertTrue(blocks != null, "msm:shield sets blocks_attacks");
        assertClose(helper, blocks.blockDelaySeconds(), 0, "block_delay_seconds");
        assertClose(helper, blocks.disableCooldownScale(), 1, "default disable_cooldown_scale");
        helper.assertTrue(blocks.bypassedBy().isPresent(), "default bypassed_by #minecraft:bypasses_shield");
        helper.assertValueEqual(shield.getMaxDamage(), 336, "vanilla shield durability");
        helper.assertTrue(shield.has(DataComponents.ENCHANTABLE), "a shield is enchantable");
        helper.assertValueEqual(shield.get(DataComponents.EQUIPPABLE).slot(), EquipmentSlot.OFFHAND, "off-hand equippable");

        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, shield);
        shield.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(player.isUsingItem(), "using msm:shield does not raise it");
        helper.assertValueEqual(shield.getUseAnimation(), ItemUseAnimation.BLOCK, "use animation");
        helper.assertTrue(player.isBlocking(), "the raised shield does not block (block delay 0)");
        assertClose(helper, blocks.resolveBlockedDamage(helper.getLevel().damageSources().generic(), 10, 0), 5, "damage_reduction 0.5 of 10");
        player.stopUsingItem();
        helper.succeed();
    }

    @GameTest
    public void spearProperties(GameTestHelper helper) {
        ItemStack ours = new ItemStack(item("ruby_spear"));
        ItemStack vanilla = new ItemStack(Items.IRON_SPEAR);
        List<DataComponentType<?>> same = List.of(DataComponents.KINETIC_WEAPON, DataComponents.PIERCING_WEAPON, DataComponents.ATTACK_RANGE,
                DataComponents.MINIMUM_ATTACK_CHARGE, DataComponents.ATTACK_ANIMATION, DataComponents.WEAPON, DataComponents.DAMAGE_TYPE,
                DataComponents.MAX_DAMAGE, DataComponents.ENCHANTABLE, DataComponents.REPAIRABLE);
        for (DataComponentType<?> type : same) {
            helper.assertValueEqual(ours.get(type), vanilla.get(type), "component " + BuiltInRegistries.DATA_COMPONENT_TYPE.getKey(type));
        }
        for (Holder<Attribute> a : List.of(Attributes.ATTACK_DAMAGE, Attributes.ATTACK_SPEED)) {
            assertClose(helper, modifier(ours, EquipmentSlot.MAINHAND, a), modifier(vanilla, EquipmentSlot.MAINHAND, a), a.getRegisteredName());
        }
        // attack_speed -1 means an attack duration of 1/3 s; attack_damage 2 plus stone's bonus 1.
        ItemStack quick = new ItemStack(item("quick_spear"));
        assertClose(helper, modifier(quick, EquipmentSlot.MAINHAND, Attributes.ATTACK_SPEED), -1.0, "attack_speed override");
        assertClose(helper, modifier(quick, EquipmentSlot.MAINHAND, Attributes.ATTACK_DAMAGE), 2.0 + 1.0, "attack_damage override plus bonus");
        helper.assertValueEqual(quick.get(DataComponents.KINETIC_WEAPON), new ItemStack(Items.STONE_SPEAR).get(DataComponents.KINETIC_WEAPON),
                "stone kinetic values");
        helper.succeed();
    }

    @GameTest
    public void maceProperties(GameTestHelper helper) {
        ItemStack ours = new ItemStack(item("ruby_mace"));
        ItemStack vanilla = new ItemStack(Items.MACE);
        helper.assertTrue(ours.getItem() instanceof MsmMaceItem && ours.getItem() instanceof MaceItem, "ruby_mace is not an MsmMaceItem");
        helper.assertValueEqual(ours.getMaxDamage(), 1561, "diamond durability");
        Enchantable enchantable = ours.get(DataComponents.ENCHANTABLE);
        helper.assertTrue(enchantable != null && enchantable.value() == 10, "diamond enchantment value: " + enchantable);
        helper.assertValueEqual(ours.get(DataComponents.TOOL), vanilla.get(DataComponents.TOOL), "mace tool rule");
        helper.assertValueEqual(ours.get(DataComponents.WEAPON), vanilla.get(DataComponents.WEAPON), "weapon component");
        for (Holder<Attribute> a : List.of(Attributes.ATTACK_DAMAGE, Attributes.ATTACK_SPEED)) {
            assertClose(helper, modifier(ours, EquipmentSlot.MAINHAND, a), modifier(vanilla, EquipmentSlot.MAINHAND, a), a.getRegisteredName());
        }
        helper.assertTrue(ours.isValidRepairItem(new ItemStack(Items.DIAMOND)), "diamonds repair a diamond mace");
        helper.succeed();
    }

    private static void assertEffect(GameTestHelper helper, LivingEntity entity, Holder<MobEffect> effect, int amplifier, int ticks, String what) {
        MobEffectInstance instance = entity.getEffect(effect);
        helper.assertTrue(instance != null, what + ": no " + effect.getRegisteredName());
        helper.assertValueEqual(instance.getAmplifier(), amplifier, what + ": amplifier");
        helper.assertTrue(Math.abs(instance.getDuration() - ticks) <= 2, what + ": duration " + instance.getDuration() + ", expected " + ticks);
    }

    @GameTest
    public void drinkAppliesEffects(GameTestHelper helper) {
        ItemStack tonic = new ItemStack(item("ruby_tonic"));
        helper.assertTrue(tonic.getItem() instanceof MsmItem, "ruby_tonic is not an MsmItem");
        helper.assertValueEqual(tonic.getMaxStackSize(), 16, "max_stack_size");
        Consumable consumable = tonic.get(DataComponents.CONSUMABLE);
        helper.assertTrue(consumable != null, "msm:consumable sets consumable");
        helper.assertValueEqual(consumable.animation(), ItemUseAnimation.DRINK, "animation");
        assertClose(helper, consumable.consumeSeconds(), 1, "seconds");
        helper.assertFalse(tonic.has(DataComponents.FOOD), "a drink without msm:food restores no hunger");
        helper.assertTrue(tonic.has(DataComponents.USE_REMAINDER), "converts_to sets use_remainder");

        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, tonic);
        ItemStack left = tonic.finishUsingItem(helper.getLevel(), player);
        helper.assertTrue(left.is(Items.GLASS_BOTTLE), "converts_to leaves a glass bottle, got " + left);
        assertEffect(helper, player, MobEffects.SPEED, 1, 600, "speed");
        assertEffect(helper, player, MobEffects.REGENERATION, 0, 100, "regeneration");
        helper.assertTrue(player.getCooldowns().isOnCooldown(new ItemStack(item("ruby_tonic"))), "cooldown_seconds starts a cooldown");

        // With msm:food: food plus the consumable's time and effects.
        ItemStack pie = new ItemStack(item("ruby_pie"));
        helper.assertValueEqual(pie.get(DataComponents.FOOD).nutrition(), 8, "food nutrition");
        assertClose(helper, pie.get(DataComponents.CONSUMABLE).consumeSeconds(), 2.5, "food consume seconds");
        player.setItemInHand(InteractionHand.MAIN_HAND, pie);
        pie.finishUsingItem(helper.getLevel(), player);
        assertEffect(helper, player, MobEffects.HASTE, 0, 200, "haste from food");
        helper.succeed();
    }

    @GameTest
    public void charmCooldown(GameTestHelper helper) {
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        ItemStack charm = new ItemStack(item("ruby_charm"));
        player.setItemInHand(InteractionHand.MAIN_HAND, charm);
        charm.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        assertEffect(helper, player, MobEffects.SPEED, 1, 200, "apply_effect self");
        assertEffect(helper, player, MobEffects.GLOWING, 0, 40, "apply_effect other (the player in item events)");
        helper.assertValueEqual(charm.getCount(), 1, "the charm is not consumed");
        helper.assertTrue(player.getCooldowns().isOnCooldown(charm), "cooldown_ticks starts a cooldown");
        player.removeAllEffects();
        charm.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertFalse(player.hasEffect(MobEffects.SPEED), "the charm works again during its cooldown");
        helper.succeed();
    }

    @GameTest
    public void totemProtects(GameTestHelper helper) {
        Mob holder = helper.spawnWithNoFreeWill(EntityTypes.COW, AT); // not undead: those ignore poison and regeneration
        holder.setItemSlot(EquipmentSlot.OFFHAND, new ItemStack(item("ruby_totem")));
        holder.addEffect(new MobEffectInstance(MobEffects.POISON, 400));
        holder.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 1000.0f);
        helper.assertTrue(holder.isAlive(), "msm:death_protection did not save the holder");
        helper.assertTrue(holder.getItemBySlot(EquipmentSlot.OFFHAND).isEmpty(), "the totem is not used up");
        helper.assertFalse(holder.hasEffect(MobEffects.POISON), "clear_effects did not clear poison");
        assertEffect(helper, holder, MobEffects.REGENERATION, 1, 200, "regeneration");
        assertEffect(helper, holder, MobEffects.FIRE_RESISTANCE, 0, 400, "fire resistance");
        holder.discard();
        helper.succeed();
    }

    @GameTest
    public void horseArmorRegistered(GameTestHelper helper) {
        ItemStack horse = new ItemStack(item("ruby_horse_armor"));
        Equippable equippable = horse.get(DataComponents.EQUIPPABLE);
        helper.assertTrue(equippable != null, "horse armour is equippable");
        helper.assertValueEqual(equippable.slot(), EquipmentSlot.BODY, "body slot");
        helper.assertValueEqual(equippable.assetId().map(k -> k.identifier()), Optional.of(Identifier.fromNamespaceAndPath("msm_test", "ruby")),
                "equipment asset");
        helper.assertTrue(equippable.canBeEquippedBy(EntityTypes.HORSE.builtInRegistryHolder()), "a horse cannot wear it");
        helper.assertFalse(equippable.canBeEquippedBy(EntityTypes.WOLF.builtInRegistryHolder()), "a wolf can wear horse armour");
        assertClose(helper, modifier(horse, EquipmentSlot.BODY, Attributes.ARMOR), 9, "horse armour uses the chestplate defence");
        helper.assertValueEqual(horse.getMaxStackSize(), 1, "horse armour stacks to 1");

        ItemStack wolf = new ItemStack(item("scute_wolf_armor"));
        ItemStack vanilla = new ItemStack(Items.WOLF_ARMOR);
        helper.assertValueEqual(wolf.get(DataComponents.EQUIPPABLE), vanilla.get(DataComponents.EQUIPPABLE), "wolf armour equippable");
        helper.assertValueEqual(wolf.getMaxDamage(), vanilla.getMaxDamage(), "wolf armour durability");
        assertClose(helper, modifier(wolf, EquipmentSlot.BODY, Attributes.ARMOR), modifier(vanilla, EquipmentSlot.BODY, Attributes.ARMOR), "wolf armour");
        helper.succeed();
    }

    @GameTest
    public void passthroughGlider(GameTestHelper helper) {
        ItemStack wings = new ItemStack(item("winged_charm"));
        helper.assertTrue(wings.has(DataComponents.GLIDER), "minecraft:glider through msm:components");
        helper.assertValueEqual(wings.get(DataComponents.EQUIPPABLE).slot(), EquipmentSlot.CHEST, "minecraft:equippable");
        helper.assertTrue(wings.has(DataComponents.DAMAGE_RESISTANT), "minecraft:damage_resistant (a damage type tag, decoded once data packs are loaded)");
        helper.assertValueEqual(wings.getMaxStackSize(), 1, "max_stack_size of the definition wins over minecraft:max_stack_size");
        helper.succeed();
    }

    @GameTest
    public void passthroughDelayedHolders(GameTestHelper helper) {
        ItemStack disc = new ItemStack(item("ruby_disc"));
        helper.assertTrue(disc.has(DataComponents.JUKEBOX_PLAYABLE), "jukebox_playable is decoded once data packs are loaded");
        helper.assertValueEqual(disc.get(DataComponents.JUKEBOX_PLAYABLE).song().unwrapKey().map(k -> k.identifier()),
                Optional.of(Identifier.withDefaultNamespace("13")), "jukebox song");
        helper.assertTrue(disc.has(DataComponents.PROVIDES_TRIM_MATERIAL), "provides_trim_material is decoded once data packs are loaded");
        helper.succeed();
    }

    @GameTest
    public void passthroughRejectsDynamicHolder(GameTestHelper helper) {
        ItemStack blade = new ItemStack(item("enchanted_blade"));
        helper.assertTrue(blade.getItem() instanceof MsmItem, "enchanted_blade still registers");
        helper.assertFalse(blade.isEnchanted(), "minecraft:enchantments applied");
        helper.assertTrue(blade.has(DataComponents.GLIDER), "the other passthrough entries still apply");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("enchanted_blade.json") && e.contains("minecraft:enchantments")
                && e.contains("needs a data pack registry")), "no error for a data pack registry holder: " + errors);
        helper.succeed();
    }
}
