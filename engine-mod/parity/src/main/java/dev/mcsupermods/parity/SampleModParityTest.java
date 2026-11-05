package dev.mcsupermods.parity;

import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.item.enchantment.Enchantable;
import net.minecraft.world.item.equipment.Equippable;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RedstoneLampBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-mod} (namespace {@code msm_sample_mod}), written
 * against vanilla and Fabric API only, so the same tests run against the content jar (with
 * {@code msm_runtime} nested) and against the ejected Java project's jar (ADR 0033 D5).
 *
 * <p>Expected values are the fixture's: blocks {@code ruby_ore}, {@code chime_block},
 * {@code glow_stone}; items {@code ruby}, {@code ruby_wand}, {@code ruby_pickaxe} (a custom tool
 * material, ADR 0042), {@code ruby_helmet} (custom armour material, equipment asset
 * {@code ruby_armor}), {@code ruby_apple}, and since ADR 0044 {@code ruby_bow} (draw speed 2, velocity
 * 1.5, damage multiplier 1.5), {@code ruby_tonic} (a drink with speed and regeneration, a glass bottle
 * back, a 3 second cooldown), {@code ruby_charm} ({@code apply_effect} on use, a 100-tick cooldown) and
 * {@code ruby_horse_armor}; function {@code ruby/shimmer}
 * ({@code say The ruby shimmers.}). Events are
 * observed through their vanilla effects: placed blocks, given items, item cooldowns and the
 * function's chat line. Sounds and particles have no server-side trace a GameTest can read.
 * Run with {@code --gametest-filter msm_parity_tests:sample_mod_*}.
 */
public class SampleModParityTest {
    static {
        ParityChat.register();
    }

