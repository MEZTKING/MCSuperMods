package dev.mcsupermods.runtime.gametest;

import com.mojang.serialization.DynamicOps;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.inventory.BagGuard;
import dev.mcsupermods.runtime.registry.inventory.MsmBundleItem;
import dev.mcsupermods.runtime.registry.inventory.MsmInventoryItem;
import dev.mcsupermods.runtime.registry.inventory.MsmItemChestMenu;
import dev.mcsupermods.runtime.registry.inventory.MsmItemDispenserMenu;
import dev.mcsupermods.runtime.registry.inventory.MsmItemHopperMenu;
import dev.mcsupermods.runtime.registry.inventory.MsmItemShulkerMenu;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.fabricmc.fabric.api.entity.event.v1.ServerLivingEntityEvents;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.NbtOps;
import net.minecraft.nbt.Tag;
import net.minecraft.network.DisconnectionDetails;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerInput;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.BundleContents;
import net.minecraft.world.item.component.ItemContainerContents;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Item inventories and bundles (ADR 0095, B450) on {@code msm/msm_test/item/bag_*.json}: the three layouts, opening with
 * a use and a sneaking use, {@code on_open}, {@code on_close} and {@code msm:on_use}, writing at once and on close, the
 * contents after a save and load, refusing bags and shulker boxes, and every duplication route of the B440 spike (S10):
 * a number key onto the bag's slot target, a number key moving the bag, the off-hand swap, dropping the bag,
 * picking the bag up with the cursor into itself, shift-clicking it, moving it by command, the creative pick, death,
 * leaving, and a second player.
 *
 * <p>Uses go through {@code ServerPlayerGameMode.useItem} and clicks through {@code AbstractContainerMenu.clicked}, as
 * the network handler does; mock players are not ticked by the server, so each test calls {@code doTick} where vanilla
 * would check {@code stillValid}.
 */
