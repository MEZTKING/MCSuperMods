package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmBlock;
import dev.mcsupermods.runtime.registry.container.MsmContainerBlock;
import dev.mcsupermods.runtime.registry.container.MsmContainerBlockItem;
import dev.mcsupermods.runtime.registry.container.MsmStorageBlockEntity;
import dev.mcsupermods.runtime.registry.types.MsmSlabBlock;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.fabricmc.fabric.api.transfer.v1.item.ItemStorage;
import net.fabricmc.fabric.api.transfer.v1.item.ItemVariant;
import net.fabricmc.fabric.api.transfer.v1.storage.Storage;
import net.fabricmc.fabric.api.transfer.v1.transaction.Transaction;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.DispenserMenu;
import net.minecraft.world.inventory.HopperMenu;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.inventory.ShulkerBoxMenu;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.ComparatorBlock;
import net.minecraft.world.level.block.Mirror;
import net.minecraft.world.level.block.Rotation;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.entity.ComparatorBlockEntity;
import net.minecraft.world.level.block.entity.HopperBlockEntity;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Containers and block entities (ADR 0074, B314) on {@code msm/msm_test/block/container_*.json}: each layout's vanilla
 * menu, the holder, saving, hoppers (vanilla and Fabric item transfer, F19 of the plan), comparators, breaking, keeping
 * the contents, the {@code open} property, {@code on_open}/{@code on_close}, loot tables and the load-time rules.
 *
 * <p>Uses go through {@code ServerPlayerGameMode.useItemOn}, as the network handler does, with a mock player beside the
 * block (inside the container interaction range, so vanilla's opener recheck keeps it open).
 */
public class MsmContainerGameTest {
    private static final BlockPos AT = new BlockPos(2, 2, 2);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Block block(String path) {
        return BuiltInRegistries.BLOCK.getValue(id(path));
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.setPos(helper.absoluteVec(new Vec3(AT.getX() + 0.5, AT.getY(), AT.getZ() + 2.5)));
        return player;
    }

    private static MsmStorageBlockEntity place(GameTestHelper helper, BlockPos rel, String path) {
        helper.setBlock(rel, block(path));
        BlockEntity be = helper.getLevel().getBlockEntity(helper.absolutePos(rel));
        helper.assertTrue(be instanceof MsmStorageBlockEntity, path + " has no storage block entity: " + be);
        return (MsmStorageBlockEntity) be;
    }

    private static MsmStorageBlockEntity storage(GameTestHelper helper, BlockPos rel) {
        return helper.getLevel().getBlockEntity(helper.absolutePos(rel)) instanceof MsmStorageBlockEntity s ? s : null;
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

    private static int countDropped(GameTestHelper helper, BlockPos rel, Item item) {
        int n = 0;
        for (ItemEntity e : helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(2))) {
            if (e.getItem().is(item)) {
                n += e.getItem().getCount();
            }
        }
        return n;
    }

    private static List<ItemEntity> dropped(GameTestHelper helper, BlockPos rel, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(helper.absolutePos(rel)).inflate(2),
                e -> e.getItem().is(item));
    }

    /** Records the firings of {@code msm_test} container events; other tests run at the same time, so filter by block. */
    private static final class Recorder implements EventListener, AutoCloseable {
        private final List<String> firings = Collections.synchronizedList(new ArrayList<>());
        private final BlockPos at;

        Recorder(BlockPos at) {
            this.at = at;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.getNamespace().equals("msm_test") && depth == 1 && at.equals(ctx.block())) {
                firings.add(event.getPath() + (ctx.player() != null && ctx.other() == ctx.player() ? "" : " (not the player)"));
            }
        }

        List<String> all() {
            synchronized (firings) {
                return List.copyOf(firings);
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    // Loading

    @GameTest
    public void containersRegisterBlockEntityTypes(GameTestHelper helper) {
        for (String path : List.of("container_chest", "container_barrel", "container_hopper", "container_dispenser", "container_crate",
                "container_holder", "container_sealed")) {
            Block b = block(path);
            helper.assertTrue(b instanceof MsmContainerBlock, path + " is not an MsmContainerBlock: " + b);
            helper.assertTrue(BuiltInRegistries.BLOCK_ENTITY_TYPE.containsKey(id(path)), path + ": no block entity type with its id");
            helper.assertTrue(b.defaultBlockState().hasProperty(MsmBlock.OPEN), path + " has no open property");
            helper.assertFalse(b.defaultBlockState().getValue(MsmBlock.OPEN), path + " starts open");
        }
        helper.assertFalse(block("type_planks").defaultBlockState().hasBlockEntity(), "a plain block has a block entity");
        helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("/container_") && !e.contains("container_slab.json")
                && !e.contains("container_bad_keep.json")), "container errors: " + MsmRuntime.report().errors());
        helper.succeed();
    }

    @GameTest
    public void containerOnASlabIsDroppedWithOneError(GameTestHelper helper) {
        Block slab = block("container_slab");
        helper.assertTrue(slab instanceof MsmSlabBlock, "container_slab not registered as a slab: " + slab);
        helper.assertFalse(slab.defaultBlockState().hasBlockEntity(), "the slab has a block entity");
        helper.assertFalse(BuiltInRegistries.BLOCK_ENTITY_TYPE.containsKey(id("container_slab")), "the slab has a block entity type");
        long count = MsmRuntime.report().errors().stream().filter(e -> e.contains("container_slab.json")).count();
        helper.assertValueEqual(count, 1L, "errors for container_slab");
        helper.assertTrue(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("container_slab.json")
                && e.contains("msm:container is not allowed on type 'slab'")), "no error for the slab: " + MsmRuntime.report().errors());
        helper.succeed();
    }

    @GameTest
    public void keepContentsOutsideAThreeRowChestIsTurnedOff(GameTestHelper helper) {
        long count = MsmRuntime.report().errors().stream().filter(e -> e.contains("container_bad_keep.json")).count();
        helper.assertValueEqual(count, 1L, "errors for container_bad_keep");
        helper.assertTrue(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("container_bad_keep.json")
                && e.contains("keep_contents needs layout 'chest' with 3 rows")), "no keep_contents error: " + MsmRuntime.report().errors());
        helper.assertFalse(item("container_bad_keep") instanceof MsmContainerBlockItem, "the item keeps contents");
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        place(helper, AT, "container_bad_keep");
        use(helper, player, AT);
        helper.assertTrue(player.containerMenu instanceof ChestMenu chest && chest.getRowCount() == 2,
                "not a two-row chest menu: " + player.containerMenu);
        player.closeContainer();
        helper.succeed();
    }

    // Menus (ADR 0074 D1)

    private static AbstractContainerMenu openWithEmptyHand(GameTestHelper helper, ServerPlayer player, BlockPos rel) {
        InteractionResult result = use(helper, player, rel);
        helper.assertTrue(result.consumesAction(), "using the container did nothing: " + result);
        return player.containerMenu;
    }

    @GameTest
    public void eachLayoutOpensItsVanillaMenu(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        record Case(String path, Class<?> menu, MenuType<?> type, int slots) {}
        List<Case> cases = List.of(
                new Case("container_chest", ChestMenu.class, MenuType.GENERIC_9x2, 18),
                new Case("container_barrel", ChestMenu.class, MenuType.GENERIC_9x3, 27),
                new Case("container_hopper", HopperMenu.class, MenuType.HOPPER, 5),
                new Case("container_dispenser", DispenserMenu.class, MenuType.GENERIC_3x3, 9),
                new Case("container_crate", ShulkerBoxMenu.class, MenuType.SHULKER_BOX, 27));
        for (Case c : cases) {
            MsmStorageBlockEntity be = place(helper, AT, c.path());
            helper.assertValueEqual(be.getContainerSize(), c.slots(), c.path() + " slots");
            AbstractContainerMenu menu = openWithEmptyHand(helper, player, AT);
            helper.assertTrue(c.menu().isInstance(menu), c.path() + ": menu " + menu + ", expected " + c.menu().getSimpleName());
            helper.assertTrue(menu.getType() == c.type(), c.path() + ": menu type " + BuiltInRegistries.MENU.getKey(menu.getType()));
            if (menu instanceof ChestMenu chest) {
                helper.assertValueEqual(chest.getRowCount(), c.slots() / 9, c.path() + " rows");
            }
            // Holding an item opens the menu too (useItemOn falls through to useWithoutItem).
            player.closeContainer();
            hold(player, new ItemStack(Items.STICK));
            helper.assertTrue(c.menu().isInstance(openWithEmptyHand(helper, player, AT)), c.path() + ": not opened with an item in hand");
            player.closeContainer();
            hold(player, ItemStack.EMPTY);
            helper.setBlock(AT, Blocks.AIR);
        }
        helper.succeed();
    }

    @GameTest
    public void menuTitleIsTheBlockName(GameTestHelper helper) {
        MsmStorageBlockEntity be = place(helper, AT, "container_chest");
        helper.assertValueEqual(be.getDisplayName().getString(), block("container_chest").getName().getString(), "title");
        helper.succeed();
    }

    // The holder (layout none)

    @GameTest
    public void holderTakesAndGivesItemsAndOpensNothing(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        MsmStorageBlockEntity be = place(helper, AT, "container_holder");
        try (Recorder r = new Recorder(helper.absolutePos(AT))) {
            hold(player, new ItemStack(Items.DIAMOND, 3));
            helper.assertTrue(use(helper, player, AT).consumesAction(), "put-in did nothing");
            helper.assertTrue(player.containerMenu == player.inventoryMenu, "the holder opened a menu: " + player.containerMenu);
            helper.assertTrue(player.getMainHandItem().isEmpty(), "diamonds left in hand: " + player.getMainHandItem());
            helper.assertTrue(be.getItem(0).is(Items.DIAMOND) && be.getItem(0).getCount() == 3, "slot 0: " + be.getItem(0));
            hold(player, new ItemStack(Items.IRON_SWORD));
            use(helper, player, AT);
            helper.assertTrue(be.getItem(1).is(Items.IRON_SWORD), "slot 1: " + be.getItem(1));
            // A second sword fits nowhere: it stays in hand and only msm:on_interact fires.
            hold(player, new ItemStack(Items.IRON_SWORD));
            use(helper, player, AT);
            helper.assertTrue(player.getMainHandItem().is(Items.IRON_SWORD), "the second sword went in");
            hold(player, ItemStack.EMPTY);
            use(helper, player, AT);
            helper.assertTrue(be.getItem(1).isEmpty(), "the sword was not taken out");
            helper.assertValueEqual(player.getInventory().countItem(Items.IRON_SWORD), 1, "swords given back");
            hold(player, ItemStack.EMPTY); // the sword went into the empty selected slot
            use(helper, player, AT);
            helper.assertTrue(be.isEmpty(), "the diamonds were not taken out");
            helper.assertValueEqual(player.getInventory().countItem(Items.DIAMOND), 3, "diamonds given back");
            hold(player, ItemStack.EMPTY);
            use(helper, player, AT); // empty: nothing to take, only msm:on_interact
            List<String> all = r.all();
            helper.assertValueEqual(all.stream().filter(e -> e.equals("holder_opened")).count(), 4L, "holder_opened firings: " + all);
            helper.assertValueEqual(all.stream().filter(e -> e.equals("holder_used")).count(), 6L, "holder_used firings: " + all);
        }
        helper.succeed();
    }

    // Saving

    @GameTest
    public void itemsSurviveSavingAndLoading(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmStorageBlockEntity be = place(helper, AT, "container_chest");
        be.setItem(0, new ItemStack(Items.COBBLESTONE, 12));
        be.setItem(17, new ItemStack(Items.DIAMOND_PICKAXE));
        CompoundTag tag = be.saveWithFullMetadata(level.registryAccess());
        ListTag items = tag.getListOrEmpty("Items");
        helper.assertValueEqual(items.size(), 2, "saved Items: " + tag);
        CompoundTag first = items.getCompoundOrEmpty(0);
        helper.assertValueEqual(first.getByteOr("Slot", (byte) -1), (byte) 0, "slot of the first saved stack: " + first);
        helper.assertValueEqual(first.getStringOr("id", ""), "minecraft:cobblestone", "id of the first saved stack");
        helper.assertValueEqual(first.getIntOr("count", 0), 12, "count of the first saved stack");
        BlockEntity loaded = BlockEntity.loadStatic(helper.absolutePos(AT), be.getBlockState(), tag, level.registryAccess());
        helper.assertTrue(loaded instanceof MsmStorageBlockEntity, "not loaded as storage: " + loaded);
        Container c = (Container) loaded;
        helper.assertTrue(c.getItem(0).is(Items.COBBLESTONE) && c.getItem(0).getCount() == 12, "slot 0 after loading: " + c.getItem(0));
        helper.assertTrue(c.getItem(17).is(Items.DIAMOND_PICKAXE), "slot 17 after loading: " + c.getItem(17));
        helper.succeed();
    }

    // Hoppers (ADR 0074 D4)

    @GameTest
    public void hopperAboveInserts(GameTestHelper helper) {
        MsmStorageBlockEntity be = place(helper, AT, "container_barrel");
        helper.setBlock(AT.above(), Blocks.HOPPER);
        ((HopperBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(AT.above()))).setItem(0, new ItemStack(Items.IRON_INGOT, 2));
        helper.succeedWhen(() -> helper.assertValueEqual(be.countItem(Items.IRON_INGOT), 2, "iron moved in"));
    }

    @GameTest
    public void hopperBelowExtracts(GameTestHelper helper) {
        MsmStorageBlockEntity be = place(helper, AT, "container_barrel");
        be.setItem(5, new ItemStack(Items.GOLD_INGOT, 2));
        helper.setBlock(AT.below(), Blocks.HOPPER);
        HopperBlockEntity hopper = (HopperBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(AT.below()));
        helper.succeedWhen(() -> helper.assertValueEqual(hopper.countItem(Items.GOLD_INGOT), 2, "gold moved out"));
    }

    @GameTest(maxTicks = 60)
    public void hoppersFalseBlocksBothWays(GameTestHelper helper) {
        MsmStorageBlockEntity be = place(helper, AT, "container_sealed");
        be.setItem(0, new ItemStack(Items.GOLD_INGOT, 2));
        helper.setBlock(AT.above(), Blocks.HOPPER);
        helper.setBlock(AT.below(), Blocks.HOPPER);
        HopperBlockEntity above = (HopperBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(AT.above()));
        HopperBlockEntity below = (HopperBlockEntity) helper.getLevel().getBlockEntity(helper.absolutePos(AT.below()));
        above.setItem(0, new ItemStack(Items.IRON_INGOT, 2));
        helper.runAfterDelay(40, () -> {
            helper.assertValueEqual(be.countItem(Items.IRON_INGOT), 0, "iron moved into a sealed container");
            helper.assertValueEqual(below.countItem(Items.GOLD_INGOT), 0, "gold moved out of a sealed container");
            helper.assertValueEqual(be.countItem(Items.GOLD_INGOT), 2, "gold left in the sealed container");
            helper.succeed();
        });
    }

    /** F19: Fabric's item transfer fallback wraps any Container block entity through its WorldlyContainer faces. */
    @GameTest
    public void fabricItemTransferUsesTheHopperFaces(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmStorageBlockEntity open = place(helper, AT, "container_barrel");
        BlockPos sealedAt = AT.east(2);
        place(helper, sealedAt, "container_sealed");
        Storage<ItemVariant> storage = ItemStorage.SIDED.find(level, helper.absolutePos(AT), Direction.UP);
        helper.assertTrue(storage != null, "no Fabric item storage for an MSM container");
        try (Transaction tx = Transaction.openOuter()) {
            long inserted = storage.insert(ItemVariant.of(Items.EMERALD), 5, tx);
            helper.assertValueEqual(inserted, 5L, "emeralds inserted through Fabric transfer");
            tx.commit();
        }
        helper.assertValueEqual(open.countItem(Items.EMERALD), 5, "emeralds in the container");
        Storage<ItemVariant> sealed = ItemStorage.SIDED.find(level, helper.absolutePos(sealedAt), Direction.UP);
        if (sealed != null) {
            try (Transaction tx = Transaction.openOuter()) {
                helper.assertValueEqual(sealed.insert(ItemVariant.of(Items.EMERALD), 5, tx), 0L, "emeralds inserted into a sealed container");
            }
        }
        helper.succeed();
    }

    // Comparators (ADR 0074 D4)

    @GameTest
    public void comparatorReadsAsABarrel(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        BlockPos at = new BlockPos(2, 2, 1);
        BlockPos sealedAt = new BlockPos(2, 2, 4);
        BlockPos barrelAt = new BlockPos(5, 2, 1);
        for (BlockPos p : List.of(at, sealedAt, barrelAt)) {
            helper.setBlock(p.below(), Blocks.STONE);
            helper.setBlock(p.west().below(), Blocks.STONE);
        }
        MsmStorageBlockEntity be = place(helper, at, "container_barrel");
        MsmStorageBlockEntity sealed = place(helper, sealedAt, "container_sealed");
        helper.setBlock(barrelAt, Blocks.BARREL);
        Container barrel = (Container) level.getBlockEntity(helper.absolutePos(barrelAt));
        // Comparators first: setting items marks the container changed, which updates them (a real comparator reads it).
        helper.setBlock(at.west(), Blocks.COMPARATOR.defaultBlockState().setValue(ComparatorBlock.FACING, Direction.EAST));
        helper.setBlock(sealedAt.west(), Blocks.COMPARATOR.defaultBlockState().setValue(ComparatorBlock.FACING, Direction.EAST));
        for (Container c : List.of(be, barrel)) {
            c.setItem(0, new ItemStack(Items.COBBLESTONE, 40));
            c.setItem(3, new ItemStack(Items.IRON_SWORD));
            c.setItem(9, new ItemStack(Items.ENDER_PEARL, 7));
        }
        sealed.setItem(0, new ItemStack(Items.COBBLESTONE, 64));
        BlockState state = helper.getBlockState(at);
        helper.assertTrue(state.hasAnalogOutputSignal(), "no analog output");
        int ours = state.getAnalogOutputSignal(level, helper.absolutePos(at), Direction.WEST);
        int vanilla = helper.getBlockState(barrelAt).getAnalogOutputSignal(level, helper.absolutePos(barrelAt), Direction.WEST);
        helper.assertValueEqual(ours, vanilla, "comparator signal against a vanilla barrel");
        helper.assertTrue(ours > 0, "signal 0 with items");
        helper.assertFalse(helper.getBlockState(sealedAt).hasAnalogOutputSignal(), "comparator: false has an analog output");
        helper.succeedWhen(() -> {
            int read = ((ComparatorBlockEntity) level.getBlockEntity(helper.absolutePos(at.west()))).getOutputSignal();
            helper.assertValueEqual(read, vanilla, "comparator beside the container");
            int none = ((ComparatorBlockEntity) level.getBlockEntity(helper.absolutePos(sealedAt.west()))).getOutputSignal();
            helper.assertValueEqual(none, 0, "comparator beside the sealed container");
        });
    }

    // Breaking (ADR 0074 D5, D6)

    @GameTest
    public void breakingDropsTheContents(GameTestHelper helper) {
        MsmStorageBlockEntity be = place(helper, AT, "container_barrel");
        be.setItem(0, new ItemStack(Items.REDSTONE, 9));
        be.setItem(20, new ItemStack(Items.APPLE, 2));
        helper.getLevel().destroyBlock(helper.absolutePos(AT), true);
        helper.assertValueEqual(countDropped(helper, AT, Items.REDSTONE), 9, "redstone dropped");
        helper.assertValueEqual(countDropped(helper, AT, Items.APPLE), 2, "apples dropped");
        helper.succeed();
    }

    @GameTest
    public void keepContentsTravelsInTheItem(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        helper.assertTrue(item("container_crate") instanceof MsmContainerBlockItem, "crate item: " + item("container_crate"));
        MsmStorageBlockEntity be = place(helper, AT, "container_crate");
        be.setItem(0, new ItemStack(Items.REDSTONE, 9));
        be.setItem(26, new ItemStack(Items.APPLE, 2));
        level.destroyBlock(helper.absolutePos(AT), true);
        helper.assertValueEqual(countDropped(helper, AT, Items.REDSTONE), 0, "redstone dropped loose");
        List<ItemEntity> crates = dropped(helper, AT, item("container_crate"));
        helper.assertValueEqual(crates.size(), 1, "crate items dropped");
        ItemStack crate = crates.getFirst().getItem().copy();
        crates.getFirst().discard();
        ItemContainerContents contents = crate.getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY);
        helper.assertValueEqual(contents.nonEmptyItemCopyStream().mapToInt(ItemStack::getCount).sum(), 11, "items in the crate item");
        // Placing the item restores the contents.
        BlockPos floor = AT.below();
        helper.setBlock(floor, Blocks.STONE);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        hold(player, crate);
        use(helper, player, floor);
        MsmStorageBlockEntity placed = storage(helper, AT);
        helper.assertTrue(placed != null, "the crate was not placed: " + helper.getBlockState(AT));
        helper.assertTrue(placed.getItem(0).is(Items.REDSTONE) && placed.getItem(0).getCount() == 9, "slot 0 after placing: " + placed.getItem(0));
        helper.assertTrue(placed.getItem(26).is(Items.APPLE), "slot 26 after placing: " + placed.getItem(26));
        helper.succeed();
    }

    @GameTest
    public void creativeBreakingDropsAFullCrate(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.CREATIVE);
        MsmStorageBlockEntity be = place(helper, AT, "container_crate");
        be.setItem(4, new ItemStack(Items.DIAMOND, 3));
        player.gameMode.destroyBlock(helper.absolutePos(AT));
        helper.assertBlockNotPresent(block("container_crate"), AT);
        List<ItemEntity> crates = dropped(helper, AT, item("container_crate"));
        helper.assertValueEqual(crates.size(), 1, "crate items dropped in creative");
        ItemContainerContents contents = crates.getFirst().getItem().getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY);
        helper.assertValueEqual(contents.nonEmptyItemCopyStream().mapToInt(ItemStack::getCount).sum(), 3, "diamonds in the crate item");
        // An empty crate drops nothing in creative.
        crates.getFirst().discard();
        place(helper, AT, "container_crate");
        player.gameMode.destroyBlock(helper.absolutePos(AT));
        helper.assertValueEqual(dropped(helper, AT, item("container_crate")).size(), 0, "empty crate dropped in creative");
        helper.succeed();
    }

    @GameTest
    public void crateRefusesAnotherCrate(GameTestHelper helper) {
        ItemStack crate = new ItemStack(item("container_crate"));
        helper.assertFalse(crate.getItem().canFitInsideContainerItems(), "a crate fits inside container items");
        helper.assertTrue(item("container_barrel") instanceof BlockItem && item("container_barrel").canFitInsideContainerItems(),
                "a plain container's item refuses containers");
        MsmStorageBlockEntity be = place(helper, AT, "container_crate");
        helper.assertFalse(be.canPlaceItem(0, crate), "canPlaceItem took a crate");
        helper.assertTrue(be.canPlaceItem(0, new ItemStack(Items.STONE)), "canPlaceItem refused stone");
        // Through a hopper face
        ItemStack left = HopperBlockEntity.addItem(null, be, crate.copy(), Direction.UP);
        helper.assertValueEqual(left.getCount(), 1, "crate left after a hopper insert");
        helper.assertTrue(be.isEmpty(), "a crate went in through a hopper face");
        // Through the shulker box menu's slot
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        use(helper, player, AT);
        helper.assertTrue(player.containerMenu instanceof ShulkerBoxMenu, "not a shulker box menu: " + player.containerMenu);
        helper.assertFalse(player.containerMenu.getSlot(0).mayPlace(crate), "the menu slot takes a crate");
        helper.assertTrue(player.containerMenu.getSlot(0).mayPlace(new ItemStack(Items.STONE)), "the menu slot refuses stone");
        player.closeContainer();
        helper.succeed();
    }

    // State (ADR 0074 D3)

    @GameTest
    public void openWhileAPlayerHasItOpen(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        MsmStorageBlockEntity be = place(helper, AT, "container_chest");
        Recorder r = new Recorder(helper.absolutePos(AT));
        try {
            use(helper, player, AT);
            helper.assertBlockProperty(AT, MsmBlock.OPEN, true);
            helper.assertValueEqual(be.openerCount(), 1, "openers");
            helper.assertValueEqual(r.all(), List.of("container_opened"), "events after opening");
        } catch (RuntimeException e) {
            r.close();
            throw e;
        }
        // Past vanilla's 5-tick recheck the player is still in range with the menu open.
        helper.runAfterDelay(12, () -> {
            try (r) {
                helper.assertBlockProperty(AT, MsmBlock.OPEN, true);
                player.closeContainer();
                helper.assertBlockProperty(AT, MsmBlock.OPEN, false);
                helper.assertValueEqual(be.openerCount(), 0, "openers after closing");
                helper.assertValueEqual(r.all(), List.of("container_opened", "container_closed"), "events after closing");
            }
            helper.succeed();
        });
    }

    @GameTest
    public void openPropertyRotatesAndMirrors(GameTestHelper helper) {
        BlockState state = block("container_barrel").defaultBlockState().setValue(MsmBlock.FACING, Direction.NORTH)
                .setValue(MsmBlock.OPEN, true);
        BlockState turned = state.rotate(Rotation.CLOCKWISE_90);
        helper.assertValueEqual(turned.getValue(MsmBlock.FACING), Direction.EAST, "facing after rotating");
        helper.assertTrue(turned.getValue(MsmBlock.OPEN), "open lost by rotating");
        BlockState mirrored = state.mirror(Mirror.FRONT_BACK);
        helper.assertValueEqual(mirrored.getValue(MsmBlock.FACING), Direction.NORTH, "facing after mirroring front to back");
        helper.assertTrue(mirrored.getValue(MsmBlock.OPEN), "open lost by mirroring");
        BlockState leftRight = state.mirror(Mirror.LEFT_RIGHT);
        helper.assertValueEqual(leftRight.getValue(MsmBlock.FACING), Direction.SOUTH, "facing after mirroring left to right");
        helper.assertTrue(leftRight.getValue(MsmBlock.OPEN), "open lost by mirroring");
        helper.succeed();
    }

    // Loot tables (ADR 0074 D2)

    @GameTest
    public void lootTableFillsTheContainerOnFirstOpen(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmStorageBlockEntity be = place(helper, AT, "container_barrel");
        BlockPos abs = helper.absolutePos(AT);
        level.getServer().getCommands().performPrefixedCommand(
                level.getServer().createCommandSourceStack().withLevel(level).withSuppressedOutput(),
                "data merge block " + abs.getX() + " " + abs.getY() + " " + abs.getZ() + " {LootTable:\"msm_test:container_fill\"}");
        MsmStorageBlockEntity merged = storage(helper, AT);
        helper.assertTrue(merged != null && merged.getLootTable() != null, "no loot table after /data merge: " + merged);
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        use(helper, player, AT);
        helper.assertValueEqual(merged.countItem(Items.DIAMOND), 1, "diamonds from the loot table");
        helper.assertTrue(merged.getLootTable() == null, "the loot table was not unpacked");
        player.closeContainer();
        helper.assertTrue(be == merged, "the block entity was replaced");
        helper.succeed();
    }
}
