package dev.mcsupermods.parity;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.JsonOps;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.arguments.EntityAnchorArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.RegistryOps;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectCategory;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.MoverType;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrowableItemProjectile;
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
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LightLayer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.RedstoneLampBlock;
import net.minecraft.world.level.block.entity.DispenserBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.phys.shapes.BooleanOp;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.phys.shapes.Shapes;
import net.minecraft.world.phys.shapes.VoxelShape;

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
 * ({@code say The ruby shimmers.}); since ADRs 0055 and 0056 the effects {@code ruby_rush}
 * (beneficial, movement speed times 1.2 per level, heals 1 every 10 ticks, {@code ruby/rush} on
 * start, glowing for 3 seconds on end) and {@code ruby_sting} (harmful, damage 1 every 20 ticks),
 * the drink {@code ruby_elixir} (Ruby Rush II for 20 seconds), the throwables {@code ruby_dart}
 * (speed 2, damage 3, {@code drop}, Ruby Sting for 10 seconds on the mob hit) and
 * {@code ruby_boomerang} (hold 10 ticks, {@code return}, durability 64, not dispensable).
 * Events are observed through their vanilla effects: placed blocks, given items, item cooldowns,
 * effects, health and the functions' chat lines. Sounds and particles have no server-side trace
 * a GameTest can read. Effect tick and end events run at the end of the server tick, so checks
 * after them wait a tick or more. The thrown entity's type is {@code msm_runtime:thrown_item} in
 * the content jar and {@code msm_sample_mod:thrown_item} in the ejected one: the tests find it as
 * a vanilla {@link ThrowableItemProjectile} carrying the item.
 * Since ADRs 0057 and 0058: the project sound events {@code chime.ring} (the chime block's
 * {@code chime} event) and {@code ruby.clink} (the tonic's drinking sound and the helmet's equip
 * sound), heard as the sound packets a listening {@link ParityEars} player receives; and the block
 * {@code ruby_spring}, whose {@code on_step} event gives whoever steps on it, mob or player,
 * Jump Boost for 5 seconds, launches it up at strength 1 and runs {@code ruby/spring}
 * ({@code tag @s add msm_sample_sprung}) as it, with a 10-tick cooldown per dimension.
 * Since ADR 0059: the shaped blocks {@code ruby_slab} (preset {@code slab_bottom}: the bottom half, solid, see-through
 * by default), {@code ruby_sprout} (preset {@code cross}: a 12 by 12 by 16 outline, walk-through, instant to break) and
 * {@code ruby_glass} (preset {@code full} with {@code see_through}: a full cube that occludes nothing, lets sky light
 * down, hides faces against itself and refuses mob spawns), observed through block state shapes, entity movement in
 * the {@code msm_parity_tests:arena} structure and the light engine.
 * Run with {@code --gametest-filter msm_parity_tests:sample_mod_*}.
 */
public class SampleModParityTest {
    static {
        ParityChat.register();
    }

    private static final String NAMESPACE = "msm_sample_mod";
    private static final BlockPos AT = new BlockPos(2, 1, 2);
    private static final String SHIMMER = "The ruby shimmers.";
    private static final String RUSH = "The ruby rush begins.";
    /** Ground for thrown items, away from {@link #AT}. */
    private static final BlockPos LANDING = new BlockPos(4, 1, 4);

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

    // Effects (ADR 0055)

    private static Holder<MobEffect> effect(GameTestHelper helper, String path) {
        Optional<Holder.Reference<MobEffect>> holder = BuiltInRegistries.MOB_EFFECT.get(id(path));
        helper.assertTrue(holder.isPresent(), "effect " + id(path) + " is not registered");
        return holder.orElseThrow();
    }

    private static Mob cow(GameTestHelper helper, BlockPos at) {
        return helper.spawnWithNoFreeWill(EntityTypes.COW, at);
    }

    @GameTest
    public void effectsAreRegisteredWithCategoryAndColour(GameTestHelper helper) {
        MobEffect rush = effect(helper, "ruby_rush").value();
        helper.assertValueEqual(rush.getCategory(), MobEffectCategory.BENEFICIAL, "ruby_rush category");
        helper.assertValueEqual(rush.getColor(), 0xE0115F, "ruby_rush colour");
        helper.assertValueEqual(rush.getDescriptionId(), "effect.msm_sample_mod.ruby_rush", "ruby_rush name key");
        MobEffect sting = effect(helper, "ruby_sting").value();
        helper.assertValueEqual(sting.getCategory(), MobEffectCategory.HARMFUL, "ruby_sting category");
        helper.assertValueEqual(sting.getColor(), 0x8B0000, "ruby_sting colour");
        helper.assertValueEqual(sting.getDescriptionId(), "effect.msm_sample_mod.ruby_sting", "ruby_sting name key");
        helper.succeed();
    }