public class MsmItemInventoryGameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static ServerPlayer player(GameTestHelper helper, GameType mode) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(mode);
        player.setPos(helper.absoluteVec(new Vec3(1.5, 2, 1.5)));
        player.getInventory().clearContent();
        return player;
    }

    private static ItemStack bag(String path, ItemStack... contents) {
        ItemStack stack = new ItemStack(item(path));
        stack.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(contents)));
        return stack;
    }

    private static List<ItemStack> contents(ItemStack bag) {
        return bag.getOrDefault(DataComponents.CONTAINER, ItemContainerContents.EMPTY).nonEmptyItemCopyStream().toList();
    }

    /** Items of {@code item} in {@code stack}, counting the contents of bags and bundles too. */
    private static int count(ItemStack stack, Item item) {
        if (stack.isEmpty()) {
            return 0;
        }
        int n = stack.is(item) ? stack.getCount() : 0;
        for (ItemStack inner : contents(stack)) {
            n += count(inner, item) * stack.getCount();
        }
        BundleContents bundle = stack.get(DataComponents.BUNDLE_CONTENTS);
        if (bundle != null) {
            n += bundle.itemCopies().mapToInt(s -> count(s, item)).sum();
        }
        return n;
    }

    /** Every {@code item} the player has: inventory (bags included) and the cursor. */
    private static int held(ServerPlayer player, Item item) {
        int n = count(player.containerMenu.getCarried(), item);
        for (int k = 0; k < player.getInventory().getContainerSize(); k++) {
            n += count(player.getInventory().getItem(k), item);
        }
        return n;
    }

    private static List<ItemEntity> onGround(GameTestHelper helper, ServerPlayer player) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(player.blockPosition()).inflate(4));
    }

    private static int onGround(GameTestHelper helper, ServerPlayer player, Item item) {
        return onGround(helper, player).stream().mapToInt(e -> count(e.getItem(), item)).sum();
    }

    private static AbstractContainerMenu open(ServerPlayer player, InteractionHand hand) {
        player.gameMode.useItem(player, player.level(), player.getItemInHand(hand), hand);
        return player.containerMenu;
    }

    private static AbstractContainerMenu openFromHotbar(GameTestHelper helper, ServerPlayer player, ItemStack bag) {
        player.getInventory().setItem(0, bag);
        player.getInventory().setSelectedSlot(0);
        AbstractContainerMenu menu = open(player, InteractionHand.MAIN_HAND);
        helper.assertTrue(menu instanceof BagGuard.Menu, "the bag did not open: " + menu);
        return menu;
    }

    /** The menu slot showing player inventory index {@code inventorySlot}, or -1. */
    private static int menuSlot(AbstractContainerMenu menu, ServerPlayer player, int inventorySlot) {
        for (int n = 0; n < menu.slots.size(); n++) {
            if (menu.getSlot(n).container == player.getInventory() && menu.getSlot(n).getContainerSlot() == inventorySlot) {
                return n;
            }
        }
        return -1;
    }

    private static int bagSlots(AbstractContainerMenu menu) {
        return menu.slots.size() - 36;
    }

    private static boolean isOpen(ServerPlayer player) {
        return player.containerMenu != player.inventoryMenu;
    }

    /** Records the events fired by {@code msm_test} bags for one player. */
    private static final class Recorder implements EventListener, AutoCloseable {
        private final List<String> firings = Collections.synchronizedList(new ArrayList<>());
        private final ServerPlayer player;

        Recorder(ServerPlayer player) {
            this.player = player;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.getNamespace().equals("msm_test") && owner.getPath().startsWith("bag_") && depth == 1 && ctx.player() == player) {
                firings.add(event.getPath() + (ctx.other() == player ? "" : " (other is not the player)"));
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
    public void bagsAndBundlesRegister(GameTestHelper helper) {
        for (String path : List.of("bag_chest", "bag_small", "bag_big", "bag_hopper", "bag_dispenser", "bag_sneak", "bag_hopper_rows")) {
            Item bag = item(path);
            helper.assertTrue(bag instanceof MsmInventoryItem, path + " is not a bag: " + bag);
            helper.assertValueEqual(bag.getDefaultMaxStackSize(), 1, path + " max stack size");
            helper.assertFalse(bag.canFitInsideContainerItems(), path + " fits inside container items");
            helper.assertTrue(new ItemStack(bag).has(DataComponents.CONTAINER), path + " has no container component");
        }
        Item bundle = item("bag_bundle");
        helper.assertTrue(bundle instanceof MsmBundleItem, "bag_bundle is not a bundle: " + bundle);
        helper.assertValueEqual(bundle.getDefaultMaxStackSize(), 1, "bundle max stack size");
        helper.assertTrue(new ItemStack(bundle).has(DataComponents.BUNDLE_CONTENTS), "the bundle has no bundle_contents");
        helper.assertTrue(((MsmInventoryItem) item("bag_hopper_rows")).bag().rows().isEmpty(), "a hopper bag kept its rows");
        helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("/bag_")), "bag errors: " + MsmRuntime.report().errors());
        List<String> warnings = MsmRuntime.report().warnings().stream().filter(w -> w.contains("bag_")).toList();
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("bag_hopper_rows.json") && w.contains("rows is only for the chest layout")),
                "no rows warning: " + warnings);
        helper.assertTrue(warnings.stream().anyMatch(w -> w.contains("bag_hopper_rows.json") && w.contains("max_stack_size 16 ignored")),
                "no max_stack_size warning: " + warnings);
        helper.assertValueEqual(warnings.size(), 2, "bag warnings " + warnings);
        helper.succeed();
    }

    // Menus (ADR 0095 D2)

    @GameTest
    public void eachLayoutOpensItsMenu(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        record Case(String path, Class<?> menu, MenuType<?> type, int slots) {}
        for (Case c : List.of(
                new Case("bag_chest", MsmItemShulkerMenu.class, MenuType.SHULKER_BOX, 27),
                new Case("bag_small", MsmItemChestMenu.class, MenuType.GENERIC_9x1, 9),
                new Case("bag_big", MsmItemChestMenu.class, MenuType.GENERIC_9x6, 54),
                new Case("bag_hopper", MsmItemHopperMenu.class, MenuType.HOPPER, 5),
                new Case("bag_hopper_rows", MsmItemHopperMenu.class, MenuType.HOPPER, 5),
                new Case("bag_dispenser", MsmItemDispenserMenu.class, MenuType.GENERIC_3x3, 9))) {
            AbstractContainerMenu menu = openFromHotbar(helper, player, bag(c.path()));
            helper.assertTrue(c.menu().isInstance(menu), c.path() + ": menu " + menu + ", expected " + c.menu().getSimpleName());
            helper.assertTrue(menu.getType() == c.type(), c.path() + ": menu type " + BuiltInRegistries.MENU.getKey(menu.getType()));
            helper.assertValueEqual(bagSlots(menu), c.slots(), c.path() + " slots");
            player.closeContainer();
            helper.assertFalse(isOpen(player), c.path() + " did not close");
        }
        helper.succeed();
    }

    @GameTest
    public void sneakUseOpensOnlyWhenSneaking(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        player.getInventory().setItem(0, bag("bag_sneak"));
        player.getInventory().setSelectedSlot(0);
        open(player, InteractionHand.MAIN_HAND);
        helper.assertFalse(isOpen(player), "a sneak_use bag opened without sneaking");
        player.setShiftKeyDown(true);
        helper.assertTrue(open(player, InteractionHand.MAIN_HAND) instanceof BagGuard.Menu, "a sneaking use did not open the bag");
        player.closeContainer();
        // A use bag opens both ways.
        player.getInventory().setItem(0, bag("bag_small"));
        helper.assertTrue(open(player, InteractionHand.MAIN_HAND) instanceof BagGuard.Menu, "a use bag did not open while sneaking");
        player.closeContainer();
        player.setShiftKeyDown(false);
        helper.assertTrue(open(player, InteractionHand.MAIN_HAND) instanceof BagGuard.Menu, "a use bag did not open");
        player.closeContainer();
        helper.succeed();
    }

    @GameTest
    public void openAndCloseFireTheirEventsAndOnUseStillFires(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        try (Recorder recorder = new Recorder(player)) {
            openFromHotbar(helper, player, bag("bag_chest"));
            helper.assertValueEqual(recorder.all(), List.of("bag_opened", "bag_used"), "events after opening");
            player.closeContainer();
            helper.assertValueEqual(recorder.all(), List.of("bag_opened", "bag_used", "bag_closed"), "events after closing");
            player.closeContainer(); // a second close fires nothing
            helper.assertValueEqual(recorder.all().size(), 3, "events after a second close");
        }
        helper.succeed();
    }

    // Saving (ADR 0095 D1, D3)

    @GameTest
    public void contentsAreWrittenAtOnceAndOnClose(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        ItemStack bag = bag("bag_chest");
        AbstractContainerMenu menu = openFromHotbar(helper, player, bag);
        menu.setCarried(new ItemStack(Items.DIAMOND, 7));
        menu.clicked(0, 0, ContainerInput.PICKUP, player);
        helper.assertTrue(menu.getCarried().isEmpty(), "the diamonds stayed on the cursor");
        helper.assertValueEqual(count(bag, Items.DIAMOND), 7, "diamonds in the stack while open");
        menu.setCarried(new ItemStack(Items.EMERALD, 2));
        menu.clicked(4, 0, ContainerInput.PICKUP, player);
        player.closeContainer();
        helper.assertValueEqual(count(bag, Items.DIAMOND), 7, "diamonds after closing");
        helper.assertValueEqual(count(bag, Items.EMERALD), 2, "emeralds after closing");
        AbstractContainerMenu again = open(player, InteractionHand.MAIN_HAND);
        helper.assertTrue(again.getSlot(0).getItem().is(Items.DIAMOND) && again.getSlot(0).getItem().getCount() == 7,
                "slot 0 after reopening: " + again.getSlot(0).getItem());
        helper.assertTrue(again.getSlot(4).getItem().is(Items.EMERALD), "slot 4 after reopening: " + again.getSlot(4).getItem());
        player.closeContainer();
        helper.succeed();
    }

    @GameTest
    public void contentsStayOnTheStackAfterARestart(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        ItemStack bag = bag("bag_big");
        AbstractContainerMenu menu = openFromHotbar(helper, player, bag);
        menu.setCarried(new ItemStack(Items.GOLD_INGOT, 12));
        menu.clicked(53, 0, ContainerInput.PICKUP, player);
        player.closeContainer();
        // A restart saves and loads the stack through its codec, as the player's data and chunks do.
        DynamicOps<Tag> ops = helper.getLevel().registryAccess().createSerializationContext(NbtOps.INSTANCE);
        Tag saved = ItemStack.CODEC.encodeStart(ops, bag).getOrThrow();
        ItemStack loaded = ItemStack.CODEC.parse(ops, saved).getOrThrow();
        helper.assertTrue(loaded.is(item("bag_big")), "loaded " + loaded);
        helper.assertValueEqual(count(loaded, Items.GOLD_INGOT), 12, "gold after loading");
        player.getInventory().setItem(0, loaded);
        AbstractContainerMenu again = open(player, InteractionHand.MAIN_HAND);
        helper.assertValueEqual(again.getSlot(53).getItem().getCount(), 12, "the last slot after loading");
        player.closeContainer();
        helper.succeed();
    }

    // No nesting (ADR 0095 D3)

    @GameTest
    public void bagsAndShulkerBoxesAreRefusedInEveryLayout(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        for (String path : List.of("bag_chest", "bag_small", "bag_big", "bag_hopper", "bag_dispenser")) {
            player.getInventory().clearContent();
            player.getInventory().setItem(1, bag("bag_small"));
            player.getInventory().setItem(2, new ItemStack(Items.SHULKER_BOX));
            player.getInventory().setItem(3, new ItemStack(Items.DIAMOND, 3));
            ItemStack opened = bag(path);
            AbstractContainerMenu menu = openFromHotbar(helper, player, opened);
            // The cursor: a shulker box, then another bag.
            menu.setCarried(new ItemStack(Items.SHULKER_BOX));
            menu.clicked(0, 0, ContainerInput.PICKUP, player);
            helper.assertTrue(menu.getCarried().is(Items.SHULKER_BOX) && menu.getSlot(0).getItem().isEmpty(), path + ": a shulker box went in");
            menu.clicked(0, 1, ContainerInput.QUICK_CRAFT, player);
            menu.setCarried(bag("bag_hopper"));
            menu.clicked(0, 0, ContainerInput.PICKUP, player);
            menu.clicked(0, 1, ContainerInput.PICKUP, player);
            helper.assertTrue(menu.getSlot(0).getItem().isEmpty(), path + ": a bag went in from the cursor");
            menu.setCarried(ItemStack.EMPTY);
            // A number key and a shift-click.
            menu.clicked(0, 2, ContainerInput.SWAP, player);
            menu.clicked(0, 1, ContainerInput.SWAP, player);
            menu.clicked(menuSlot(menu, player, 2), 0, ContainerInput.QUICK_MOVE, player);
            menu.clicked(menuSlot(menu, player, 1), 0, ContainerInput.QUICK_MOVE, player);
            for (int n = 0; n < bagSlots(menu); n++) {
                helper.assertTrue(BagGuard.fits(menu.getSlot(n).getItem()), path + ": slot " + n + " holds " + menu.getSlot(n).getItem());
            }
            helper.assertTrue(player.getInventory().getItem(2).is(Items.SHULKER_BOX), path + ": the shulker box left its slot");
            helper.assertTrue(player.getInventory().getItem(1).is(item("bag_small")), path + ": the other bag left its slot");
            // Plain items go in.
            menu.clicked(menuSlot(menu, player, 3), 0, ContainerInput.QUICK_MOVE, player);
            helper.assertValueEqual(count(opened, Items.DIAMOND), 3, path + ": diamonds shift-clicked in");
            player.closeContainer();
        }
        // Bundles and vanilla shulker boxes refuse bags too.
        helper.assertFalse(BundleContents.canItemBeInBundle(bag("bag_chest")), "a bag fits in a bundle");
        helper.assertTrue(BundleContents.canItemBeInBundle(new ItemStack(Items.DIAMOND)), "a diamond does not fit in a bundle");
        helper.succeed();
    }

    // The locked slot and the duplication routes of B440 S10

    /** A bag of five diamonds open from hotbar slot 0; the test then tries one route. */
    private static AbstractContainerMenu openFiveDiamonds(GameTestHelper helper, ServerPlayer player, ItemStack bag) {
        bag.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(new ItemStack(Items.DIAMOND, 5))));
        return openFromHotbar(helper, player, bag);
    }

    private static void assertFive(GameTestHelper helper, ServerPlayer player, String route) {
        int all = held(player, Items.DIAMOND) + onGround(helper, player, Items.DIAMOND);
        helper.assertValueEqual(all, 5, route + ": diamonds in all");
    }

    @GameTest
    public void theBagSlotIsLocked(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        ItemStack bag = bag("bag_chest");
        AbstractContainerMenu menu = openFiveDiamonds(helper, player, bag);
        int own = menuSlot(menu, player, 0);
        helper.assertTrue(own >= bagSlots(menu), "no menu slot shows the bag");
        record Route(String name, int slot, int button, ContainerInput input) {}
        for (Route r : List.of(
                new Route("cursor pick-up of the bag", own, 0, ContainerInput.PICKUP),
                new Route("right-click pick-up of the bag", own, 1, ContainerInput.PICKUP),
                new Route("shift-click of the bag", own, 0, ContainerInput.QUICK_MOVE),
                new Route("dropping the bag", own, 1, ContainerInput.THROW),
                new Route("number key moving the bag", own, 4, ContainerInput.SWAP),
                new Route("off-hand key on the bag", own, Inventory.SLOT_OFFHAND, ContainerInput.SWAP),
                new Route("number key onto the bag's hotbar slot", 0, 0, ContainerInput.SWAP),
                new Route("dragging over the bag", own, 1, ContainerInput.QUICK_CRAFT),
                new Route("double-click gathering", own, 0, ContainerInput.PICKUP_ALL))) {
            menu.clicked(r.slot(), r.button(), r.input(), player);
            helper.assertTrue(player.getInventory().getItem(0) == bag, r.name() + ": the bag left its slot");
            helper.assertTrue(menu.getCarried().isEmpty(), r.name() + ": the cursor holds " + menu.getCarried());
            helper.assertTrue(isOpen(player) && player.containerMenu == menu, r.name() + ": the menu closed");
            assertFive(helper, player, r.name());
        }
        helper.assertValueEqual(count(bag, Items.DIAMOND), 5, "diamonds still in the bag");
        // The diamonds on the cursor cannot be put down on the bag's slot either (the bag into itself, the other way round).
        menu.clicked(0, 0, ContainerInput.PICKUP, player);
        menu.clicked(own, 0, ContainerInput.PICKUP, player);
        helper.assertTrue(player.getInventory().getItem(0) == bag && count(bag, Items.DIAMOND) == 0, "taking the diamonds out");
        assertFive(helper, player, "taking the diamonds out");
        player.closeContainer();
        assertFive(helper, player, "after closing");
        helper.succeed();
    }

    @GameTest
    public void theCreativePickOfTheBagIsRefused(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.CREATIVE);
        ItemStack bag = bag("bag_chest");
        AbstractContainerMenu menu = openFiveDiamonds(helper, player, bag);
        int own = menuSlot(menu, player, 0);
        menu.clicked(own, 2, ContainerInput.CLONE, player);
        helper.assertTrue(menu.getCarried().isEmpty(), "the creative pick copied the bag: " + menu.getCarried());
        // Taking the diamonds out and picking the bag still copies nothing.
        menu.clicked(0, 0, ContainerInput.QUICK_MOVE, player);
        menu.clicked(own, 2, ContainerInput.CLONE, player);
        helper.assertTrue(menu.getCarried().isEmpty(), "the creative pick copied the bag after taking out");
        helper.assertValueEqual(count(bag, Items.DIAMOND), 0, "diamonds left in the bag");
        assertFive(helper, player, "creative pick");
        player.closeContainer();
        helper.succeed();
    }

    @GameTest
    public void theOffHandBagIsLocked(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        ItemStack bag = bag("bag_chest");
        bag.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(new ItemStack(Items.DIAMOND, 5))));
        player.setItemInHand(InteractionHand.OFF_HAND, bag);
        AbstractContainerMenu menu = open(player, InteractionHand.OFF_HAND);
        helper.assertTrue(menu instanceof BagGuard.Menu, "the off-hand bag did not open: " + menu);
        menu.clicked(0, Inventory.SLOT_OFFHAND, ContainerInput.SWAP, player);
        menu.clicked(bagSlots(menu) + 1, Inventory.SLOT_OFFHAND, ContainerInput.SWAP, player);
        helper.assertTrue(player.getItemInHand(InteractionHand.OFF_HAND) == bag, "the off-hand bag moved");
        helper.assertTrue(isOpen(player), "the menu closed");
        assertFive(helper, player, "off-hand swap");
        player.closeContainer();
        helper.assertValueEqual(count(bag, Items.DIAMOND), 5, "diamonds in the off-hand bag");
        helper.succeed();
    }

    @GameTest
    public void theMenuClosesWhenTheStackLeavesTheSlot(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        // Scrolling the hotbar does not move the bag: the menu stays.
        ItemStack bag = bag("bag_chest");
        AbstractContainerMenu menu = openFiveDiamonds(helper, player, bag);
        player.getInventory().setSelectedSlot(4);
        player.doTick();
        helper.assertTrue(player.containerMenu == menu, "scrolling the hotbar closed the menu");
        // Moved by a command: a copy replaces the stack, after the diamonds were taken out.
        menu.clicked(0, 0, ContainerInput.QUICK_MOVE, player);
        ItemStack copy = bag.copy();
        player.getInventory().setItem(0, copy);
        menu.clicked(menuSlot(menu, player, 9), 0, ContainerInput.QUICK_MOVE, player); // refused: the menu is no longer valid
        player.doTick();
        helper.assertFalse(isOpen(player), "the menu stayed open after the bag was replaced");
        helper.assertValueEqual(count(copy, Items.DIAMOND), 0, "diamonds in the copy");
        assertFive(helper, player, "moved by a command");
        // Dropped: the stack leaves the slot.
        player.getInventory().clearContent();
        ItemStack second = bag("bag_hopper");
        openFiveDiamonds(helper, player, second);
        player.drop(player.getInventory().removeItem(0, 1), false, net.minecraft.util.Prediction.SERVER_ONLY);
        player.doTick();
        helper.assertFalse(isOpen(player), "the menu stayed open after the bag was dropped");
        assertFive(helper, player, "dropped");
        helper.succeed();
    }

    @GameTest
    public void deathWithTheMenuOpen(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        ItemStack bag = bag("bag_chest");
        bag.set(DataComponents.CONTAINER, ItemContainerContents.fromItems(List.of(new ItemStack(Items.DIAMOND, 2),
                new ItemStack(Items.DIAMOND, 3))));
        AbstractContainerMenu menu = openFromHotbar(helper, player, bag);
        menu.clicked(0, 0, ContainerInput.QUICK_MOVE, player);
        // The mock player does not die from damage (as in MsmKeyBindGameTest): the death is made by hand in vanilla's order,
        // no health, the inventory dropped, then Fabric's death event.
        try (Recorder recorder = new Recorder(player)) {
            player.setHealth(0);
            player.getInventory().dropAll();
            ServerLivingEntityEvents.AFTER_DEATH.invoker().afterDeath(player, helper.getLevel().damageSources().genericKill());
            helper.assertFalse(player.containerMenu == menu, "the menu stayed open after death");
            helper.assertValueEqual(recorder.all(), List.of("bag_closed"), "events at death");
        }
        helper.assertFalse(menu.stillValid(player), "the menu is still valid after death");
        menu.clicked(1, 0, ContainerInput.QUICK_MOVE, player);
        helper.assertValueEqual(held(player, Items.DIAMOND) + onGround(helper, player, Items.DIAMOND), 5, "diamonds after death");
        long bags = onGround(helper, player).stream().filter(e -> e.getItem().is(item("bag_chest"))).count();
        helper.assertValueEqual(bags, 1L, "bags on the ground");
        helper.succeed();
    }

    @GameTest
    public void leavingWithTheMenuOpen(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        ItemStack bag = bag("bag_chest");
        AbstractContainerMenu menu = openFiveDiamonds(helper, player, bag);
        menu.clicked(0, 0, ContainerInput.QUICK_MOVE, player);
        try (Recorder recorder = new Recorder(player)) {
            player.connection.onDisconnect(new DisconnectionDetails(Component.literal("B450 test")));
            helper.assertValueEqual(recorder.all(), List.of("bag_closed"), "events when leaving");
        }
        helper.assertValueEqual(count(bag, Items.DIAMOND), 0, "diamonds left in the bag");
        helper.assertValueEqual(held(player, Items.DIAMOND), 5, "diamonds in the saved inventory");
        helper.assertFalse(menu.stillValid(player), "the menu is still valid after leaving");
        helper.succeed();
    }

    @GameTest
    public void twoPlayersKeepTheirOwnBags(GameTestHelper helper) {
        ServerPlayer ann = player(helper, GameType.SURVIVAL);
        ServerPlayer ben = player(helper, GameType.SURVIVAL);
        ItemStack annBag = bag("bag_chest", new ItemStack(Items.DIAMOND, 5));
        ItemStack benBag = annBag.copy(); // as a creative pick or another route would copy it (limit Q14)
        AbstractContainerMenu annMenu = openFromHotbar(helper, ann, annBag);
        AbstractContainerMenu benMenu = openFromHotbar(helper, ben, benBag);
        annMenu.clicked(0, 0, ContainerInput.QUICK_MOVE, ann);
        benMenu.setCarried(new ItemStack(Items.EMERALD));
        benMenu.clicked(1, 0, ContainerInput.PICKUP, ben);
        helper.assertValueEqual(count(annBag, Items.DIAMOND), 0, "Ann's bag diamonds");
        helper.assertValueEqual(count(annBag, Items.EMERALD), 0, "Ann's bag emeralds");
        helper.assertValueEqual(count(benBag, Items.DIAMOND), 5, "Ben's bag diamonds");
        helper.assertValueEqual(count(benBag, Items.EMERALD), 1, "Ben's bag emeralds");
        // Ben's menu cannot be used by Ann.
        benMenu.clicked(0, 0, ContainerInput.QUICK_MOVE, ann);
        helper.assertValueEqual(count(benBag, Items.DIAMOND), 5, "Ben's bag after Ann's click");
        ann.closeContainer();
        ben.closeContainer();
        helper.assertValueEqual(held(ann, Items.DIAMOND), 5, "Ann's diamonds");
        helper.assertValueEqual(held(ben, Items.DIAMOND), 5, "Ben's diamonds");
        helper.succeed();
    }

    // Bundles (ADR 0095 D4)

    @GameTest
    public void bundleInsertsAndTakesOut(GameTestHelper helper) {
        ServerPlayer player = player(helper, GameType.SURVIVAL);
        AbstractContainerMenu menu = player.inventoryMenu;
        // Inventory menu slots 9..35 are inventory indexes 9..35.
        ItemStack bundle = new ItemStack(item("bag_bundle"));
        player.getInventory().setItem(9, bundle);
        player.getInventory().setItem(10, new ItemStack(Items.DIAMOND, 10));
        menu.clicked(9, 0, ContainerInput.PICKUP, player);
        helper.assertTrue(menu.getCarried().is(item("bag_bundle")), "the bundle is not on the cursor: " + menu.getCarried());
        // Insert: a left-click with the bundle on the cursor onto the diamonds.
        menu.clicked(10, 0, ContainerInput.PICKUP, player);
        ItemStack carried = menu.getCarried();
        helper.assertTrue(carried.is(item("bag_bundle")), "the bundle left the cursor: " + carried);
        helper.assertValueEqual(count(carried, Items.DIAMOND), 10, "diamonds in the bundle");
        helper.assertTrue(player.getInventory().getItem(10).isEmpty(), "diamonds left in their slot");
        helper.assertTrue(carried.getItem().isBarVisible(carried), "no fullness bar");
        helper.assertFalse(BundleContents.canItemBeInBundle(bag("bag_chest")), "a bag fits in the bundle");
        menu.clicked(9, 0, ContainerInput.PICKUP, player);
        // Take out: a right-click on the bundle with an empty cursor.
        menu.clicked(9, 1, ContainerInput.PICKUP, player);
        helper.assertTrue(menu.getCarried().is(Items.DIAMOND) && menu.getCarried().getCount() == 10, "taken out: " + menu.getCarried());
        helper.assertValueEqual(count(player.getInventory().getItem(9), Items.DIAMOND), 0, "diamonds left in the bundle");
        menu.setCarried(ItemStack.EMPTY);
        helper.succeed();
    }
}
