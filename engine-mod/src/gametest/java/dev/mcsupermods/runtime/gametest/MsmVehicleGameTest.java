package dev.mcsupermods.runtime.gametest;

import com.mojang.authlib.GameProfile;
import dev.mcsupermods.runtime.controls.KeyBinds;
import dev.mcsupermods.runtime.net.KeyPayload;
import dev.mcsupermods.runtime.registry.vehicle.VehicleHorn;
import io.netty.channel.embedded.EmbeddedChannel;
import java.util.UUID;
import net.minecraft.network.Connection;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.PacketFlow;
import net.minecraft.network.protocol.game.ClientboundBundlePacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.CommonListenerCookie;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.vehicle.MsmStorageVehicle;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicleItem;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicles;
import dev.mcsupermods.runtime.registry.vehicle.VehiclePhysics;
import dev.mcsupermods.runtime.registry.vehicle.VehicleSeats;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.Mth;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.HasCustomInventoryScreen;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.gametest.framework.GameTestHelper;

/**
 * Vehicles (ADR 0090; B412) on the {@code vh_*} definitions in {@code msm/msm_test/vehicle/}: {@code vh_kart} (ground,
 * fuel, two seats, camera 8, health 10 with iron repair, red and blue paint, every trigger, ramming, explode events),
 * {@code vh_boat} (water, two rows of storage), {@code vh_tank} (turret, ammunition, {@code immune_to},
 * {@code explodes} 2), {@code vh_heli} (hover, no pick-up), {@code vh_plane} (air), {@code vh_amphi} (amphibious, names
 * overridden), {@code vh_raft} (ground that floats). The horn ({@code vh_kart}'s {@code engine.horn}, B421) is heard by
 * a listening player ({@code Ears}). Players act through {@code Player.interactOn},
 * {@code Player.attack} and {@code ItemStack.use}, the calls the server's packets make. On the server a vehicle without a
 * driver moves itself; a driven one is moved by its driver's client (ADR 0090 D4), which a GameTest has not got, so the
 * driven tests read the server's part (fuel, triggers, seats) and drive the physics step directly.
 */