    @GameTest
    public void rubyRushSpeedModifierScalesWithLevel(GameTestHelper helper) {
        Mob cow = cow(helper, AT);
        Holder<MobEffect> rush = effect(helper, "ruby_rush");
        double base = cow.getAttributeValue(Attributes.MOVEMENT_SPEED);
        cow.addEffect(new MobEffectInstance(rush, 200, 0));
        assertClose(helper, cow.getAttributeValue(Attributes.MOVEMENT_SPEED), base * 1.2, "ruby_rush I movement speed (times 1.2)");
        cow.removeEffect(rush);
        assertClose(helper, cow.getAttributeValue(Attributes.MOVEMENT_SPEED), base, "movement speed after ruby_rush is removed");
        cow.addEffect(new MobEffectInstance(rush, 200, 1));
        assertClose(helper, cow.getAttributeValue(Attributes.MOVEMENT_SPEED), base * 1.4, "ruby_rush II movement speed (times 1.4)");
        cow.removeEffect(rush);
        assertClose(helper, cow.getAttributeValue(Attributes.MOVEMENT_SPEED), base, "movement speed after ruby_rush II is removed");
        cow.discard();
        helper.succeed();
    }

    /** on_start runs {@code ruby/rush} once (not again on a refresh); on_end gives glowing, on removal and on expiry. */
    @GameTest(maxTicks = 60)
    public void rubyRushStartAndEnd(GameTestHelper helper) {
        Holder<MobEffect> rush = effect(helper, "ruby_rush");
        Mob removed = cow(helper, AT);
        Mob expired = cow(helper, AT.east(2));
        int mark = ParityChat.mark();
        removed.addEffect(new MobEffectInstance(rush, 200, 0));
        removed.addEffect(new MobEffectInstance(rush, 300, 0)); // longer: updated, no second on_start
        helper.assertValueEqual(ParityChat.since(mark), List.of(RUSH), "chat after adding ruby_rush (on_start run_function ruby/rush)");
        expired.addEffect(new MobEffectInstance(rush, 5, 0));
        helper.assertFalse(removed.hasEffect(MobEffects.GLOWING), "glowing before on_end");
        removed.removeEffect(rush);
        helper.runAfterDelay(20, () -> {
            assertEffect(helper, removed, MobEffects.GLOWING, 0, 60 - 20, "on_end after removeEffect (apply_effect glowing)");
            helper.assertFalse(expired.hasEffect(rush), "ruby_rush did not run out");
            helper.assertTrue(expired.hasEffect(MobEffects.GLOWING), "on_end after ruby_rush ran out gave no glowing");
            removed.discard();
            expired.discard();
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 60)
    public void rubyRushTickHeals(GameTestHelper helper) {
        Mob cow = cow(helper, AT);
        cow.setHealth(2);
        cow.addEffect(new MobEffectInstance(effect(helper, "ruby_rush"), 400, 0));
        helper.runAfterDelay(25, () -> {
            // heal 1 every 10 ticks: two or three heals in 25 ticks.
            helper.assertTrue(cow.getHealth() >= 4 - 1.0e-3 && cow.getHealth() <= 5 + 1.0e-3,
                    "ruby_rush heal on tick: health " + cow.getHealth() + ", expected 4 to 5");
            cow.discard();
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 80)
    public void rubyStingTickDamages(GameTestHelper helper) {
        Mob cow = cow(helper, AT);
        float full = cow.getHealth();
        cow.addEffect(new MobEffectInstance(effect(helper, "ruby_sting"), 400, 0));
        helper.runAfterDelay(45, () -> {
            // damage 1 every 20 ticks: two or three hits in 45 ticks.
            float lost = full - cow.getHealth();
            helper.assertTrue(lost >= 2 - 1.0e-3 && lost <= 3 + 1.0e-3, "ruby_sting damage on tick: lost " + lost + ", expected 2 to 3");
            cow.discard();
            helper.succeed();
        });
    }

    @GameTest
    public void rubyElixirGivesRubyRush(GameTestHelper helper) {
        ItemStack elixir = new ItemStack(item(helper, "ruby_elixir"));
        helper.assertValueEqual(elixir.getMaxStackSize(), 16, "ruby_elixir max stack size");
        Consumable consumable = elixir.get(DataComponents.CONSUMABLE);
        helper.assertTrue(consumable != null && consumable.animation() == ItemUseAnimation.DRINK, "ruby_elixir is a drink: " + consumable);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, elixir);
        int mark = ParityChat.mark();
        ItemStack left = elixir.finishUsingItem(helper.getLevel(), player);
        helper.assertTrue(left.is(Items.GLASS_BOTTLE), "drinking ruby_elixir leaves a glass bottle, got " + left);
        assertEffect(helper, player, effect(helper, "ruby_rush"), 1, 400, "ruby_elixir ruby_rush");
        helper.assertValueEqual(ParityChat.since(mark), List.of(RUSH), "chat after drinking ruby_elixir (on_start)");
        helper.succeed();
    }

    // Throwables (ADR 0056)

    /** The thrown items near {@code player} carrying {@code item}, of the one thrown-item type. */
    private static List<ThrowableItemProjectile> thrown(GameTestHelper helper, Entity near, Item item) {
        return helper.getLevel().getEntitiesOfClass(ThrowableItemProjectile.class, new AABB(near.blockPosition()).inflate(8),
                e -> e.getItem().is(item));
    }

    private static Player thrower(GameTestHelper helper) {
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(AT)));
        return player;
    }

    /** Moves a thrown item 2.5 blocks above {@code target} (relative) and sends it straight down. */
    private static void dropOnto(GameTestHelper helper, ThrowableItemProjectile entity, Vec3 target) {
        Vec3 above = helper.absoluteVec(target.add(0, 2.5, 0));
        entity.snapTo(above.x, above.y, above.z);
        entity.setDeltaMovement(0, -0.8, 0);
    }

    private static List<ItemEntity> droppedNear(GameTestHelper helper, BlockPos at, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(at)).inflate(2), e -> e.getItem().is(item));
    }

    @GameTest
    public void rubyDartThrowSpawnsAProjectileWithTheItem(GameTestHelper helper) {
        Item dart = item(helper, "ruby_dart");
        Player player = thrower(helper);
        ItemStack stack = new ItemStack(dart, 4);
        helper.assertValueEqual(stack.getMaxStackSize(), 16, "ruby_dart max stack size");
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        InteractionResult result = stack.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(result.consumesAction(), "use did not throw: " + result);
        helper.assertValueEqual(player.getMainHandItem().getCount(), 3, "a throw takes one dart from the hand");
        List<ThrowableItemProjectile> thrown = thrown(helper, player, dart);
        helper.assertValueEqual(thrown.size(), 1, "thrown darts");
        ThrowableItemProjectile entity = thrown.getFirst();
        helper.assertValueEqual(BuiltInRegistries.ENTITY_TYPE.getKey(entity.getType()).getPath(), "thrown_item", "thrown entity type path");
        helper.assertValueEqual(entity.getItem().getCount(), 1, "the projectile carries one dart");
        helper.assertTrue(entity.getOwner() == player, "the thrower owns the projectile: " + entity.getOwner());
        double speed = entity.getDeltaMovement().length();
        helper.assertTrue(Math.abs(speed - 2.0) < 0.25, "ruby_dart speed 2, got " + speed);
        assertClose(helper, entity.getGravity(), 0.03, "ruby_dart gravity (the default)");
        thrown.forEach(Entity::discard);
        helper.succeed();
    }

    /** A survival player at {@link #AT} looking at {@code target}'s middle, so a throw flies straight at it. */
    private static Player aimingAt(GameTestHelper helper, Entity target) {
        Player player = thrower(helper);
        player.lookAt(EntityAnchorArgument.Anchor.EYES, target.position().add(0, target.getBbHeight() / 2, 0));
        return player;
    }

    @GameTest(maxTicks = 40)
    public void rubyDartHitDamagesAndStings(GameTestHelper helper) {
        BlockPos at = AT.east(3);
        helper.setBlock(at.below(), Blocks.STONE);
        Item dart = item(helper, "ruby_dart");
        Mob cow = cow(helper, at);
        Player player = aimingAt(helper, cow);
        float full = cow.getHealth();
        ItemStack stack = new ItemStack(dart);
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        stack.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        ThrowableItemProjectile entity = thrown(helper, player, dart).getFirst();
        helper.runAfterDelay(10, () -> {
            helper.assertTrue(entity.isRemoved(), "the dart was not removed after the hit: at " + entity.position() + ", cow at " + cow.position());
            float lost = full - cow.getHealth();
            helper.assertTrue(Math.abs(lost - 3) < 1.0e-3, "ruby_dart damage 3: lost " + lost);
            MobEffectInstance sting = cow.getEffect(effect(helper, "ruby_sting"));
            helper.assertTrue(sting != null, "on_hit_entity did not give ruby_sting to the cow (target other)");
            helper.assertValueEqual(sting.getAmplifier(), 0, "ruby_sting amplifier");
            helper.assertTrue(sting.getDuration() > 180 && sting.getDuration() <= 200, "ruby_sting duration " + sting.getDuration());
            helper.assertFalse(player.hasEffect(effect(helper, "ruby_sting")), "the thrower got ruby_sting");
            List<ItemEntity> dropped = droppedNear(helper, at, dart);
            helper.assertValueEqual(dropped.size(), 1, "the dart dropped after the hit (drop)");
            dropped.forEach(Entity::discard);
            cow.discard();
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 40)
    public void rubyDartDropsWhereItLands(GameTestHelper helper) {
        helper.setBlock(LANDING, Blocks.STONE);
        Item dart = item(helper, "ruby_dart");
        Player player = thrower(helper);
        ItemStack stack = new ItemStack(dart, 2);
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        stack.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        ThrowableItemProjectile entity = thrown(helper, player, dart).getFirst();
        dropOnto(helper, entity, Vec3.atBottomCenterOf(LANDING).add(0, 1, 0));
        helper.runAfterDelay(10, () -> {
            helper.assertTrue(entity.isRemoved(), "the dart was not removed after landing");
            List<ItemEntity> dropped = droppedNear(helper, LANDING, dart);
            helper.assertValueEqual(dropped.size(), 1, "darts dropped at the landing point");
            helper.assertValueEqual(dropped.getFirst().getItem().getCount(), 1, "dropped dart count");
            helper.assertValueEqual(count(player, dart), 1, "darts left with the thrower");
            dropped.forEach(Entity::discard);
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 40)
    public void rubyBoomerangChargesAndReturns(GameTestHelper helper) {
        helper.setBlock(LANDING, Blocks.STONE);
        Item boomerangItem = item(helper, "ruby_boomerang");
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(AT)));
        ItemStack boomerang = new ItemStack(boomerangItem);
        helper.assertValueEqual(boomerang.getMaxDamage(), 64, "ruby_boomerang durability");
        helper.assertValueEqual(boomerang.getRarity(), Rarity.UNCOMMON, "ruby_boomerang rarity");
        player.setItemInHand(InteractionHand.MAIN_HAND, boomerang);
        boomerang.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertTrue(player.isUsingItem(), "charge_ticks 10: use starts holding");
        int duration = boomerang.getUseDuration(player);
        helper.assertFalse(boomerangItem.releaseUsing(boomerang, helper.getLevel(), player, duration - 5), "released after 5 of 10 ticks");
        helper.assertTrue(thrown(helper, player, boomerangItem).isEmpty(), "thrown after 5 of 10 ticks");
        helper.assertTrue(boomerangItem.releaseUsing(boomerang, helper.getLevel(), player, duration - 12), "released after 12 of 10 ticks");
        player.stopUsingItem();
        helper.assertValueEqual(count(player, boomerangItem), 0, "the boomerang left the inventory while it flies");
        List<ThrowableItemProjectile> thrown = thrown(helper, player, boomerangItem);
        helper.assertValueEqual(thrown.size(), 1, "thrown boomerangs");
        dropOnto(helper, thrown.getFirst(), Vec3.atBottomCenterOf(LANDING).add(0, 1, 0));
        helper.runAfterDelay(10, () -> {
            helper.assertValueEqual(count(player, boomerangItem), 1, "boomerangs back in the inventory (return)");
            for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
                ItemStack s = player.getInventory().getItem(i);
                if (s.is(boomerangItem)) {
                    helper.assertValueEqual(s.getDamageValue(), 1, "the returned boomerang took one durability");
                }
            }
            helper.assertTrue(droppedNear(helper, LANDING, boomerangItem).isEmpty(), "the boomerang also dropped");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 40)
    public void dispenserThrowsDartsButNotBoomerangs(GameTestHelper helper) {
        helper.assertFalse(DispenserBlock.DISPENSER_REGISTRY.containsKey(item(helper, "ruby_boomerang")),
                "ruby_boomerang (dispensable false) has a dispenser behaviour");
        Item dart = item(helper, "ruby_dart");
        BlockPos at = new BlockPos(2, 2, 2);
        helper.setBlock(at, Blocks.DISPENSER.defaultBlockState().setValue(DispenserBlock.FACING, Direction.UP));
        DispenserBlockEntity dispenser = (DispenserBlockEntity) helper.getBlockEntity(at, DispenserBlockEntity.class);
        dispenser.setItem(0, new ItemStack(dart, 3));
        helper.setBlock(at.east(), Blocks.REDSTONE_BLOCK);
        List<ThrowableItemProjectile> seen = new ArrayList<>();
        helper.onEachTick(() -> seen.addAll(helper.getLevel().getEntitiesOfClass(ThrowableItemProjectile.class,
                new AABB(helper.absolutePos(at)).inflate(8), e -> e.getItem().is(dart) && !seen.contains(e))));
        helper.runAfterDelay(12, () -> {
            helper.assertValueEqual(dispenser.getItem(0).getCount(), 2, "the dispenser used one dart");
            helper.assertValueEqual(seen.size(), 1, "darts thrown by the dispenser");
            seen.forEach(Entity::discard);
            droppedNear(helper, at, dart).forEach(Entity::discard);
            helper.succeed();
        });
    }

    // Project sound events (ADR 0057)

    private static final List<String> SOUND_KEYS = List.of("chime.ring", "ruby.clink");

    private static RegistryOps<JsonElement> ops(GameTestHelper helper) {
        return RegistryOps.create(JsonOps.INSTANCE, helper.getLevel().registryAccess());
    }

    private static void assertHeard(GameTestHelper helper, ParityEars ears, String key, String what) {
        List<Identifier> heard = ears.heard();
        helper.assertTrue(heard.contains(id(key)), what + ": " + id(key) + " not heard; heard " + heard);
    }

    @GameTest
    public void projectSoundEventsAreRegistered(GameTestHelper helper) {
        for (String key : SOUND_KEYS) {
            helper.assertTrue(BuiltInRegistries.SOUND_EVENT.containsKey(id(key)), id(key) + " is not a registered sound event");
            SoundEvent sound = BuiltInRegistries.SOUND_EVENT.getValue(id(key));
            helper.assertValueEqual(sound.location(), id(key), id(key) + " location");
            helper.assertTrue(sound.fixedRange().isEmpty(), id(key) + " is not a variable-range event");
        }
        helper.succeed();
    }

    /** Once registered, a bare project key is a {@code SoundEvent.CODEC} value: a reference into the registry. */
    @GameTest
    public void soundEventCodecDecodesTheBareKey(GameTestHelper helper) {
        for (String key : SOUND_KEYS) {
            DataResult<Holder<SoundEvent>> decoded = SoundEvent.CODEC.parse(ops(helper), new JsonPrimitive(id(key).toString()));
            helper.assertTrue(decoded.result().isPresent(), id(key) + " did not decode: " + decoded.error());
            helper.assertTrue(decoded.getOrThrow().is(id(key)), id(key) + " decoded to " + decoded.getOrThrow());
        }
        helper.assertTrue(SoundEvent.CODEC.parse(ops(helper), new JsonPrimitive(id("no_such_sound").toString())).error().isPresent(),
                "an unregistered key decoded");
        helper.succeed();
    }

    /**
     * The tonic's consumable sound and the helmet's equip sound are references to {@code ruby.clink}: encoded with the
     * components' own Codecs they are the bare id (an inline event would be an object), whatever the Minecraft
     * version's Java shape of the field.
     */
    @GameTest
    public void consumableAndEquipSoundsNameTheProjectEvent(GameTestHelper helper) {
        Consumable consumable = new ItemStack(item(helper, "ruby_tonic")).get(DataComponents.CONSUMABLE);
        helper.assertTrue(consumable != null, "ruby_tonic is consumable");
        JsonObject encoded = DataComponents.CONSUMABLE.codecOrThrow().encodeStart(ops(helper), consumable).getOrThrow().getAsJsonObject();
        helper.assertValueEqual(encoded.get("sound"), new JsonPrimitive(id("ruby.clink").toString()), "ruby_tonic consumable sound");
        Equippable equippable = new ItemStack(item(helper, "ruby_helmet")).get(DataComponents.EQUIPPABLE);
        helper.assertTrue(equippable != null, "ruby_helmet is equippable");
        encoded = DataComponents.EQUIPPABLE.codecOrThrow().encodeStart(ops(helper), equippable).getOrThrow().getAsJsonObject();
        helper.assertValueEqual(encoded.get("equip_sound"), new JsonPrimitive(id("ruby.clink").toString()), "ruby_helmet equip sound");
        helper.succeed();
    }

    /** The chime block's {@code chime} event (on losing power) plays {@code chime.ring}. */
    @GameTest
    public void chimePlaysTheProjectSound(GameTestHelper helper) {
        helper.setBlock(AT, block(helper, "chime_block"));
        helper.setBlock(AT.west(), Blocks.REDSTONE_BLOCK);
        try (ParityEars ears = ParityEars.listener(helper, AT.above(2))) {
            helper.setBlock(AT.west(), Blocks.AIR);
            assertHeard(helper, ears, "chime.ring", "chime_block on_unpowered");
        }
        helper.succeed();
    }

    /** The drinker's own client plays its drinking sound, so the server sends it to the other players: a listener hears it. */
    @GameTest
    public void tonicPlaysTheProjectSound(GameTestHelper helper) {
        try (ParityEars ears = ParityEars.listener(helper, AT.above());
                ParityEars drinker = new ParityEars(helper, AT, GameType.SURVIVAL)) {
            ItemStack tonic = new ItemStack(item(helper, "ruby_tonic"));
            drinker.player.setItemInHand(InteractionHand.MAIN_HAND, tonic);
            ears.heard();
            drinker.player.setItemInHand(InteractionHand.MAIN_HAND, tonic.finishUsingItem(helper.getLevel(), drinker.player));
            assertHeard(helper, ears, "ruby.clink", "drinking ruby_tonic");
        }
        helper.succeed();
    }

    /** Vanilla plays no equip sound in an entity's first tick, so the stand is dressed a few ticks after it spawns. */
    @GameTest(maxTicks = 20)
    public void helmetEquipPlaysTheProjectSound(GameTestHelper helper) {
        ArmorStand stand = helper.spawn(EntityTypes.ARMOR_STAND, AT);
        helper.runAfterDelay(3, () -> {
            try (ParityEars ears = ParityEars.listener(helper, AT.above(2))) {
                stand.setItemSlot(EquipmentSlot.HEAD, new ItemStack(item(helper, "ruby_helmet")));
                assertHeard(helper, ears, "ruby.clink", "equipping ruby_helmet");
            }
            stand.discard();
            helper.succeed();
        });
    }

    // The ruby spring (ADR 0058 D1): whoever steps on it is self

    private static final String SPRUNG = "msm_sample_sprung";

    @GameTest(maxTicks = 40)
    public void rubySpringLaunchesAMob(GameTestHelper helper) {
        Block spring = block(helper, "ruby_spring");
        helper.setBlock(AT, spring);
        Mob pig = helper.spawn(EntityTypes.PIG, AT.above());
        double y = pig.getY();
        spring.stepOn(helper.getLevel(), helper.absolutePos(AT), helper.getBlockState(AT), pig);
        assertEffect(helper, pig, MobEffects.JUMP_BOOST, 0, 100, "ruby_spring on a pig");
        helper.assertTrue(pig.getDeltaMovement().y > 0.5, "launch did not set the pig's velocity: " + pig.getDeltaMovement());
        helper.assertTrue(pig.entityTags().contains(SPRUNG), "ruby/spring did not run as the pig: " + pig.entityTags());
        helper.runAfterDelay(3, () -> {
            helper.assertTrue(pig.getY() > y + 0.5, "the pig did not rise: " + y + " -> " + pig.getY());
            pig.discard();
            helper.succeed();
        });
    }

    /** A server player's position follows its client, so the launch shows as its velocity. */
    @GameTest
    public void rubySpringLaunchesAPlayer(GameTestHelper helper) {
        Block spring = block(helper, "ruby_spring");
        helper.setBlock(AT, spring);
        try (ParityEars ears = new ParityEars(helper, AT.above(), GameType.SURVIVAL)) {
            ServerPlayer player = ears.player;
            spring.stepOn(helper.getLevel(), helper.absolutePos(AT), helper.getBlockState(AT), player);
            assertEffect(helper, player, MobEffects.JUMP_BOOST, 0, 100, "ruby_spring on a player");
            helper.assertTrue(player.getDeltaMovement().y > 0.5, "launch did not set the player's velocity: " + player.getDeltaMovement());
            helper.assertTrue(player.entityTags().contains(SPRUNG), "ruby/spring did not run as the player: " + player.entityTags());
        }
        helper.succeed();
    }

    /** The step cooldown is per entity, position and dimension. */
    @GameTest
    public void rubySpringCooldownIsPerDimension(GameTestHelper helper) {
        Block spring = block(helper, "ruby_spring");
        helper.setBlock(AT, spring);
        ServerLevel nether = helper.getLevel().getServer().getLevel(Level.NETHER);
        helper.assertTrue(nether != null, "no nether level");
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, AT.above());
        BlockPos abs = helper.absolutePos(AT);
        BlockState state = helper.getBlockState(AT);
        spring.stepOn(helper.getLevel(), abs, state, pig);
        helper.assertTrue(pig.hasEffect(MobEffects.JUMP_BOOST), "first step gave no effect");
        pig.removeAllEffects();
        spring.stepOn(helper.getLevel(), abs, state, pig);
        helper.assertFalse(pig.hasEffect(MobEffects.JUMP_BOOST), "a second step within the cooldown fired");
        spring.stepOn(nether, abs, state, pig);
        helper.assertTrue(pig.hasEffect(MobEffects.JUMP_BOOST), "the same position in the nether shares the overworld's cooldown");
        pig.discard();
        helper.succeed();
    }

    // Block shapes (ADR 0059): ruby_slab, ruby_sprout, ruby_glass

    private static final String ARENA = "msm_parity_tests:arena";
    private static final double EPS = 1e-6;

    /** A box in pixels, as the shape component writes it. */
    private static AABB px(double x1, double y1, double z1, double x2, double y2, double z2) {
        return new AABB(x1 / 16, y1 / 16, z1 / 16, x2 / 16, y2 / 16, z2 / 16);
    }

    private static boolean same(AABB a, AABB b) {
        return Math.abs(a.minX - b.minX) < EPS && Math.abs(a.minY - b.minY) < EPS && Math.abs(a.minZ - b.minZ) < EPS
                && Math.abs(a.maxX - b.maxX) < EPS && Math.abs(a.maxY - b.maxY) < EPS && Math.abs(a.maxZ - b.maxZ) < EPS;
    }

    private static boolean equal(VoxelShape a, VoxelShape b) {
        return !Shapes.joinIsNotEmpty(a, b, BooleanOp.NOT_SAME);
    }

    private static VoxelShape outline(GameTestHelper helper, BlockState state) {
        return state.getShape(helper.getLevel(), helper.absolutePos(AT), CollisionContext.empty());
    }

    private static VoxelShape collision(GameTestHelper helper, BlockState state) {
        return state.getCollisionShape(helper.getLevel(), helper.absolutePos(AT), CollisionContext.empty());
    }

    /** What every see-through block shares with vanilla glass: no occlusion, light passes, no suffocation, no spawns. */
    private static void assertSeeThrough(GameTestHelper helper, BlockState state, String what) {
        ServerLevel level = helper.getLevel();
        BlockPos abs = helper.absolutePos(AT);
        helper.assertFalse(state.canOcclude(), what + " occludes");
        helper.assertTrue(state.propagatesSkylightDown(), what + " stops sky light");
        helper.assertValueEqual(state.getLightDampening(), 0, what + " light dampening");
        helper.assertValueEqual(state.getShadeBrightness(level, abs), 1.0f, what + " shade brightness");
        helper.assertFalse(state.isSuffocating(level, abs), what + " suffocates");
        helper.assertFalse(state.isViewBlocking(level, abs, new AABB(abs)), what + " blocks the view");
        helper.assertFalse(state.isRedstoneConductor(level, abs), what + " conducts redstone");
        helper.assertFalse(state.isValidSpawn(level, abs, EntityTypes.ZOMBIE), what + " lets a zombie spawn on it");
        helper.assertTrue(state.getVisualShape(level, abs, CollisionContext.empty()).isEmpty(), what + " has a visual shape");
    }

    private static void assertDropsItself(GameTestHelper helper, Block block, BlockState state, String path) {
        helper.assertValueEqual(block.getLootTable().orElseThrow().identifier(), id("blocks/" + path), path + " loot table");
        List<ItemStack> drops = Block.getDrops(state, helper.getLevel(), helper.absolutePos(AT), null, null, new ItemStack(Items.DIAMOND_PICKAXE));
        helper.assertTrue(drops.size() == 1 && drops.getFirst().is(item(helper, path)) && drops.getFirst().getCount() == 1,
                path + " drops itself (loot self): " + drops);
    }

    @GameTest
    public void rubySlabIsTheBottomHalf(GameTestHelper helper) {
        Block block = block(helper, "ruby_slab");
        BlockState state = place(helper, block, 0, 2.0f, "stone", "ruby_slab");
        helper.assertValueEqual(block.getExplosionResistance(), 6.0f, "ruby_slab resistance");
        VoxelShape outline = outline(helper, state);
        helper.assertTrue(same(outline.bounds(), px(0, 0, 0, 16, 8, 16)), "ruby_slab outline " + outline.bounds());
        helper.assertTrue(equal(collision(helper, state), outline), "ruby_slab collision follows the outline: " + collision(helper, state));
        // No see_through in the element: a shape that is not the full cube is see-through by default (ADR 0059 D1).
        assertSeeThrough(helper, state, "ruby_slab");
        assertDropsItself(helper, block, state, "ruby_slab");
        assertBlockItem(helper, block, "ruby_slab", 64, Rarity.COMMON);
        helper.succeed();
    }

    @GameTest
    public void rubySproutIsWalkThrough(GameTestHelper helper) {
        Block block = block(helper, "ruby_sprout");
        BlockState state = place(helper, block, 0, 0.0f, "grass", "ruby_sprout");
        VoxelShape outline = outline(helper, state);
        helper.assertTrue(same(outline.bounds(), px(2, 0, 2, 14, 16, 14)), "ruby_sprout outline " + outline.bounds());
        helper.assertTrue(collision(helper, state).isEmpty(), "ruby_sprout collision is not empty: " + collision(helper, state));
        assertSeeThrough(helper, state, "ruby_sprout");
        assertDropsItself(helper, block, state, "ruby_sprout");
        assertBlockItem(helper, block, "ruby_sprout", 64, Rarity.COMMON);
        helper.succeed();
    }

    @GameTest
    public void rubyGlassIsLikeGlass(GameTestHelper helper) {
        Block block = block(helper, "ruby_glass");
        BlockState state = place(helper, block, 0, 0.3f, "glass", "ruby_glass");
        VoxelShape outline = outline(helper, state);
        helper.assertTrue(same(outline.bounds(), px(0, 0, 0, 16, 16, 16)), "ruby_glass outline " + outline.bounds());
        helper.assertTrue(equal(collision(helper, state), Shapes.block()), "ruby_glass collision is not the full cube: " + collision(helper, state));
        assertSeeThrough(helper, state, "ruby_glass");
        helper.assertFalse(state.isSolidRender(), "ruby_glass is a solid render");
        helper.assertTrue(state.skipRendering(state, Direction.EAST), "ruby_glass draws the face against itself");
        helper.assertFalse(state.skipRendering(Blocks.STONE.defaultBlockState(), Direction.EAST), "ruby_glass hides a face against stone");
        // The same answers as vanilla glass, the block it imitates.
        BlockState glass = Blocks.GLASS.defaultBlockState();
        helper.assertValueEqual(state.canOcclude(), glass.canOcclude(), "canOcclude against vanilla glass");
        helper.assertValueEqual(state.propagatesSkylightDown(), glass.propagatesSkylightDown(), "propagatesSkylightDown against vanilla glass");
        helper.assertValueEqual(state.isValidSpawn(helper.getLevel(), helper.absolutePos(AT), EntityTypes.ZOMBIE),
                glass.isValidSpawn(helper.getLevel(), helper.absolutePos(AT), EntityTypes.ZOMBIE), "isValidSpawn against vanilla glass");
        assertDropsItself(helper, block, state, "ruby_glass");
        assertBlockItem(helper, block, "ruby_glass", 64, Rarity.COMMON);
        helper.succeed();
    }

    /** An armour stand dropped onto the slab comes to rest on its top, half a block up. */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void anEntityStandsAtTheRubySlabHeight(GameTestHelper helper) {
        BlockPos at = new BlockPos(3, 1, 5);
        helper.setBlock(at, block(helper, "ruby_slab"));
        ArmorStand stand = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 2.5, 5.5));
        double top = helper.absolutePos(at).getY() + 0.5;
        helper.succeedWhen(() -> {
            helper.assertTrue(stand.onGround(), "not on the ground yet at y " + stand.getY());
            helper.assertTrue(Math.abs(stand.getY() - top) < 1e-3, "stands at y " + stand.getY() + ", the slab top is " + top);
            stand.discard();
        });
    }

    /** An armour stand dropped onto the sprout falls through it to the floor. */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void anEntityFallsThroughTheRubySprout(GameTestHelper helper) {
        BlockPos at = new BlockPos(3, 1, 5);
        helper.setBlock(at, block(helper, "ruby_sprout"));
        ArmorStand stand = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 2.5, 5.5));
        double floor = helper.absolutePos(at).getY();
        helper.succeedWhen(() -> {
            helper.assertTrue(stand.onGround(), "not on the ground yet at y " + stand.getY());
            helper.assertTrue(Math.abs(stand.getY() - floor) < 1e-3, "stands at y " + stand.getY() + ", the floor is " + floor);
            stand.discard();
        });
    }

    /** {@code Entity.move} applies block collision at once: through the sprout the whole way, stopped by the glass. */
    @GameTest(structure = ARENA)
    public void anEntityWalksThroughTheRubySproutNotTheGlass(GameTestHelper helper) {
        helper.setBlock(new BlockPos(4, 1, 3), block(helper, "ruby_sprout"));
        helper.setBlock(new BlockPos(4, 1, 7), block(helper, "ruby_glass"));
        ArmorStand through = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 1, 3.5));
        ArmorStand blocked = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 1, 7.5));
        double x1 = through.getX();
        double x2 = blocked.getX();
        through.move(MoverType.SELF, new Vec3(2, 0, 0));
        blocked.move(MoverType.SELF, new Vec3(2, 0, 0));
        helper.assertTrue(Math.abs(through.getX() - (x1 + 2)) < 1e-3, "the sprout stopped the entity: " + x1 + " -> " + through.getX());
        helper.assertTrue(blocked.getX() < x2 + 0.5, "the glass did not stop the entity: " + x2 + " -> " + blocked.getX());
        through.discard();
        blocked.discard();
        helper.succeed();
    }

    /** Sky light reaches the cell below the ruby glass at full strength; below stone it is at most 14 (from the side). */
    @GameTest(structure = ARENA, maxTicks = 100)
    public void skyLightPassesTheRubyGlass(GameTestHelper helper) {
        BlockPos glass = new BlockPos(3, 2, 5);
        BlockPos stone = new BlockPos(7, 2, 5);
        helper.setBlock(glass, block(helper, "ruby_glass"));
        helper.setBlock(stone, Blocks.STONE);
        ServerLevel level = helper.getLevel();
        helper.succeedWhen(() -> {
            int underGlass = level.getBrightness(LightLayer.SKY, helper.absolutePos(glass.below()));
            int underStone = level.getBrightness(LightLayer.SKY, helper.absolutePos(stone.below()));
            helper.assertValueEqual(underGlass, 15, "sky light below the ruby glass");
            helper.assertTrue(underStone < 15, "sky light below stone is " + underStone + " (light engine not updated yet)");
        });
    }
}
