package dev.mcsupermods.parity;

import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.ExperienceOrb;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.AbstractFurnaceMenu;
import net.minecraft.world.inventory.BlastFurnaceMenu;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.DispenserMenu;
import net.minecraft.world.inventory.FurnaceMenu;
import net.minecraft.world.inventory.HopperMenu;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.inventory.ShulkerBoxMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ComparatorBlock;
import net.minecraft.world.level.block.HopperBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.ComparatorBlockEntity;
import net.minecraft.world.level.block.entity.HopperBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.block.state.properties.BlockStateProperties;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-machines} (namespace {@code msm_sample_machines}, ADRs 0074 and 0075),
 * against vanilla and Fabric API only (ADR 0033 D5): the content jar's runtime classes and the ejected project's classes
 * differ, so every check goes through vanilla types ({@link Container}, the vanilla menus, {@link BlockStateProperties}
 * {@code open} and {@code lit}), vanilla calls ({@code ServerPlayerGameMode.useItemOn}, the call the server's use packet
 * makes; vanilla hoppers and comparators), commands ({@code /item}, {@code /data}, {@code /function}), saved data and the
 * chat lines of the {@code say/*} functions the blocks' events run ({@link ParityChat}). Run with
 * {@code --gametest-filter msm_parity_tests:sample_machines_*}.
 *
 * <ul>
 *   <li>{@code crate} (chest, 3 rows, {@code on_open}/{@code on_close}), {@code small_crate} (1 row), {@code keep_crate}
 *       (keep-contents, shulker box menu), {@code hopper_box} (hopper layout, no comparator), {@code dispenser_box},
 *       {@code holder} (layout {@code none}, size 1, {@code on_open} on each use).</li>
 *   <li>{@code grinder} (fuel, its own recipe type, {@code default_time} 40, {@code on_start}/{@code on_finish}),
 *       {@code fast_furnace} ({@code minecraft:smelting} at speed 2), {@code redstone_grinder} (redstone power, the
 *       grinder's recipes, blast furnace menu, comparator {@code progress}).</li>
 * </ul>
 */
public class SampleMachinesParityTest {
    static {
        ParityChat.register();
    }

    private static final String NAMESPACE = "msm_sample_machines";
    private static final BlockPos AT = new BlockPos(2, 2, 2);

    private static final String CRATE_OPENED = "The crate is opened.";
    private static final String CRATE_CLOSED = "The crate is closed.";
    private static final String HOLDER_USED = "The holder is used.";
    private static final String GRINDER_STARTS = "The grinder starts.";
    private static final String GRINDER_FINISHES = "The grinder finishes.";
    private static final String FAST_FURNACE_FINISHES = "The fast furnace finishes.";
    private static final String REDSTONE_GRINDER_FINISHES = "The redstone grinder finishes.";

    private static final List<String> CONTAINERS = List.of("crate", "small_crate", "keep_crate", "hopper_box", "dispenser_box", "holder");
    private static final List<String> MACHINES = List.of("grinder", "fast_furnace", "redstone_grinder");

    // The furnace slots, as vanilla's AbstractFurnaceBlockEntity numbers them.
    private static final int INPUT = 0;
    private static final int FUEL = 1;
    private static final int OUTPUT = 2;

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

    /** Places the sample block {@code path} at {@code rel} and returns its block entity as a vanilla {@link Container}. */
    private static Container place(GameTestHelper helper, BlockPos rel, String path) {
        helper.setBlock(rel, block(helper, path));
        return container(helper, rel, path);
    }

    private static Container container(GameTestHelper helper, BlockPos rel, String what) {
        BlockEntity be = helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        helper.assertTrue(be instanceof Container, what + " has no Container block entity: " + be);
        return (Container) be;
    }

    /** A survival player in the level beside {@code AT} (inside the container interaction range). */
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.setPos(helper.absoluteVec(new Vec3(AT.getX() + 0.5, AT.getY(), AT.getZ() + 2.5)));
        return player;
    }

    private static void leave(GameTestHelper helper, ServerPlayer player) {
        player.closeContainer();
        helper.getLevel().getServer().getPlayerList().remove(player);
    }

    /** A right-click on the top of the block at {@code rel} with the main hand, as the network handler does. */
    private static InteractionResult use(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs).add(0, 0.5, 0), Direction.UP, abs, false);
        return player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND),
                InteractionHand.MAIN_HAND, hit);
    }

    private static void hold(ServerPlayer player, ItemStack stack) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
    }

    private static int count(Container c, int slot, Item item) {
        ItemStack stack = c.getItem(slot);
        return stack.is(item) ? stack.getCount() : 0;
    }

    private static int dropped(GameTestHelper helper, BlockPos rel, Item item) {
        int n = 0;
        for (ItemEntity e : droppedEntities(helper, rel, item)) {
            n += e.getItem().getCount();
        }
        return n;
    }

    private static List<ItemEntity> droppedEntities(GameTestHelper helper, BlockPos rel, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(2),
                e -> e.getItem().is(item));
    }

    private static int orbs(GameTestHelper helper, Vec3 at) {
        return helper.getLevel().getEntitiesOfClass(ExperienceOrb.class, new AABB(at, at).inflate(3)).stream()
                .mapToInt(ExperienceOrb::getValue).sum();
    }

    private static boolean lit(GameTestHelper helper, BlockPos rel) {
        return helper.getBlockState(rel).getValue(BlockStateProperties.LIT);
    }

    private static int signal(GameTestHelper helper, BlockPos rel) {
        return helper.getBlockState(rel).getAnalogOutputSignal(helper.getLevel(), helper.absolutePos(rel), Direction.NORTH);
    }

    private static CompoundTag saved(GameTestHelper helper, BlockPos rel) {
        BlockEntity be = helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        return be.saveWithFullMetadata(helper.getLevel().registryAccess());
    }

    /** Runs {@code command} as the server at {@code rel} (relative) and returns its result (-1 when it failed). */
    private static int command(GameTestHelper helper, BlockPos rel, String command) {
        ServerLevel level = helper.getLevel();
        int[] result = {-1};
        CommandSourceStack source = level.getServer().createCommandSourceStack().withLevel(level)
                .withPosition(Vec3.atBottomCenterOf(helper.absolutePos(rel))).withSuppressedOutput()
                .withCallback((success, value) -> result[0] = success ? value : -1);
        level.getServer().getCommands().performPrefixedCommand(source, command);
        return result[0];
    }

    private static String coordinates(GameTestHelper helper, BlockPos rel) {
        BlockPos abs = helper.absolutePos(rel);
        return abs.getX() + " " + abs.getY() + " " + abs.getZ();
    }

    private static void assertSaid(GameTestHelper helper, int mark, String line, String what) {
        List<String> said = ParityChat.since(mark);
        helper.assertTrue(said.contains(line), what + ": no chat line '" + line + "'; said " + said);
    }

    // Registration (ADR 0074 D1, ADR 0075 D1, D2)

    /** Every block and item is registered; containers carry {@code open}, machines {@code lit}; each machine has its recipe type. */
    @GameTest
    public void blocksRegisterWithTheirStateAndRecipeTypes(GameTestHelper helper) {
        for (String path : CONTAINERS) {
            BlockState state = block(helper, path).defaultBlockState();
            item(helper, path);
            helper.assertTrue(state.hasBlockEntity(), path + " has no block entity");
            helper.assertTrue(state.hasProperty(BlockStateProperties.OPEN), path + " has no open property");
            helper.assertFalse(state.getValue(BlockStateProperties.OPEN), path + " starts open");
            helper.assertFalse(state.hasProperty(BlockStateProperties.LIT), path + " has a lit property");
            helper.assertTrue(BuiltInRegistries.BLOCK_ENTITY_TYPE.containsKey(id(path)), path + ": no block entity type with its id");
        }
        for (String path : MACHINES) {
            BlockState state = block(helper, path).defaultBlockState();
            item(helper, path);
            helper.assertTrue(state.hasProperty(BlockStateProperties.LIT), path + " has no lit property");
            helper.assertFalse(state.getValue(BlockStateProperties.LIT), path + " starts lit");
            helper.assertFalse(state.hasProperty(BlockStateProperties.OPEN), path + " has an open property");
            helper.assertTrue(BuiltInRegistries.BLOCK_ENTITY_TYPE.containsKey(id(path)), path + ": no block entity type with its id");
            helper.assertTrue(BuiltInRegistries.RECIPE_TYPE.containsKey(id(path)), path + ": no recipe type with its id");
            helper.assertTrue(BuiltInRegistries.RECIPE_SERIALIZER.containsKey(id(path)), path + ": no recipe serializer with its id");
        }
        helper.assertValueEqual(block(helper, "redstone_grinder").defaultBlockState().setValue(BlockStateProperties.LIT, true)
                .getLightEmission(), 15, "the redstone grinder's light when lit (lit_light)");
        helper.assertValueEqual(block(helper, "grinder").defaultBlockState().setValue(BlockStateProperties.LIT, true)
                .getLightEmission(), 13, "the grinder's light when lit (default lit_light)");
        helper.succeed();
    }

    // Menus (ADR 0074 D1, ADR 0075 D4)

    /** Each container layout opens its vanilla menu with its row count; the holder opens none. */
    @GameTest
    public void eachLayoutOpensItsVanillaMenu(GameTestHelper helper) {
        record Case(String path, Class<?> menu, MenuType<?> type, int slots) {}
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        try {
            for (Case c : List.of(
                    new Case("crate", ChestMenu.class, MenuType.GENERIC_9x3, 27),
                    new Case("small_crate", ChestMenu.class, MenuType.GENERIC_9x1, 9),
                    new Case("keep_crate", ShulkerBoxMenu.class, MenuType.SHULKER_BOX, 27),
                    new Case("hopper_box", HopperMenu.class, MenuType.HOPPER, 5),
                    new Case("dispenser_box", DispenserMenu.class, MenuType.GENERIC_3x3, 9))) {
                Container container = place(helper, AT, c.path());
                helper.assertValueEqual(container.getContainerSize(), c.slots(), c.path() + " slots");
                helper.assertTrue(use(helper, player, AT).consumesAction(), c.path() + ": using it did nothing");
                AbstractContainerMenu menu = player.containerMenu;
                helper.assertTrue(c.menu().isInstance(menu), c.path() + ": menu " + menu + ", expected " + c.menu().getSimpleName());
                helper.assertTrue(menu.getType() == c.type(), c.path() + ": menu type " + BuiltInRegistries.MENU.getKey(menu.getType()));
                if (menu instanceof ChestMenu chest) {
                    helper.assertValueEqual(chest.getRowCount(), c.slots() / 9, c.path() + " rows");
                }
                player.closeContainer();
                helper.setBlock(AT, Blocks.AIR);
            }
            Container holder = place(helper, AT, "holder");
            helper.assertValueEqual(holder.getContainerSize(), 1, "holder slots");
            use(helper, player, AT);
            helper.assertTrue(player.containerMenu == player.inventoryMenu, "the holder opened a menu: " + player.containerMenu);
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    /** Each machine opens the vanilla furnace menu its {@code menu} names. */
    @GameTest
    public void machinesOpenTheirFurnaceMenus(GameTestHelper helper) {
        record Case(String path, Class<?> menu, MenuType<?> type) {}
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        try {
            for (Case c : List.of(
                    new Case("grinder", FurnaceMenu.class, MenuType.FURNACE),
                    new Case("fast_furnace", FurnaceMenu.class, MenuType.FURNACE),
                    new Case("redstone_grinder", BlastFurnaceMenu.class, MenuType.BLAST_FURNACE))) {
                Container machine = place(helper, AT, c.path());
                helper.assertValueEqual(machine.getContainerSize(), 3, c.path() + " slots");
                use(helper, player, AT);
                AbstractContainerMenu menu = player.containerMenu;
                helper.assertTrue(c.menu().isInstance(menu), c.path() + ": menu " + menu + ", expected " + c.menu().getSimpleName());
                helper.assertTrue(menu.getType() == c.type(), c.path() + ": menu type " + BuiltInRegistries.MENU.getKey(menu.getType()));
                player.closeContainer();
                helper.setBlock(AT, Blocks.AIR);
            }
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    // Commands and saved data (ADR 0074 D2)

    /** {@code /item replace block} fills a slot and {@code /data get block ... Items} reads it back. */
    @GameTest
    public void itemAndDataCommandsSeeTheSlots(GameTestHelper helper) {
        Container crate = place(helper, AT, "crate");
        String at = coordinates(helper, AT);
        helper.assertTrue(command(helper, AT, "item replace block " + at + " container.4 with minecraft:diamond 7") > 0,
                "/item replace block failed");
        helper.assertValueEqual(count(crate, 4, Items.DIAMOND), 7, "diamonds in slot 4");
        helper.assertValueEqual(command(helper, AT, "data get block " + at + " Items"), 1, "/data get block Items (stacks)");
        helper.assertValueEqual(command(helper, AT, "data get block " + at + " Items[{Slot:4b}].count"), 7, "/data get count in slot 4");
        helper.assertTrue(command(helper, AT, "item replace block " + at + " container.27 with minecraft:stone") < 0,
                "/item replace block took slot 27 of a 27-slot crate");
        helper.succeed();
    }

    /** A machine saves the furnace's field names (B321): items, fuel, progress and experience. */
    @GameTest(maxTicks = 80)
    public void machineSavesTheFurnaceFields(GameTestHelper helper) {
        Container grinder = place(helper, AT, "grinder");
        grinder.setItem(INPUT, new ItemStack(Items.COBBLESTONE, 2));
        grinder.setItem(FUEL, new ItemStack(Items.COAL));
        helper.runAfterDelay(20, () -> {
            CompoundTag tag = saved(helper, AT);
            for (String key : List.of("Items", "lit_time_remaining", "lit_total_time", "fuel_speed", "cooking_time_spent",
                    "cooking_total_time", "experience")) {
                helper.assertTrue(tag.contains(key), "saved data has no " + key + ": " + tag);
            }
            helper.assertValueEqual(tag.getIntOr("cooking_total_time", 0), 40, "cooking_total_time (default_time)");
            helper.assertValueEqual(tag.getIntOr("lit_total_time", 0), 1600, "lit_total_time (one coal)");
            int spent = tag.getIntOr("cooking_time_spent", 0);
            helper.assertTrue(spent > 0 && spent < 40, "cooking_time_spent after 20 ticks: " + spent);
            helper.succeed();
        });
    }

    // Hoppers and comparators (ADR 0074 D4)

    /** A hopper above fills the crate and a hopper below empties it. */
    @GameTest(maxTicks = 100)
    public void hoppersFillAndEmptyTheCrate(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Container crate = place(helper, AT, "crate");
        crate.setItem(5, new ItemStack(Items.GOLD_INGOT, 2));
        helper.setBlock(AT.above(), Blocks.HOPPER);
        helper.setBlock(AT.below(), Blocks.HOPPER);
        HopperBlockEntity above = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.above()));
        HopperBlockEntity below = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.below()));
        above.setItem(0, new ItemStack(Items.IRON_INGOT, 2));
        helper.succeedWhen(() -> {
            helper.assertValueEqual(above.countItem(Items.IRON_INGOT), 0, "iron left in the hopper above");
            helper.assertValueEqual(below.countItem(Items.GOLD_INGOT), 2, "gold pulled out by the hopper below");
            helper.assertValueEqual(below.countItem(Items.IRON_INGOT) + crate.countItem(Items.IRON_INGOT), 2, "iron moved in");
        });
    }

    /** A comparator reads the crate as a vanilla barrel with the same items; {@code comparator: false} gives none. */
    @GameTest
    public void comparatorMatchesTheVanillaBarrel(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos at = new BlockPos(2, 2, 1);
        BlockPos hopperBoxAt = new BlockPos(2, 2, 4);
        BlockPos barrelAt = new BlockPos(5, 2, 1);
        for (BlockPos p : List.of(at, hopperBoxAt, barrelAt)) {
            helper.setBlock(p.below(), Blocks.STONE);
            helper.setBlock(p.west().below(), Blocks.STONE);
        }
        Container crate = place(helper, at, "crate");
        Container hopperBox = place(helper, hopperBoxAt, "hopper_box");
        helper.setBlock(barrelAt, Blocks.BARREL);
        Container barrel = container(helper, barrelAt, "barrel");
        helper.setBlock(at.west(), Blocks.COMPARATOR.defaultBlockState().setValue(ComparatorBlock.FACING, Direction.EAST));
        helper.setBlock(hopperBoxAt.west(), Blocks.COMPARATOR.defaultBlockState().setValue(ComparatorBlock.FACING, Direction.EAST));
        for (Container c : List.of(crate, barrel)) {
            c.setItem(0, new ItemStack(Items.COBBLESTONE, 40));
            c.setItem(3, new ItemStack(Items.IRON_SWORD));
            c.setItem(9, new ItemStack(Items.ENDER_PEARL, 7));
            c.setChanged();
        }
        hopperBox.setItem(0, new ItemStack(Items.COBBLESTONE, 64));
        hopperBox.setChanged();
        helper.assertTrue(helper.getBlockState(at).hasAnalogOutputSignal(), "the crate has no analog output");
        int vanilla = helper.getBlockState(barrelAt).getAnalogOutputSignal(level, helper.absolutePos(barrelAt), Direction.WEST);
        helper.assertValueEqual(helper.getBlockState(at).getAnalogOutputSignal(level, helper.absolutePos(at), Direction.WEST), vanilla,
                "the crate's signal against a vanilla barrel");
        helper.assertTrue(vanilla > 0, "signal 0 with items");
        helper.assertFalse(helper.getBlockState(hopperBoxAt).hasAnalogOutputSignal(), "the hopper box (comparator: false) has an analog output");
        helper.succeedWhen(() -> {
            int read = ((ComparatorBlockEntity) level.getBlockEntity(helper.absolutePos(at.west()))).getOutputSignal();
            helper.assertValueEqual(read, vanilla, "the comparator beside the crate");
            int none = ((ComparatorBlockEntity) level.getBlockEntity(helper.absolutePos(hopperBoxAt.west()))).getOutputSignal();
            helper.assertValueEqual(none, 0, "the comparator beside the hopper box");
        });
    }

    // Breaking and keeping the contents (ADR 0074 D5, D6)

    /** Breaking the crate drops its contents and the crate itself. */
    @GameTest
    public void breakingTheCrateDropsItsContents(GameTestHelper helper) {
        Container crate = place(helper, AT, "crate");
        crate.setItem(0, new ItemStack(Items.REDSTONE, 9));
        crate.setItem(20, new ItemStack(Items.APPLE, 2));
        helper.getLevel().destroyBlock(helper.absolutePos(AT), true);
        helper.assertValueEqual(dropped(helper, AT, Items.REDSTONE), 9, "redstone dropped");
        helper.assertValueEqual(dropped(helper, AT, Items.APPLE), 2, "apples dropped");
        helper.assertValueEqual(dropped(helper, AT, item(helper, "crate")), 1, "crate items dropped");
        helper.succeed();
    }

    /** The keeping crate drops one item holding its contents, and placing that item puts them back. */
    @GameTest
    public void keepCrateCarriesItsContentsInTheItem(GameTestHelper helper) {
        Item keepCrate = item(helper, "keep_crate");
        Container crate = place(helper, AT, "keep_crate");
        crate.setItem(0, new ItemStack(Items.REDSTONE, 9));
        crate.setItem(26, new ItemStack(Items.APPLE, 2));
        helper.getLevel().destroyBlock(helper.absolutePos(AT), true);
        helper.assertValueEqual(dropped(helper, AT, Items.REDSTONE), 0, "redstone dropped loose");
        List<ItemEntity> drops = droppedEntities(helper, AT, keepCrate);
        helper.assertValueEqual(drops.size(), 1, "keeping crate items dropped");
        ItemStack stack = drops.getFirst().getItem().copy();
        drops.getFirst().discard();
        ItemContainerContents contents = stack.getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY);
        helper.assertValueEqual(contents.nonEmptyItemCopyStream().mapToInt(ItemStack::getCount).sum(), 11, "items in the dropped crate");
        helper.setBlock(AT.below(), Blocks.STONE);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        try {
            hold(player, stack);
            use(helper, player, AT.below());
            Container placed = container(helper, AT, "the placed keeping crate");
            helper.assertValueEqual(count(placed, 0, Items.REDSTONE), 9, "redstone in slot 0 after placing");
            helper.assertValueEqual(count(placed, 26, Items.APPLE), 2, "apples in slot 26 after placing");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    /** A keeping crate refuses another keeping crate (as a shulker box): its slots, a hopper and its menu. */
    @GameTest
    public void keepCrateRefusesAnotherKeepCrate(GameTestHelper helper) {
        ItemStack other = new ItemStack(item(helper, "keep_crate"));
        helper.assertFalse(other.getItem().canFitInsideContainerItems(), "a keeping crate fits inside container items");
        helper.assertTrue(item(helper, "crate").canFitInsideContainerItems(), "a plain crate refuses containers");
        Container crate = place(helper, AT, "keep_crate");
        helper.assertFalse(crate.canPlaceItem(0, other), "canPlaceItem took a keeping crate");
        helper.assertTrue(crate.canPlaceItem(0, new ItemStack(Items.STONE)), "canPlaceItem refused stone");
        ItemStack left = HopperBlockEntity.addItem(null, crate, other.copy(), Direction.UP);
        helper.assertValueEqual(left.getCount(), 1, "keeping crates left after a hopper insert");
        helper.assertTrue(crate.isEmpty(), "a keeping crate went in through a hopper");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        try {
            use(helper, player, AT);
            helper.assertTrue(player.containerMenu instanceof ShulkerBoxMenu, "not a shulker box menu: " + player.containerMenu);
            helper.assertFalse(player.containerMenu.getSlot(0).mayPlace(other), "the menu slot takes a keeping crate");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    // The holder (layout none)

    /** An item goes into the holder, an empty hand takes it out, and every use says {@code on_open}'s line. */
    @GameTest
    public void holderTakesAndGivesBack(GameTestHelper helper) {
        Container holder = place(helper, AT, "holder");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        try {
            int mark = ParityChat.mark();
            hold(player, new ItemStack(Items.DIAMOND, 3));
            helper.assertTrue(use(helper, player, AT).consumesAction(), "the put-in did nothing");
            helper.assertTrue(player.getMainHandItem().isEmpty(), "diamonds left in hand: " + player.getMainHandItem());
            helper.assertValueEqual(count(holder, 0, Items.DIAMOND), 3, "diamonds in the holder");
            assertSaid(helper, mark, HOLDER_USED, "on_open at the put-in");
            // A second item fits nowhere (size 1, other item): it stays in hand.
            hold(player, new ItemStack(Items.IRON_SWORD));
            use(helper, player, AT);
            helper.assertTrue(player.getMainHandItem().is(Items.IRON_SWORD), "the sword went into a full holder");
            int takeMark = ParityChat.mark();
            hold(player, ItemStack.EMPTY);
            use(helper, player, AT);
            helper.assertTrue(holder.isEmpty(), "the diamonds were not taken out");
            helper.assertValueEqual(player.getInventory().countItem(Items.DIAMOND), 3, "diamonds given back");
            assertSaid(helper, takeMark, HOLDER_USED, "on_open at the take-out");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    // Events and state (ADR 0074 D3)

    /** Opening the crate sets {@code open} and says {@code on_open}'s line; closing it clears both ways. */
    @GameTest
    public void crateOpensAndClosesWithItsLines(GameTestHelper helper) {
        place(helper, AT, "crate");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        int mark = ParityChat.mark();
        use(helper, player, AT);
        helper.assertTrue(player.containerMenu instanceof ChestMenu, "not a chest menu: " + player.containerMenu);
        helper.assertBlockProperty(AT, BlockStateProperties.OPEN, true);
        assertSaid(helper, mark, CRATE_OPENED, "on_open");
        // Past vanilla's 5-tick recheck the player is still in range with the menu open.
        helper.runAfterDelay(12, () -> {
            try {
                helper.assertBlockProperty(AT, BlockStateProperties.OPEN, true);
                int closeMark = ParityChat.mark();
                player.closeContainer();
                helper.assertBlockProperty(AT, BlockStateProperties.OPEN, false);
                assertSaid(helper, closeMark, CRATE_CLOSED, "on_close");
            } finally {
                leave(helper, player);
            }
            helper.succeed();
        });
    }

    /** {@code place_loot_crate} sets a crate with a loot table; the first opening fills it (3 diamonds, 5 bread). */
    @GameTest
    public void lootCrateFillsOnFirstOpen(GameTestHelper helper) {
        // A function with no return reports no success to the callback, so the placed block is the check.
        command(helper, AT, "function " + NAMESPACE + ":place_loot_crate");
        helper.assertBlockPresent(block(helper, "crate"), AT);
        helper.assertTrue(saved(helper, AT).contains("LootTable"), "no LootTable in the placed crate: " + saved(helper, AT));
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        try {
            use(helper, player, AT);
            Container crate = container(helper, AT, "the loot crate");
            helper.assertValueEqual(crate.countItem(Items.DIAMOND), 3, "diamonds from the loot table");
            helper.assertValueEqual(crate.countItem(Items.BREAD), 5, "bread from the loot table");
            helper.assertFalse(saved(helper, AT).contains("LootTable"), "the loot table was not unpacked");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    // Machines (ADR 0075 D1, D3)

    /** The grinder burns coal and makes gravel from cobblestone after 40 ticks, lit while it burns; both events speak. */
    @GameTest(maxTicks = 80)
    public void grinderMakesGravelAfterItsTime(GameTestHelper helper) {
        int mark = ParityChat.mark();
        Container grinder = place(helper, AT, "grinder");
        grinder.setItem(INPUT, new ItemStack(Items.COBBLESTONE));
        grinder.setItem(FUEL, new ItemStack(Items.COAL));
        helper.runAfterDelay(30, () -> {
            helper.assertTrue(lit(helper, AT), "not lit while working");
            helper.assertTrue(grinder.getItem(OUTPUT).isEmpty(), "output before 40 ticks: " + grinder.getItem(OUTPUT));
            helper.assertTrue(grinder.getItem(FUEL).isEmpty(), "the coal was not burned");
            assertSaid(helper, mark, GRINDER_STARTS, "on_start");
        });
        helper.runAfterDelay(50, () -> {
            helper.assertValueEqual(count(grinder, OUTPUT, Items.GRAVEL), 1, "gravel made");
            helper.assertTrue(grinder.getItem(INPUT).isEmpty(), "cobblestone left");
            helper.assertTrue(lit(helper, AT), "the coal still burns: lit");
            assertSaid(helper, mark, GRINDER_FINISHES, "on_finish");
            helper.succeed();
        });
    }

    /** The fast furnace smelts raw iron at speed 2: 100 ticks for vanilla's 200. */
    @GameTest(maxTicks = 140)
    public void fastFurnaceSmeltsInHalfTheTime(GameTestHelper helper) {
        int mark = ParityChat.mark();
        Container furnace = place(helper, AT, "fast_furnace");
        furnace.setItem(INPUT, new ItemStack(Items.RAW_IRON));
        furnace.setItem(FUEL, new ItemStack(Items.COAL));
        helper.runAfterDelay(85, () -> {
            helper.assertTrue(lit(helper, AT), "not lit while smelting");
            helper.assertTrue(furnace.getItem(OUTPUT).isEmpty(), "output before 100 ticks: " + furnace.getItem(OUTPUT));
            helper.assertValueEqual(saved(helper, AT).getIntOr("cooking_total_time", 0), 100, "cooking_total_time at speed 2");
        });
        helper.runAfterDelay(115, () -> {
            helper.assertValueEqual(count(furnace, OUTPUT, Items.IRON_INGOT), 1, "iron ingot smelted");
            assertSaid(helper, mark, FAST_FURNACE_FINISHES, "on_finish");
            helper.succeed();
        });
    }

    /**
     * The redstone grinder waits for power; with a redstone block beside it, it grinds gravel into flint in the recipe's
     * 20 ticks, lit while working, and its comparator reads the progress.
     */
    @GameTest(maxTicks = 120)
    public void redstoneGrinderRunsOnlyWhenPowered(GameTestHelper helper) {
        Container grinder = place(helper, AT, "redstone_grinder");
        grinder.setItem(INPUT, new ItemStack(Items.GRAVEL));
        int[] mark = {0};
        helper.startSequence()
                .thenIdle(30)
                .thenExecute(() -> {
                    helper.assertFalse(lit(helper, AT), "lit without power");
                    helper.assertTrue(grinder.getItem(OUTPUT).isEmpty(), "output without power");
                    helper.assertValueEqual(signal(helper, AT), 0, "progress signal without power");
                    helper.assertFalse(grinder.canPlaceItem(FUEL, new ItemStack(Items.COAL)), "a redstone machine's fuel slot takes coal");
                    mark[0] = ParityChat.mark();
                    helper.setBlock(AT.east(), Blocks.REDSTONE_BLOCK);
                })
                .thenIdle(8)
                .thenExecute(() -> {
                    helper.assertTrue(lit(helper, AT), "not lit while powered and working");
                    int progress = signal(helper, AT);
                    helper.assertTrue(progress > 0 && progress < 15, "progress signal while working: " + progress);
                })
                .thenWaitUntil(() -> helper.assertValueEqual(count(grinder, OUTPUT, Items.FLINT), 1, "flint made once powered"))
                .thenWaitUntil(() -> helper.assertFalse(lit(helper, AT), "lit with nothing to do"))
                .thenExecute(() -> assertSaid(helper, mark[0], REDSTONE_GRINDER_FINISHES, "on_finish"))
                .thenSucceed();
    }

    /** Hoppers use the furnace faces: the top fills the input, a side the fuel (fuel only), the bottom takes the output. */
    @GameTest(maxTicks = 160)
    public void hoppersUseTheFurnaceFaces(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        Container grinder = place(helper, AT, "grinder");
        grinder.setItem(OUTPUT, new ItemStack(Items.GRAVEL, 3));
        helper.setBlock(AT.above(), Blocks.HOPPER);
        helper.setBlock(AT.east(), Blocks.HOPPER.defaultBlockState().setValue(HopperBlock.FACING, Direction.WEST));
        helper.setBlock(AT.below(), Blocks.HOPPER);
        HopperBlockEntity above = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.above()));
        HopperBlockEntity side = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.east()));
        HopperBlockEntity below = (HopperBlockEntity) level.getBlockEntity(helper.absolutePos(AT.below()));
        above.setItem(0, new ItemStack(Items.COBBLESTONE));
        side.setItem(0, new ItemStack(Items.COAL));
        side.setItem(1, new ItemStack(Items.ANDESITE)); // not a fuel: stays in the side hopper
        helper.succeedWhen(() -> {
            helper.assertValueEqual(above.countItem(Items.COBBLESTONE), 0, "cobblestone left in the top hopper");
            helper.assertValueEqual(side.countItem(Items.COAL), 0, "coal left in the side hopper");
            helper.assertValueEqual(side.countItem(Items.ANDESITE), 1, "andesite in the side hopper");
            helper.assertValueEqual(below.countItem(Items.GRAVEL), 4, "gravel pulled out of the bottom (3 + 1 made)");
            helper.assertFalse(grinder.getItem(FUEL).is(Items.ANDESITE), "andesite in the fuel slot");
        });
    }

    /** The open furnace menu shows the machine's progress and flame. */
    @GameTest(maxTicks = 60)
    public void furnaceMenuShowsTheProgress(GameTestHelper helper) {
        Container grinder = place(helper, AT, "grinder");
        grinder.setItem(INPUT, new ItemStack(Items.COBBLESTONE));
        grinder.setItem(FUEL, new ItemStack(Items.COAL));
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        use(helper, player, AT);
        helper.assertTrue(player.containerMenu instanceof AbstractFurnaceMenu, "not a furnace menu: " + player.containerMenu);
        AbstractFurnaceMenu menu = (AbstractFurnaceMenu) player.containerMenu;
        helper.runAfterDelay(20, () -> {
            try {
                float progress = menu.getBurnProgress();
                helper.assertTrue(progress > 0.2f && progress < 0.8f, "menu progress after 20 of 40 ticks: " + progress);
                helper.assertTrue(menu.isLit(), "menu flame off while working");
                helper.assertTrue(menu.getLitProgress() > 0, "menu fuel gauge empty while burning");
            } finally {
                leave(helper, player);
            }
            helper.succeed();
        });
    }

    /** Taking the flint out of the furnace menu pays the recipe's experience (1) as orbs at the player. */
    @GameTest(maxTicks = 80)
    public void takingTheResultPaysTheExperience(GameTestHelper helper) {
        Container grinder = place(helper, AT, "grinder");
        grinder.setItem(INPUT, new ItemStack(Items.GRAVEL));
        grinder.setItem(FUEL, new ItemStack(Items.COAL));
        helper.runAfterDelay(35, () -> {
            helper.assertValueEqual(count(grinder, OUTPUT, Items.FLINT), 1, "flint made");
            helper.assertValueEqual(saved(helper, AT).getFloatOr("experience", -1.0f), 1.0f, "experience stored");
            ServerPlayer player = player(helper, GameType.SURVIVAL);
            try {
                use(helper, player, AT);
                AbstractContainerMenu menu = player.containerMenu;
                helper.assertTrue(menu instanceof AbstractFurnaceMenu, "not a furnace menu: " + menu);
                menu.clicked(AbstractFurnaceMenu.RESULT_SLOT, 0, ContainerInput.QUICK_MOVE, player);
                helper.assertValueEqual(player.getInventory().countItem(Items.FLINT), 1, "flint taken");
                helper.assertValueEqual(saved(helper, AT).getFloatOr("experience", -1.0f), 0.0f, "experience left in the grinder");
                helper.assertValueEqual(orbs(helper, player.position()), 1, "experience orbs at the player");
            } finally {
                leave(helper, player);
            }
            helper.succeed();
        });
    }
}
