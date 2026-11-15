package dev.mcsupermods.parity;

import io.netty.buffer.Unpooled;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.RegistryFriendlyByteBuf;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.common.ClientboundCustomPayloadPacket;
import net.minecraft.network.protocol.common.ServerboundCustomPayloadPacket;
import net.minecraft.network.protocol.game.ClientboundExplodePacket;
import net.minecraft.network.protocol.game.ClientboundLevelParticlesPacket;
import net.minecraft.network.protocol.game.ClientboundSoundEntityPacket;
import net.minecraft.network.protocol.game.ClientboundSoundPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrowableItemProjectile;
import net.minecraft.world.entity.vehicle.VehicleEntity;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Behaviour parity over {@code fixtures/sample-vehicles} (namespace {@code msm_sample_vehicles}, ADRs 0088 to 0091), on
 * content jars only: vehicles, key binds and HUD elements are not part of the Java project eject (ADR 0091 D7), so the
 * filter is {@code msm_parity_tests:sample_vehicles_*}. Black-box through vanilla and Fabric API alone (ADR 0033 D5):
 * a real {@link ServerPlayer} ({@link ParityEars}) using items and entities as the network handler does, the
 * vehicle's saved data ({@code Fuel}, {@code Paint}, {@code Ammo}, {@code Items}, vanilla's damage), the item's kept
 * state in {@code minecraft:custom_data}, the entities in the world and the packets a player receives.
 *
 * <p>The runtime's own payloads go over the wire as a client would send and receive them: a key press is the bytes of a
 * serverbound {@code msm_runtime:key_v1} custom payload (the key id as a string, then pressed), decoded by the vanilla
 * packet codec (Fabric API picks the runtime's payload type) and handed to the player's packet listener; HUD values are
 * read by encoding the clientbound {@code msm_runtime:hud_v1} packets the player receives and reading their bytes (the
 * hash, then index, optional number, text and visibility per value). The runtime sends HUD values only to a client that
 * registered the channel, so {@link #listenToHud} sends Fabric's {@code minecraft:register} for it first.
 *
 * <p>Covered (the B425 list): the seven types and their items, placing by mode, fuel and refuelling (and burning only
 * while driven forwards), the car's one row of storage, paint, the repair kit, the tank's shells loading, the cannon
 * firing a shell owned by the player with its cooldown and recoil, the machine gun firing while held, the tank's fire
 * immunity and explosion when destroyed, picking up keeping fuel, damage, paint and ammunition, the {@code flare} key only
 * while seated with its 40-tick cooldown, the {@code status} key's HUD actions (and a spectator's press dropped), and the
 * HUD sync of {@code flare_charge}, {@code speedometer} and {@code tank_shells}. Driving itself (the position) is the
 * client's (ADR 0090 D4) and the client's sounds and drawing are B418's client GameTest; parity asserts only what the
 * server decides and sends.
 */
public class SampleVehiclesParityTest {
    static final String NAMESPACE = "msm_sample_vehicles";
    private static final String ARENA = "msm_parity_tests:arena";
    private static final List<String> VEHICLES = List.of("racing_car", "motorboat", "swamp_buggy", "biplane", "hovercraft", "helicopter",
            "battle_tank");
    /** The vehicle sizes [width, height] of the fixture. */
    private static final Map<String, float[]> SIZES = Map.of(
            "racing_car", new float[] {1.6f, 1.3f},
            "motorboat", new float[] {1.6f, 0.7f},
            "swamp_buggy", new float[] {1.2f, 0.6f},
            "biplane", new float[] {2.5f, 1.2f},
            "hovercraft", new float[] {2f, 0.8f},
            "helicopter", new float[] {2.2f, 1.8f},
            "battle_tank", new float[] {3f, 1.6f});
    private static final Identifier KEY_V1 = Identifier.fromNamespaceAndPath("msm_runtime", "key_v1");
    private static final Identifier HUD_V1 = Identifier.fromNamespaceAndPath("msm_runtime", "hud_v1");
    private static final Identifier REGISTER = Identifier.withDefaultNamespace("register");
    private static final String FIRE = "msm_runtime:vehicle_fire";
    private static final String SECOND = "msm_runtime:vehicle_fire_second";
    private static final String FLARE = NAMESPACE + ":flare";
    private static final String STATUS = NAMESPACE + ":status";
    /** HUD slots: the sorted HUD id list (flare_charge, speedometer, status_line, tank_shells). */
    private static final int HUD_FLARE_CHARGE = 0;
    private static final int HUD_SPEEDOMETER = 1;
    private static final int HUD_STATUS_LINE = 2;
    private static final int HUD_TANK_SHELLS = 3;
    private static final String STATUS_TEXT = "J flare, R cannon, V machine gun, H horn, Left Alt down";
    private static final Identifier EXPLODE = Identifier.withDefaultNamespace("entity.generic.explode");
    private static final Identifier ARROW_SHOOT = Identifier.withDefaultNamespace("entity.arrow.shoot");
    private static final Identifier FIREWORK_LAUNCH = Identifier.withDefaultNamespace("entity.firework_rocket.launch");
    private static final Identifier FIREWORK = Identifier.withDefaultNamespace("firework");

    static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NAMESPACE, path);
    }

    static Item item(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id(path)), "item " + id(path) + " is not registered");
        return BuiltInRegistries.ITEM.getValue(id(path));
    }

    @SuppressWarnings("unchecked")
    static EntityType<VehicleEntity> type(GameTestHelper helper, String path) {
        helper.assertTrue(BuiltInRegistries.ENTITY_TYPE.containsKey(id(path)), "entity type " + id(path) + " is not registered");
        return (EntityType<VehicleEntity>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    /** A vanilla item by id (the dyes are a colour collection in 26.x, so they are looked up by name). */
    static Item vanilla(String path) {
        return BuiltInRegistries.ITEM.getValue(Identifier.withDefaultNamespace(path));
    }

    /** A vehicle of {@code path} at {@code at} (relative), facing {@code yaw}. */
    static VehicleEntity spawn(GameTestHelper helper, String path, Vec3 at, float yaw) {
        Entity entity = type(helper, path).create(helper.getLevel(), net.minecraft.world.entity.EntitySpawnReason.COMMAND);
        helper.assertTrue(entity instanceof VehicleEntity, id(path) + " is not a vehicle entity: " + entity);
        Vec3 abs = helper.absoluteVec(at);
        entity.snapTo(abs.x, abs.y, abs.z, yaw, 0);
        helper.getLevel().addFreshEntity(entity);
        return (VehicleEntity) entity;
    }

    /** The entity's saved data, as the world saves it. */
    static CompoundTag saved(GameTestHelper helper, Entity entity) {
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, helper.getLevel().registryAccess());
        entity.saveWithoutId(out);
        return out.buildResult();
    }

    static int fuel(GameTestHelper helper, Entity vehicle) {
        return saved(helper, vehicle).getIntOr("Fuel", -1);
    }

    static String paint(GameTestHelper helper, Entity vehicle) {
        return saved(helper, vehicle).getStringOr("Paint", "");
    }

    static int ammo(GameTestHelper helper, Entity vehicle, String weapon) {
        return saved(helper, vehicle).getCompoundOrEmpty("Ammo").getIntOr(weapon, -1);
    }

    /** A main-hand right-click on {@code entity}, as the network handler does. */
    static InteractionResult use(ServerPlayer player, Entity entity) {
        return player.interactOn(entity, InteractionHand.MAIN_HAND, Vec3.ZERO);
    }

    /** How many of {@code item} the player carries. */
    static int count(ServerPlayer player, Item item) {
        int total = 0;
        for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) {
            ItemStack stack = player.getInventory().getItem(slot);
            if (stack.is(item)) {
                total += stack.getCount();
            }
        }
        return total;
    }

    /** The first stack of {@code item} the player carries, or empty. */
    static ItemStack find(ServerPlayer player, Item item) {
        for (int slot = 0; slot < player.getInventory().getContainerSize(); slot++) {
            ItemStack stack = player.getInventory().getItem(slot);
            if (stack.is(item)) {
                return stack;
            }
        }
        return ItemStack.EMPTY;
    }

    /** As {@code assertValueEqual} for doubles within {@code eps}. */
    static void near(GameTestHelper helper, double actual, double expected, double eps, String what) {
        helper.assertTrue(Math.abs(actual - expected) <= eps, what + ": expected " + expected + ", got " + actual);
    }

    // The wire

    /**
     * Sends the serverbound {@code msm_runtime:key_v1} payload for {@code key} as a client would: its bytes decoded by the
     * vanilla codec, then handled by the player's packet listener on the server thread.
     */
    static void key(GameTestHelper helper, ServerPlayer player, String key, boolean pressed) {
        RegistryFriendlyByteBuf buf = new RegistryFriendlyByteBuf(Unpooled.buffer(), helper.getLevel().registryAccess());
        buf.writeIdentifier(KEY_V1);
        buf.writeUtf(key, 256);
        buf.writeBoolean(pressed);
        player.connection.handleCustomPayload(ServerboundCustomPayloadPacket.STREAM_CODEC.decode(buf));
    }

    /** A tap: press and release in the same tick. */
    static void tap(GameTestHelper helper, ServerPlayer player, String key) {
        key(helper, player, key, true);
        key(helper, player, key, false);
    }

    /** Registers the {@code hud_v1} channel for the player as a client with the runtime does (Fabric's play registration). */
    static void listenToHud(GameTestHelper helper, ServerPlayer player) {
        RegistryFriendlyByteBuf buf = new RegistryFriendlyByteBuf(Unpooled.buffer(), helper.getLevel().registryAccess());
        buf.writeIdentifier(REGISTER);
        buf.writeBytes(HUD_V1.toString().getBytes(StandardCharsets.US_ASCII));
        player.connection.handleCustomPayload(ServerboundCustomPayloadPacket.STREAM_CODEC.decode(buf));
    }

    /** One HUD value the player received: slot, optional number, text and visibility, and the game time it was read. */
    record Hud(int slot, Optional<Double> number, Optional<String> text, Optional<Boolean> visible, long tick) {
        boolean cleared() {
            return number.isEmpty() && text.isEmpty() && visible.isEmpty();
        }
    }

    /**
     * Reads the packets the player received since the last read: the HUD values (decoded from the {@code hud_v1}
     * packets' bytes) into {@code hud}, every other packet into {@code other}.
     */
    static void read(GameTestHelper helper, ParityEars ears, List<Hud> hud, List<Packet<?>> other) {
        long tick = helper.getLevel().getGameTime();
        for (Packet<?> packet : ears.packets()) {
            if (packet instanceof ClientboundCustomPayloadPacket custom && custom.payload().type().id().equals(HUD_V1)) {
                RegistryFriendlyByteBuf buf = new RegistryFriendlyByteBuf(Unpooled.buffer(), helper.getLevel().registryAccess());
                ClientboundCustomPayloadPacket.GAMEPLAY_STREAM_CODEC.encode(buf, custom);
                helper.assertValueEqual(buf.readIdentifier(), HUD_V1, "the HUD packet's channel");
                buf.readInt(); // the hash of the HUD id list
                int values = buf.readVarInt();
                for (int i = 0; i < values; i++) {
                    int slot = buf.readVarInt();
                    Optional<Double> number = buf.readBoolean() ? Optional.of(buf.readDouble()) : Optional.empty();
                    Optional<String> text = buf.readBoolean() ? Optional.of(buf.readUtf(256)) : Optional.empty();
                    Optional<Boolean> visible = buf.readBoolean() ? Optional.of(buf.readBoolean()) : Optional.empty();
                    hud.add(new Hud(slot, number, text, visible, tick));
                }
                helper.assertValueEqual(buf.readableBytes(), 0, "bytes left in a HUD packet");
            } else if (other != null) {
                other.add(packet);
            }
        }
    }

    static List<Hud> slot(List<Hud> hud, int slot) {
        return hud.stream().filter(h -> h.slot() == slot).toList();
    }

    static List<Identifier> sounds(List<Packet<?>> packets) {
        List<Identifier> out = new ArrayList<>();
        for (Packet<?> packet : packets) {
            switch (packet) {
                case ClientboundSoundPacket p -> out.add(p.getSound().value().location());
                case ClientboundSoundEntityPacket p -> out.add(p.getSound().value().location());
                default -> {}
            }
        }
        return out;
    }

    static long particles(List<Packet<?>> packets, Identifier type) {
        return packets.stream().filter(p -> p instanceof ClientboundLevelParticlesPacket lp
                && type.equals(BuiltInRegistries.PARTICLE_TYPE.getKey(lp.particle().getType()))).count();
    }

    /** The thrown items near {@code at} (absolute), discarded after reading so no shell explodes in the arena. */
    static List<ThrowableItemProjectile> takeShells(GameTestHelper helper, Vec3 at) {
        List<ThrowableItemProjectile> shells = helper.getLevel().getEntitiesOfClass(ThrowableItemProjectile.class, new AABB(at, at).inflate(16));
        shells.forEach(Entity::discard);
        return shells;
    }

    /** Clears the arena's inside above its stone floor (y 1 to 3), so no block left from another test is in the way. */
    private static void clear(GameTestHelper helper) {
        for (int x = 1; x <= 9; x++) {
            for (int z = 1; z <= 9; z++) {
                for (int y = 1; y <= 3; y++) {
                    helper.setBlock(x, y, z, Blocks.AIR);
                }
            }
        }
    }

    // The seven types and their items

    /**
     * The seven vehicle types are registered with their sizes, are vehicles and not living (no health attribute,
     * effects or AI), and each has an item of the same id; the shell and the repair kit are items.
     */
    @GameTest(structure = ARENA)
    public void theSevenTypesAndTheirItemsAreRegistered(GameTestHelper helper) {
        for (String path : VEHICLES) {
            EntityType<VehicleEntity> type = type(helper, path);
            item(helper, path);
            float[] size = SIZES.get(path);
            near(helper, type.getWidth(), size[0], 1e-6, path + " width");
            near(helper, type.getHeight(), size[1], 1e-6, path + " height");
            Entity entity = type.create(helper.getLevel(), net.minecraft.world.entity.EntitySpawnReason.COMMAND);
            helper.assertTrue(entity instanceof VehicleEntity, path + " is not a vehicle entity");
            helper.assertFalse(entity instanceof LivingEntity, path + " is a living entity");
            helper.assertValueEqual(entity.getPickResult() == null ? "" : BuiltInRegistries.ITEM.getKey(entity.getPickResult().getItem()).toString(),
                    id(path).toString(), path + " pick result");
        }
        helper.assertValueEqual(new ItemStack(item(helper, "battle_tank_shell")).getMaxStackSize(), 16, "shell stack size");
        helper.assertValueEqual(new ItemStack(item(helper, "repair_kit")).getMaxStackSize(), 16, "repair kit stack size");
        helper.succeed();
    }

    // Placing by mode

    /** Uses the vehicle item in the main hand looking straight down from {@code at}; returns what was placed near there. */
    private static List<VehicleEntity> place(GameTestHelper helper, ServerPlayer player, String path, Vec3 at, boolean placed) {
        player.snapTo(helper.absoluteVec(at));
        player.setYRot(90);
        player.setXRot(90);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(helper, path)));
        InteractionResult result = player.gameMode.useItem(player, helper.getLevel(), player.getMainHandItem(), InteractionHand.MAIN_HAND);
        Vec3 abs = helper.absoluteVec(at);
        List<VehicleEntity> found = helper.getLevel().getEntitiesOfClass(VehicleEntity.class, new AABB(abs, abs).inflate(3),
                v -> v.getType() == type(helper, path));
        if (placed) {
            helper.assertTrue(result.consumesAction(), path + " was not placed at " + at + ": " + result);
            helper.assertValueEqual(found.size(), 1, path + " placed");
            helper.assertTrue(player.getMainHandItem().isEmpty(), path + ": the item was not used up");
            VehicleEntity vehicle = found.getFirst();
            near(helper, Math.floorMod((int) Math.round(vehicle.getYRot()), 360), 90, 1e-6, path + " faces the player's look");
        } else {
            helper.assertFalse(result.consumesAction(), path + " was placed at " + at + ": " + result);
            helper.assertValueEqual(found.size(), 0, path + " placed");
            helper.assertValueEqual(player.getMainHandItem().getCount(), 1, path + ": the refused item stays");
        }
        found.forEach(Entity::discard);
        return found;
    }

    /**
     * On stone the ground vehicles (car, biplane, tank) and the ones that go anywhere (buggy, hovercraft, helicopter) are
     * placed on the block's top and the motorboat is refused; on water the motorboat and the ones that go anywhere are
     * placed at the surface and the ground vehicles refused.
     */
    @GameTest(structure = ARENA, maxTicks = 40)
    public void placingFollowsTheMode(GameTestHelper helper) {
        clear(helper);
        try (ParityEars ears = new ParityEars(helper, new BlockPos(5, 1, 5), GameType.SURVIVAL, "msm-vh-placer")) {
            Vec3 ground = new Vec3(7.5, 1, 7.5);
            for (String path : List.of("racing_car", "biplane", "battle_tank", "swamp_buggy", "hovercraft", "helicopter")) {
                List<VehicleEntity> placed = place(helper, ears.player, path, ground, true);
                near(helper, placed.getFirst().getY(), helper.absoluteVec(ground).y, 1e-6, path + " on the stone's top");
            }
            place(helper, ears.player, "motorboat", ground, false);

            // A 3 by 3 pool with a stone rim, its surface below y 2.
            for (int x = 1; x <= 5; x++) {
                for (int z = 1; z <= 5; z++) {
                    boolean rim = x == 1 || z == 1 || x == 5 || z == 5;
                    helper.setBlock(x, 1, z, rim ? Blocks.STONE : Blocks.WATER);
                }
            }
            Vec3 pool = new Vec3(3.5, 2.2, 3.5);
            for (String path : List.of("motorboat", "swamp_buggy", "hovercraft", "helicopter")) {
                List<VehicleEntity> placed = place(helper, ears.player, path, pool, true);
                double y = placed.getFirst().getY() - helper.absoluteVec(Vec3.ZERO).y;
                helper.assertTrue(y > 1.5 && y < 2, path + " not at the water's surface: y " + y);
            }
            for (String path : List.of("racing_car", "biplane", "battle_tank")) {
                place(helper, ears.player, path, pool, false);
            }
        }
        helper.succeed();
    }

    // Fuel and refuel

    /**
     * Coal gives the car 1200 ticks a piece up to its 24000-tick tank; the twenty-first coal is not taken and the player
     * gets in instead. Driving forwards burns one tick a tick; standing still burns none. The tank takes blaze rods
     * (2400 ticks) and no coal.
     */
    @GameTest(structure = ARENA, maxTicks = 80)
    public void fuelRefuelsAndBurnsOnlyWhileDriven(GameTestHelper helper) {
        clear(helper);
        VehicleEntity car = spawn(helper, "racing_car", new Vec3(5.5, 1, 3.5), 0);
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 7.5), 0);
        ParityEars driver = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-vh-fuel");
        ParityEars tanker = new ParityEars(helper, new BlockPos(3, 1, 7), GameType.SURVIVAL, "msm-vh-fuel-tank");
        Runnable close = () -> {
            driver.player.stopRiding();
            tanker.player.stopRiding();
            driver.close();
            tanker.close();
        };
        long[] from = new long[2];
        try {
            helper.assertValueEqual(fuel(helper, car), 0, "a new car's fuel");
            driver.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.COAL, 21));
            helper.assertTrue(use(driver.player, car).consumesAction(), "the first coal");
            helper.assertValueEqual(fuel(helper, car), 1200, "fuel after one coal");
            for (int i = 1; i < 20; i++) {
                use(driver.player, car);
            }
            helper.assertValueEqual(fuel(helper, car), 24000, "fuel after twenty coal");
            helper.assertValueEqual(count(driver.player, Items.COAL), 1, "coal left after filling up");
            use(driver.player, car);
            helper.assertValueEqual(count(driver.player, Items.COAL), 1, "coal taken by a full tank");
            helper.assertValueEqual(fuel(helper, car), 24000, "fuel above the capacity");
            helper.assertTrue(driver.player.getVehicle() == car, "a full tank's coal did not let the player in");

            tanker.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.COAL, 1));
            use(tanker.player, tank);
            helper.assertValueEqual(fuel(helper, tank), 0, "the tank took coal");
            helper.assertValueEqual(count(tanker.player, Items.COAL), 1, "the tank used up coal");
            tanker.player.stopRiding();
            tanker.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.BLAZE_ROD, 1));
            use(tanker.player, tank);
            helper.assertValueEqual(fuel(helper, tank), 2400, "the tank's fuel after a blaze rod");
            helper.assertValueEqual(count(tanker.player, Items.BLAZE_ROD), 0, "the blaze rod was not used up");
        } catch (RuntimeException e) {
            close.run();
            throw e;
        }
        helper.startSequence()
                .thenExecute(() -> {
                    driver.player.setLastClientInput(new Input(true, false, false, false, false, false, false));
                    from[0] = helper.getLevel().getGameTime();
                    from[1] = fuel(helper, car);
                })
                .thenIdle(20)
                .thenExecute(() -> {
                    long ticks = helper.getLevel().getGameTime() - from[0];
                    long burnt = from[1] - fuel(helper, car);
                    if (Math.abs(burnt - ticks) > 1) {
                        close.run();
                        helper.fail("driving forwards for " + ticks + " ticks burnt " + burnt + " ticks of fuel");
                    }
                    driver.player.setLastClientInput(Input.EMPTY);
                    from[1] = fuel(helper, car);
                })
                .thenIdle(20)
                .thenExecute(() -> {
                    int now = fuel(helper, car);
                    close.run();
                    helper.assertValueEqual((long) now, from[1], "fuel after standing still for 20 ticks");
                })
                .thenSucceed();
    }

    // Storage

    /**
     * A sneaking use opens the car's boot, a one-row chest menu titled with the car's name; what is put in stays and is
     * saved under {@code Items}, and drops when the car is destroyed. The tank has no storage: no menu opens.
     */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void theCarHasOneRowOfStorage(GameTestHelper helper) {
        clear(helper);
        VehicleEntity car = spawn(helper, "racing_car", new Vec3(5.5, 1, 3.5), 0);
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 7.5), 0);
        try (ParityEars ears = new ParityEars(helper, new BlockPos(3, 1, 3), GameType.SURVIVAL, "msm-vh-boot")) {
            ServerPlayer player = ears.player;
            player.setShiftKeyDown(true);
            helper.assertTrue(use(player, car).consumesAction(), "a sneaking use of the car");
            helper.assertTrue(player.containerMenu instanceof ChestMenu, "no chest menu: " + player.containerMenu);
            ChestMenu boot = (ChestMenu) player.containerMenu;
            helper.assertValueEqual(boot.getRowCount(), 1, "the boot's rows");
            helper.assertTrue(boot.getType() == MenuType.GENERIC_9x1, "the boot's menu type");
            helper.assertValueEqual(boot.getContainer().getContainerSize(), 9, "the boot's slots");
            boot.getSlot(0).set(new ItemStack(Items.DIAMOND, 3));
            player.closeContainer();
            helper.assertFalse(player.getVehicle() == car, "a sneaking use got in");

            CompoundTag saved = saved(helper, car);
            helper.assertValueEqual(saved.getListOrEmpty("Items").size(), 1, "stacks saved in the boot");
            use(player, car);
            helper.assertTrue(player.containerMenu instanceof ChestMenu c && c.getContainer().getItem(0).is(Items.DIAMOND)
                    && c.getContainer().getItem(0).getCount() == 3, "the diamonds are not in the boot again");
            player.closeContainer();

            use(player, tank);
            helper.assertTrue(player.containerMenu == player.inventoryMenu, "the tank opened a menu: " + player.containerMenu);

            Vec3 at = car.position();
            car.hurtServer(helper.getLevel(), helper.getLevel().damageSources().generic(), 40);
            helper.assertTrue(car.isRemoved(), "the car survived 40 damage");
            List<ItemEntity> drops = helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(at, at).inflate(2));
            helper.assertTrue(drops.stream().anyMatch(d -> d.getItem().is(Items.DIAMOND) && d.getItem().getCount() == 3),
                    "the boot's diamonds did not drop");
            helper.assertTrue(drops.stream().anyMatch(d -> d.getItem().is(item(helper, "racing_car"))), "the car's item did not drop");
            drops.forEach(Entity::discard);
            tank.discard();
        }
        helper.succeed();
    }

    // Paint

    /**
     * A red dye paints the car red and is used up; a second red dye is not taken (the player gets in); blue repaints it
     * from the seat; a green dye is no paint of the car and stays.
     */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void dyesPaintTheCar(GameTestHelper helper) {
        clear(helper);
        VehicleEntity car = spawn(helper, "racing_car", new Vec3(5.5, 1, 5.5), 0);
        try (ParityEars ears = new ParityEars(helper, new BlockPos(3, 1, 5), GameType.SURVIVAL, "msm-vh-paint")) {
            ServerPlayer player = ears.player;
            helper.assertValueEqual(paint(helper, car), "", "a new car's paint");
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(vanilla("red_dye"), 2));
            helper.assertTrue(use(player, car).consumesAction(), "red dye");
            helper.assertValueEqual(paint(helper, car), "red", "paint after red dye");
            helper.assertValueEqual(count(player, vanilla("red_dye")), 1, "red dye left");
            use(player, car);
            helper.assertValueEqual(count(player, vanilla("red_dye")), 1, "a second red dye was used");
            helper.assertTrue(player.getVehicle() == car, "the second red dye did not let the player in");
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(vanilla("blue_dye"), 1));
            use(player, car);
            helper.assertValueEqual(paint(helper, car), "blue", "paint after blue dye from the seat");
            helper.assertTrue(player.getMainHandItem().isEmpty(), "the blue dye was not used up");
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(vanilla("green_dye"), 1));
            use(player, car);
            helper.assertValueEqual(paint(helper, car), "blue", "paint after green dye");
            helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "green dye used");
            player.stopRiding();
            car.discard();
        }
        helper.succeed();
    }

    // The repair kit

    /**
     * A repair kit takes 10 damage off the car (down to none) and 20 off the tank, one kit a use; on an undamaged car
     * the kit is not used.
     */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void theRepairKitRepairs(GameTestHelper helper) {
        clear(helper);
        ServerLevel level = helper.getLevel();
        VehicleEntity car = spawn(helper, "racing_car", new Vec3(5.5, 1, 3.5), 0);
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 7.5), 0);
        Item kit = item(helper, "repair_kit");
        try (ParityEars ears = new ParityEars(helper, new BlockPos(3, 1, 5), GameType.SURVIVAL, "msm-vh-repair")) {
            ServerPlayer player = ears.player;
            helper.assertTrue(car.hurtServer(level, level.damageSources().generic(), 25), "the car was not hurt");
            near(helper, car.getDamage(), 25, 1e-6, "the car's damage");
            helper.assertTrue(tank.hurtServer(level, level.damageSources().generic(), 30), "the tank was not hurt");
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(kit, 5));
            use(player, car);
            near(helper, car.getDamage(), 15, 1e-6, "the car's damage after one kit");
            use(player, car);
            use(player, car);
            near(helper, car.getDamage(), 0, 1e-6, "the car's damage after three kits");
            helper.assertValueEqual(count(player, kit), 2, "kits left after three uses");
            use(player, tank);
            near(helper, tank.getDamage(), 10, 1e-6, "the tank's damage after one kit");
            helper.assertValueEqual(count(player, kit), 1, "kits left after the tank");
            use(player, car);
            helper.assertValueEqual(count(player, kit), 1, "a kit used on an undamaged car");
            player.stopRiding();
            car.discard();
            tank.discard();
        }
        helper.succeed();
    }

    // Tank shells

    /**
     * Shells load the cannon up to its 16: five go in from a stack of five, then eleven of a stack of sixteen; a full
     * cannon takes none (the player gets in).
     */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void shellsLoadTheTankCannon(GameTestHelper helper) {
        clear(helper);
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 5.5), 0);
        Item shell = item(helper, "battle_tank_shell");
        try (ParityEars ears = new ParityEars(helper, new BlockPos(2, 1, 5), GameType.SURVIVAL, "msm-vh-loader")) {
            ServerPlayer player = ears.player;
            helper.assertValueEqual(ammo(helper, tank, "cannon"), 0, "a new tank's shells");
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(shell, 5));
            helper.assertTrue(use(player, tank).consumesAction(), "loading five shells");
            helper.assertValueEqual(ammo(helper, tank, "cannon"), 5, "shells after five");
            helper.assertTrue(player.getMainHandItem().isEmpty(), "shells left of five");
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(shell, 16));
            use(player, tank);
            helper.assertValueEqual(ammo(helper, tank, "cannon"), 16, "shells after sixteen more");
            helper.assertValueEqual(player.getMainHandItem().getCount(), 5, "shells left of sixteen");
            helper.assertFalse(player.getVehicle() == tank, "loading got in");
            use(player, tank);
            helper.assertValueEqual(player.getMainHandItem().getCount(), 5, "a full cannon took shells");
            helper.assertTrue(player.getVehicle() == tank, "a full cannon's shells did not let the player in");
            player.stopRiding();
            tank.discard();
        }
        helper.succeed();
    }

    /**
     * A press of "Vehicle: fire" (R) in the tank fires one shell, owned by the player, from the barrel forwards (+z, the
     * tank facing south); the cannon then holds 15, the tank is pushed back by the 0.1 recoil and everyone else hears the
     * explosion sound. Within the 60-tick cooldown a press fires nothing; after it the next shell goes.
     */
    @GameTest(structure = ARENA, maxTicks = 120)
    public void cannonShotsArePlayerOwnedWithCooldownAndRecoil(GameTestHelper helper) {
        clear(helper);
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 2.5), 0);
        Item shell = item(helper, "battle_tank_shell");
        ParityEars gunner = new ParityEars(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "msm-vh-gunner");
        ParityEars listener = new ParityEars(helper, new BlockPos(8, 1, 2), GameType.CREATIVE, "msm-vh-listener");
        Runnable close = () -> {
            gunner.player.stopRiding();
            takeShells(helper, tank.position());
            tank.discard();
            gunner.close();
            listener.close();
        };
        long[] firedAt = {0};
        try {
            ServerPlayer player = gunner.player;
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(shell, 16));
            use(player, tank);
            helper.assertValueEqual(ammo(helper, tank, "cannon"), 16, "shells loaded");
            use(player, tank);
            helper.assertTrue(player.getVehicle() == tank, "the gunner is not in the tank");
            player.setYRot(0);
            player.setXRot(0);
            listener.packets();
            key(helper, player, FIRE, true);
            firedAt[0] = helper.getLevel().getGameTime();
            List<ThrowableItemProjectile> shells = takeShells(helper, tank.position());
            helper.assertValueEqual(shells.size(), 1, "shells fired by one press");
            ThrowableItemProjectile fired = shells.getFirst();
            helper.assertTrue(fired.getOwner() == player, "the shell's owner is " + fired.getOwner());
            helper.assertTrue(fired.getItem().is(shell), "the projectile is " + fired.getItem());
            Vec3 v = fired.getDeltaMovement();
            helper.assertTrue(v.z > 2 && Math.abs(v.x) < 0.5, "the shell does not fly forwards at about 2.5: " + v);
            helper.assertTrue(fired.getY() - tank.getY() > 1, "the shell did not start at the barrel's height: " + (fired.getY() - tank.getY()));
            helper.assertValueEqual(ammo(helper, tank, "cannon"), 15, "shells after a shot");
            Vec3 push = tank.getDeltaMovement();
            helper.assertTrue(push.z < -0.09 && push.z > -0.11 && Math.abs(push.x) < 0.01, "the recoil: " + push);
            helper.assertTrue(sounds(listener.packets()).contains(EXPLODE), "the listener did not hear the cannon");
            key(helper, player, FIRE, false);
        } catch (RuntimeException e) {
            close.run();
            throw e;
        }
        helper.startSequence()
                .thenIdle(2)
                .thenExecute(() -> {
                    tap(helper, gunner.player, FIRE);
                    int shells = takeShells(helper, tank.position()).size();
                    int left = ammo(helper, tank, "cannon");
                    if (shells != 0 || left != 15) {
                        close.run();
                        helper.fail("a press 2 ticks after a shot fired " + shells + " shell(s), " + left + " left");
                    }
                })
                .thenIdle(40)
                .thenExecute(() -> {
                    tap(helper, gunner.player, FIRE);
                    int shells = takeShells(helper, tank.position()).size();
                    if (shells != 0) {
                        close.run();
                        helper.fail("a press " + (helper.getLevel().getGameTime() - firedAt[0]) + " ticks after a shot fired");
                    }
                })
                .thenWaitUntil(() -> helper.assertTrue(helper.getLevel().getGameTime() - firedAt[0] >= 61, "the cooldown"))
                .thenExecute(() -> {
                    tap(helper, gunner.player, FIRE);
                    int shells = takeShells(helper, tank.position()).size();
                    int left = ammo(helper, tank, "cannon");
                    close.run();
                    helper.assertValueEqual(shells, 1, "shells fired after the cooldown");
                    helper.assertValueEqual(left, 14, "shells left after the second shot");
                })
                .thenSucceed();
    }

    /**
     * Holding "Vehicle: fire second" (V) in the tank fires the machine gun's arrows (owned by the player, creative pick-up
     * only, as the gun has no ammunition) every 4 ticks while held: five or six over 20 ticks; none after the release.
     */
    @GameTest(structure = ARENA, maxTicks = 80)
    public void theMachineGunFiresWhileHeld(GameTestHelper helper) {
        clear(helper);
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 2.5), 0);
        ParityEars gunner = new ParityEars(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "msm-vh-mg");
        ParityEars listener = new ParityEars(helper, new BlockPos(8, 1, 2), GameType.CREATIVE, "msm-vh-mg-listener");
        Set<UUID> arrows = new HashSet<>();
        List<String> wrong = new ArrayList<>();
        int[] heard = {0};
        Runnable close = () -> {
            gunner.player.stopRiding();
            tank.discard();
            gunner.close();
            listener.close();
        };
        Runnable collect = () -> {
            if (tank.isRemoved()) {
                return;
            }
            Vec3 at = tank.position();
            for (AbstractArrow arrow : helper.getLevel().getEntitiesOfClass(AbstractArrow.class, new AABB(at, at).inflate(40))) {
                if (arrows.add(arrow.getUUID())) {
                    if (arrow.getOwner() != gunner.player) {
                        wrong.add("an arrow owned by " + arrow.getOwner());
                    }
                    if (arrow.pickup != AbstractArrow.Pickup.CREATIVE_ONLY) {
                        wrong.add("an arrow with pick-up " + arrow.pickup);
                    }
                }
                arrow.discard();
            }
            heard[0] += (int) sounds(listener.packets()).stream().filter(ARROW_SHOOT::equals).count();
        };
        int[] held = new int[1];
        try {
            use(gunner.player, tank);
            helper.assertTrue(gunner.player.getVehicle() == tank, "the gunner is not in the tank");
            gunner.player.setYRot(0);
            listener.packets();
            key(helper, gunner.player, SECOND, true);
            collect.run();
            helper.assertValueEqual(arrows.size(), 1, "arrows right after the press");
        } catch (RuntimeException e) {
            close.run();
            throw e;
        }
        helper.onEachTick(collect);
        helper.startSequence()
                .thenIdle(20)
                .thenExecute(() -> {
                    collect.run();
                    key(helper, gunner.player, SECOND, false);
                    held[0] = arrows.size();
                })
                .thenIdle(12)
                .thenExecute(() -> {
                    collect.run();
                    close.run();
                    helper.assertTrue(wrong.isEmpty(), String.join("; ", wrong));
                    helper.assertTrue(held[0] >= 5 && held[0] <= 6, held[0] + " arrows while held for 20 ticks (5 or 6 expected)");
                    helper.assertValueEqual(arrows.size(), held[0], "arrows after the release");
                    helper.assertValueEqual(heard[0], arrows.size(), "shooting sounds the listener heard");
                })
                .thenSucceed();
    }

    // Fire immunity and destruction

    /** The tank takes no fire, burning or lava damage (immune to {@code #minecraft:is_fire}) but takes any other; the car burns. */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void theTankIsImmuneToFire(GameTestHelper helper) {
        clear(helper);
        ServerLevel level = helper.getLevel();
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 7.5), 0);
        VehicleEntity car = spawn(helper, "racing_car", new Vec3(5.5, 1, 3.5), 0);
        helper.assertFalse(tank.hurtServer(level, level.damageSources().onFire(), 5), "burning hurt the tank");
        helper.assertFalse(tank.hurtServer(level, level.damageSources().inFire(), 5), "fire hurt the tank");
        helper.assertFalse(tank.hurtServer(level, level.damageSources().lava(), 5), "lava hurt the tank");
        near(helper, tank.getDamage(), 0, 1e-6, "the tank's damage from fire");
        helper.assertTrue(tank.hurtServer(level, level.damageSources().generic(), 5), "generic damage did not hurt the tank");
        near(helper, tank.getDamage(), 5, 1e-6, "the tank's damage from a generic hit");
        helper.assertTrue(car.hurtServer(level, level.damageSources().onFire(), 5), "burning did not hurt the car");
        near(helper, car.getDamage(), 5, 1e-6, "the car's damage from burning");
        tank.discard();
        car.discard();
        helper.succeed();
    }

    /**
     * Destroyed (120 damage), the tank is removed with an explosion of power 2 at its place, which a player nearby is sent,
     * and its item drops; the car, which has no {@code explodes}, is removed without one.
     */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void theTankExplodesWhenDestroyed(GameTestHelper helper) {
        clear(helper);
        ServerLevel level = helper.getLevel();
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 7.5), 0);
        VehicleEntity car = spawn(helper, "racing_car", new Vec3(5.5, 1, 3.5), 0);
        try (ParityEars ears = new ParityEars(helper, new BlockPos(2, 1, 5), GameType.CREATIVE, "msm-vh-boom")) {
            ears.packets();
            car.hurtServer(level, level.damageSources().generic(), 40);
            helper.assertTrue(car.isRemoved(), "the car survived 40 damage");
            helper.assertFalse(ears.packets().stream().anyMatch(p -> p instanceof ClientboundExplodePacket), "the car exploded");
            Vec3 at = tank.position();
            tank.hurtServer(level, level.damageSources().generic(), 119);
            helper.assertFalse(tank.isRemoved(), "the tank was destroyed by 119 damage");
            tank.hurtServer(level, level.damageSources().generic(), 1);
            helper.assertTrue(tank.isRemoved(), "the tank survived 120 damage");
            List<ClientboundExplodePacket> booms = new ArrayList<>();
            for (Packet<?> packet : ears.packets()) {
                if (packet instanceof ClientboundExplodePacket boom) {
                    booms.add(boom);
                }
            }
            helper.assertValueEqual(booms.size(), 1, "explosions sent");
            helper.assertTrue(booms.getFirst().center().distanceTo(at) < 0.01, "the explosion at " + booms.getFirst().center() + ", the tank at " + at);
            near(helper, booms.getFirst().radius(), 2, 1e-6, "the explosion's power");
            List<ItemEntity> drops = level.getEntitiesOfClass(ItemEntity.class, new AABB(at, at).inflate(3));
            helper.assertTrue(drops.stream().anyMatch(d -> d.getItem().is(item(helper, "battle_tank"))), "the tank's item did not drop");
            level.getEntitiesOfClass(ItemEntity.class, new AABB(helper.absoluteVec(Vec3.ZERO), helper.absoluteVec(new Vec3(11, 4, 11))))
                    .forEach(Entity::discard);
        }
        helper.succeed();
    }

    // Picking up

    /**
     * A sneaking hit on an empty car picks it up: the item keeps its fuel, damage and paint, the boot's contents drop,
     * and placing it again gives a car with the same fuel, damage and paint and an empty boot. A tank keeps its shells. A
     * car with a passenger is not picked up (it takes the hit).
     */
    @GameTest(structure = ARENA, maxTicks = 20)
    public void pickingUpKeepsTheState(GameTestHelper helper) {
        clear(helper);
        ServerLevel level = helper.getLevel();
        VehicleEntity car = spawn(helper, "racing_car", new Vec3(5.5, 1, 3.5), 0);
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 7.5), 0);
        ParityEars ears = new ParityEars(helper, new BlockPos(2, 1, 5), GameType.SURVIVAL, "msm-vh-picker");
        ParityEars rider = new ParityEars(helper, new BlockPos(8, 1, 5), GameType.SURVIVAL, "msm-vh-rider");
        try {
            ServerPlayer player = ears.player;
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.COAL, 1));
            use(player, car);
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(vanilla("red_dye"), 1));
            use(player, car);
            car.hurtServer(level, level.damageSources().generic(), 5);
            player.setShiftKeyDown(true);
            use(player, car);
            helper.assertTrue(player.containerMenu instanceof ChestMenu, "the boot did not open");
            player.containerMenu.getSlot(0).set(new ItemStack(Items.DIAMOND, 3));
            player.closeContainer();
            player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(helper, "battle_tank_shell"), 7));
            player.setShiftKeyDown(false);
            use(player, tank);
            helper.assertValueEqual(ammo(helper, tank, "cannon"), 7, "shells loaded");

            Vec3 carAt = car.position();
            player.setShiftKeyDown(true);
            player.attack(car);
            helper.assertTrue(car.isRemoved(), "a sneaking hit did not pick the car up");
            ItemStack carItem = find(player, item(helper, "racing_car")).copy();
            helper.assertFalse(carItem.isEmpty(), "the player did not get the car");
            CompoundTag state = carItem.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag().getCompoundOrEmpty("msm_vehicle");
            helper.assertValueEqual(state.getIntOr("fuel", 0), 1200, "the item's kept fuel");
            near(helper, state.getFloatOr("damage", 0), 5, 1e-6, "the item's kept damage");
            helper.assertValueEqual(state.getStringOr("paint", ""), "red", "the item's kept paint");
            List<ItemEntity> drops = level.getEntitiesOfClass(ItemEntity.class, new AABB(carAt, carAt).inflate(2));
            helper.assertTrue(drops.stream().anyMatch(d -> d.getItem().is(Items.DIAMOND) && d.getItem().getCount() == 3),
                    "the boot's diamonds did not drop");
            drops.forEach(Entity::discard);

            player.attack(tank);
            helper.assertTrue(tank.isRemoved(), "a sneaking hit did not pick the tank up");
            ItemStack tankItem = find(player, item(helper, "battle_tank")).copy();
            CompoundTag tankState = tankItem.getOrDefault(DataComponents.CUSTOM_DATA, CustomData.EMPTY).copyTag().getCompoundOrEmpty("msm_vehicle");
            helper.assertValueEqual(tankState.getCompoundOrEmpty("ammo").getIntOr("cannon", 0), 7, "the item's kept shells");

            player.setShiftKeyDown(false);
            player.getInventory().clearContent();
            List<VehicleEntity> again = placeWith(helper, player, carItem, new Vec3(5.5, 1, 3.5), "racing_car");
            helper.assertValueEqual(fuel(helper, again.getFirst()), 1200, "fuel after placing again");
            near(helper, again.getFirst().getDamage(), 5, 1e-6, "damage after placing again");
            helper.assertValueEqual(paint(helper, again.getFirst()), "red", "paint after placing again");
            helper.assertValueEqual(saved(helper, again.getFirst()).getListOrEmpty("Items").size(), 0, "the boot after placing again");
            List<VehicleEntity> tankAgain = placeWith(helper, player, tankItem, new Vec3(5.5, 1, 7.5), "battle_tank");
            helper.assertValueEqual(ammo(helper, tankAgain.getFirst(), "cannon"), 7, "shells after placing again");

            VehicleEntity ridden = again.getFirst();
            use(rider.player, ridden);
            helper.assertTrue(rider.player.getVehicle() == ridden, "the rider did not get in");
            player.setShiftKeyDown(true);
            player.attack(ridden);
            helper.assertFalse(ridden.isRemoved(), "a car with a passenger was picked up");
            helper.assertTrue(ridden.getDamage() > 5, "the hit did no damage: " + ridden.getDamage());
            rider.player.stopRiding();
            ridden.discard();
            tankAgain.getFirst().discard();
        } finally {
            ears.close();
            rider.close();
        }
        helper.succeed();
    }

    private static List<VehicleEntity> placeWith(GameTestHelper helper, ServerPlayer player, ItemStack stack, Vec3 at, String path) {
        player.snapTo(helper.absoluteVec(at));
        player.setYRot(0);
        player.setXRot(90);
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        InteractionResult result = player.gameMode.useItem(player, helper.getLevel(), stack, InteractionHand.MAIN_HAND);
        helper.assertTrue(result.consumesAction(), "placing the picked-up " + path + ": " + result);
        Vec3 abs = helper.absoluteVec(at);
        List<VehicleEntity> found = helper.getLevel().getEntitiesOfClass(VehicleEntity.class, new AABB(abs, abs).inflate(2),
                v -> v.getType() == type(helper, path));
        helper.assertValueEqual(found.size(), 1, path + " placed again");
        return found;
    }

    // Keys

    /**
     * The {@code flare} key (J, {@code when: in_vehicle}, cooldown 40) does nothing on foot; seated in the car, a press
     * runs the {@code flares} script's handler (the firework launch sound, heard by the player too, and firework particles above the car); a press 5
     * ticks later does nothing (the cooldown), one 45 ticks after the first flare works again.
     */
    @GameTest(structure = ARENA, maxTicks = 120)
    public void theFlareKeyWorksOnlySeatedWithItsCooldown(GameTestHelper helper) {
        clear(helper);
        VehicleEntity car = spawn(helper, "racing_car", new Vec3(5.5, 1, 5.5), 0);
        ParityEars ears = new ParityEars(helper, new BlockPos(3, 1, 5), GameType.SURVIVAL, "msm-vh-flare");
        Runnable close = () -> {
            ears.player.stopRiding();
            car.discard();
            ears.close();
        };
        long[] first = {0};
        java.util.function.Function<String, Long> flares = what -> {
            List<Packet<?>> packets = ears.packets();
            long sounds = sounds(packets).stream().filter(FIREWORK_LAUNCH::equals).count();
            long sparks = particles(packets, FIREWORK);
            if ((sounds == 0) != (sparks == 0)) {
                close.run();
                helper.fail(what + ": " + sounds + " launch sound(s) but " + sparks + " firework particle packet(s)");
            }
            return sounds;
        };
        try {
            tap(helper, ears.player, FLARE);
        } catch (RuntimeException e) {
            close.run();
            throw e;
        }
        helper.startSequence()
                .thenIdle(1)
                .thenExecute(() -> {
                    long n = flares.apply("on foot");
                    if (n != 0) {
                        close.run();
                        helper.fail("a flare on foot");
                    }
                    use(ears.player, car);
                    if (ears.player.getVehicle() != car) {
                        close.run();
                        helper.fail("the player did not get in");
                    }
                    tap(helper, ears.player, FLARE);
                    first[0] = helper.getLevel().getGameTime();
                })
                .thenIdle(1)
                .thenExecute(() -> {
                    long n = flares.apply("seated");
                    if (n != 1) {
                        close.run();
                        helper.fail(n + " flares from the first press seated");
                    }
                })
                .thenIdle(4)
                .thenExecute(() -> tap(helper, ears.player, FLARE))
                .thenIdle(1)
                .thenExecute(() -> {
                    long n = flares.apply("within the cooldown");
                    if (n != 0) {
                        close.run();
                        helper.fail("a flare " + (helper.getLevel().getGameTime() - first[0]) + " ticks after the first");
                    }
                })
                .thenWaitUntil(() -> helper.assertTrue(helper.getLevel().getGameTime() - first[0] >= 45, "waiting"))
                .thenExecute(() -> tap(helper, ears.player, FLARE))
                .thenIdle(1)
                .thenExecute(() -> {
                    long n = flares.apply("after the cooldown");
                    close.run();
                    helper.assertValueEqual(n, 1L, "flares after the cooldown");
                })
                .thenSucceed();
    }

    /**
     * Pressing {@code status} (K, any time) sets the hidden {@code status_line} to the keys' text and shows it; releasing
     * hides it again. A spectator's press is dropped: nothing changes for them.
     */
    @GameTest(structure = ARENA, maxTicks = 40)
    public void theStatusKeyShowsAndHidesTheStatusLine(GameTestHelper helper) {
        clear(helper);
        ParityEars ears = new ParityEars(helper, new BlockPos(3, 1, 5), GameType.SURVIVAL, "msm-vh-status");
        ParityEars ghost = new ParityEars(helper, new BlockPos(7, 1, 5), GameType.SPECTATOR, "msm-vh-status-ghost");
        List<Hud> hud = new ArrayList<>();
        List<Hud> ghostHud = new ArrayList<>();
        Runnable close = () -> {
            ears.close();
            ghost.close();
        };
        try {
            listenToHud(helper, ears.player);
            listenToHud(helper, ghost.player);
        } catch (RuntimeException e) {
            close.run();
            throw e;
        }
        helper.startSequence()
                .thenIdle(6)
                .thenExecute(() -> {
                    read(helper, ears, hud, null);
                    read(helper, ghost, ghostHud, null);
                    hud.clear();
                    ghostHud.clear();
                    key(helper, ears.player, STATUS, true);
                    key(helper, ghost.player, STATUS, true);
                })
                .thenIdle(1)
                .thenExecute(() -> {
                    read(helper, ears, hud, null);
                    read(helper, ghost, ghostHud, null);
                    List<Hud> line = slot(hud, HUD_STATUS_LINE);
                    boolean ok = line.size() == 1 && line.getFirst().text().equals(Optional.of(STATUS_TEXT))
                            && line.getFirst().visible().equals(Optional.of(true)) && line.getFirst().number().isEmpty();
                    if (!ok) {
                        close.run();
                        helper.fail("status_line after the press: " + line);
                    }
                    hud.clear();
                    key(helper, ears.player, STATUS, false);
                })
                .thenIdle(1)
                .thenExecute(() -> {
                    read(helper, ears, hud, null);
                    read(helper, ghost, ghostHud, null);
                    List<Hud> line = slot(hud, HUD_STATUS_LINE);
                    List<Hud> ghostLine = slot(ghostHud, HUD_STATUS_LINE);
                    close.run();
                    helper.assertValueEqual(line.size(), 1, "status_line entries after the release: " + line);
                    helper.assertTrue(line.getFirst().visible().equals(Optional.of(false)) && line.getFirst().text().isEmpty(),
                            "status_line after the release: " + line);
                    helper.assertTrue(ghostLine.isEmpty(), "a spectator's press changed status_line: " + ghostLine);
                })
                .thenSucceed();
    }

    /**
     * Driving the tank with the HUD channel registered: {@code flare_charge} is synced as the script's 100,
     * {@code tank_shells} as the 16 loaded, and {@code speedometer} as 0 when seated, then 5.0 blocks a second while the
     * tank moves 0.25 blocks a tick (the server's position of a driven vehicle comes from the driver's client, so the test
     * moves it), 0 again once it stops; a shot syncs 15 shells; getting out clears the speedometer and the shells.
     */
    @GameTest(structure = ARENA, maxTicks = 200)
    public void theHudSyncsFlareChargeSpeedometerAndShells(GameTestHelper helper) {
        clear(helper);
        VehicleEntity tank = spawn(helper, "battle_tank", new Vec3(5.5, 1, 2.5), 0);
        ParityEars ears = new ParityEars(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "msm-vh-hud");
        List<Hud> hud = new ArrayList<>();
        boolean[] moving = {false};
        Runnable close = () -> {
            ears.player.stopRiding();
            takeShells(helper, tank.position());
            tank.discard();
            ears.close();
        };
        try {
            ears.player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(item(helper, "battle_tank_shell"), 16));
            use(ears.player, tank);
            use(ears.player, tank);
            helper.assertTrue(ears.player.getVehicle() == tank, "the driver is not in the tank");
            ears.player.setYRot(0);
            listenToHud(helper, ears.player);
        } catch (RuntimeException e) {
            close.run();
            throw e;
        }
        helper.onEachTick(() -> {
            if (ears.player.isRemoved()) {
                return;
            }
            if (moving[0]) {
                tank.setPos(tank.getX(), tank.getY(), tank.getZ() + 0.25);
            }
            read(helper, ears, hud, null);
        });
        java.util.function.BiPredicate<Integer, Double> has = (s, n) -> slot(hud, s).stream().anyMatch(h -> h.number().equals(Optional.of(n)));
        helper.startSequence()
                .thenWaitUntil(() -> {
                    helper.assertTrue(has.test(HUD_FLARE_CHARGE, 100.0), "flare_charge: " + slot(hud, HUD_FLARE_CHARGE));
                    helper.assertTrue(has.test(HUD_TANK_SHELLS, 16.0), "tank_shells: " + slot(hud, HUD_TANK_SHELLS));
                    helper.assertTrue(has.test(HUD_SPEEDOMETER, 0.0), "speedometer: " + slot(hud, HUD_SPEEDOMETER));
                })
                .thenExecute(() -> {
                    hud.clear();
                    moving[0] = true;
                })
                .thenWaitUntil(() -> helper.assertTrue(has.test(HUD_SPEEDOMETER, 5.0), "speedometer moving: " + slot(hud, HUD_SPEEDOMETER)))
                .thenExecute(() -> {
                    moving[0] = false;
                    hud.clear();
                })
                .thenWaitUntil(() -> helper.assertTrue(has.test(HUD_SPEEDOMETER, 0.0), "speedometer stopped: " + slot(hud, HUD_SPEEDOMETER)))
                .thenExecute(() -> {
                    hud.clear();
                    tap(helper, ears.player, FIRE);
                    takeShells(helper, tank.position());
                })
                .thenWaitUntil(() -> helper.assertTrue(has.test(HUD_TANK_SHELLS, 15.0), "tank_shells after a shot: " + slot(hud, HUD_TANK_SHELLS)))
                .thenExecute(() -> {
                    hud.clear();
                    ears.player.stopRiding();
                })
                .thenWaitUntil(() -> {
                    helper.assertTrue(slot(hud, HUD_SPEEDOMETER).stream().anyMatch(Hud::cleared), "speedometer on foot: " + slot(hud, HUD_SPEEDOMETER));
                    helper.assertTrue(slot(hud, HUD_TANK_SHELLS).stream().anyMatch(Hud::cleared), "tank_shells on foot: " + slot(hud, HUD_TANK_SHELLS));
                })
                .thenExecute(close)
                .thenSucceed();
    }
}
