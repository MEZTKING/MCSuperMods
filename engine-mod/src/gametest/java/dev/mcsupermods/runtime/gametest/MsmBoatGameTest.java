package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.boat.MsmBoatItem;
import dev.mcsupermods.runtime.registry.boat.MsmBoats;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.dispenser.BoatDispenseItemBehavior;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.game.ServerboundPlayerLoadedPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityDimensions;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.entity.vehicle.boat.Boat;
import net.minecraft.world.entity.vehicle.boat.ChestBoat;
import net.minecraft.world.entity.vehicle.boat.ChestRaft;
import net.minecraft.world.entity.vehicle.boat.Raft;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.BoatItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.DispenserBlock;
import net.minecraft.world.level.block.entity.DispenserBlockEntity;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Boats and chest boats of project woods (ADR 0110 D1 as amended after B524; B536). Test items: {@code bt_maple_boat}
 * ({@code chest}; companion {@code bt_maple_chest_boat}), {@code bt_reed_raft} ({@code chest} and {@code raft}; companion
 * {@code bt_reed_chest_raft}) and {@code bt_plain_boat} ({@code wood_texture: minecraft:oak}, no chest). The tests run in
 * {@code mob2_yard} (a glass box on a stone floor, inside y 1 to 10) with a pool of water at y 1, and look only at the
 * entities and items of their own subjects.
 */
public class MsmBoatGameTest {
    private static final String YARD = "msm_runtime_gametest:mob2_yard";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    private static EntityType<?> type(String path) {
        return BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    /** Water at y 1 over x and z {@code from} to {@code to}, ringed by stone. */
    private static void pool(GameTestHelper helper, int from, int to) {
        for (int x = from - 1; x <= to + 1; x++) {
            for (int z = from - 1; z <= to + 1; z++) {
                boolean inside = x >= from && x <= to && z >= from && z <= to;
                helper.setBlock(new BlockPos(x, 1, z), inside ? Blocks.WATER : Blocks.STONE);
            }
        }
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, Vec3 at, float pitch) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        Vec3 abs = helper.absoluteVec(at);
        player.snapTo(abs.x, abs.y, abs.z, 0f, pitch);
        player.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
        return player;
    }

    private static void leave(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            player.stopRiding();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    private static List<AbstractBoat> boats(GameTestHelper helper, EntityType<?> type) {
        AABB area = new AABB(helper.absolutePos(BlockPos.ZERO)).expandTowards(17, 12, 17);
        return helper.getLevel().getEntitiesOfClass(AbstractBoat.class, area, b -> b.getType() == type);
    }

    private static int dropped(GameTestHelper helper, Item item) {
        AABB area = new AABB(helper.absolutePos(BlockPos.ZERO)).expandTowards(17, 12, 17);
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, area, e -> e.getItem().is(item)).stream()
                .mapToInt(e -> e.getItem().getCount()).sum();
    }

