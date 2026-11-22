package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.registry.MsmAnimal;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.mob.MobBuckets;
import dev.mcsupermods.runtime.registry.mob.MobHabits;
import dev.mcsupermods.runtime.registry.mob.MobMovement;
import dev.mcsupermods.runtime.registry.mob.MobRiding;
import dev.mcsupermods.runtime.registry.mob.MobShoulder;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ServerboundPlayerLoadedPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.util.ProblemReporter;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.Bucketable;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.targeting.TargetingConditions;
import net.minecraft.world.entity.animal.parrot.Parrot;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.storage.TagValueInput;
import net.minecraft.world.level.storage.TagValueOutput;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Mobs 2 (ADR 0109 D1 to D5 as amended after B524; B532): fish buckets ({@code mob2_fish} with water and variants,
 * {@code mob2_dry_fish} without water), both shoulders ({@code shoulder_pet} takes either side, {@code mob2_pet_left}
 * only the left; vanilla parrots set on the owner's shoulders), hovering ({@code mob2_hover}), phasing through a wall
 * ({@code mob2_phase}), swooping ({@code mob2_swooper}), roosting ({@code mob2_roost}), the habits ({@code mob2_collector},
 * {@code mob2_digger}, {@code mob2_dead}, {@code mob2_barterer}) and the dash ({@code mob2_camel}). Most tests run in
 * {@code mob2_yard}: a 17 x 12 x 17 glass box on a stone floor (inside x and z 1 to 15, y 1 to 10), so every mob a test
 * needs stays inside the test's own loaded chunks. Mock players are never on the ground by themselves; the tests set it.
 */
public class MsmMob2GameTest {
    private static final String YARD = "msm_runtime_gametest:mob2_yard";

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static <T extends PathfinderMob> EntityType<T> type(String path) {
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static MsmMob msm(Entity mob) {
        return (MsmMob) mob;
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, BlockPos pos) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(pos)));
        player.setOnGround(true);
        player.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
        return player;
    }

    private static void leave(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            player.stopRiding();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    private static InteractionResult use(ServerPlayer player, Entity mob, ItemStack held) {
        player.setItemInHand(InteractionHand.MAIN_HAND, held);
        return player.interactOn(mob, InteractionHand.MAIN_HAND, Vec3.ZERO);
    }

    private static CompoundTag save(ServerLevel level, Entity mob) {
        TagValueOutput out = TagValueOutput.createWithContext(ProblemReporter.DISCARDING, level.registryAccess());
        mob.saveWithoutId(out);
        return out.buildResult();
    }

    private static <T extends PathfinderMob> T load(GameTestHelper helper, String path, CompoundTag tag) {
        ServerLevel level = helper.getLevel();
        T copy = MsmMob2GameTest.<T>type(path).create(level, EntitySpawnReason.LOAD);
        helper.assertTrue(copy != null, "no copy of " + path);
        copy.load(TagValueInput.create(ProblemReporter.DISCARDING, level.registryAccess(), tag));
        return copy;
    }

    private static List<ItemEntity> items(GameTestHelper helper, Vec3 around, double range, Item item) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(around, around).inflate(range),
                e -> item == null || e.getItem().is(item));
    }

    private static int count(List<ItemEntity> items) {
        return items.stream().mapToInt(e -> e.getItem().getCount()).sum();
    }

    /** The y (absolute) of the yard's floor top. */
    private static double floor(GameTestHelper helper) {
        return helper.absoluteVec(new Vec3(0, 1, 0)).y;
    }

    // D1 Fish buckets

    @GameTest(structure = YARD, maxTicks = 40)
    public void aWaterBucketTakesTheFishWhichComesBackWithItsNameHealthAndVariant(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        for (int x = 5; x <= 9; x++) {
            for (int z = 5; z <= 9; z++) {
                helper.setBlock(new BlockPos(x, 1, z), Blocks.WATER);
            }
        }
        PathfinderMob fish = helper.spawn(type("mob2_fish"), new BlockPos(7, 1, 7));
        helper.assertTrue(fish instanceof Bucketable && msm(fish).driver().buckets().enabled(), "mob2_fish is not bucketable");
        Item bucketItem = MobBuckets.bucketOf(fish.getType()).orElseThrow(() -> helper.assertionException("no bucket item"));
        helper.assertValueEqual(BuiltInRegistries.ITEM.getKey(bucketItem), EntityComponents.Bucketable.itemId(id("mob2_fish")), "bucket id");
        helper.assertValueEqual(new ItemStack(bucketItem).getMaxStackSize(), 1, "the bucket stacks to");
        fish.setCustomName(Component.literal("Finn"));
        fish.setHealth(3.0f);
        msm(fish).driver().variants().setById("silver");
        ServerPlayer catcher = player(helper, new BlockPos(7, 1, 4));
        helper.assertTrue(use(catcher, fish, new ItemStack(Items.WATER_BUCKET)).consumesAction(), "the water bucket did not take the fish");
        ItemStack held = catcher.getMainHandItem();
        helper.assertTrue(held.is(bucketItem) && held.getCount() == 1, "held after the pickup: " + held);
        CompoundTag data = held.getOrDefault(DataComponents.BUCKET_ENTITY_DATA, CustomData.EMPTY).copyTag();
        helper.assertValueEqual(data.getStringOr("Variant", ""), "silver", "the variant in the bucket");
        helper.assertTrue(Math.abs(data.getFloatOr("Health", 0) - 3.0f) < 1.0e-4, "the health in the bucket: " + data);
        helper.assertTrue(fish.isRemoved(), "the fish stayed in the water");

        ServerPlayer releaser = player(helper, new BlockPos(12, 1, 12));
        Vec3 eye = releaser.position();
        releaser.snapTo(eye.x, eye.y, eye.z, 0f, 90f); // straight down
        releaser.setItemInHand(InteractionHand.MAIN_HAND, held.copy());
        helper.assertTrue(releaser.gameMode.useItem(releaser, level, releaser.getMainHandItem(), InteractionHand.MAIN_HAND).consumesAction(),
                "the bucket was not emptied");
        helper.assertTrue(releaser.getMainHandItem().is(Items.BUCKET), "left in hand: " + releaser.getMainHandItem());
        helper.assertBlockPresent(Blocks.WATER, new BlockPos(12, 1, 12));
        List<PathfinderMob> released = level.getEntitiesOfClass(PathfinderMob.class, new AABB(helper.absolutePos(new BlockPos(12, 1, 12))).inflate(1.5),
                e -> e.getType() == fish.getType());
        helper.assertValueEqual(released.size(), 1, "released fish");
        PathfinderMob back = released.getFirst();
        helper.assertValueEqual(back.getCustomName() == null ? null : back.getCustomName().getString(), "Finn", "the name");
        helper.assertTrue(Math.abs(back.getHealth() - 3.0f) < 1.0e-4, "the health: " + back.getHealth());
        helper.assertValueEqual(msm(back).driver().variants().id().orElse(""), "silver", "the variant");
        helper.assertTrue(((Bucketable) back).fromBucket() && back.requiresCustomPersistence(), "not marked as from a bucket");
        CompoundTag tag = save(level, back);
        helper.assertTrue(tag.getBooleanOr("FromBucket", false), "FromBucket was not saved: " + tag.keySet());
        helper.assertTrue(((Bucketable) load(helper, "mob2_fish", tag)).fromBucket(), "FromBucket was not loaded");
        leave(helper, catcher, releaser);
        helper.succeed();
    }

    @GameTest(structure = YARD, maxTicks = 20)
    public void anEmptyBucketTakesADryFishAndPutsItBackWithoutWater(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        PathfinderMob fish = helper.spawn(type("mob2_dry_fish"), new BlockPos(4, 1, 4));
        PathfinderMob flyer = helper.spawn(type("mob2_flyer"), new BlockPos(10, 1, 4));
        ServerPlayer player = player(helper, new BlockPos(4, 1, 6));
        helper.assertFalse(use(player, flyer, new ItemStack(Items.WATER_BUCKET)).consumesAction() && flyer.isRemoved(),
                "a water bucket took a mob without msm:bucketable");
        helper.assertFalse(flyer.isRemoved(), "a mob without msm:bucketable went into a bucket");
        helper.assertFalse(use(player, fish, new ItemStack(Items.WATER_BUCKET)).consumesAction() && fish.isRemoved(),
                "a water bucket took a fish whose bucket holds no water");
        helper.assertTrue(use(player, fish, new ItemStack(Items.BUCKET)).consumesAction(), "the empty bucket did not take the fish");
        ItemStack held = player.getMainHandItem();
        Item bucket = MobBuckets.bucketOf(fish.getType()).orElseThrow();
        helper.assertTrue(held.is(bucket), "held: " + held);
        helper.assertValueEqual(bucket.getDescriptionId(), "item.msm_test.dry_fish_bucket", "the bucket's item_name");
        BlockPos floor = new BlockPos(8, 0, 8);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(helper.absolutePos(floor)).add(0, 0.5, 0), Direction.UP, helper.absolutePos(floor), false);
        helper.assertTrue(held.useOn(new UseOnContext(player, InteractionHand.MAIN_HAND, hit)).consumesAction(), "the bucket did not put the fish back");
        helper.assertTrue(player.getMainHandItem().is(Items.BUCKET), "left in hand: " + player.getMainHandItem());
        helper.assertBlockPresent(Blocks.AIR, new BlockPos(8, 1, 8));
        List<PathfinderMob> back = level.getEntitiesOfClass(PathfinderMob.class, new AABB(helper.absolutePos(new BlockPos(8, 1, 8))).inflate(1.0),
                e -> e.getType() == fish.getType());
        helper.assertValueEqual(back.size(), 1, "fish put back");
        helper.assertTrue(((Bucketable) back.getFirst()).fromBucket(), "not marked as from a bucket");
        leave(helper, player);
        helper.succeed();
    }

    // D2 Both shoulders

    private static MobShoulder shoulder(Entity pet) {
        return msm(pet).driver().shoulder();
    }

    private static void near(GameTestHelper helper, Entity pet, ServerPlayer owner, MobShoulder.Side side, String what) {
        Vec3 expected = owner.position().add(MobShoulder.offset(owner, side));
        double off = pet.position().distanceTo(expected);
        helper.assertTrue(off < 1.0e-3, what + ": the pet is " + off + " blocks from the " + side + " shoulder");
    }

    @GameTest(structure = YARD, maxTicks = 40)
    public void twoPetsSitOnBothShouldersAndParrotsKeepTheirs(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerPlayer owner = player(helper, new BlockPos(8, 1, 8));
        MsmAnimal first = helper.spawnWithNoFreeWill(type("shoulder_pet"), new BlockPos(6, 1, 8));
        MsmAnimal second = helper.spawnWithNoFreeWill(type("shoulder_pet"), new BlockPos(10, 1, 8));
        MsmAnimal leftOnly = helper.spawnWithNoFreeWill(type("mob2_pet_left"), new BlockPos(8, 1, 6));
        MsmAnimal third = helper.spawnWithNoFreeWill(type("shoulder_pet"), new BlockPos(8, 1, 10));
        for (MsmAnimal pet : List.of(first, second, leftOnly, third)) {
            pet.tame(owner);
        }
        helper.assertValueEqual(shoulder(leftOnly).allowedSides(), List.of(MobShoulder.Side.LEFT), "sides: left");
        Vec3 right = MobShoulder.offset(owner, MobShoulder.Side.RIGHT);
        Vec3 left = MobShoulder.offset(owner, MobShoulder.Side.LEFT);
        helper.assertTrue(Math.abs(right.x + left.x) < 1.0e-9 && Math.abs(right.z + left.z) < 1.0e-9 && right.y == left.y,
                "the left shoulder is not the right one mirrored: " + right + " / " + left);
        helper.assertTrue(right.equals(MobShoulder.offset(owner)), "the one-argument offset is not the right shoulder");

        helper.assertTrue(shoulder(first).perch(owner), "first: " + shoulder(first).refusal(owner));
        helper.assertValueEqual(shoulder(first).side(), MobShoulder.Side.RIGHT, "either takes the right first");
        helper.assertTrue(shoulder(second).perch(owner), "second: " + shoulder(second).refusal(owner));
        helper.assertValueEqual(shoulder(second).side(), MobShoulder.Side.LEFT, "the second pet's side");
        helper.assertValueEqual(shoulder(leftOnly).refusal(owner), "another pet is on that shoulder", "the left is taken");
        helper.assertValueEqual(shoulder(third).refusal(owner), "both shoulders are taken", "a third pet");
        helper.assertTrue(MobShoulder.perchedOn(owner, MobShoulder.Side.RIGHT) == first
                && MobShoulder.perchedOn(owner, MobShoulder.Side.LEFT) == second, "the index");
        CompoundTag tag = save(level, second);
        helper.assertValueEqual(tag.getStringOr("PerchSide", ""), "left", "the saved side");
        helper.runAfterDelay(2, () -> {
            owner.setOnGround(true);
            near(helper, first, owner, MobShoulder.Side.RIGHT, "first");
            near(helper, second, owner, MobShoulder.Side.LEFT, "second");
            // A parrot lands on the left (vanilla's own shoulder data): the second pet has nowhere left and gets off.
            owner.setShoulderParrotLeft(Optional.of(Parrot.Variant.RED_BLUE));
            helper.runAfterDelay(2, () -> {
                helper.assertFalse(shoulder(second).perched(), "a pet stayed on the parrot's shoulder");
                helper.assertTrue(shoulder(first).perched(), "the right pet left too");
                helper.assertValueEqual(shoulder(third).refusal(owner), "both shoulders are taken", "a parrot and a pet");
                // The right pet leaves; with the parrot on the left the left-only pet cannot sit.
                shoulder(first).unperch();
                owner.setOnGround(true);
                helper.assertValueEqual(shoulder(leftOnly).refusal(owner), "a parrot sits on that shoulder", "the parrot's side");
                helper.assertTrue(shoulder(third).perch(owner), "the right was free: " + shoulder(third).refusal(owner));
                helper.assertValueEqual(shoulder(third).side(), MobShoulder.Side.RIGHT, "beside the parrot");
                // The parrot moves to the right: the pet takes the side the parrot left free.
                owner.setShoulderParrotLeft(Optional.empty());
                owner.setShoulderParrotRight(Optional.of(Parrot.Variant.BLUE));
                helper.runAfterDelay(2, () -> {
                    helper.assertTrue(shoulder(third).perched(), "the pet got off instead of moving over");
                    helper.assertValueEqual(shoulder(third).side(), MobShoulder.Side.LEFT, "the side the parrot left free");
                    near(helper, third, owner, MobShoulder.Side.LEFT, "after moving over");
                    owner.setShoulderParrotRight(Optional.empty());
                    leave(helper, owner);
                    helper.succeed();
                });
            });
        });
    }

    // D3 Flight

    @GameTest(structure = YARD, maxTicks = 220)
    public void aHoveringMobHoldsItsHeightOverTheGround(GameTestHelper helper) {
        PathfinderMob mob = helper.spawn(type("mob2_hover"), new BlockPos(8, 1, 8));
        helper.assertValueEqual(msm(mob).driver().movement().mode(), EntityComponents.MovementMode.HOVER, "mode");
        helper.assertTrue(mob.isNoGravity() && mob.getMoveControl() instanceof MobMovement.HoverMoveControl, "not hovering");
        double floor = floor(helper);
        double[] range = {Double.MAX_VALUE, -Double.MAX_VALUE};
        int[] t = {0};
        helper.onEachTick(() -> {
            t[0]++;
            double ground = MobMovement.groundBelow(helper.getLevel(), mob.blockPosition(), 40);
            if (t[0] >= 100) {
                double over = mob.getY() - ground;
                range[0] = Math.min(range[0], over);
                range[1] = Math.max(range[1], over);
            }
            if (t[0] == 200) {
                helper.assertTrue(Math.abs(ground - floor) < 1.0e-6, "the ground below is " + ground + ", the floor " + floor);
                helper.assertTrue(range[0] > 3.0 && range[1] < 5.0, "the height over the ground from tick 100 to 200: " + range[0] + " to " + range[1]);
                helper.assertTrue(mob.getHealth() == mob.getMaxHealth(), "the hovering mob was hurt");
                helper.succeed();
            }
        });
    }

    @GameTest(structure = YARD, maxTicks = 300)
    public void aPhasingMobChargesThroughAWallAndComesOutOfIt(GameTestHelper helper) {
        for (int z = 1; z <= 15; z++) {
            for (int y = 1; y <= 10; y++) {
                helper.setBlock(new BlockPos(8, y, z), Blocks.STONE);
            }
        }
        LivingEntity pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(12, 1, 8));
        PathfinderMob mob = helper.spawn(type("mob2_phase"), new BlockPos(4, 2, 8));
        mob.setTarget(pig);
        float health = mob.getMaxHealth();
        double wall = helper.absoluteVec(new Vec3(8, 0, 0)).x;
        boolean[] charged = {false};
        helper.onEachTick(() -> {
            if (msm(mob).driver().movement().charging()) {
                charged[0] = true;
            }
        });
        helper.succeedWhen(() -> {
            helper.assertTrue(charged[0], "the mob never charged");
            helper.assertTrue(pig.getHealth() < pig.getMaxHealth(), "the pig behind the wall was not hit");
            helper.assertTrue(mob.getX() > wall, "the mob did not get through the wall: x " + mob.getX());
            helper.assertTrue(mob.getHealth() == health, "the mob took damage in the wall: " + mob.getHealth());
            helper.assertFalse(mob.noPhysics, "the mob kept passing through blocks after the charge");
        });
    }

    @GameTest(structure = YARD, maxTicks = 400)
    public void aSwoopingMobCirclesHighThenDivesAtItsTarget(GameTestHelper helper) {
        LivingEntity pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(8, 1, 8));
        PathfinderMob mob = helper.spawn(type("mob2_swooper"), new BlockPos(3, 3, 3));
        mob.setTarget(pig);
        double[] highest = {-Double.MAX_VALUE};
        helper.onEachTick(() -> highest[0] = Math.max(highest[0], mob.getY() - pig.getY()));
        helper.succeedWhen(() -> {
            helper.assertTrue(highest[0] > 3.0, "the mob never circled high: " + highest[0]);
            helper.assertTrue(pig.getHealth() < pig.getMaxHealth(), "the dive never hit");
        });
    }

    @GameTest(structure = YARD, maxTicks = 300)
    public void aRoostingMobHangsUnderABlockAndWakesWhenHurt(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        helper.setBlock(new BlockPos(8, 6, 8), Blocks.STONE);
        PathfinderMob mob = helper.spawn(type("mob2_roost"), new BlockPos(8, 2, 8));
        MobHabits habits = msm(mob).driver().habits();
        double ceiling = helper.absoluteVec(new Vec3(0, 6, 0)).y;
        boolean[] checked = {false};
        helper.succeedWhen(() -> {
            if (!checked[0]) {
                helper.assertTrue(habits.roosting(), "not roosting yet");
                helper.assertTrue(Math.abs(mob.getBoundingBox().maxY - ceiling) < 1.0e-6, "the box's top " + mob.getBoundingBox().maxY
                        + " is not at the block's underside " + ceiling);
                helper.assertTrue(mob.isNoGravity() && mob.getDeltaMovement().lengthSqr() == 0, "hanging with gravity or motion");
                CompoundTag tag = save(level, mob);
                helper.assertTrue(tag.getBooleanOr("Roosting", false), "Roosting was not saved");
                helper.assertTrue(msm(load(helper, "mob2_roost", tag)).driver().habits().roosting(), "Roosting was not loaded");
                mob.hurtServer(level, level.damageSources().generic(), 1.0f);
                checked[0] = true;
            }
            helper.assertFalse(habits.roosting(), "a hurt mob kept hanging");
        });
    }

    // D4 Habits

    @GameTest(structure = YARD, maxTicks = 400)
    public void aCollectorBringsItemsLikeItsOwnToItsOwner(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        ServerPlayer owner = player(helper, new BlockPos(2, 1, 2));
        PathfinderMob mob = helper.spawn(type("mob2_collector"), new BlockPos(3, 1, 3));
        MobHabits habits = msm(mob).driver().habits();
        helper.assertTrue(use(owner, mob, new ItemStack(Items.EMERALD, 2)).consumesAction(), "the collector did not take the emerald");
        helper.assertTrue(habits.liked().is(Items.EMERALD) && owner.getMainHandItem().getCount() == 1, "given: " + habits.liked()
                + ", left " + owner.getMainHandItem());
        owner.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        helper.assertTrue(save(level, mob).contains("CollectLiked"), "the given item was not saved");
        for (int i = 0; i < 3; i++) {
            helper.spawnItem(Items.EMERALD, new Vec3(12.5 + (i % 2), 1, 12.5 + i / 2));
        }
        helper.spawnItem(Items.DIRT, new Vec3(13.5, 1, 13.5));
        Vec3 home = owner.position();
        helper.succeedWhen(() -> {
            owner.setOnGround(true);
            int near = count(items(helper, home, 4, Items.EMERALD)) + owner.getInventory().countItem(Items.EMERALD);
            helper.assertValueEqual(near, 3, "emeralds brought to the owner");
            helper.assertTrue(habits.carried().isEmpty(), "still carrying " + habits.carried());
            helper.assertValueEqual(count(items(helper, helper.absoluteVec(new Vec3(13.5, 1, 13.5)), 3, Items.DIRT)), 1, "the dirt was left");
            // An empty hand takes the item back.
            owner.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            helper.assertTrue(use(owner, mob, ItemStack.EMPTY).consumesAction() && owner.getMainHandItem().is(Items.EMERALD),
                    "the owner did not get the item back");
            helper.assertTrue(habits.liked().isEmpty(), "the collector kept its item");
            leave(helper, owner);
        });
    }

    @GameTest(structure = YARD, maxTicks = 400)
    public void aCollectorBringsItsLoadToANoteBlockItHeard(GameTestHelper helper) {
        ServerPlayer owner = player(helper, new BlockPos(2, 1, 14));
        PathfinderMob mob = helper.spawn(type("mob2_collector"), new BlockPos(3, 1, 13));
        MobHabits habits = msm(mob).driver().habits();
        use(owner, mob, new ItemStack(Items.EMERALD));
        owner.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
        BlockPos note = new BlockPos(13, 1, 3);
        helper.setBlock(note, Blocks.NOTE_BLOCK);
        helper.useBlock(note, owner);
        helper.assertTrue(habits.noteBlock() != null && habits.noteBlock().equals(helper.absolutePos(note)), "the note block was not heard: "
                + habits.noteBlock());
        helper.spawnItem(Items.EMERALD, new Vec3(8.5, 1, 8.5));
        Vec3 top = helper.absoluteVec(Vec3.atBottomCenterOf(note.above()));
        helper.succeedWhen(() -> {
            owner.setOnGround(true);
            helper.assertValueEqual(count(items(helper, top, 3, Items.EMERALD)), 1, "the emerald by the note block");
            helper.assertTrue(habits.carried().isEmpty(), "still carrying " + habits.carried());
            leave(helper, owner);
        });
    }

    @GameTest(structure = YARD, maxTicks = 600)
    public void aDiggerFindsItsBlockAndDigsUpLoot(GameTestHelper helper) {
        for (int x = 10; x <= 13; x++) {
            for (int z = 10; z <= 13; z++) {
                helper.setBlock(new BlockPos(x, 0, z), Blocks.MOSS_BLOCK);
            }
        }
        PathfinderMob mob = helper.spawn(type("mob2_digger"), new BlockPos(4, 1, 4));
        MobHabits habits = msm(mob).driver().habits();
        helper.assertTrue(habits.isDigBlock(Blocks.MOSS_BLOCK.defaultBlockState()) && habits.isDigBlock(Blocks.WOOL.red().defaultBlockState())
                && !habits.isDigBlock(Blocks.STONE.defaultBlockState()), "dig_blocks: an id and a tag");
        Vec3 moss = helper.absoluteVec(new Vec3(12, 1, 12));
        helper.succeedWhen(() -> {
            int dug = count(items(helper, moss, 4, Items.TORCHFLOWER_SEEDS)) + count(items(helper, moss, 4, Items.PITCHER_POD));
            helper.assertTrue(dug > 0, "nothing dug up yet");
            helper.assertTrue(habits.digCooldown() > 0, "no cooldown after digging");
        });
    }

    @GameTest(structure = YARD, maxTicks = 200)
    public void aMobPlaysDeadWhenBadlyHurtAndRecovers(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        PathfinderMob mob = helper.spawn(type("mob2_dead"), new BlockPos(8, 1, 8));
        PathfinderMob other = helper.spawn(type("mob2_dead"), new BlockPos(4, 1, 4));
        LivingEntity pig = helper.spawnWithNoFreeWill(EntityTypes.PIG, new BlockPos(12, 1, 12));
        MobHabits habits = msm(mob).driver().habits();
        helper.assertTrue(TargetingConditions.forCombat().test(level, pig, mob), "seen as an enemy before");
        other.hurtServer(level, level.damageSources().generic(), 2.0f);
        helper.assertFalse(msm(other).driver().habits().playingDead(), "a light hit made the mob play dead");
        mob.hurtServer(level, level.damageSources().generic(), 12.0f);
        helper.assertTrue(habits.playingDead() && habits.playDeadTicks() == 60, "not playing dead at health " + mob.getHealth());
        helper.assertTrue(mob.hasEffect(MobEffects.REGENERATION), "no regeneration while playing dead");
        helper.assertFalse(TargetingConditions.forCombat().test(level, pig, mob), "seen as an enemy while playing dead");
        helper.assertTrue(save(level, mob).getIntOr("PlayDeadTicks", 0) == 60, "PlayDeadTicks was not saved");
        float hurtHealth = mob.getHealth();
        Vec3 at = mob.position();
        helper.runAfterDelay(30, () -> {
            helper.assertTrue(habits.playingDead(), "stopped playing dead early");
            helper.assertTrue(mob.position().distanceTo(at) < 0.1, "moved while playing dead: " + mob.position().distanceTo(at));
        });
        helper.runAfterDelay(70, () -> {
            helper.assertFalse(habits.playingDead(), "still playing dead after its ticks");
            helper.assertTrue(mob.getHealth() > hurtHealth, "no health came back: " + mob.getHealth());
            helper.succeed();
        });
    }

    @GameTest(structure = YARD, maxTicks = 300)
    public void aBartererTakesItsItemFromAHandAndTheGroundAndDropsLoot(GameTestHelper helper) {
        ServerPlayer player = player(helper, new BlockPos(8, 1, 6));
        PathfinderMob mob = helper.spawn(type("mob2_barterer"), new BlockPos(8, 1, 8));
        MobHabits habits = msm(mob).driver().habits();
        helper.assertFalse(use(player, mob, new ItemStack(Items.DIRT)).consumesAction() && !habits.barterHeld().isEmpty(),
                "the barterer took dirt");
        helper.assertTrue(use(player, mob, new ItemStack(Items.GOLD_INGOT, 2)).consumesAction(), "the barterer did not take gold");
        helper.assertTrue(habits.barterHeld().is(Items.GOLD_INGOT) && player.getMainHandItem().getCount() == 1, "took " + habits.barterHeld()
                + ", left " + player.getMainHandItem());
        helper.assertValueEqual(habits.barterTicks(), 20, "the countdown");
        helper.assertFalse(use(player, mob, new ItemStack(Items.GOLD_INGOT)).consumesAction() && player.getMainHandItem().isEmpty(),
                "a busy barterer took more gold");
        Vec3 around = mob.position();
        Vec3 ground = helper.absoluteVec(new Vec3(12.5, 1, 12.5));
        boolean[] rolled = {false};
        helper.succeedWhen(() -> {
            if (!rolled[0]) {
                helper.assertTrue(habits.barterHeld().isEmpty(), "no roll yet");
                helper.assertTrue(count(items(helper, around, 6, null)) > 0, "the roll dropped nothing");
                for (ItemEntity e : items(helper, around, 8, null)) {
                    e.discard();
                }
                helper.spawnItem(Items.GOLD_INGOT, new Vec3(12.5, 1, 12.5));
                rolled[0] = true;
            }
            helper.assertValueEqual(count(items(helper, ground, 1.5, Items.GOLD_INGOT)), 0, "the gold on the ground");
            helper.assertTrue(habits.barterHeld().is(Items.GOLD_INGOT) && habits.barterTicks() > 0, "the gold from the ground is not held");
            leave(helper, player);
        });
    }

    @GameTest(structure = YARD, maxTicks = 100)
    public void aDashLeapsForwardFromTheJumpBarAndCoolsDown(GameTestHelper helper) {
        PathfinderMob camel = helper.spawn(type("mob2_camel"), new BlockPos(8, 1, 8));
        PathfinderMob other = helper.spawn(type("mob2_camel"), new BlockPos(4, 1, 4));
        ServerPlayer rider = player(helper, new BlockPos(8, 1, 6));
        helper.assertTrue(use(rider, camel, ItemStack.EMPTY).consumesAction() && rider.getVehicle() == camel, "the rider did not mount");
        MobRiding riding = msm(camel).driver().riding();
        helper.assertTrue(riding.dash().isPresent() && riding.canJump(), "a dash mount without a bar");
        riding.onPlayerJump(90);
        helper.assertTrue(riding.pendingDash() > 0.99f && riding.pendingJump() == 0, "the bar charged " + riding.pendingDash() + " / "
                + riding.pendingJump());
        camel.setYRot(0); // facing south (+z)
        camel.setDeltaMovement(Vec3.ZERO);
        riding.dash(1.0f);
        Vec3 motion = camel.getDeltaMovement();
        helper.assertTrue(Math.abs(motion.z - MobRiding.DASH_SPEED) < 1.0e-6 && Math.abs(motion.x) < 1.0e-6
                && Math.abs(motion.y - MobRiding.DASH_LIFT) < 1.0e-6, "the dash's motion: " + motion);
        helper.assertValueEqual(riding.dashCooldown(), 40, "the cooldown");
        helper.assertValueEqual(((net.minecraft.world.entity.PlayerRideableJumping) camel).getJumpCooldown(), 40, "vanilla's bar cooldown");
        helper.assertFalse(riding.canJump(), "the bar shows during the cooldown");
        MobRiding otherRiding = msm(other).driver().riding();
        otherRiding.handleStartJump(90);
        helper.assertValueEqual(otherRiding.dashCooldown(), 40, "the server's cooldown from the bar's release");
        helper.runAfterDelay(41, () -> {
            helper.assertValueEqual(riding.dashCooldown(), 0, "the cooldown did not run down");
            helper.assertTrue(riding.canJump(), "no bar after the cooldown");
            leave(helper, rider);
            helper.succeed();
        });
    }
}
