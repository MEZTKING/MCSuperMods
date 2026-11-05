package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.MsmItem;
import java.util.ArrayList;
import java.util.Optional;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.Holder;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attribute;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.Rarity;
import net.minecraft.world.item.enchantment.Enchantable;
import net.minecraft.world.item.equipment.Equippable;
import net.minecraft.world.item.equipment.EquipmentAssets;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.RedstoneLampBlock;
import net.minecraft.world.level.block.StairBlock;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.Half;
import net.minecraft.world.phys.Vec3;

/**
 * Runtime v1 GameTests: every component and action of ADR 0025 D2 to D4 on the kitchen-sink
 * definitions in {@code msm/msm_test/}, plus the load-time rules (defaults, {@code "item": false},
 * dropped events, newer formats, unknown keys and creative tabs).
 */
public class MsmRuntimeGameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static final Identifier SINK = id("kitchen_sink");
    private static final BlockPos AT = new BlockPos(2, 1, 2);

    /** Records events and actions while a test body runs (the server thread runs one test body at a time). */
    private static final class Recorder implements EventListener, AutoCloseable {
        final List<String> events = new ArrayList<>();
        final List<Action> actions = new ArrayList<>();

        Recorder() {
            EventRunner.setListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            events.add(event.getPath() + "@" + depth);
        }

        @Override
        public void onAction(Identifier owner, Identifier event, Action action, EventContext ctx) {
            actions.add(action);
        }

        @Override
        public void close() {
            EventRunner.setListener(null);
        }
    }

    private static int count(Player player, Item item) {
        int n = 0;
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack s = player.getInventory().getItem(i);
            if (s.is(item)) {
                n += s.getCount();
            }
        }
        return n;
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    // Registration and load-time rules

    @GameTest
    public void kitchenSinkBlockProperties(GameTestHelper helper) {
        Block block = block("kitchen_sink");
        helper.assertTrue(block instanceof MsmBlock, "kitchen_sink is not an MsmBlock");
        helper.setBlock(AT, block);
        BlockState state = helper.getBlockState(AT);
        BlockPos abs = helper.absolutePos(AT);
        helper.assertValueEqual(state.getLightEmission(), 9, "msm:light_emitter level");
        helper.assertValueEqual(state.getDestroySpeed(helper.getLevel(), abs), 2.5f, "msm:breakable hardness");
        helper.assertValueEqual(block.getExplosionResistance(), 9.0f, "msm:breakable resistance");
        helper.assertTrue(state.requiresCorrectToolForDrops(), "msm:breakable requires_tool");
        helper.assertTrue(BlockSoundCheck.hasSound(state, "amethyst"), "sound_type amethyst");
        helper.assertValueEqual(block.getLootTable().orElseThrow().identifier(), id("blocks/kitchen_sink_custom"), "loot_table");
        helper.assertTrue(state.hasProperty(MsmBlock.POWERED), "blocks with redstone events track POWERED");
        Item item = BuiltInRegistries.ITEM.getValue(SINK);
        helper.assertTrue(item instanceof BlockItem bi && bi.getBlock() == block, "block item");
        helper.assertValueEqual(item.getDefaultMaxStackSize(), 16, "block item max_stack_size");
        helper.assertValueEqual(item.components().get(DataComponents.RARITY), Rarity.UNCOMMON, "block item rarity");
        helper.succeed();
    }

    @GameTest
    public void defaultsApply(GameTestHelper helper) {
        Block block = block("defaults");
        helper.setBlock(AT, block);
        BlockState state = helper.getBlockState(AT);
        helper.assertValueEqual(state.getDestroySpeed(helper.getLevel(), helper.absolutePos(AT)), 1.5f, "default hardness");
        helper.assertValueEqual(block.getExplosionResistance(), 6.0f, "default resistance");
        helper.assertFalse(state.requiresCorrectToolForDrops(), "default requires no tool");
        helper.assertValueEqual(state.getLightEmission(), 0, "default light");
        helper.assertTrue(BlockSoundCheck.hasSound(state, "stone"), "default sound_type stone");
        helper.assertFalse(state.hasProperty(MsmBlock.POWERED), "no POWERED without redstone events");
        helper.assertFalse(state.isSignalSource(), "no signal without msm:redstone");
        Item item = BuiltInRegistries.ITEM.getValue(id("defaults"));
        helper.assertValueEqual(item.getDefaultMaxStackSize(), 64, "default block item stack size");
        helper.assertValueEqual(block.getLootTable().orElseThrow().identifier(), id("blocks/defaults"), "default loot table");
        helper.succeed();
    }

    @GameTest
    public void itemFalseRegistersNoBlockItem(GameTestHelper helper) {
        helper.assertTrue(BuiltInRegistries.BLOCK.containsKey(id("no_item")), "no_item block registered");
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("no_item")), "\"item\": false still registered an item");
        helper.succeed();
    }

    @GameTest
    public void unknownActionDropsTheEventButRegistersTheBlock(GameTestHelper helper) {
        helper.assertTrue(block("partly_broken") instanceof MsmBlock, "partly_broken not registered");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("partly_broken.json") && e.contains("explode")
                && e.contains("msm_runtime_gametest")), "no error for the unknown action type: " + errors);
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("partly_broken.json") && w.contains("future_key")),
                "no warning for the unknown top-level key: " + warnings);
        helper.setBlock(AT, block("partly_broken"));
        try (Recorder r = new Recorder()) {
            helper.useBlock(AT, helper.makeMockPlayer(GameType.SURVIVAL));
            helper.assertTrue(r.events.isEmpty(), "the dropped event ran: " + r.events);
        }
        helper.succeed();
    }

    @GameTest
    public void newerFormatIsRejected(GameTestHelper helper) {
        helper.assertFalse(BuiltInRegistries.BLOCK.containsKey(id("future_format")), "format 2 definition registered");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("future_format.json") && e.contains("msm_runtime_gametest")
                && e.contains("format 2 is newer")), "no error naming the file and the mod: " + errors);
        helper.succeed();
    }

    @GameTest
    public void unknownCreativeTabWarnsAfterStartup(GameTestHelper helper) {
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("gadget.json") && w.contains("msm_test:no_such_tab")),
                "no warning for the unknown creative tab: " + warnings);
        helper.assertFalse(warnings.stream().anyMatch(w -> w.contains("minecraft:building_blocks")), "vanilla tab reported unknown");
        helper.succeed();
    }

    // Block components

    @GameTest
    public void interactRunsAllSixActions(GameTestHelper helper) {
        helper.setBlock(AT, block("kitchen_sink"));
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        try (Recorder r = new Recorder()) {
            helper.useBlock(AT, player);
            helper.assertValueEqual(r.events, List.of("interact@1", "chained@2"), "events fired");
            helper.assertTrue(r.actions.stream().anyMatch(a -> a instanceof Action.SpawnParticle p
                    && p.particle().equals(Identifier.parse("minecraft:end_rod")) && p.count() == 5), "spawn_particle ran");
            helper.assertTrue(r.actions.stream().anyMatch(a -> a instanceof Action.PlaySound s
                    && s.sound().equals(Identifier.parse("minecraft:block.amethyst_block.chime"))), "play_sound ran");
        }
        // run_function: as the player (tag @s) with permission level 2 (setblock).
        helper.assertTrue(player.entityTags().contains("msm_ran"), "run_function did not run as the player");
        helper.assertBlockPresent(Blocks.DIAMOND_BLOCK, AT.above(3));
        // set_block_state with offset [0, 1, 0] and properties.
        BlockState stairs = helper.getBlockState(AT.above());
        helper.assertTrue(stairs.is(Blocks.OAK_STAIRS) && stairs.getValue(StairBlock.FACING) == Direction.EAST
                && stairs.getValue(StairBlock.HALF) == Half.TOP, "set_block_state placed " + stairs);
        // give_item.
        helper.assertValueEqual(count(player, Items.DIAMOND), 2, "give_item diamonds");
        // trigger_event -> chained -> set_block_state [0, 2, 0].
        helper.assertBlockPresent(Blocks.GOLD_BLOCK, AT.above(2));
        helper.succeed();
    }

    @GameTest
    public void triggerEventStopsAtDepth16(GameTestHelper helper) {
        MsmBlock block = (MsmBlock) block("kitchen_sink");
        helper.setBlock(AT, block);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        try (Recorder r = new Recorder()) {
            EventRunner.fire(block.id(), block.definition().events(), id("loop"),
                    EventContext.forBlock(helper.getLevel(), helper.absolutePos(AT), player));
            helper.assertValueEqual(r.events.size(), EventRunner.MAX_DEPTH, "events in the chain");
            helper.assertValueEqual(r.events.getLast(), "loop@16", "deepest event");
        }
        helper.assertValueEqual(count(player, Items.ARROW), 16, "arrows from a 16-deep chain");
        helper.succeed();
    }

    @GameTest(maxTicks = 60)
    public void stepFiresWithPerEntityCooldown(GameTestHelper helper) {
        Block block = block("kitchen_sink");
        helper.setBlock(AT, block);
        BlockPos abs = helper.absolutePos(AT);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        Player other = helper.makeMockPlayer(GameType.SURVIVAL);
        BlockState state = helper.getBlockState(AT);
        block.stepOn(helper.getLevel(), abs, state, player);
        block.stepOn(helper.getLevel(), abs, state, player);
        block.stepOn(helper.getLevel(), abs, state, other);
        helper.assertValueEqual(count(player, Items.STICK), 1, "second step within the cooldown fired");
        helper.assertValueEqual(count(other, Items.STICK), 1, "cooldown is per entity");
        helper.runAfterDelay(21, () -> {
            block.stepOn(helper.getLevel(), abs, helper.getBlockState(AT), player);
            helper.assertValueEqual(count(player, Items.STICK), 2, "step after the cooldown did not fire");
            helper.succeed();
        });
    }

    @GameTest
    public void redstoneEmitsSignal(GameTestHelper helper) {
        // The lamp first: placing the block then updates the lamp as a neighbour.
        helper.setBlock(AT.east(), Blocks.REDSTONE_LAMP);
        helper.setBlock(AT, block("kitchen_sink"));
        BlockState state = helper.getBlockState(AT);
        helper.assertTrue(state.isSignalSource(), "emit 7 is a signal source");
        helper.assertValueEqual(state.getSignal(helper.getLevel(), helper.absolutePos(AT), Direction.WEST), 7, "signal strength");
        helper.succeedWhen(() -> helper.assertBlockProperty(AT.east(), RedstoneLampBlock.LIT, true));
    }

    @GameTest
    public void redstoneTransitionsFireEvents(GameTestHelper helper) {
        helper.setBlock(AT, block("kitchen_sink"));
        helper.assertBlockProperty(AT, MsmBlock.POWERED, false);
        Recorder r = new Recorder();
        helper.setBlock(AT.west(), Blocks.REDSTONE_BLOCK);
        helper.assertBlockProperty(AT, MsmBlock.POWERED, true);
        helper.setBlock(AT.west(), Blocks.AIR);
        helper.assertBlockProperty(AT, MsmBlock.POWERED, false);
        r.close();
        helper.assertValueEqual(r.events, List.of("powered@1", "unpowered@1"), "redstone events");
        helper.succeed();
    }

    // Items

    @GameTest
    public void kitchenSinkItemComponents(GameTestHelper helper) {
        Item gadget = BuiltInRegistries.ITEM.getValue(id("gadget"));
        helper.assertTrue(gadget instanceof MsmItem, "gadget is not an MsmItem");
        ItemStack stack = new ItemStack(gadget);
        helper.assertValueEqual(stack.getMaxDamage(), 300, "msm:durability overrides the tier durability");
        helper.assertValueEqual(stack.getMaxStackSize(), 1, "damageable items stack to 1");
        helper.assertValueEqual(stack.get(DataComponents.RARITY), Rarity.EPIC, "rarity");
        helper.assertTrue(stack.has(DataComponents.TOOL), "msm:tool sets the tool component");
        helper.assertTrue(stack.isCorrectToolForDrops(Blocks.IRON_ORE.defaultBlockState()), "copper pickaxe mines iron ore");
        helper.assertFalse(stack.isCorrectToolForDrops(Blocks.DIAMOND_ORE.defaultBlockState()), "copper pickaxe gets diamond ore drops");
        helper.assertTrue(stack.getDestroySpeed(Blocks.STONE.defaultBlockState()) > 1.0f, "pickaxe is fast on stone");

        Item snack = BuiltInRegistries.ITEM.getValue(id("snack"));
        ItemStack food = new ItemStack(snack);
        FoodProperties props = food.get(DataComponents.FOOD);
        helper.assertTrue(props != null, "msm:food sets the food component");
        helper.assertValueEqual(props.nutrition(), 5, "nutrition");
        helper.assertValueEqual(props.saturation(), 5 * 0.6f * 2.0f, "saturation from the modifier");
        helper.assertTrue(props.canAlwaysEat(), "can_always_eat");
        helper.assertTrue(food.has(DataComponents.CONSUMABLE), "food is consumable");
        helper.assertValueEqual(food.getMaxStackSize(), 32, "max_stack_size");
        helper.succeed();
    }

    @GameTest
    public void useRunsEventAndCooldown(GameTestHelper helper) {
        Item gadget = BuiltInRegistries.ITEM.getValue(id("gadget"));
        Item shard = BuiltInRegistries.ITEM.getValue(Identifier.fromNamespaceAndPath("msm_spike", "shard"));
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setPos(helper.absoluteVec(new Vec3(2.5, 2.0, 2.5)));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(gadget));
        InteractionResult first;
        try (Recorder r = new Recorder()) {
            first = gadget.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
            helper.assertValueEqual(r.events, List.of("zap@1", "after@2"), "events fired");
            helper.assertTrue(r.actions.stream().anyMatch(a -> a instanceof Action.SpawnParticle), "spawn_particle ran");
            helper.assertTrue(r.actions.stream().anyMatch(a -> a instanceof Action.PlaySound), "play_sound ran");
        }
        helper.assertTrue(first.consumesAction(), "first use: " + first);
        helper.assertTrue(player.entityTags().contains("msm_ran"), "run_function as the player");
        BlockPos below = new BlockPos(2, 1, 2);
        helper.assertBlockPresent(Blocks.DIAMOND_BLOCK, below.above(4)); // ~3 from the player's feet at y 2
        helper.assertBlockPresent(Blocks.EMERALD_BLOCK, below.east()); // offset [1, 0, 0] from the block below the player
        helper.assertValueEqual(count(player, shard), 3, "give_item from another mod's namespace");
        helper.assertValueEqual(count(player, Items.APPLE), 1, "trigger_event chain");
        helper.assertTrue(player.getCooldowns().isOnCooldown(player.getMainHandItem()), "cooldown_ticks started");
        InteractionResult second = gadget.use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
        helper.assertValueEqual(second, InteractionResult.FAIL, "use during the cooldown");
        helper.assertValueEqual(count(player, shard), 3, "event ran during the cooldown");
        helper.succeed();
    }

    // Armour and custom tool materials (ADR 0042)

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    /** The sum of a stack's modifiers of one attribute for a slot. */
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

    @GameTest
    public void armorHelmetProperties(GameTestHelper helper) {
        Item helmet = item("ruby_helmet");
        helper.assertTrue(helmet instanceof MsmItem, "ruby_helmet is not an MsmItem");
        ItemStack stack = new ItemStack(helmet);
        Equippable equippable = stack.get(DataComponents.EQUIPPABLE);
        helper.assertTrue(equippable != null, "msm:armor sets the equippable component");
        helper.assertValueEqual(equippable.slot(), EquipmentSlot.HEAD, "equippable slot");
        helper.assertValueEqual(equippable.assetId().map(k -> k.identifier()), Optional.of(id("ruby")), "equipment asset");
        helper.assertTrue(EquipSoundCheck.plays(equippable, Identifier.parse("minecraft:item.armor.equip_diamond")), "equip sound by id");
        assertClose(helper, modifier(stack, EquipmentSlot.HEAD, Attributes.ARMOR), 3, "armor (helmet defense)");
        assertClose(helper, modifier(stack, EquipmentSlot.HEAD, Attributes.ARMOR_TOUGHNESS), 1.5, "armor_toughness");
        assertClose(helper, modifier(stack, EquipmentSlot.HEAD, Attributes.KNOCKBACK_RESISTANCE), 0.1f, "knockback_resistance");
        assertClose(helper, modifier(stack, EquipmentSlot.CHEST, Attributes.ARMOR), 0, "armor in another slot");
        helper.assertValueEqual(stack.getMaxDamage(), 11 * 20, "max_damage is the helmet multiplier (11) times the base durability");
        helper.assertValueEqual(stack.getMaxStackSize(), 1, "armour stacks to 1");
        helper.succeed();
    }

    @GameTest
    public void armorCustomMaterial(GameTestHelper helper) {
        ItemStack ruby = new ItemStack(item("ruby_helmet"));
        helper.assertTrue(ruby.has(DataComponents.REPAIRABLE), "repairable component");
        helper.assertTrue(ruby.isValidRepairItem(new ItemStack(Items.DIAMOND)), "repair_items #minecraft:diamond_tool_materials");
        helper.assertFalse(ruby.isValidRepairItem(new ItemStack(Items.IRON_INGOT)), "iron repairs the ruby helmet");
        Enchantable enchantable = ruby.get(DataComponents.ENCHANTABLE);
        helper.assertTrue(enchantable != null && enchantable.value() == 15, "enchantable from enchantment_value: " + enchantable);

        // A vanilla material by name equals the vanilla piece.
        ItemStack ours = new ItemStack(item("iron_chestplate"));
        ItemStack vanilla = new ItemStack(Items.IRON_CHESTPLATE);
        Equippable equippable = ours.get(DataComponents.EQUIPPABLE);
        helper.assertValueEqual(equippable.slot(), EquipmentSlot.CHEST, "chestplate slot");
        helper.assertValueEqual(equippable.assetId(), Optional.of(EquipmentAssets.IRON), "iron equipment asset");
        helper.assertValueEqual(ours.getMaxDamage(), vanilla.getMaxDamage(), "max_damage of iron");
        for (Holder<Attribute> a : List.of(Attributes.ARMOR, Attributes.ARMOR_TOUGHNESS, Attributes.KNOCKBACK_RESISTANCE)) {
            assertClose(helper, modifier(ours, EquipmentSlot.CHEST, a), modifier(vanilla, EquipmentSlot.CHEST, a), a.getRegisteredName());
        }
        helper.assertTrue(ours.isValidRepairItem(new ItemStack(Items.IRON_INGOT)), "iron ingots repair iron armour");
        helper.succeed();
    }

    @GameTest
    public void armorDurabilityOverride(GameTestHelper helper) {
        ItemStack boots = new ItemStack(item("sturdy_boots"));
        helper.assertValueEqual(boots.getMaxDamage(), 777, "msm:durability overrides the material's per-slot durability");
        Equippable equippable = boots.get(DataComponents.EQUIPPABLE);
        helper.assertValueEqual(equippable.slot(), EquipmentSlot.FEET, "boots slot");
        helper.assertTrue(EquipSoundCheck.plays(equippable, Identifier.parse("minecraft:item.armor.equip_generic")),
                "an unknown equip_sound falls back to the generic sound");
        List<String> warnings = MsmRuntime.report().warnings();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("sturdy_boots.json") && w.contains("msm_test:no_such_sound")),
                "no warning for the unknown equip sound: " + warnings);
        // Without repair_items the repair tag is a project tag nobody fills.
        helper.assertFalse(boots.isValidRepairItem(new ItemStack(Items.DIAMOND)), "diamonds repair boots without repair_items");
        helper.assertFalse(boots.isValidRepairItem(new ItemStack(Items.LEATHER)), "leather repairs boots without repair_items");
        helper.assertFalse(boots.has(DataComponents.ENCHANTABLE), "enchantment_value 0 is not enchantable");
        helper.succeed();
    }

    @GameTest
    public void armorAndToolTogetherRegisterNeither(GameTestHelper helper) {
        ItemStack stack = new ItemStack(item("armed_helmet"));
        helper.assertTrue(stack.getItem() instanceof MsmItem, "armed_helmet still registers");
        helper.assertFalse(stack.has(DataComponents.EQUIPPABLE), "msm:armor applied beside msm:tool");
        helper.assertFalse(stack.has(DataComponents.TOOL), "msm:tool applied beside msm:armor");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("armed_helmet.json") && e.contains("msm:armor and msm:tool")),
                "no error for armour and tool on one item: " + errors);
        helper.succeed();
    }

    @GameTest
    public void customToolMaterialMinesAndRefusesDrops(GameTestHelper helper) {
        ItemStack ruby = new ItemStack(item("ruby_pickaxe"));
        ItemStack flint = new ItemStack(item("flint_pickaxe"));
        BlockState obsidian = Blocks.OBSIDIAN.defaultBlockState();
        helper.assertTrue(ruby.isCorrectToolForDrops(obsidian), "ruby (incorrect_for_diamond_tool) gets obsidian drops");
        helper.assertValueEqual(ruby.getDestroySpeed(obsidian), 10.0f, "ruby mines at its speed");
        helper.assertFalse(flint.isCorrectToolForDrops(obsidian), "flint (incorrect_for_stone_tool) gets obsidian drops");
        helper.assertTrue(flint.isCorrectToolForDrops(Blocks.IRON_ORE.defaultBlockState()), "flint mines iron ore for drops");
        helper.assertValueEqual(flint.getDestroySpeed(obsidian), 4.0f, "flint still mines at its speed");
        helper.assertValueEqual(ruby.getMaxDamage(), 1200, "custom material durability");
        helper.assertValueEqual(flint.getMaxDamage(), 100, "custom material durability");
        helper.assertTrue(ruby.isValidRepairItem(new ItemStack(Items.DIAMOND)), "ruby repair_items");
        helper.assertFalse(flint.isValidRepairItem(new ItemStack(Items.FLINT)), "flint without repair_items is repaired by flint");
        Enchantable enchantable = ruby.get(DataComponents.ENCHANTABLE);
        helper.assertTrue(enchantable != null && enchantable.value() == 12, "enchantable: " + enchantable);

        // Through the player: progress is speed / hardness / 30 with drops and / 100 without.
        helper.setBlock(AT, Blocks.OBSIDIAN);
        BlockPos abs = helper.absolutePos(AT);
        Player player = helper.makeMockPlayer(GameType.SURVIVAL);
        player.setItemInHand(InteractionHand.MAIN_HAND, ruby);
        float rubyProgress = obsidian.getDestroyProgress(player, helper.getLevel(), abs);
        player.setItemInHand(InteractionHand.MAIN_HAND, flint);
        float flintProgress = obsidian.getDestroyProgress(player, helper.getLevel(), abs);
        assertClose(helper, rubyProgress / flintProgress, (10.0 / 30.0) / (4.0 / 100.0), "ruby against flint progress on obsidian");
        helper.succeed();
    }

    @GameTest
    public void toolAttackOverrides(GameTestHelper helper) {
        ItemStack sword = new ItemStack(item("heavy_sword"));
        ItemStack iron = new ItemStack(Items.IRON_SWORD);
        double vanillaDamage = modifier(iron, EquipmentSlot.MAINHAND, Attributes.ATTACK_DAMAGE);
        assertClose(helper, modifier(sword, EquipmentSlot.MAINHAND, Attributes.ATTACK_DAMAGE), vanillaDamage + (9.0 - 3.0),
                "attack_damage 9 replaces the sword base 3; the iron bonus stays");
        assertClose(helper, modifier(sword, EquipmentSlot.MAINHAND, Attributes.ATTACK_SPEED), -3.0, "attack_speed override");
        assertClose(helper, modifier(iron, EquipmentSlot.MAINHAND, Attributes.ATTACK_SPEED), -2.4, "vanilla sword speed");
        helper.assertValueEqual(sword.getMaxDamage(), iron.getMaxDamage(), "iron durability");
        // Without overrides a custom material adds its bonus to the type's base (pickaxe 1.0, -2.8).
        ItemStack ruby = new ItemStack(item("ruby_pickaxe"));
        assertClose(helper, modifier(ruby, EquipmentSlot.MAINHAND, Attributes.ATTACK_DAMAGE), 1.0 + 3.5, "pickaxe base plus bonus");
        assertClose(helper, modifier(ruby, EquipmentSlot.MAINHAND, Attributes.ATTACK_SPEED), -2.8f, "pickaxe base speed");
        helper.succeed();
    }
}