    /** Uses the held stack the way a right-click does (the server's game mode), looking straight down from above the pool. */
    private static AbstractBoat place(GameTestHelper helper, String itemPath, String typePath, Vec3 at) {
        ServerLevel level = helper.getLevel();
        ServerPlayer placer = player(helper, at, 90f);
        placer.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(itemPath)));
        helper.assertTrue(placer.gameMode.useItem(placer, level, placer.getMainHandItem(), InteractionHand.MAIN_HAND).consumesAction(),
                itemPath + " was not used");
        helper.assertTrue(placer.getMainHandItem().isEmpty(), itemPath + " left in a survival hand: " + placer.getMainHandItem());
        leave(helper, placer);
        List<AbstractBoat> placed = boats(helper, type(typePath));
        helper.assertValueEqual(placed.size(), 1, typePath + " boats placed");
        AbstractBoat boat = placed.getFirst();
        Vec3 abs = helper.absoluteVec(at);
        helper.assertTrue(Math.abs(boat.getX() - abs.x) < 0.01 && Math.abs(boat.getZ() - abs.z) < 0.01, typePath + " placed at " + boat.position());
        return boat;
    }

    private static void sameSize(GameTestHelper helper, EntityType<?> ours, EntityType<?> vanilla) {
        EntityDimensions a = ours.getDimensions();
        EntityDimensions b = vanilla.getDimensions();
        helper.assertTrue(a.width() == b.width() && a.height() == b.height() && a.eyeHeight() == b.eyeHeight(),
                ours + " is " + a + ", " + vanilla + " " + b);
        helper.assertValueEqual(ours.clientTrackingRange(), vanilla.clientTrackingRange(), ours + " tracking range");
        helper.assertValueEqual(ours.updateInterval(), vanilla.updateInterval(), ours + " update interval");
    }

    @GameTest
    public void boatItemsRegisterVanillaBoatTypesWithTheirChestBoats(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        helper.assertTrue(item("bt_maple_boat") instanceof MsmBoatItem boatItem && boatItem.boat() == type("bt_maple_boat"),
                "bt_maple_boat is " + item("bt_maple_boat"));
        helper.assertTrue(item("bt_maple_chest_boat") instanceof BoatItem, "bt_maple_chest_boat is " + item("bt_maple_chest_boat"));
        helper.assertTrue(item("bt_reed_chest_raft") instanceof BoatItem, "bt_reed_chest_raft is " + item("bt_reed_chest_raft"));
        helper.assertFalse(BuiltInRegistries.ITEM.containsKey(id("bt_plain_chest_boat")), "a boat without chest has a chest boat");
        helper.assertTrue(type("bt_maple_boat").create(level, net.minecraft.world.entity.EntitySpawnReason.COMMAND) instanceof Boat, "maple is no Boat");
        helper.assertTrue(type("bt_maple_chest_boat").create(level, net.minecraft.world.entity.EntitySpawnReason.COMMAND) instanceof ChestBoat,
                "maple chest is no ChestBoat");
        helper.assertTrue(type("bt_reed_raft").create(level, net.minecraft.world.entity.EntitySpawnReason.COMMAND) instanceof Raft, "reed is no Raft");
        helper.assertTrue(type("bt_reed_chest_raft").create(level, net.minecraft.world.entity.EntitySpawnReason.COMMAND) instanceof ChestRaft,
                "reed chest is no ChestRaft");
        sameSize(helper, type("bt_maple_boat"), EntityTypes.OAK_BOAT);
        sameSize(helper, type("bt_maple_chest_boat"), EntityTypes.OAK_CHEST_BOAT);
        sameSize(helper, type("bt_reed_raft"), EntityTypes.BAMBOO_RAFT);
        sameSize(helper, type("bt_reed_chest_raft"), EntityTypes.BAMBOO_CHEST_RAFT);
        for (String path : List.of("bt_maple_boat", "bt_maple_chest_boat", "bt_reed_raft", "bt_reed_chest_raft", "bt_plain_boat")) {
            helper.assertValueEqual(new ItemStack(item(path)).getMaxStackSize(), 1, path + " stacks to");
            helper.assertTrue(DispenserBlock.DISPENSER_REGISTRY.get(item(path)) instanceof BoatDispenseItemBehavior, path + " has no boat dispenser behaviour");
            helper.assertTrue(MsmRuntime.report().boats().contains(id(path)), path + " is not in the report's boats");
        }
        helper.assertTrue(MsmBoats.of(type("bt_maple_chest_boat")).map(b -> b.wood().equals(id("bt_maple"))).orElse(false), "maple wood");
        helper.assertTrue(MsmBoats.of(type("bt_plain_boat")).map(b -> b.wood().equals(Identifier.withDefaultNamespace("oak"))).orElse(false),
                "plain boat wood");
        helper.succeed();
    }

    @GameTest(structure = YARD, maxTicks = 60)
    public void aBoatAndARaftArePlacedOnWaterAndFloat(GameTestHelper helper) {
        pool(helper, 3, 13);
        AbstractBoat boat = place(helper, "bt_maple_boat", "bt_maple_boat", new Vec3(5.5, 3.0, 5.5));
        AbstractBoat raft = place(helper, "bt_reed_raft", "bt_reed_raft", new Vec3(11.5, 3.0, 11.5));
        helper.assertTrue(raft instanceof Raft, "the raft is " + raft);
        helper.runAfterDelay(40, () -> {
            for (AbstractBoat b : List.of(boat, raft)) {
                double top = helper.absoluteVec(new Vec3(0, 2, 0)).y; // the water surface
                helper.assertTrue(!b.isRemoved() && b.getY() > top - 0.6 && b.getY() < top + 0.1, b.getType() + " floats at " + b.getY() + ", water top " + top);
                helper.assertTrue(helper.getLevel().getFluidState(b.blockPosition()).is(FluidTags.WATER)
                        || helper.getLevel().getFluidState(b.blockPosition().below()).is(FluidTags.WATER), b.getType() + " is not on water");
            }
            helper.succeed();
        });
    }

    @GameTest(structure = YARD, maxTicks = 40)
    public void twoPlayersRideABoatAndASneakingPlayerOpensTheChestBoat(GameTestHelper helper) {
        pool(helper, 3, 13);
        AbstractBoat boat = place(helper, "bt_maple_boat", "bt_maple_boat", new Vec3(5.5, 3.0, 5.5));
        AbstractBoat chest = place(helper, "bt_maple_chest_boat", "bt_maple_chest_boat", new Vec3(11.5, 3.0, 11.5));
        ServerPlayer first = player(helper, new Vec3(6.5, 2.0, 7.5), 0f);
        ServerPlayer second = player(helper, new Vec3(4.5, 2.0, 7.5), 0f);
        helper.assertTrue(first.interactOn(boat, InteractionHand.MAIN_HAND, Vec3.ZERO).consumesAction(), "the first player did not get in");
        helper.assertTrue(second.interactOn(boat, InteractionHand.MAIN_HAND, Vec3.ZERO).consumesAction(), "the second player did not get in");
        helper.assertTrue(first.getVehicle() == boat && second.getVehicle() == boat, "riders: " + boat.getPassengers());
        helper.assertValueEqual(boat.getControllingPassenger(), first, "the boat's driver");

        ServerPlayer sneaker = player(helper, new Vec3(11.5, 2.0, 13.5), 0f);
        sneaker.setShiftKeyDown(true);
        helper.assertTrue(sneaker.interactOn(chest, InteractionHand.MAIN_HAND, Vec3.ZERO).consumesAction(), "the chest boat did not open");
        helper.assertTrue(sneaker.containerMenu instanceof ChestMenu menu && menu.getContainer() == chest,
                "the open menu is " + sneaker.containerMenu);
        helper.assertValueEqual(((ChestBoat) chest).getContainerSize(), 27, "the chest boat holds");
        helper.assertFalse(sneaker.isPassenger(), "sneaking got into the chest boat");
        sneaker.closeContainer();
        sneaker.setShiftKeyDown(false);
        helper.assertTrue(sneaker.interactOn(chest, InteractionHand.MAIN_HAND, Vec3.ZERO).consumesAction() && sneaker.getVehicle() == chest,
                "not sneaking did not ride the chest boat");
        leave(helper, first, second, sneaker);
        helper.succeed();
    }

    @GameTest(structure = YARD, maxTicks = 40)
    public void breakingABoatDropsItsItemAndAChestBoatAlsoItsContents(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        pool(helper, 3, 13);
        AbstractBoat boat = place(helper, "bt_maple_boat", "bt_maple_boat", new Vec3(5.5, 3.0, 5.5));
        AbstractBoat raft = place(helper, "bt_reed_chest_raft", "bt_reed_chest_raft", new Vec3(11.5, 3.0, 11.5));
        ((ChestRaft) raft).setItem(0, new ItemStack(Items.DIAMOND, 3));
        ServerPlayer breaker = player(helper, new Vec3(8.5, 2.0, 8.5), 0f);
        for (AbstractBoat b : List.of(boat, raft)) {
            for (int hits = 0; hits < 10 && !b.isRemoved(); hits++) {
                b.hurtServer(level, level.damageSources().playerAttack(breaker), 10f);
            }
            helper.assertTrue(b.isRemoved(), b.getType() + " did not break");
        }
        leave(helper, breaker);
        helper.runAfterDelay(2, () -> {
            helper.assertValueEqual(dropped(helper, item("bt_maple_boat")), 1, "dropped maple boats");
            helper.assertValueEqual(dropped(helper, item("bt_reed_chest_raft")), 1, "dropped reed chest rafts");
            helper.assertValueEqual(dropped(helper, Items.DIAMOND), 3, "dropped diamonds");
            helper.succeed();
        });
    }

    @GameTest(structure = YARD, maxTicks = 40)
    public void aDispenserPutsTheProjectBoatOnTheWaterInFrontAsForVanillaBoats(GameTestHelper helper) {
        pool(helper, 5, 13);
        BlockPos at = new BlockPos(4, 1, 8); // in the pool's stone ring, facing the water to the east
        BlockPos power = at.west();
        helper.setBlock(at, Blocks.DISPENSER.defaultBlockState().setValue(DispenserBlock.FACING, Direction.EAST));
        helper.runAfterDelay(1, () -> {
            DispenserBlockEntity dispenser = (DispenserBlockEntity) helper.getBlockEntity(at, DispenserBlockEntity.class);
            dispenser.insertItem(new ItemStack(item("bt_plain_boat")));
            dispenser.insertItem(new ItemStack(item("bt_maple_chest_boat")));
            helper.setBlock(power, Blocks.REDSTONE_BLOCK);
        });
        helper.runAfterDelay(10, () -> {
            helper.setBlock(power, Blocks.AIR);
        });
        helper.runAfterDelay(14, () -> helper.setBlock(power, Blocks.REDSTONE_BLOCK));
        helper.runAfterDelay(24, () -> {
            DispenserBlockEntity dispenser = (DispenserBlockEntity) helper.getBlockEntity(at, DispenserBlockEntity.class);
            for (int slot = 0; slot < dispenser.getContainerSize(); slot++) {
                helper.assertTrue(dispenser.getItem(slot).isEmpty(), "slot " + slot + " still holds " + dispenser.getItem(slot));
            }
            for (String path : List.of("bt_plain_boat", "bt_maple_chest_boat")) {
                List<AbstractBoat> placed = boats(helper, type(path));
                helper.assertValueEqual(placed.size(), 1, path + " boats dispensed");
                BlockPos front = helper.absolutePos(at.east());
                AbstractBoat b = placed.getFirst();
                helper.assertTrue(Math.abs(b.getX() - (front.getX() + 0.5)) < 1.5 && Math.abs(b.getZ() - (front.getZ() + 0.5)) < 1.5,
                        path + " dispensed to " + b.position() + ", in front " + front);
                helper.assertValueEqual(dropped(helper, item(path)), 0, path + " dropped as an item");
            }
            helper.succeed();
        });
    }
}