public class MsmVehicleGameTest {
    private static final Vec3 MID = new Vec3(3.5, 1, 3.5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static EntityType<MsmVehicle> type(String path) {
        return (EntityType<MsmVehicle>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static Item item(String path) {
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    /** A vanilla item by id (the dye constants are a colour collection on 26.x). */
    private static Item vanilla(String path) {
        return BuiltInRegistries.ITEM.getValue(Identifier.withDefaultNamespace(path));
    }

    private static MsmVehicle spawn(GameTestHelper helper, String path, Vec3 at) {
        return helper.spawn(type(path), at);
    }

    /** A stone floor at y 0 over the whole test area. */
    private static void floor(GameTestHelper helper) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                helper.setBlock(x, 0, z, Blocks.STONE);
            }
        }
    }

    /** A floor, stone walls around and water four deep inside (y 1 to 4, x and z 1 to 6). */
    private static void pool(GameTestHelper helper) {
        floor(helper);
        for (int y = 1; y <= 4; y++) {
            for (int x = 0; x < 8; x++) {
                for (int z = 0; z < 8; z++) {
                    boolean wall = x == 0 || z == 0 || x == 7 || z == 7;
                    helper.setBlock(x, y, z, wall ? Blocks.STONE : Blocks.WATER);
                }
            }
        }
    }

    /** The water surface of {@link #pool}, absolute. */
    private static double surface(GameTestHelper helper) {
        BlockPos top = helper.absolutePos(new BlockPos(3, 4, 3));
        return top.getY() + helper.getLevel().getFluidState(top).getHeight(helper.getLevel(), top);
    }

    /** A survival player in the level at {@code at} (relative). Removed by {@link #remove}. */
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, Vec3 at) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(at));
        player.setGameMode(GameType.SURVIVAL);
        return player;
    }

    private static void remove(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            player.stopRiding();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    /** A right click on the vehicle with {@code stack} in the main hand. */
    private static InteractionResult click(ServerPlayer player, MsmVehicle vehicle, ItemStack stack) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        return player.interactOn(vehicle, InteractionHand.MAIN_HAND, vehicle.position());
    }

    /** The first stack of {@code item} in the player's inventory, or empty. */
    private static ItemStack inInventory(ServerPlayer player, Item item) {
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            if (player.getInventory().getItem(i).is(item)) {
                return player.getInventory().getItem(i);
            }
        }
        return ItemStack.EMPTY;
    }

    private static List<ItemEntity> drops(GameTestHelper helper, Vec3 around, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(around, around).inflate(4), e -> e.getItem().is(item));
    }

    private static int count(List<ItemEntity> drops) {
        return drops.stream().mapToInt(e -> e.getItem().getCount()).sum();
    }

    private static void assertNear(GameTestHelper helper, double actual, double expected, double tolerance, String what) {
        helper.assertTrue(Math.abs(actual - expected) <= tolerance, what + ": expected " + expected + " (+-" + tolerance + "), got " + actual);
    }

    /** B406: yaw compared modulo 360. */
    private static void assertYaw(GameTestHelper helper, float actual, float expected, String what) {
        helper.assertTrue(Math.abs(Mth.wrapDegrees(actual - expected)) < 1e-3, what + ": expected yaw " + expected + ", got " + actual);
    }

    private static MsmVehicle saveAndLoad(GameTestHelper helper, MsmVehicle vehicle) {
        ServerLevel level = helper.getLevel();
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        vehicle.saveWithoutId(out);
        CompoundTag tag = out.buildResult();
        @SuppressWarnings("unchecked")
        EntityType<MsmVehicle> type = (EntityType<MsmVehicle>) vehicle.getType();
        MsmVehicle copy = type.create(level, EntitySpawnReason.LOAD);
        helper.assertTrue(copy != null, "no copy");
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
        return copy;
    }

    /**
     * Records the events of one vehicle: GameTests run side by side, so other tests' vehicles of the same type are left
     * out by {@code only}.
     */
    private static final class Recorder implements EventListener, AutoCloseable {
        final Identifier owner;
        final Predicate<EventContext> only;
        final List<String> events = new ArrayList<>();
        final List<EventContext> contexts = new ArrayList<>();

        Recorder(String owner, Predicate<EventContext> only) {
            this.owner = id(owner);
            this.only = only;
            EventRunner.addListener(this);
        }

        /** The events of {@code vehicle} only. */
        Recorder(MsmVehicle vehicle) {
            this(BuiltInRegistries.ENTITY_TYPE.getKey(vehicle.getType()).getPath(), ctx -> ctx.entity() == vehicle);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.equals(this.owner) && only.test(ctx)) {
                events.add(event.getPath());
                contexts.add(ctx);
            }
        }

        @Override
        public void onAction(Identifier owner, Identifier event, Action action, EventContext ctx) {}

        int count(String event) {
            return (int) events.stream().filter(event::equals).count();
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    // Registration

    @GameTest
    public void everyTestVehicleRegistersAnEntityTypeAndAnItemUnderOneId(GameTestHelper helper) {
        List<Identifier> ids = MsmRuntime.report().vehicles();
        for (String path : List.of("vh_kart", "vh_boat", "vh_tank", "vh_heli", "vh_plane", "vh_amphi", "vh_raft")) {
            helper.assertTrue(ids.contains(id(path)), path + " not in the report: " + ids);
            helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id(path)), path + " has no entity type");
            helper.assertTrue(item(path) instanceof MsmVehicleItem, path + " has no vehicle item: " + item(path));
            helper.assertTrue(MsmVehicles.entry(id(path)).isPresent(), path + " has no entry");
        }
        helper.assertFalse(MsmRuntime.report().errors().stream().anyMatch(e -> e.contains("/vehicle/")),
                "vehicle errors: " + MsmRuntime.report().errors());
        helper.assertFalse(MsmRuntime.report().warnings().stream().anyMatch(w -> w.contains("/vehicle/")),
                "vehicle warnings: " + MsmRuntime.report().warnings());
        MsmVehicle boat = spawn(helper, "vh_boat", MID);
        MsmVehicle kart = spawn(helper, "vh_kart", MID.add(0, 3, 0));
        helper.assertTrue(boat instanceof MsmStorageVehicle && boat instanceof HasCustomInventoryScreen, "a vehicle with storage opens with the inventory key");
        helper.assertFalse(kart instanceof HasCustomInventoryScreen, "a vehicle without storage would take its riders' inventory key");
        helper.assertFalse((Object) kart instanceof LivingEntity, "a vehicle is not living");
        helper.assertValueEqual(item("vh_kart").getDefaultMaxStackSize(), 1, "vehicle items stack");
        helper.assertValueEqual(new ItemStack(item("vh_amphi")).getItem().getDescriptionId(), "item.msm_test.vh_amphi_custom", "item.name");
        MsmVehicle amphi = spawn(helper, "vh_amphi", MID.add(0, 6, 0));
        helper.assertValueEqual(amphi.getName(), Component.translatable("entity.msm_test.vh_amphi_custom"), "name");
        helper.assertValueEqual(kart.getPickResult().getItem(), item("vh_kart"), "pick result");
        helper.succeed();
    }

    // Placing (ADR 0090 D5)

    @GameTest(maxTicks = 20)
    public void theItemPlacesOnTheGroundFacingThePlayerAndFiresOnPlace(GameTestHelper helper) {
        floor(helper);
        ServerPlayer player = player(helper, MID);
        player.setYRot(90);
        player.setXRot(90);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("vh_kart")));
        try (Recorder recorder = new Recorder("vh_kart", ctx -> ctx.player() == player)) {
            InteractionResult result = player.getMainHandItem().use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
            helper.assertTrue(result.consumesAction(), "use: " + result);
            List<MsmVehicle> karts = helper.getLevel().getEntitiesOfClass(MsmVehicle.class, new AABB(helper.absoluteVec(MID), helper.absoluteVec(MID)).inflate(2));
            helper.assertValueEqual(karts.size(), 1, "karts placed");
            MsmVehicle kart = karts.getFirst();
            assertNear(helper, kart.getY(), helper.absoluteVec(MID).y, 1e-6, "on the floor's top");
            assertYaw(helper, kart.getYRot(), 90, "facing the player's look");
            helper.assertTrue(player.getMainHandItem().isEmpty(), "the item was not used up: " + player.getMainHandItem());
            helper.assertValueEqual(recorder.events, List.of("placed"), "on_place");
            helper.assertTrue(recorder.contexts.getFirst().player() == player, "on_place player");
            // The spot is taken now: a second kart does not fit.
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("vh_kart")));
            InteractionResult second = player.getMainHandItem().use(helper.getLevel(), player, InteractionHand.MAIN_HAND);
            helper.assertFalse(second.consumesAction(), "a second kart in the same place: " + second);
            helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "the refused item stays");
        }
        remove(helper, player);
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void placesOnFollowsTheMode(GameTestHelper helper) {
        pool(helper);
        ServerPlayer player = player(helper, new Vec3(3.5, 6, 3.5));
        player.setXRot(90);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("vh_kart")));
        helper.assertFalse(player.getMainHandItem().use(helper.getLevel(), player, InteractionHand.MAIN_HAND).consumesAction(),
                "a ground kart placed on water");
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("vh_boat")));
        helper.assertTrue(player.getMainHandItem().use(helper.getLevel(), player, InteractionHand.MAIN_HAND).consumesAction(),
                "a boat not placed on water");
        List<MsmVehicle> boats = helper.getLevel().getEntitiesOfClass(MsmVehicle.class, new AABB(helper.absolutePos(BlockPos.ZERO)).expandTowards(8, 8, 8),
                v -> v.getType() == type("vh_boat"));
        helper.assertValueEqual(boats.size(), 1, "boats");
        assertNear(helper, boats.getFirst().getY(), surface(helper), 1e-3, "the boat on the surface");
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("vh_amphi")));
        player.setYRot(0);
        player.snapTo(helper.absoluteVec(new Vec3(2, 6, 5.5)));
        helper.assertTrue(player.getMainHandItem().use(helper.getLevel(), player, InteractionHand.MAIN_HAND).consumesAction(),
                "an amphibious vehicle (any) not placed on water");
        // On the wall's top (ground): the boat refuses, the kart is placed.
        player.snapTo(helper.absoluteVec(new Vec3(0.5, 6, 0.5)));
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item("vh_boat")));
        helper.assertFalse(player.getMainHandItem().use(helper.getLevel(), player, InteractionHand.MAIN_HAND).consumesAction(),
                "a boat placed on stone");
        remove(helper, player);
        helper.succeed();
    }

    // Picking up (ADR 0090 D5)

    @GameTest(maxTicks = 20)
    public void aSneakingHitPicksUpWithFuelDamagePaintAndName(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        kart.fuel().setFuel(120);
        kart.setDamage(3);
        kart.paint().set("red");
        kart.setCustomName(Component.literal("Zippy"));
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        player.setShiftKeyDown(true);
        player.attack(kart);
        helper.assertTrue(kart.isRemoved(), "the kart is still there");
        ItemStack stack = inInventory(player, item("vh_kart"));
        helper.assertTrue(stack.is(item("vh_kart")), "the player did not get the kart");
        CustomData data = stack.get(DataComponents.CUSTOM_DATA);
        helper.assertTrue(data != null, "no kept state");
        CompoundTag state = data.copyTag().getCompoundOrEmpty(MsmVehicleItem.STATE);
        helper.assertValueEqual(state.getIntOr("fuel", 0), 120, "kept fuel");
        assertNear(helper, state.getFloatOr("damage", 0), 3, 1e-6, "kept damage");
        helper.assertValueEqual(state.getStringOr("paint", ""), "red", "kept paint");
        helper.assertValueEqual(stack.getHoverName().getString(), "Zippy", "kept name");
        MsmVehicle again = MsmVehicleItem.place(helper.getLevel(), MsmVehicles.entry(id("vh_kart")).orElseThrow(), stack, player,
                helper.absoluteVec(MID), 0);
        helper.assertTrue(again != null, "placing the picked-up kart failed");
        helper.assertValueEqual(again.fuel().fuel(), 120, "fuel after placing again");
        assertNear(helper, again.getDamage(), 3, 1e-6, "damage after placing again");
        helper.assertValueEqual(again.paint().current().map(p -> p.id()).orElse(""), "red", "paint after placing again");
        helper.assertValueEqual(again.getCustomName() == null ? "" : again.getCustomName().getString(), "Zippy", "name after placing again");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void pickingUpKeepsAmmunitionWithinTheCapacity(GameTestHelper helper) {
        floor(helper);
        MsmVehicle tank = spawn(helper, "vh_tank", MID);
        tank.weapons().setAmmo(0, 7);
        helper.assertValueEqual(tank.ammo(0), 7, "loaded");
        tank.weapons().setAmmo(0, 50);
        helper.assertValueEqual(tank.ammo(0), 10, "ammunition above the capacity");
        tank.weapons().setAmmo(0, 7);
        ItemStack stack = MsmVehicleItem.stackOf(tank);
        tank.discard();
        CompoundTag state = stack.get(DataComponents.CUSTOM_DATA).copyTag().getCompoundOrEmpty(MsmVehicleItem.STATE);
        helper.assertValueEqual(state.getCompoundOrEmpty("ammo").getIntOr("cannon", 0), 7, "kept ammunition");
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        MsmVehicle again = MsmVehicleItem.place(helper.getLevel(), MsmVehicles.entry(id("vh_tank")).orElseThrow(), stack, player,
                helper.absoluteVec(MID), 0);
        helper.assertValueEqual(again.ammo(0), 7, "ammunition after placing again");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void pickingUpDropsTheStorage(GameTestHelper helper) {
        floor(helper);
        MsmVehicle boat = spawn(helper, "vh_boat", MID);
        boat.storage().orElseThrow().container().setItem(0, new ItemStack(Items.DIRT, 5));
        boat.storage().orElseThrow().container().setItem(17, new ItemStack(Items.APPLE, 2));
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        player.setShiftKeyDown(true);
        player.attack(boat);
        helper.assertTrue(boat.isRemoved(), "the boat is still there");
        helper.assertTrue(inInventory(player, item("vh_boat")).is(item("vh_boat")), "the player did not get the boat");
        Vec3 at = helper.absoluteVec(MID);
        helper.assertValueEqual(count(drops(helper, at, Items.DIRT)), 5, "dirt dropped");
        helper.assertValueEqual(count(drops(helper, at, Items.APPLE)), 2, "apples dropped");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void noPickUpWhenOccupiedOrSwitchedOff(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        MsmVehicle heli = spawn(helper, "vh_heli", MID.add(0, 0, 3));
        ServerPlayer rider = player(helper, MID.add(-2, 0, 0));
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        helper.assertTrue(rider.startRiding(kart), "the rider could not get in");
        player.setShiftKeyDown(true);
        kart.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(player), 1);
        helper.assertFalse(kart.isRemoved(), "an occupied kart was picked up");
        assertNear(helper, kart.getDamage(), 1, 1e-6, "an occupied kart is hit instead");
        heli.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(player), 1);
        helper.assertFalse(heli.isRemoved(), "pick_up: false was picked up");
        assertNear(helper, heli.getDamage(), 1, 1e-6, "pick_up: false is hit instead");
        remove(helper, rider, player);
        helper.succeed();
    }

    // Seats (ADR 0090 D2, D8)

    @GameTest(maxTicks = 20)
    public void seatsTakePlayersOnlyAndTheFirstDrives(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        kart.setYRot(90);
        ServerPlayer first = player(helper, MID.add(2, 0, 0));
        ServerPlayer second = player(helper, MID.add(-2, 0, 0));
        ServerPlayer third = player(helper, MID.add(0, 0, 2));
        try (Recorder recorder = new Recorder(kart)) {
            click(first, kart, ItemStack.EMPTY);
            click(second, kart, ItemStack.EMPTY);
            InteractionResult full = click(third, kart, ItemStack.EMPTY);
            helper.assertTrue(first.getVehicle() == kart && second.getVehicle() == kart, "two seats not taken");
            helper.assertFalse(third.isPassenger(), "a third player in a two-seat kart");
            helper.assertFalse(full.consumesAction(), "a full kart answered " + full);
            helper.assertTrue(kart.getControllingPassenger() == first && kart.driver() == first, "the first seat does not drive");
            helper.assertValueEqual(recorder.count("in"), 2, "on_mount per player");
            helper.assertTrue(recorder.contexts.getFirst().player() == first, "on_mount player");
        }
        // Seat 0 at (0, 0.5, 0.2) and seat 1 at (0, 0.5, -0.6), x right and z forwards, turned with the hull (yaw 90: west).
        Vec3 seat0 = kart.getPassengerRidingPosition(first).subtract(kart.position());
        Vec3 seat1 = kart.getPassengerRidingPosition(second).subtract(kart.position());
        assertNear(helper, seat0.x, -0.2, 1e-4, "seat 0 x");
        assertNear(helper, seat0.y, 0.5, 1e-4, "seat 0 y");
        assertNear(helper, seat0.z, 0, 1e-4, "seat 0 z");
        assertNear(helper, seat1.x, 0.6, 1e-4, "seat 1 x");
        assertNear(helper, VehicleSeats.toWorld(new Vec3(1, 0, 0), 0).x, -1, 1e-9, "right of south is west");
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, MID.add(0, 0, -2));
        MsmVehicle boat = spawn(helper, "vh_boat", MID.add(0, 3, 0));
        helper.assertFalse(pig.startRiding(boat), "a pig got into a vehicle");
        remove(helper, first, second, third);
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void gettingOutPutsThePlayerBesideTheHullAndResetsTheCamera(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        double base = player.getAttributeValue(Attributes.CAMERA_DISTANCE);
        try (Recorder recorder = new Recorder(kart)) {
            click(player, kart, ItemStack.EMPTY);
            helper.assertTrue(player.getVehicle() == kart, "not seated");
            assertNear(helper, player.getAttributeValue(Attributes.CAMERA_DISTANCE), 8, 1e-6, "camera distance while seated");
            player.stopRiding();
            helper.assertFalse(player.isPassenger(), "still seated");
            assertNear(helper, player.getAttributeValue(Attributes.CAMERA_DISTANCE), base, 1e-6, "camera distance after getting out");
            helper.assertValueEqual(recorder.count("out"), 1, "on_dismount");
        }
        helper.assertFalse(player.getBoundingBox().intersects(kart.getBoundingBox()), "got out inside the hull: " + player.position());
        // Seat 0 is on the centre line, so the right side first: right of a hull facing south is west.
        helper.assertTrue(player.getX() < kart.getX() - kart.getBbWidth() / 2, "not on the right side: " + player.position() + " kart " + kart.position());
        assertNear(helper, player.getY(), kart.getY(), 0.01, "standing on the floor");
        remove(helper, player);
        helper.succeed();
    }

    // Moving without a driver (ADR 0090 D3, D4)

    @GameTest(maxTicks = 60)
    public void aGroundVehicleFallsAndLands(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", new Vec3(3.5, 6, 3.5));
        double floor = helper.absoluteVec(MID).y;
        helper.runAfterDelay(5, () -> helper.assertTrue(kart.getY() < helper.absoluteVec(MID).y + 4.9, "not falling: " + kart.getY()));
        helper.succeedWhen(() -> {
            helper.assertTrue(kart.onGround(), "not landed: " + kart.getY());
            assertNear(helper, kart.getY(), floor, 1e-3, "landed on the floor");
        });
    }

    @GameTest(maxTicks = 100)
    public void boatsAmphibiansAndFloatingCarsFloatAtTheWaterline(GameTestHelper helper) {
        pool(helper);
        MsmVehicle boat = spawn(helper, "vh_boat", new Vec3(2.5, 2, 2.5));
        MsmVehicle amphi = spawn(helper, "vh_amphi", new Vec3(5, 2, 5));
        MsmVehicle raft = spawn(helper, "vh_raft", new Vec3(2.5, 1.5, 5));
        double rest = surface(helper) - VehiclePhysics.DRAFT;
        helper.runAfterDelay(80, () -> {
            for (MsmVehicle v : List.of(boat, amphi, raft)) {
                assertNear(helper, v.getY(), rest, 0.05, v.getType().getDescriptionId() + " resting depth");
                helper.assertTrue(Math.abs(v.getDeltaMovement().y) < 0.02, v.getType().getDescriptionId() + " still bobbing: " + v.getDeltaMovement());
            }
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 80)
    public void aGroundVehicleSinksInDeepWater(GameTestHelper helper) {
        pool(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", new Vec3(3.5, 4.2, 3.5));
        double bottom = helper.absoluteVec(MID).y;
        helper.succeedWhen(() -> {
            assertNear(helper, kart.getY(), bottom, 1e-3, "on the bottom of the pool");
            helper.assertTrue(kart.onGround(), "not on the bottom");
        });
    }

    @GameTest(maxTicks = 40)
    public void aPlaneWithoutThrottleStallsAndAHoverVehicleSinksSlowly(GameTestHelper helper) {
        floor(helper);
        MsmVehicle plane = spawn(helper, "vh_plane", new Vec3(2, 6, 2));
        MsmVehicle heli = spawn(helper, "vh_heli", new Vec3(5.5, 6, 5.5));
        double start = helper.absoluteVec(new Vec3(0, 6, 0)).y;
        helper.runAfterDelay(30, () -> {
            helper.assertTrue(plane.onGround(), "the stalled plane has not landed: " + (plane.getY() - start));
            double dropped = start - heli.getY();
            helper.assertTrue(dropped > 0.5 && dropped < 2, "the unpowered hover vehicle dropped " + dropped + " in 30 ticks");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 20)
    public void aDrivenPlaneHandsNoFallToItsPilot(GameTestHelper helper) {
        floor(helper);
        MsmVehicle plane = spawn(helper, "vh_plane", MID);
        MsmVehicle kart = spawn(helper, "vh_kart", MID.add(0, 4, 0));
        ServerPlayer pilot = player(helper, MID.add(2, 0, 0));
        ServerPlayer driver = player(helper, MID.add(-2, 0, 0));
        helper.assertTrue(pilot.startRiding(plane) && driver.startRiding(kart), "not seated");
        plane.fallDistance = 12;
        kart.fallDistance = 12;
        helper.runAfterDelay(1, () -> {
            helper.assertValueEqual(plane.fallDistance, 0.0, "a driven plane's fall distance");
            helper.assertTrue(kart.fallDistance > 0, "a car keeps falling: " + kart.fallDistance);
            remove(helper, pilot, driver);
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 60)
    public void aCoastingVehicleRamsWhatIsInTheWay(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", new Vec3(1.2, 1, 3.5));
        kart.setYRot(-90); // facing east
        kart.setDeltaMovement(0.6, 0, 0);
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new Vec3(5.5, 1, 3.5));
        float full = pig.getHealth();
        helper.succeedWhen(() -> helper.assertTrue(pig.getHealth() < full || !pig.isAlive(), "the pig was not hit"));
    }

    // Driving (server's part)

    @GameTest(maxTicks = 20)
    public void withoutFuelThereIsNoThrust(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        VehiclePhysics.Input forward = new VehiclePhysics.Input(true, false, false, false, false, false, 0, 0);
        helper.assertFalse(kart.fuel().canRun(), "an empty tank runs");
        for (int i = 0; i < 3; i++) {
            kart.movement().step(forward, kart.fuel().canRun());
        }
        assertNear(helper, kart.movement().last().speed(), 0, 1e-9, "speed without fuel");
        kart.fuel().setFuel(50);
        for (int i = 0; i < 3; i++) {
            kart.movement().step(forward, kart.fuel().canRun());
        }
        assertNear(helper, kart.movement().last().speed(), 0.06, 1e-6, "speed after three ticks of throttle");
        helper.assertTrue(spawn(helper, "vh_boat", MID.add(0, 4, 0)).fuel().canRun(), "a vehicle without engine.fuel needs fuel");
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void fuelItemsRefuelUpToTheCapacity(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        ItemStack coal = new ItemStack(Items.COAL, 5);
        helper.assertTrue(click(player, kart, coal).consumesAction(), "coal was not used");
        helper.assertValueEqual(kart.fuel().fuel(), 100, "fuel after one coal");
        helper.assertValueEqual(coal.getCount(), 4, "coal used up");
        click(player, kart, new ItemStack(Items.OAK_LOG));
        helper.assertValueEqual(kart.fuel().fuel(), 120, "fuel after a log (#minecraft:logs)");
        click(player, kart, coal);
        click(player, kart, coal);
        helper.assertValueEqual(kart.fuel().fuel(), 250, "fuel is capped at the capacity");
        helper.assertValueEqual(coal.getCount(), 2, "coal after filling up");
        click(player, kart, coal);
        helper.assertValueEqual(coal.getCount(), 2, "coal used on a full tank");
        helper.assertTrue(player.getVehicle() == kart, "a full tank does not let the player in");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest(maxTicks = 40)
    public void theEngineBurnsFuelWhileTheDriverGivesThrottle(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        kart.fuel().setFuel(100);
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        helper.assertTrue(player.startRiding(kart), "not seated");
        player.setLastClientInput(new Input(true, false, false, true, false, false, false));
        helper.runAfterDelay(10, () -> {
            int burnt = 100 - kart.fuel().fuel();
            helper.assertTrue(burnt >= 9 && burnt <= 11, "burnt " + burnt + " in 10 ticks of throttle");
            assertNear(helper, kart.throttle(), 1, 1e-6, "synched throttle");
            assertNear(helper, kart.steering(), 1, 1e-6, "synched steering");
            player.setLastClientInput(Input.EMPTY);
        });
        helper.runAfterDelay(12, () -> {
            int left = kart.fuel().fuel();
            helper.runAfterDelay(10, () -> {
                helper.assertValueEqual(kart.fuel().fuel(), left, "fuel burnt without throttle");
                assertNear(helper, kart.throttle(), 0, 1e-6, "synched throttle without keys");
                remove(helper, player);
                helper.succeed();
            });
        });
    }

    @GameTest(maxTicks = 40)
    public void onTickFiresOnlyWhileDriven(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        Recorder recorder = new Recorder(kart);
        helper.runAfterDelay(11, () -> {
            helper.assertValueEqual(recorder.count("driving"), 0, "on_tick without a driver");
            helper.assertTrue(player.startRiding(kart), "not seated");
        });
        helper.runAfterDelay(23, () -> {
            recorder.close();
            int fired = recorder.count("driving");
            helper.assertTrue(fired >= 2 && fired <= 3, "on_tick every 5 ticks fired " + fired + " times in 12 ticks");
            remove(helper, player);
            helper.succeed();
        });
    }

    // Damage, repair, destroy (ADR 0090 D9)

    @GameTest(maxTicks = 20)
    public void damageStaysUntilRepaired(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        helper.assertTrue(kart.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(player), 4), "not hurt");
        assertNear(helper, kart.getDamage(), 4, 1e-6, "damage");
        helper.assertValueEqual(kart.getHurtTime(), 10, "hurt time");
        helper.runAfterDelay(5, () -> {
            assertNear(helper, kart.getDamage(), 4, 1e-6, "damage after 5 ticks (no healing)");
            helper.assertTrue(kart.getHurtTime() < 10, "hurt time not counting down");
            ItemStack iron = new ItemStack(Items.IRON_INGOT, 3);
            click(player, kart, iron);
            assertNear(helper, kart.getDamage(), 0, 1e-6, "damage after a repair of 4");
            helper.assertValueEqual(iron.getCount(), 2, "iron used up");
            click(player, kart, iron);
            helper.assertValueEqual(iron.getCount(), 2, "iron used on an undamaged kart");
            helper.assertTrue(player.getVehicle() == kart, "an undamaged kart does not let the player in");
            remove(helper, player);
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 20)
    public void destroyedDropsItsItemAndFiresOnDestroy(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        ServerPlayer rider = player(helper, MID.add(-2, 0, 0));
        rider.startRiding(kart);
        try (Recorder recorder = new Recorder(kart)) {
            for (int i = 0; i < 3; i++) {
                kart.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(player), 4);
            }
            helper.assertTrue(kart.isRemoved(), "a kart with 12 damage of 10 is still there");
            helper.assertTrue(recorder.events.contains("wrecked"), "on_destroy: " + recorder.events);
            EventContext ctx = recorder.contexts.get(recorder.events.indexOf("wrecked"));
            helper.assertTrue(ctx.player() == player && ctx.entity() == kart, "on_destroy context");
        }
        helper.assertFalse(rider.isPassenger(), "the rider is still seated");
        helper.assertValueEqual(count(drops(helper, helper.absoluteVec(MID), item("vh_kart"))), 1, "kart items dropped");
        remove(helper, player, rider);
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void creativeHitsAndExplosionsDestroyWithoutTheItem(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", new Vec3(1.5, 1, 1.5));
        MsmVehicle other = spawn(helper, "vh_kart", new Vec3(5.5, 1, 5.5));
        ServerPlayer player = player(helper, new Vec3(1.5, 1, 4));
        player.setGameMode(GameType.CREATIVE);
        try (Recorder recorder = new Recorder(kart)) {
            player.attack(kart);
            helper.assertTrue(kart.isRemoved(), "a creative hit did not break the kart");
            helper.assertValueEqual(recorder.count("wrecked"), 1, "on_destroy for a creative hit");
        }
        other.hurtServer(helper.getLevel(), helper.getLevel().damageSources().explosion(null, null), 20);
        helper.assertTrue(other.isRemoved(), "the explosion did not destroy the kart");
        helper.assertValueEqual(count(drops(helper, helper.absoluteVec(new Vec3(3.5, 1, 3.5)), item("vh_kart"))), 0, "kart items dropped");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void immuneToIgnoresListedDamage(GameTestHelper helper) {
        floor(helper);
        MsmVehicle tank = spawn(helper, "vh_tank", MID);
        ServerLevel level = helper.getLevel();
        helper.assertFalse(tank.hurtServer(level, level.damageSources().onFire(), 5), "#minecraft:is_fire hurt the tank");
        helper.assertFalse(tank.hurtServer(level, level.damageSources().cactus(), 5), "minecraft:cactus hurt the tank");
        helper.assertTrue(tank.hurtServer(level, level.damageSources().generic(), 5), "generic damage did not hurt the tank");
        assertNear(helper, tank.getDamage(), 5, 1e-6, "damage");
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void explodesHurtsAroundButSparesTheDrops(GameTestHelper helper) {
        floor(helper);
        MsmVehicle tank = spawn(helper, "vh_tank", MID);
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, MID.add(2, 0, 0));
        float full = pig.getHealth();
        try (Recorder recorder = new Recorder(tank)) {
            tank.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 40);
            helper.assertTrue(tank.isRemoved(), "the tank survived 40 of 30");
            helper.assertValueEqual(recorder.events, List.of("boom"), "on_destroy");
        }
        helper.assertTrue(pig.getHealth() < full || !pig.isAlive(), "explodes 2 did not hurt the pig");
        helper.assertValueEqual(count(drops(helper, helper.absoluteVec(MID), item("vh_tank"))), 1, "the tank's item after its explosion");
        helper.assertTrue(helper.getBlockState(new BlockPos(3, 0, 3)).is(Blocks.STONE), "explodes broke the floor");
        helper.succeed();
    }

    // Storage (ADR 0090 D9)

    @GameTest(maxTicks = 20)
    public void storageOpensIsSavedAndDropsWhenDestroyed(GameTestHelper helper) {
        floor(helper);
        MsmVehicle boat = spawn(helper, "vh_boat", MID);
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        player.setShiftKeyDown(true);
        click(player, boat, ItemStack.EMPTY);
        helper.assertTrue(player.containerMenu instanceof ChestMenu menu && menu.getRowCount() == 2, "menu: " + player.containerMenu);
        player.closeContainer();
        player.setShiftKeyDown(false);
        ((HasCustomInventoryScreen) boat).openCustomInventoryScreen(player);
        helper.assertTrue(player.containerMenu instanceof ChestMenu, "the inventory key did not open the storage");
        player.closeContainer();
        boat.storage().orElseThrow().container().setItem(3, new ItemStack(Items.DIAMOND, 4));
        MsmVehicle copy = saveAndLoad(helper, boat);
        ItemStack loaded = copy.storage().orElseThrow().container().getItem(3);
        helper.assertTrue(loaded.is(Items.DIAMOND) && loaded.getCount() == 4, "loaded storage: " + loaded);
        boat.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(player), 40);
        helper.assertTrue(boat.isRemoved(), "the boat survived 40 of 40");
        helper.assertValueEqual(count(drops(helper, helper.absoluteVec(MID), Items.DIAMOND)), 4, "diamonds dropped");
        helper.assertValueEqual(count(drops(helper, helper.absoluteVec(MID), item("vh_boat"))), 1, "the boat's item dropped");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void fuelDamageAndTurretAreSaved(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        kart.fuel().setFuel(77);
        kart.setDamage(2.5f);
        MsmVehicle copy = saveAndLoad(helper, kart);
        helper.assertValueEqual(copy.fuel().fuel(), 77, "loaded fuel");
        assertNear(helper, copy.getDamage(), 2.5, 1e-6, "loaded damage");
        MsmVehicle tank = spawn(helper, "vh_tank", MID.add(0, 3, 0));
        tank.setTurret(30, -10);
        tank.weapons().setAmmo(0, 4);
        MsmVehicle tankCopy = saveAndLoad(helper, tank);
        assertNear(helper, tankCopy.turretYaw(), 30, 1e-6, "loaded turret yaw");
        assertNear(helper, tankCopy.turretPitch(), -10, 1e-6, "loaded turret pitch");
        helper.assertValueEqual(tankCopy.ammo(0), 4, "loaded ammunition");
        helper.succeed();
    }

    // Paint (ADR 0090 D12)

    @GameTest(maxTicks = 20)
    public void dyesPaintTheVehicle(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        ServerPlayer player = player(helper, MID.add(2, 0, 0));
        helper.assertValueEqual(kart.paint().index(), 0, "unpainted");
        ItemStack red = new ItemStack(vanilla("red_dye"), 2);
        helper.assertTrue(click(player, kart, red).consumesAction(), "red dye not used");
        helper.assertValueEqual(kart.paint().index(), 1, "red paint index");
        helper.assertValueEqual(red.getCount(), 1, "red dye used up");
        click(player, kart, new ItemStack(vanilla("blue_dye")));
        helper.assertValueEqual(kart.paint().current().map(p -> p.id()).orElse(""), "blue", "blue paint");
        helper.assertValueEqual(saveAndLoad(helper, kart).paint().current().map(p -> p.id()).orElse(""), "blue", "loaded paint");
        click(player, kart, new ItemStack(vanilla("green_dye")));
        helper.assertValueEqual(kart.paint().current().map(p -> p.id()).orElse(""), "blue", "a dye of no paint");
        helper.assertTrue(player.getVehicle() == kart, "a dye of no paint does not let the player in");
        remove(helper, player);
        helper.succeed();
    }

    // The explode action (ADR 0090 D6)

    @GameTest(maxTicks = 20)
    public void explodeBreaksBlocksOnlyWhenAsked(GameTestHelper helper) {
        floor(helper);
        List<BlockPos> dirt = List.of(new BlockPos(5, 1, 3), new BlockPos(1, 1, 3), new BlockPos(3, 1, 5), new BlockPos(3, 1, 1));
        dirt.forEach(pos -> helper.setBlock(pos, Blocks.DIRT));
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        ServerLevel level = helper.getLevel();
        MsmVehicles.Entry entry = MsmVehicles.entry(id("vh_kart")).orElseThrow();
        EventRunner.fire(entry.id(), entry.definition().events(), id("puff"), EventContext.forEntity(level, kart, null));
        for (BlockPos pos : dirt) {
            helper.assertTrue(helper.getBlockState(pos).is(Blocks.DIRT), "explode without breaks_blocks broke " + pos);
        }
        EventRunner.fire(entry.id(), entry.definition().events(), id("blast"), EventContext.forEntity(level, kart, null));
        long broken = dirt.stream().filter(pos -> !helper.getBlockState(pos).is(Blocks.DIRT)).count();
        helper.assertTrue(broken > 0, "explode with breaks_blocks broke no dirt");
        helper.assertFalse(kart.isRemoved(), "the kart's own explosion destroyed it");
        assertNear(helper, kart.getDamage(), 0, 1e-6, "the kart's own explosion damaged it");
        helper.succeed();
    }

    @GameTest(maxTicks = 20)
    public void explodeAtOtherNeedsAnOtherEntity(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", new Vec3(1.5, 1, 1.5));
        Mob pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new Vec3(6, 1, 6));
        float full = pig.getHealth();
        ServerLevel level = helper.getLevel();
        MsmVehicles.Entry entry = MsmVehicles.entry(id("vh_kart")).orElseThrow();
        EventRunner.fire(entry.id(), entry.definition().events(), id("blast_other"), EventContext.forEntity(level, kart, null, null));
        helper.assertValueEqual(pig.getHealth(), full, "explode at other without one hurt the pig");
        EventRunner.fire(entry.id(), entry.definition().events(), id("blast_other"), EventContext.forEntity(level, kart, null, pig));
        helper.assertTrue(pig.getHealth() < full || !pig.isAlive(), "explode at other did not hurt the pig");
        helper.succeed();
    }

    // The horn (ADR 0090 D2 engine.horn, ADR 0088 D5; B421)

    /**
     * A spectator player that records the sound packets it is sent, as in {@code MsmSoundGameTest}: a plain
     * {@code ServerPlayer} on a {@code Connection} inside a Netty {@code EmbeddedChannel}, whose outbound queue holds the
     * packets unencoded. Only sounds played within a block of {@code source} count, since other tests run next to this
     * one. Remove it with {@link #close}.
     */
    private static final class Ears implements AutoCloseable {
        private final ServerPlayer player;
        private final EmbeddedChannel channel;
        private final MinecraftServer server;
        private final Entity source;

        Ears(GameTestHelper helper, Vec3 at, Entity source) {
            this.source = source;
            server = helper.getLevel().getServer();
            GameProfile profile = new GameProfile(UUID.randomUUID(), "msm-ears");
            CommonListenerCookie cookie = CommonListenerCookie.createInitial(profile, false);
            player = new ServerPlayer(server, helper.getLevel(), profile, cookie.clientInformation());
            Connection connection = new Connection(PacketFlow.SERVERBOUND);
            channel = new EmbeddedChannel(connection);
            server.getPlayerList().placeNewPlayer(connection, player, cookie);
            player.setGameMode(GameType.SPECTATOR);
            player.snapTo(helper.absoluteVec(at));
            heard();
        }

        /** The sound events played at the source since the last call, in order. */
        List<Identifier> heard() {
            channel.flushOutbound();
            List<Identifier> out = new ArrayList<>();
            for (Object message = channel.readOutbound(); message != null; message = channel.readOutbound()) {
                if (message instanceof Packet<?> packet) {
                    collect(packet, out);
                }
            }
            return out;
        }

        private void collect(Packet<?> packet, List<Identifier> out) {
            switch (packet) {
                case ClientboundSoundPacket p -> {
                    if (source.position().distanceTo(new Vec3(p.getX(), p.getY(), p.getZ())) < 1) {
                        out.add(p.getSound().value().location());
                    }
                }
                case ClientboundBundlePacket b -> b.subPackets().forEach(p -> collect(p, out));
                default -> {}
            }
        }

        @Override
        public void close() {
            server.getPlayerList().remove(player);
            channel.close();
        }
    }

    private static final Identifier BELL = Identifier.withDefaultNamespace("block.note_block.bell");

    private static void horn(ServerPlayer player, boolean pressed) {
        KeyBinds.receive(player, new KeyPayload(KeyBinds.RuntimeKey.HORN.id(), pressed));
    }

    private static long bells(List<Identifier> heard) {
        return heard.stream().filter(BELL::equals).count();
    }

    @GameTest(maxTicks = 40)
    public void theDriversHornSoundsForEveryoneNearWithACooldown(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        ServerPlayer driver = player(helper, MID);
        helper.assertTrue(driver.startRiding(kart), "the driver gets in");
        Ears ears = new Ears(helper, MID.add(4, 1, 0), kart);
        horn(driver, true);
        horn(driver, false);
        helper.assertValueEqual(bells(ears.heard()), 1L, "the horn sounds once per press");
        horn(driver, true);
        horn(driver, false);
        helper.assertValueEqual(bells(ears.heard()), 0L, "a press within the cooldown is silent");
        helper.runAfterDelay(VehicleHorn.COOLDOWN_TICKS, () -> {
            horn(driver, true);
            helper.assertValueEqual(bells(ears.heard()), 1L, "after the cooldown it sounds again");
            helper.runAfterDelay(VehicleHorn.COOLDOWN_TICKS + 1, () -> {
                helper.assertValueEqual(bells(ears.heard()), 0L, "holding the key sounds it once");
                horn(driver, false);
                ears.close();
                remove(helper, driver);
                helper.succeed();
            });
        });
    }

    @GameTest
    public void onlyTheDriverOfAVehicleWithAHornSoundsIt(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = spawn(helper, "vh_kart", MID);
        MsmVehicle tank = spawn(helper, "vh_tank", new Vec3(1.5, 1, 1.5));
        ServerPlayer tankDriver = player(helper, MID);
        ServerPlayer kartDriver = player(helper, MID);
        ServerPlayer rider = player(helper, MID);
        ServerPlayer walker = player(helper, MID);
        helper.assertTrue(tankDriver.startRiding(tank), "the tank's driver gets in");
        helper.assertTrue(kartDriver.startRiding(kart) && rider.startRiding(kart), "two get into the kart");
        Ears ears = new Ears(helper, MID.add(2, 1, 0), kart);
        for (ServerPlayer player : List.of(tankDriver, rider, walker)) {
            horn(player, true);
            horn(player, false);
        }
        helper.assertValueEqual(bells(ears.heard()), 0L, "no horn on the tank, none for the kart's passenger, none on foot");
        helper.assertFalse(VehicleHorn.sound(helper.getLevel(), tank), "a vehicle without engine.horn");
        horn(kartDriver, true);
        horn(kartDriver, false);
        helper.assertValueEqual(bells(ears.heard()), 1L, "the kart's driver sounds it");
        ears.close();
        remove(helper, tankDriver, kartDriver, rider, walker);
        helper.succeed();
    }
}