    private static final String NAMESPACE = "msm_sample_mod";
    private static final BlockPos AT = new BlockPos(2, 1, 2);
    private static final String SHIMMER = "The ruby shimmers.";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    private static Block block(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id(path)), "block " + id(path) + " is not registered");
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(path)), "item " + id(path) + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static int count(Player player, Item item) {
        int n = 0;
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack stack = player.getInventory().getItem(i);
            if (stack.is(item)) {
                n += stack.getCount();
            }
        }
        return n;
    }

    /** The summed amount of {@code attribute}'s modifiers on {@code stack} for {@code slot}. */
    private static double modifier(ItemStack stack, EquipmentSlot slot, Holder<Attribute> attribute) {
        double[] sum = {0};
        stack.forEachModifier(slot, (a, m) -> {
            if (a.equals(attribute)) {
                sum[0] += m.amount();
            }
        });
        return sum[0];
    }

    private static void assertClose(GameTestHelper helper, double actual, double expected, String what) {
        helper.assertTrue(Math.abs(actual - expected) < 1.0e-4, what + ": expected " + expected + ", got " + actual);
    }

    /** Places {@code block} at {@link #AT} and checks the state's light, hardness and sound (an mcdoc sound_type id). */
    private static BlockState place(GameTestHelper helper, Block block, int light, float hardness, String sound, String what) {
        helper.setBlock(AT, block);
        BlockState state = helper.getBlockState(AT);
        helper.assertValueEqual(state.getLightEmission(), light, what + " light");
        helper.assertValueEqual(state.getDestroySpeed(helper.getLevel(), helper.absolutePos(AT)), hardness, what + " hardness");
        helper.assertTrue(ParitySounds.hasSound(state, sound), what + " sound type");
        return state;
    }

    private static void assertBlockItem(GameTestHelper helper, Block block, String path, int stack, Rarity rarity) {
        Item item = item(helper, path);
        helper.assertTrue(item instanceof BlockItem bi && bi.getBlock() == block, path + " is not the block's item: " + item);
        helper.assertValueEqual(item.getDefaultMaxStackSize(), stack, path + " block item max stack size");
        helper.assertValueEqual(item.components().get(DataComponents.RARITY), rarity, path + " block item rarity");
    }

    // Blocks

    @GameTest
    public void rubyOreIsRegistered(GameTestHelper helper) {
        Block block = block(helper, "ruby_ore");
        assertBlockItem(helper, block, "ruby_ore", 64, Rarity.COMMON);
        helper.succeed();
    }

    @GameTest
    public void rubyOreProperties(GameTestHelper helper) {
        Block block = block(helper, "ruby_ore");
        BlockState state = place(helper, block, 7, 3.0f, "stone", "ruby_ore");
        helper.assertValueEqual(block.getExplosionResistance(), 3.0f, "ruby_ore resistance");
        helper.assertTrue(state.requiresCorrectToolForDrops(), "ruby_ore requires the tool");
        helper.assertTrue(new ItemStack(Items.IRON_PICKAXE).isCorrectToolForDrops(state), "iron pickaxe is the correct tool (min_tier iron)");
        helper.assertTrue(new ItemStack(Items.DIAMOND_PICKAXE).isCorrectToolForDrops(state), "diamond pickaxe is a correct tool");
        helper.assertFalse(new ItemStack(Items.STONE_PICKAXE).isCorrectToolForDrops(state), "stone pickaxe is below min_tier iron");
        helper.assertFalse(new ItemStack(Items.IRON_SHOVEL).isCorrectToolForDrops(state), "a shovel is not the tool");
        helper.assertTrue(new ItemStack(item(helper, "ruby_pickaxe")).isCorrectToolForDrops(state), "ruby pickaxe mines ruby ore");
        helper.assertValueEqual(block.getLootTable().orElseThrow().identifier(), id("blocks/ruby_ore_rich"), "ruby_ore loot table");
        List<ItemStack> drops = Block.getDrops(state, helper.getLevel(), helper.absolutePos(AT), null, null, new ItemStack(Items.IRON_PICKAXE));
        Item ruby = item(helper, "ruby");
        int rubies = drops.stream().filter(s -> s.is(ruby)).mapToInt(ItemStack::getCount).sum();
        helper.assertTrue(rubies >= 1 && rubies <= 3 && drops.stream().allMatch(s -> s.is(ruby)), "ruby_ore drops 1 to 3 rubies: " + drops);
        helper.succeed();
    }

    @GameTest
    public void chimeBlockProperties(GameTestHelper helper) {
        Block block = block(helper, "chime_block");
        BlockState state = place(helper, block, 0, 0.8f, "wood", "chime_block");
        helper.assertValueEqual(block.getExplosionResistance(), 6.0f, "chime_block default resistance");
        helper.assertFalse(state.requiresCorrectToolForDrops(), "chime_block drops without the tool (requires_tool false)");
        helper.assertTrue(new ItemStack(Items.WOODEN_AXE).getDestroySpeed(state) > 1.0f, "an axe is the tool (mineable with axe)");
        helper.assertValueEqual(new ItemStack(Items.IRON_PICKAXE).getDestroySpeed(state), 1.0f, "a pickaxe is not the tool");
        helper.assertValueEqual(block.getLootTable().orElseThrow().identifier(), id("blocks/chime_block"), "chime_block loot table");
        List<ItemStack> drops = Block.getDrops(state, helper.getLevel(), helper.absolutePos(AT), null, null, ItemStack.EMPTY);
        helper.assertTrue(drops.size() == 1 && drops.getFirst().is(item(helper, "chime_block")) && drops.getFirst().getCount() == 1,
                "chime_block drops itself (loot self): " + drops);
        assertBlockItem(helper, block, "chime_block", 16, Rarity.UNCOMMON);
        helper.succeed();
    }

    @GameTest
    public void glowStoneProperties(GameTestHelper helper) {
        Block block = block(helper, "glow_stone");
        BlockState state = place(helper, block, 15, 2.0f, "glass", "glow_stone");
        helper.assertValueEqual(block.getExplosionResistance(), 6.0f, "glow_stone default resistance");
        helper.assertTrue(state.requiresCorrectToolForDrops(), "glow_stone requires the tool");
        helper.assertTrue(new ItemStack(Items.NETHERITE_SHOVEL).isCorrectToolForDrops(state), "netherite shovel is the correct tool");
        // Vanilla gates no block behind netherite: min_tier netherite lands in needs_diamond_tool.
        helper.assertTrue(new ItemStack(Items.DIAMOND_SHOVEL).isCorrectToolForDrops(state), "diamond shovel is a correct tool");
        helper.assertFalse(new ItemStack(Items.IRON_SHOVEL).isCorrectToolForDrops(state), "iron shovel is below the diamond gate");
        helper.assertFalse(new ItemStack(Items.NETHERITE_PICKAXE).isCorrectToolForDrops(state), "a pickaxe is not the tool");
        helper.assertValueEqual(block.getLootTable().orElseThrow().identifier(), id("blocks/glow_stone"), "glow_stone loot table");
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("glow_stone")), "glow_stone has \"item\": false but an item is registered");
        helper.succeed();
    }

    // Items

    @GameTest
    public void itemProperties(GameTestHelper helper) {
        ItemStack ruby = new ItemStack(item(helper, "ruby"));
        helper.assertValueEqual(ruby.getMaxStackSize(), 64, "ruby max stack size");
        helper.assertValueEqual(ruby.getRarity(), Rarity.UNCOMMON, "ruby rarity");
        helper.assertFalse(ruby.isDamageableItem(), "ruby has no durability");

        ItemStack wand = new ItemStack(item(helper, "ruby_wand"));
        helper.assertValueEqual(wand.getMaxDamage(), 32, "ruby_wand durability overrides the tier's");
        helper.assertValueEqual(wand.getMaxStackSize(), 1, "ruby_wand stacks to 1");
        helper.assertValueEqual(wand.getRarity(), Rarity.EPIC, "ruby_wand rarity");
        helper.assertValueEqual(wand.get(DataComponents.ATTRIBUTE_MODIFIERS), new ItemStack(Items.GOLDEN_SWORD).get(DataComponents.ATTRIBUTE_MODIFIERS),
                "ruby_wand (gold sword) attack modifiers");
        helper.assertTrue(wand.getDestroySpeed(Blocks.COBWEB.defaultBlockState()) > 1.0f, "ruby_wand is a sword (fast on cobweb)");

        ItemStack apple = new ItemStack(item(helper, "ruby_apple"));
        FoodProperties food = apple.get(DataComponents.FOOD);
        helper.assertTrue(food != null, "ruby_apple is food");
        helper.assertValueEqual(food.nutrition(), 4, "ruby_apple nutrition");
        helper.assertValueEqual(food.saturation(), 4 * 0.6f * 2.0f, "ruby_apple saturation (modifier 0.6)");
        helper.assertTrue(food.canAlwaysEat(), "ruby_apple can always be eaten");
        helper.assertTrue(apple.has(DataComponents.CONSUMABLE), "ruby_apple is consumable");
        helper.assertValueEqual(apple.getMaxStackSize(), 16, "ruby_apple max stack size");
        helper.assertValueEqual(apple.getRarity(), Rarity.COMMON, "ruby_apple rarity");
        helper.succeed();
    }

    @GameTest
    public void rubyHelmetIsArmor(GameTestHelper helper) {
        ItemStack helmet = new ItemStack(item(helper, "ruby_helmet"));
        Equippable equippable = helmet.get(DataComponents.EQUIPPABLE);
        helper.assertTrue(equippable != null, "ruby_helmet is equippable (msm:armor)");
        helper.assertValueEqual(equippable.slot(), EquipmentSlot.HEAD, "ruby_helmet slot");
        helper.assertValueEqual(equippable.assetId().map(k -> k.identifier()), Optional.of(id("ruby_armor")), "ruby_helmet equipment asset");
        assertClose(helper, modifier(helmet, EquipmentSlot.HEAD, Attributes.ARMOR), 3, "ruby_helmet armor (helmet defense)");
        assertClose(helper, modifier(helmet, EquipmentSlot.HEAD, Attributes.ARMOR_TOUGHNESS), 1, "ruby_helmet armor_toughness");
        assertClose(helper, modifier(helmet, EquipmentSlot.HEAD, Attributes.KNOCKBACK_RESISTANCE), 0.05f, "ruby_helmet knockback_resistance");
        assertClose(helper, modifier(helmet, EquipmentSlot.CHEST, Attributes.ARMOR), 0, "ruby_helmet armor in the chest slot");
        helper.assertValueEqual(helmet.getMaxDamage(), 11 * 25, "ruby_helmet durability (helmet multiplier 11 times 25)");
        helper.assertValueEqual(helmet.getMaxStackSize(), 1, "ruby_helmet stacks to 1");
        helper.assertValueEqual(helmet.getRarity(), Rarity.RARE, "ruby_helmet rarity");
        helper.assertTrue(helmet.isValidRepairItem(new ItemStack(Items.DIAMOND)), "diamonds repair ruby_helmet (#minecraft:repairs_diamond_armor)");
        helper.assertFalse(helmet.isValidRepairItem(new ItemStack(Items.IRON_INGOT)), "iron repairs ruby_helmet");
        Enchantable enchantable = helmet.get(DataComponents.ENCHANTABLE);
        helper.assertTrue(enchantable != null && enchantable.value() == 12, "ruby_helmet enchantable 12: " + enchantable);
        helper.succeed();
    }

    @GameTest
    public void rubyPickaxeMaterial(GameTestHelper helper) {
        Item item = item(helper, "ruby_pickaxe");
        ItemStack pickaxe = new ItemStack(item);
        helper.assertValueEqual(pickaxe.getMaxDamage(), 1200, "ruby_pickaxe durability (custom material)");
        helper.assertValueEqual(pickaxe.getMaxStackSize(), 1, "ruby_pickaxe stacks to 1");
        helper.assertValueEqual(pickaxe.getRarity(), Rarity.RARE, "ruby_pickaxe rarity");
        helper.assertFalse(pickaxe.has(DataComponents.ENCHANTABLE), "ruby_pickaxe (enchantment_value 0) is enchantable");
        helper.assertTrue(pickaxe.isValidRepairItem(new ItemStack(Items.DIAMOND)), "diamonds repair ruby_pickaxe");
        assertClose(helper, modifier(pickaxe, EquipmentSlot.MAINHAND, Attributes.ATTACK_DAMAGE), 1.0 + 3.0, "ruby_pickaxe attack damage (pickaxe base 1 plus bonus 3)");
        assertClose(helper, modifier(pickaxe, EquipmentSlot.MAINHAND, Attributes.ATTACK_SPEED), -2.6f, "ruby_pickaxe attack_speed override");

        BlockState obsidian = Blocks.OBSIDIAN.defaultBlockState();
        helper.assertTrue(pickaxe.isCorrectToolForDrops(obsidian), "ruby_pickaxe mines obsidian for drops (incorrect_for_diamond_tool)");
        helper.assertValueEqual(pickaxe.getDestroySpeed(obsidian), 9.0f, "ruby_pickaxe speed on obsidian");
        helper.assertValueEqual(pickaxe.getDestroySpeed(Blocks.STONE.defaultBlockState()), 9.0f, "ruby_pickaxe speed on stone");

        // Progress through the player: speed / hardness / 30 with drops, / 100 without (stone: speed 4, no drops).
        helper.setBlock(AT, Blocks.OBSIDIAN);
        BlockPos abs = helper.absolutePos(AT);
        ServerPlayer player = (ServerPlayer) helper.makeMockServerPlayer(GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, pickaxe.copy());
        float rubyProgress = obsidian.getDestroyProgress(player, helper.getLevel(), abs);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.STONE_PICKAXE));
        float stoneProgress = obsidian.getDestroyProgress(player, helper.getLevel(), abs);
        assertClose(helper, rubyProgress / stoneProgress, (9.0 / 30.0) / (4.0 / 100.0), "ruby against stone pickaxe progress on obsidian");

        // Black box: break obsidian as a survival player does and observe the drop.
        BlockPos other = AT.east();
        helper.setBlock(other, Blocks.OBSIDIAN);
        helper.assertTrue(player.gameMode.destroyBlock(helper.absolutePos(other)), "a stone pickaxe breaks obsidian");
        helper.assertItemEntityNotPresent(Items.OBSIDIAN, other, 2.0);
        player.setItemInHand(InteractionHand.MAIN_HAND, pickaxe.copy());
        helper.assertTrue(player.gameMode.destroyBlock(abs), "ruby_pickaxe breaks obsidian");
        helper.assertBlockPresent(Blocks.AIR, AT);
        helper.assertItemEntityPresent(Items.OBSIDIAN, AT, 2.0);
        helper.succeed();
    }

    // Events

    @GameTest
    public void rubyOreInteractionRunsTheFunction(GameTestHelper helper) {
        helper.setBlock(AT, block(helper, "ruby_ore"));
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        int mark = ParityChat.mark();
        helper.useBlock(AT, player);
        helper.assertValueEqual(ParityChat.since(mark), List.of(SHIMMER), "chat after using ruby_ore (run_function ruby/shimmer)");
        helper.assertBlockPresent(block(helper, "ruby_ore"), AT);
        helper.succeed();
    }

    @GameTest(maxTicks = 60)
    public void chimeStepPlacesGlowstoneWithPerEntityCooldown(GameTestHelper helper) {
        Block block = block(helper, "chime_block");
        helper.setBlock(AT, block);
        BlockPos abs = helper.absolutePos(AT);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        Player other = helper.makeMockPlayer(GameType.SURVIVAL);
        block.stepOn(helper.getLevel(), abs, helper.getBlockState(AT), player);
        helper.assertBlockPresent(Blocks.GLOWSTONE, AT.above());
        helper.setBlock(AT.above(), Blocks.AIR);
        block.stepOn(helper.getLevel(), abs, helper.getBlockState(AT), player);
        helper.assertBlockPresent(Blocks.AIR, AT.above());
        block.stepOn(helper.getLevel(), abs, helper.getBlockState(AT), other);
        helper.assertBlockPresent(Blocks.GLOWSTONE, AT.above());
        helper.setBlock(AT.above(), Blocks.AIR);
        helper.runAfterDelay(21, () -> {
            block.stepOn(helper.getLevel(), abs, helper.getBlockState(AT), player);
            helper.assertBlockPresent(Blocks.GLOWSTONE, AT.above());
            helper.succeed();
        });
    }

    @GameTest
    public void chimeRedstoneTransitionsPlaceAndClearGlowstone(GameTestHelper helper) {
        helper.setBlock(AT, block(helper, "chime_block"));
        helper.assertBlockPresent(Blocks.AIR, AT.above());
        helper.setBlock(AT.west(), Blocks.REDSTONE_BLOCK);
        helper.assertBlockPresent(Blocks.GLOWSTONE, AT.above());
        helper.setBlock(AT.west(), Blocks.AIR);
        helper.assertBlockPresent(Blocks.AIR, AT.above());
        helper.succeed();
    }

    @GameTest
    public void chimeEmitsNoSignal(GameTestHelper helper) {
        helper.setBlock(AT.east(), Blocks.REDSTONE_LAMP);
        helper.setBlock(AT, block(helper, "chime_block"));
        BlockState state = helper.getBlockState(AT);
        helper.assertFalse(state.isSignalSource(), "chime_block (emit 0) is a signal source");
        helper.assertValueEqual(state.getSignal(helper.getLevel(), helper.absolutePos(AT), Direction.WEST), 0, "chime_block signal");
        helper.runAfterDelay(4, () -> {
            helper.assertBlockProperty(AT.east(), RedstoneLampBlock.LIT, false);
            helper.succeed();
        });
    }

    @GameTest
    public void rubyWandUseGivesRubiesWithCooldown(GameTestHelper helper) {
        Item wand = item(helper, "ruby_wand");
        Item ruby = item(helper, "ruby");
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(2.5, 2.0, 2.5)));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(wand));
        InteractionResult first = wand.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(first.consumesAction(), "first use: " + first);
        helper.assertValueEqual(count(player, ruby), 2, "rubies given by the first use");
        helper.assertTrue(player.getCooldowns().isOnCooldown(player.getMainHandItem()), "cooldown_ticks started");
        InteractionResult second = wand.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertValueEqual(second, InteractionResult.FAIL, "use during the cooldown");
        helper.assertValueEqual(count(player, ruby), 2, "rubies after a use during the cooldown");
        helper.succeed();
    }

    @GameTest
    public void rubyAppleUseRunsTheFunctionAndStartsEating(GameTestHelper helper) {
        Item apple = item(helper, "ruby_apple");
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(2.5, 2.0, 2.5)));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(apple));
        int mark = ParityChat.mark();
        InteractionResult result = apple.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(result.consumesAction(), "use: " + result);
        helper.assertValueEqual(ParityChat.since(mark), List.of(SHIMMER), "chat after using ruby_apple (run_function ruby/shimmer)");
        helper.assertTrue(player.isUsingItem(), "a full player starts eating (can_always_eat)");
        helper.succeed();
    }

    // Gear (ADR 0044)

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

    private static void assertEffect(GameTestHelper helper, LivingEntity entity, Holder<MobEffect> effect, int amplifier, int ticks, String what) {
        MobEffectInstance instance = entity.getEffect(effect);
        helper.assertTrue(instance != null, what + ": no " + effect.getRegisteredName());
        helper.assertValueEqual(instance.getAmplifier(), amplifier, what + ": amplifier");
        helper.assertTrue(Math.abs(instance.getDuration() - ticks) <= 2, what + ": duration " + instance.getDuration() + ", expected " + ticks);
    }

    @GameTest
    public void rubyBowShoots(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(2.5, 2.0, 2.5))); // arrows spawn at the player, inside the test's loaded area
        player.getInventory().setItem(9, new ItemStack(Items.ARROW, 32)); // not the selected slot, which holds the bow
        ItemStack bow = new ItemStack(item(helper, "ruby_bow"));
        helper.assertValueEqual(bow.getMaxDamage(), 384, "ruby_bow durability (vanilla bow's)");
        helper.assertValueEqual(bow.getMaxStackSize(), 1, "ruby_bow stacks to 1");
        helper.assertValueEqual(bow.getRarity(), Rarity.RARE, "ruby_bow rarity");
        helper.assertTrue(bow.has(DataComponents.ENCHANTABLE), "ruby_bow is enchantable");
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
        assertClose(helper, baseDamage(level, ours.getFirst()), 2.0 * 1.5, "ruby_bow arrow base damage (damage_multiplier 1.5)");
        assertClose(helper, baseDamage(level, theirs.getFirst()), 2.0, "vanilla arrow base damage");
        helper.succeed();
    }

    @GameTest
    public void rubyTonicEffects(GameTestHelper helper) {
        Item tonicItem = item(helper, "ruby_tonic");
        ItemStack tonic = new ItemStack(tonicItem);
        helper.assertValueEqual(tonic.getMaxStackSize(), 16, "ruby_tonic max stack size");
        Consumable consumable = tonic.get(DataComponents.CONSUMABLE);
        helper.assertTrue(consumable != null, "ruby_tonic is consumable");
        helper.assertValueEqual(consumable.animation(), ItemUseAnimation.DRINK, "ruby_tonic animation");
        assertClose(helper, consumable.consumeSeconds(), 1, "ruby_tonic consume seconds");
        helper.assertFalse(tonic.has(DataComponents.FOOD), "ruby_tonic restores no hunger (no msm:food)");

        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, tonic);
        ItemStack left = tonic.finishUsingItem(helper.getLevel(), player);
        helper.assertTrue(left.is(Items.GLASS_BOTTLE), "drinking ruby_tonic leaves a glass bottle (converts_to), got " + left);
        assertEffect(helper, player, MobEffects.SPEED, 1, 600, "ruby_tonic speed");
        assertEffect(helper, player, MobEffects.REGENERATION, 0, 100, "ruby_tonic regeneration");
        helper.assertTrue(player.getCooldowns().isOnCooldown(new ItemStack(tonicItem)), "ruby_tonic cooldown_seconds starts a cooldown");
        helper.succeed();
    }

    @GameTest
    public void rubyCharmCooldown(GameTestHelper helper) {
        Item charmItem = item(helper, "ruby_charm");
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(2.5, 2.0, 2.5)));
        ItemStack charm = new ItemStack(charmItem);
        helper.assertValueEqual(charm.getMaxStackSize(), 1, "ruby_charm stacks to 1");
        helper.assertValueEqual(charm.getRarity(), Rarity.UNCOMMON, "ruby_charm rarity");
        player.setItemInHand(InteractionHand.MAIN_HAND, charm);
        InteractionResult first = charmItem.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(first.consumesAction(), "first use: " + first);
        assertEffect(helper, player, MobEffects.SPEED, 1, 200, "apply_effect self");
        assertEffect(helper, player, MobEffects.GLOWING, 0, 40, "apply_effect other (the player in item events)");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "ruby_charm is not used up");
        helper.assertTrue(player.getCooldowns().isOnCooldown(player.getMainHandItem()), "cooldown_ticks started");
        player.removeAllEffects();
        InteractionResult second = charmItem.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertValueEqual(second, InteractionResult.FAIL, "use during the cooldown");
        helper.assertFalse(player.hasEffect(MobEffects.SPEED), "ruby_charm works during its cooldown");
        helper.succeed();
    }

    @GameTest
    public void rubyHorseArmorIsBodyArmor(GameTestHelper helper) {
        ItemStack armor = new ItemStack(item(helper, "ruby_horse_armor"));
        Equippable equippable = armor.get(DataComponents.EQUIPPABLE);
        helper.assertTrue(equippable != null, "ruby_horse_armor is equippable (msm:armor slot horse)");
        helper.assertValueEqual(equippable.slot(), EquipmentSlot.BODY, "ruby_horse_armor slot");
        helper.assertValueEqual(equippable.assetId().map(k -> k.identifier()), Optional.of(id("ruby_armor")), "ruby_horse_armor equipment asset");
        helper.assertTrue(equippable.canBeEquippedBy(BuiltInRegistries.ENTITY_TYPE.wrapAsHolder(EntityTypes.HORSE)), "a horse cannot wear ruby_horse_armor");
        helper.assertFalse(equippable.canBeEquippedBy(BuiltInRegistries.ENTITY_TYPE.wrapAsHolder(EntityTypes.WOLF)), "a wolf can wear ruby_horse_armor");
        assertClose(helper, modifier(armor, EquipmentSlot.BODY, Attributes.ARMOR), 9, "ruby_horse_armor armor (the chestplate defence)");
        assertClose(helper, modifier(armor, EquipmentSlot.BODY, Attributes.ARMOR_TOUGHNESS), 1, "ruby_horse_armor armor_toughness");
        helper.assertValueEqual(armor.getMaxStackSize(), 1, "ruby_horse_armor stacks to 1");
        helper.assertValueEqual(armor.getRarity(), Rarity.RARE, "ruby_horse_armor rarity");
        helper.succeed();
    }
}
