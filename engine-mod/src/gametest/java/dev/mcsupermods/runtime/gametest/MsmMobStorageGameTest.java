package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.registry.MsmAnimal;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.mob.MobShoulder;
import dev.mcsupermods.runtime.registry.mob.MobStorage;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.protocol.game.ServerboundPlayerCommandPacket;
import net.minecraft.network.protocol.game.ServerboundPlayerLoadedPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.HasCustomInventoryScreen;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Input;
import net.minecraft.world.inventory.ChestMenu;
import net.minecraft.world.inventory.InventoryMenu;
import net.minecraft.world.inventory.MerchantMenu;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.portal.TeleportTransition;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Mount storage and shoulder pets (ADR 0098 D3, D4 as amended; B479). Storage: {@code storage_mule} (a tameable,
 * rideable {@code animal} with a 2-row store) and {@code storage_crate} (a {@code mob} trader whose 1-row store needs a
 * chest, with barrel sounds). Shoulders: {@code shoulder_pet} (a tameable walker) and {@code shoulder_flyer} (a
 * {@code fly} mover, which has {@code NoGravity} of its own). Clicks go through {@code Player.interactOn}, the inventory
 * key through the server's own handling of the player command packet.
 */
public class MsmMobStorageGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final BlockPos MID = new BlockPos(1, 2, 1);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static <T extends PathfinderMob> EntityType<T> type(String path) {
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static MobStorage storage(PathfinderMob mob) {
        return ((MsmMob) mob).driver().storage();
    }

