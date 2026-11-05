package dev.mcsupermods.parity;

import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RedstoneLampBlock;
import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-mod} (namespace {@code msm_sample_mod}), written
 * against vanilla and Fabric API only, so the same tests run against the content jar (with
 * {@code msm_runtime} nested) and against the ejected Java project's jar (ADR 0033 D5).
 *
 * <p>Expected values are the fixture's: blocks {@code ruby_ore}, {@code chime_block},
 * {@code glow_stone}; items {@code ruby}, {@code ruby_wand}, {@code ruby_pickaxe},
 * {@code ruby_apple}; function {@code ruby/shimmer} ({@code say The ruby shimmers.}). Events are
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

    /** Places {@code block} at {@link #AT} and checks the state's light, hardness and sound. */
    private static BlockState place(GameTestHelper helper, Block block, int light, float hardness, SoundType sound, String what) {
        helper.setBlock(AT, block);
        BlockState state = helper.getBlockState(AT);
        helper.assertValueEqual(state.getLightEmission(), light, what + " light");
        helper.assertValueEqual(state.getDestroySpeed(helper.getLevel(), helper.absolutePos(AT)), hardness, what + " hardness");
        helper.assertTrue(state.getSoundType() == sound, what + " sound type");
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
        BlockState state = place(helper, block, 7, 3.0f, SoundType.STONE, "ruby_ore");
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
        BlockState state = place(helper, block, 0, 0.8f, SoundType.WOOD, "chime_block");
        helper.assertValueEqual(block.getExplosionResistance(), 6.0f, "chime_block default resistance");
        helper.assertFalse(state.requiresCorrectToolForDrops(), "chime_block drops without the tool (requires_tool false)");
        helper.assertTrue(new ItemStack(Items.WOODEN_AXE).getDestroySpeed(state) > 1.0f, "an axe is the tool (mineable with axe)");
        helper.assertValueEqual(new ItemStack(Items.IRON_PICKAXE).getDestroySpeed(state), 1.0f, "a pickaxe is not the tool");
        helper.assertValueEqual(block.getLootTable().orElseThrow().identifier(), id("blocks/chime_block"), "chime_block loot table");
        List<ItemStack> drops = Block.getDrops(state, helper.getLevel(), helper.absolutePos(AT), null);
        helper.assertTrue(drops.size() == 1 && drops.getFirst().is(item(helper, "chime_block")) && drops.getFirst().getCount() == 1,
                "chime_block drops itself (loot self): " + drops);
        assertBlockItem(helper, block, "chime_block", 16, Rarity.UNCOMMON);
        helper.succeed();
    }

    @GameTest
    public void glowStoneProperties(GameTestHelper helper) {
        Block block = block(helper, "glow_stone");
        BlockState state = place(helper, block, 15, 2.0f, SoundType.GLASS, "glow_stone");
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

        ItemStack pickaxe = new ItemStack(item(helper, "ruby_pickaxe"));
        ItemStack diamond = new ItemStack(Items.DIAMOND_PICKAXE);
        helper.assertValueEqual(pickaxe.getMaxDamage(), diamond.getMaxDamage(), "ruby_pickaxe durability (diamond tier)");
        helper.assertValueEqual(pickaxe.getRarity(), Rarity.RARE, "ruby_pickaxe rarity");
        helper.assertValueEqual(pickaxe.get(DataComponents.ATTRIBUTE_MODIFIERS), diamond.get(DataComponents.ATTRIBUTE_MODIFIERS),
                "ruby_pickaxe (diamond pickaxe) attack modifiers");
        helper.assertTrue(pickaxe.isCorrectToolForDrops(Blocks.OBSIDIAN.defaultBlockState()), "ruby_pickaxe mines obsidian (diamond tier)");
        helper.assertValueEqual(pickaxe.getDestroySpeed(Blocks.STONE.defaultBlockState()), diamond.getDestroySpeed(Blocks.STONE.defaultBlockState()),
                "ruby_pickaxe speed on stone");

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
}