    private static MobShoulder shoulder(PathfinderMob mob) {
        return ((MsmMob) mob).driver().shoulder();
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, BlockPos pos) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(pos)));
        player.setOnGround(true);
        // As a real client's first packet: until then the server ignores the inventory key and the player takes no damage.
        player.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
        return player;
    }

    private static void leave(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            player.closeContainer();
            player.stopRiding();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    /** Sneaking as the client says it: the player's own tick takes the shift key from the last client input. */
    private static void sneak(ServerPlayer player, boolean sneaking) {
        player.setLastClientInput(new Input(false, false, false, false, false, sneaking, false));
        player.setShiftKeyDown(sneaking);
    }

    private static void use(ServerPlayer player, Entity mob, ItemStack held, boolean sneaking) {
        player.setShiftKeyDown(sneaking);
        player.setItemInHand(InteractionHand.MAIN_HAND, held);
        player.interactOn(mob, InteractionHand.MAIN_HAND, Vec3.ZERO);
        player.setShiftKeyDown(false);
    }

    private static ChestMenu chest(GameTestHelper helper, ServerPlayer player, MobStorage storage, int rows, String what) {
        if (!(player.containerMenu instanceof ChestMenu menu)) {
            throw helper.assertionException(what + ": no chest menu (" + player.containerMenu.getClass().getSimpleName() + ")");
        }
        helper.assertTrue(menu.getContainer() == storage.container(), what + ": the menu is not the mob's store");
        helper.assertValueEqual(menu.getRowCount(), rows, what + ": rows");
        return menu;
    }

    private static CompoundTag save(ServerLevel level, Entity mob) {
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        mob.saveWithoutId(out);
        return out.buildResult();
    }

    private static <T extends PathfinderMob> T load(GameTestHelper helper, String path, CompoundTag tag) {
        ServerLevel level = helper.getLevel();
        T copy = MsmMobStorageGameTest.<T>type(path).create(level, EntitySpawnReason.LOAD);
        helper.assertTrue(copy != null, "no copy of " + path);
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
        return copy;
    }

    private static int dropped(GameTestHelper helper, Vec3 around, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(around, around).inflate(4), e -> e.getItem().is(item))
                .stream().mapToInt(e -> e.getItem().getCount()).sum();
    }

    private static void near(GameTestHelper helper, Entity pet, ServerPlayer owner, String what) {
        Vec3 expected = owner.position().add(MobShoulder.offset(owner));
        double off = pet.position().distanceTo(expected);
        helper.assertTrue(off < 1.0e-3, what + ": the pet is " + off + " blocks from the shoulder (" + pet.position() + ", expected " + expected + ")");
    }

    // Mount storage (ADR 0098 D3)

    @GameTest
    public void sneakUseOpensTheOwnersStoreAndPlainUseStillMounts(GameTestHelper helper) {
        MsmAnimal mule = helper.spawnWithNoFreeWill(type("storage_mule"), MID);
        ServerPlayer owner = player(helper, MID.east());
        ServerPlayer stranger = player(helper, MID.west());
        try {
            helper.assertTrue(mule instanceof HasCustomInventoryScreen, "a mob with msm:storage takes the inventory key");
            MobStorage storage = storage(mule);
            helper.assertTrue(storage.enabled() && storage.hasStore(), "storage_mule has no store");
            use(owner, mule, ItemStack.EMPTY, true);
            helper.assertTrue(owner.containerMenu instanceof InventoryMenu, "a wild tameable mule opened its store");
            mule.tame(owner);
            use(stranger, mule, ItemStack.EMPTY, true);
            helper.assertTrue(stranger.containerMenu instanceof InventoryMenu, "a stranger opened a tamed mule's store");
            use(owner, mule, ItemStack.EMPTY, true);
            chest(helper, owner, storage, 2, "the owner's sneaking use");
            helper.assertTrue(owner.containerMenu.stillValid(owner), "the menu is not valid beside the mule");
            owner.closeContainer();
            use(owner, mule, new ItemStack(Items.BONE), true);
            chest(helper, owner, storage, 2, "sneaking with the taming food");
            owner.closeContainer();
            use(owner, mule, ItemStack.EMPTY, false);
            helper.assertTrue(owner.getVehicle() == mule, "a plain use no longer mounts");
            helper.assertTrue(owner.containerMenu instanceof InventoryMenu, "a plain use opened the store");
            owner.stopRiding();
            use(owner, mule, ItemStack.EMPTY, true);
            ChestMenu open = chest(helper, owner, storage, 2, "sneaking again");
            mule.kill(helper.getLevel());
            helper.assertFalse(open.stillValid(owner), "a dead mule's store stays valid");
        } finally {
            leave(helper, owner, stranger);
        }
        helper.succeed();
    }

    @GameTest
    public void theInventoryKeyOpensTheStoreFromTheSaddle(GameTestHelper helper) {
        MsmAnimal mule = helper.spawnWithNoFreeWill(type("storage_mule"), MID);
        PathfinderMob horse = helper.spawnWithNoFreeWill(type("rd_horse"), MID.south(2));
        ServerPlayer owner = player(helper, MID.east());
        try {
            helper.assertFalse(horse instanceof HasCustomInventoryScreen,
                    "a rideable mob without storage would take its rider's inventory key");
            mule.tame(owner);
            helper.assertTrue(owner.startRiding(mule), "the owner could not ride the mule");
            owner.connection.handlePlayerCommand(new ServerboundPlayerCommandPacket(owner, ServerboundPlayerCommandPacket.Action.OPEN_INVENTORY));
            ChestMenu menu = chest(helper, owner, storage(mule), 2, "the inventory key while riding");
            helper.assertTrue(menu.stillValid(owner), "the menu is not valid from the saddle");
            owner.closeContainer();
            owner.stopRiding();
            ((HasCustomInventoryScreen) mule).openCustomInventoryScreen(owner);
            chest(helper, owner, storage(mule), 2, "openCustomInventoryScreen");
        } finally {
            leave(helper, owner);
        }
        helper.succeed();
    }

    @GameTest
    public void aChestAddsTheStoreAndPlainUseStillTrades(GameTestHelper helper) {
        PathfinderMob crate = helper.spawnWithNoFreeWill(type("storage_crate"), MID);
        ServerPlayer player = player(helper, MID.east());
        try {
            MobStorage storage = storage(crate);
            helper.assertTrue(storage.enabled() && !storage.hasStore(), "needs_chest: no store before the chest");
            use(player, crate, ItemStack.EMPTY, true);
            helper.assertTrue(player.containerMenu instanceof MerchantMenu, "without the chest a sneaking use passes on to trading");
            player.closeContainer();
            ItemStack chests = new ItemStack(Items.CHEST, 2);
            use(player, crate, chests, false);
            helper.assertTrue(storage.hasChest() && storage.hasStore(), "the chest did not add the store");
            helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "the chest was not used up");
            helper.assertTrue(player.containerMenu instanceof InventoryMenu, "adding the chest opened a menu");
            use(player, crate, new ItemStack(Items.CHEST), false);
            helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "a second chest was taken");
            player.closeContainer();
            use(player, crate, ItemStack.EMPTY, true);
            chest(helper, player, storage, 1, "a sneaking use after the chest");
            player.closeContainer();
            use(player, crate, ItemStack.EMPTY, false);
            helper.assertTrue(player.containerMenu instanceof MerchantMenu, "a plain use no longer trades");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    @GameTest
    public void contentsAreSavedAndDroppedOnDeath(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        PathfinderMob crate = helper.spawnWithNoFreeWill(type("storage_crate"), MID);
        ServerPlayer player = player(helper, MID.east());
        try {
            use(player, crate, new ItemStack(Items.CHEST), false);
            storage(crate).container().setItem(0, new ItemStack(Items.DIAMOND, 5));
            storage(crate).container().setItem(8, new ItemStack(Items.APPLE, 3));
            CompoundTag tag = save(level, crate);
            helper.assertTrue(tag.contains("StorageItems") && tag.getBooleanOr("StorageChest", false), "save keys: " + tag.keySet());
            PathfinderMob copy = load(helper, "storage_crate", tag);
            MobStorage loaded = storage(copy);
            helper.assertTrue(loaded.hasChest(), "the chest was not loaded");
            ItemStack diamonds = loaded.container().getItem(0);
            helper.assertTrue(diamonds.is(Items.DIAMOND) && diamonds.getCount() == 5, "loaded slot 0: " + diamonds);
            helper.assertTrue(loaded.container().countItem(Items.APPLE) == 3, "loaded apples: " + loaded.container().countItem(Items.APPLE));
            CompoundTag plain = save(level, helper.spawnWithNoFreeWill(type("rd_horse"), MID.south(2)));
            helper.assertFalse(plain.contains("StorageItems"), "a mob without msm:storage saved storage data");

            Vec3 at = crate.position();
            crate.kill(level);
            helper.assertValueEqual(dropped(helper, at, Items.DIAMOND), 5, "diamonds dropped");
            helper.assertValueEqual(dropped(helper, at, Items.APPLE), 3, "apples dropped");
            helper.assertValueEqual(dropped(helper, at, Items.CHEST), 1, "the chest dropped");
            helper.assertTrue(storage(crate).container().isEmpty() && !storage(crate).hasChest(), "the dead mob kept its store");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    // Shoulder pets (ADR 0098 D4 as amended)

    @GameTest(maxTicks = 60)
    public void aPerchedPetStaysOnTheShoulderThroughATeleportAndIsSaved(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmAnimal pet = helper.spawnWithNoFreeWill(type("shoulder_pet"), MID);
        ServerPlayer owner = player(helper, MID.east());
        MobShoulder shoulder = shoulder(pet);
        helper.assertTrue(shoulder.enabled(), "shoulder_pet cannot perch");
        helper.assertValueEqual(shoulder.refusal(owner), "not tamed by this player", "a wild pet");
        helper.assertFalse(shoulder.perch(owner), "a wild pet perched");
        pet.tame(owner);
        owner.setYRot(90);
        owner.setYHeadRot(90);
        owner.yBodyRot = 90;
        helper.assertTrue(shoulder.perch(owner), "perch refused: " + shoulder.refusal(owner));
        helper.assertTrue(shoulder.perched() && pet.isNoGravity() && pet.noPhysics, "perched without its flags");
        helper.assertFalse(pet.isPushable(), "a perched pet can be pushed");
        helper.assertTrue(MobShoulder.perchedOn(owner) == pet, "the server index does not know the pet");
        near(helper, pet, owner, "right after perching");
        Vec3 standing = MobShoulder.offset(owner);
        helper.assertTrue(Math.abs(standing.y - 1.35) < 1.0e-6 && Math.abs(standing.z + 0.4) < 1.0e-6,
                "the shoulder 90 degrees round: " + standing);

        CompoundTag tag = save(level, pet);
        helper.assertTrue(tag.getBooleanOr("Perched", false), "the perched flag was not saved: " + tag.keySet());
        helper.assertFalse(tag.getBooleanOr("PerchNoGravity", true), "the earlier NoGravity was not saved");
        MsmAnimal copy = load(helper, "shoulder_pet", tag);
        helper.assertTrue(shoulder(copy).perched() && copy.noPhysics, "the loaded pet is not perched");

        helper.runAfterDelay(3, () -> {
            near(helper, pet, owner, "three ticks later");
            Vec3 to = owner.position().add(7, 0, 3);
            owner.teleportTo(to.x, to.y, to.z);
            owner.setOnGround(true);
            helper.runAfterDelay(3, () -> {
                helper.assertTrue(shoulder.perched(), "a teleport in the same dimension threw the pet off");
                near(helper, pet, owner, "after the teleport");
                sneak(owner, true);
                helper.runAfterDelay(2, () -> {
                    helper.assertFalse(shoulder.perched(), "sneaking kept the pet on");
                    helper.assertFalse(pet.isNoGravity() || pet.noPhysics, "the flags stayed after leaving");
                    helper.assertTrue(shoulder.cooldown() > MobShoulder.COOLDOWN - 3, "no cooldown after leaving: " + shoulder.cooldown());
                    sneak(owner, false);
                    helper.assertValueEqual(shoulder.refusal(owner), "cooling down", "right after leaving");
                    CompoundTag after = save(level, pet);
                    helper.assertFalse(after.getBooleanOr("Perched", true), "the cleared flag was not saved");
                    helper.assertTrue(after.getIntOr("ShoulderCooldown", 0) > 0, "the cooldown was not saved");
                    helper.assertTrue(MobShoulder.perchedOn(owner) == null, "the index kept the pet");
                    leave(helper, owner);
                    helper.succeed();
                });
            });
        });
    }

    @GameTest(maxTicks = 40)
    public void damageOrLeavingTakesThePetOffAndOnlyOneSits(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MsmAnimal first = helper.spawnWithNoFreeWill(type("shoulder_pet"), MID);
        MsmAnimal second = helper.spawnWithNoFreeWill(type("shoulder_pet"), MID.north());
        ServerPlayer owner = player(helper, MID.east());
        first.tame(owner);
        second.tame(owner);
        helper.assertTrue(shoulder(first).perch(owner), "perch refused: " + shoulder(first).refusal(owner));
        helper.assertValueEqual(shoulder(second).refusal(owner), "another pet is on that shoulder", "one pet per player");
        helper.assertFalse(shoulder(second).perch(owner), "a second pet perched");
        helper.assertTrue(owner.hurtServer(level, level.damageSources().fellOutOfWorld(), 1.0f), "the owner was not hurt");
        helper.assertFalse(shoulder(first).perched(), "damage kept the pet on");
        helper.assertFalse(first.isNoGravity(), "NoGravity stayed after damage");
        helper.assertTrue(shoulder(second).perch(owner), "the second pet could not perch once the first left: "
                + shoulder(second).refusal(owner));
        helper.getLevel().getServer().getPlayerList().remove(owner);
        helper.runAfterDelay(2, () -> {
            helper.assertFalse(shoulder(second).perched(), "the pet stayed perched after its owner left");
            helper.assertFalse(second.isNoGravity() || second.noPhysics, "the flags stayed after the owner left");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 40)
    public void aDimensionChangeTakesThePetOffAndAFlyerKeepsItsNoGravity(GameTestHelper helper) {
        MsmAnimal pet = helper.spawnWithNoFreeWill(type("shoulder_flyer"), MID);
        ServerPlayer owner = player(helper, MID.east());
        helper.assertTrue(pet.isNoGravity(), "a fly mover without NoGravity");
        pet.tame(owner);
        helper.assertTrue(shoulder(pet).perch(owner), "perch refused: " + shoulder(pet).refusal(owner));
        ServerLevel nether = helper.getLevel().getServer().getLevel(Level.NETHER);
        helper.assertTrue(nether != null, "no nether");
        helper.runAfterDelay(1, () -> {
            owner.teleport(new TeleportTransition(nether, new Vec3(0.5, 100, 0.5), Vec3.ZERO, 0f, 0f, TeleportTransition.DO_NOTHING));
            helper.runAfterDelay(2, () -> {
                helper.assertFalse(shoulder(pet).perched(), "the pet stayed perched across a dimension change");
                helper.assertTrue(pet.level() == helper.getLevel() && !pet.isRemoved(), "the pet left its dimension");
                helper.assertTrue(pet.isNoGravity() && !pet.noPhysics, "the flyer did not get its own NoGravity back");
                leave(helper, owner);
                helper.succeed();
            });
        });
    }

    @GameTest(structure = ARENA, maxTicks = 200)
    public void aTamedPetWalksToItsOwnerAndPerches(GameTestHelper helper) {
        MsmAnimal pet = helper.spawn(type("shoulder_pet"), new BlockPos(2, 1, 5));
        MsmAnimal sitter = helper.spawn(type("shoulder_pet"), new BlockPos(8, 1, 8));
        ServerPlayer owner = player(helper, new BlockPos(6, 1, 5));
        pet.tame(owner);
        sitter.tame(owner);
        sitter.setOrderedToSit(true);
        helper.assertValueEqual(shoulder(sitter).refusal(owner), "ordered to sit", "a sitting pet");
        helper.succeedWhen(() -> {
            owner.setOnGround(true);
            helper.assertTrue(shoulder(pet).perched(), "not perched yet; refusal: " + shoulder(pet).refusal(owner)
                    + ", distance " + pet.distanceTo(owner));
            helper.assertFalse(shoulder(sitter).perched(), "a pet ordered to sit perched");
            leave(helper, owner);
        });
    }
}
