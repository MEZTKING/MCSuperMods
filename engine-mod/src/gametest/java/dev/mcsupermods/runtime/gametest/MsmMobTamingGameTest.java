package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmAnimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.game.ServerboundPlayerLoadedPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.ai.goal.FollowOwnerGoal;
import net.minecraft.world.entity.ai.goal.Goal;
import net.minecraft.world.entity.ai.goal.SitWhenOrderedToGoal;
import net.minecraft.world.entity.ai.goal.WrappedGoal;
import net.minecraft.world.entity.monster.zombie.Zombie;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * Taming (ADR 0071 D1, B292) on {@code tb_pet} (bone, chance 1, {@code tamed_health} 30, {@code on_tame}, a melee
 * attack) and {@code tb_pet_stubborn} (the {@code #minecraft:fishes} tag, chance 0). Interactions go through
 * {@code Player.interactOn}, the path a right click takes on the server.
 */
public class MsmMobTamingGameTest {
    private static final String ARENA = "msm_runtime_gametest:arena";
    private static final BlockPos MID = new BlockPos(5, 1, 5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static EntityType<MsmAnimal> type(String path) {
        return (EntityType<MsmAnimal>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper, BlockPos pos) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(pos)));
        return player;
    }

    private static void leave(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    private static void use(ServerPlayer player, MsmAnimal mob, ItemStack held) {
        player.setItemInHand(InteractionHand.MAIN_HAND, held);
        player.interactOn(mob, InteractionHand.MAIN_HAND, Vec3.ZERO);
    }

    private static List<Goal> goals(MsmAnimal mob) {
        return mob.getGoalSelector().getAvailableGoals().stream().map(WrappedGoal::getGoal).toList();
    }

    /** Records the events fired with {@code entity} as self; other tests run at the same time. */
    private static final class Recorder implements EventListener, AutoCloseable {
        final List<String> events = Collections.synchronizedList(new ArrayList<>());
        final List<EventContext> contexts = Collections.synchronizedList(new ArrayList<>());
        private final Object entity;

        Recorder(Object entity) {
            this.entity = entity;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (ctx.entity() == entity) {
                events.add(event.getPath());
                contexts.add(ctx);
            }
        }

        long count(String event) {
            synchronized (events) {
                return events.stream().filter(event::equals).count();
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    @GameTest
    public void tamingFoodTamesAndOtherItemsDoNothing(GameTestHelper helper) {
        MsmAnimal pet = helper.spawnWithNoFreeWill(type("tb_pet"), MID);
        ServerPlayer player = player(helper, MID.east());
        try (Recorder r = new Recorder(pet)) {
            ItemStack stick = new ItemStack(Items.STICK, 4);
            use(player, pet, stick);
            helper.assertFalse(pet.isTame(), "a stick tamed tb_pet");
            helper.assertValueEqual(stick.getCount(), 4, "sticks after a stick");
            helper.assertFalse(pet.requiresCustomPersistence(), "a wild pet is persistent");

            ItemStack bones = new ItemStack(Items.BONE, 3);
            use(player, pet, bones);
            helper.assertTrue(pet.isTame(), "a bone with chance 1 did not tame tb_pet");
            helper.assertTrue(pet.isOwnedBy(player), "the feeder is not the owner");
            helper.assertValueEqual(bones.getCount(), 2, "bones after taming");
            helper.assertTrue(pet.isOrderedToSit(), "a new pet does not sit (sit defaults to true)");
            helper.assertValueEqual((double) pet.getMaxHealth(), 30.0, "tamed_health");
            helper.assertValueEqual((double) pet.getHealth(), 30.0, "health after taming");
            helper.assertTrue(pet.requiresCustomPersistence(), "a tamed pet may despawn");
            helper.assertValueEqual(r.count("tb_tamed"), 1L, "on_tame: " + r.events);
            helper.assertTrue(r.contexts.getFirst().player() == player, "on_tame player is not the new owner");

            use(player, pet, bones);
            helper.assertValueEqual(bones.getCount(), 2, "a tamed pet ate another bone");
            helper.assertValueEqual(r.count("tb_tamed"), 1L, "on_tame fired again");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    @GameTest
    public void failedTamingUsesTheItemAndTagsWork(GameTestHelper helper) {
        MsmAnimal pet = helper.spawnWithNoFreeWill(type("tb_pet_stubborn"), MID);
        ServerPlayer player = player(helper, MID.east());
        try {
            ItemStack cod = new ItemStack(Items.COD, 2);
            use(player, pet, cod);
            helper.assertFalse(pet.isTame(), "chance 0 tamed tb_pet_stubborn");
            helper.assertValueEqual(cod.getCount(), 1, "the #minecraft:fishes item was not used up by a failed try");
            player.setGameMode(GameType.CREATIVE);
            use(player, pet, cod);
            helper.assertValueEqual(cod.getCount(), 1, "creative used up the taming item");
        } finally {
            leave(helper, player);
        }
        helper.succeed();
    }

    @GameTest
    public void ownersEmptyHandTogglesSitting(GameTestHelper helper) {
        MsmAnimal pet = helper.spawn(type("tb_pet"), MID);
        helper.assertTrue(goals(pet).stream().anyMatch(g -> g instanceof SitWhenOrderedToGoal), "no SitWhenOrderedToGoal");
        helper.assertTrue(goals(pet).stream().anyMatch(g -> g instanceof FollowOwnerGoal), "no FollowOwnerGoal");
        ServerPlayer owner = player(helper, MID.east());
        ServerPlayer stranger = player(helper, MID.west());
        try {
            pet.tame(owner);
            helper.assertFalse(pet.isOrderedToSit(), "sitting before any click");
            use(owner, pet, ItemStack.EMPTY);
            helper.assertTrue(pet.isOrderedToSit(), "the owner's empty hand did not make the pet sit");
            use(stranger, pet, ItemStack.EMPTY);
            helper.assertTrue(pet.isOrderedToSit(), "a stranger's empty hand stood the pet up");
            use(owner, pet, new ItemStack(Items.STICK));
            helper.assertTrue(pet.isOrderedToSit(), "an item in the owner's hand toggled sitting");
            use(owner, pet, ItemStack.EMPTY);
            helper.assertFalse(pet.isOrderedToSit(), "the owner's second click did not stand the pet up");
        } finally {
            leave(helper, owner, stranger);
        }
        helper.succeed();
    }

    /**
     * A tamed {@code msm:rideable} mob ({@code tb_mount}, no saddle needed): the owner's empty hand mounts it and never
     * toggles sitting; the owner sneaking toggles sitting and does not mount (ADR 0071 D1, D3; decision of 2026-11-14).
     * Without {@code msm:rideable} the empty hand toggles ({@link #ownersEmptyHandTogglesSitting}).
     */
    @GameTest
    public void ownerMountsARideablePetAndSneaksToToggleSitting(GameTestHelper helper) {
        MsmAnimal mount = helper.spawnWithNoFreeWill(type("tb_mount"), MID);
        ServerPlayer owner = player(helper, MID.east());
        try {
            mount.tame(owner);
            owner.setShiftKeyDown(true);
            helper.assertTrue(owner.isSecondaryUseActive(), "the mock owner is not sneaking");
            use(owner, mount, ItemStack.EMPTY);
            helper.assertTrue(mount.isOrderedToSit(), "the sneaking owner's empty hand did not make the mount sit");
            helper.assertFalse(mount.hasPassenger(owner), "the sneaking owner mounted");
            use(owner, mount, ItemStack.EMPTY);
            helper.assertFalse(mount.isOrderedToSit(), "the sneaking owner's second click did not stand the mount up");
            owner.setShiftKeyDown(false);
            use(owner, mount, ItemStack.EMPTY);
            helper.assertFalse(mount.isOrderedToSit(), "the owner's empty hand toggled sitting on a rideable pet");
            helper.assertTrue(mount.hasPassenger(owner), "the owner's empty hand did not mount the rideable pet");
            owner.stopRiding();
        } finally {
            leave(helper, owner);
        }
        helper.succeed();
    }

    /**
     * The arena's floor is 9 by 9 inside its walls, too small for {@code TamableAnimal}'s teleport distance of 12, so the
     * owner stands on the corner of the wall (10, 4, 10), 13.1 and 12.4 blocks from the pets: the following pet teleports
     * onto the wall next to the owner (vanilla tries spots within 3 blocks and 1 up or down), the sitting one stays.
     */
    @GameTest(structure = ARENA, maxTicks = 200)
    public void sittingPetStaysAndFollowingPetTeleports(GameTestHelper helper) {
        BlockPos sitAt = new BlockPos(1, 1, 2);
        MsmAnimal sitter = helper.spawn(type("tb_pet"), sitAt);
        MsmAnimal follower = helper.spawn(type("tb_pet"), new BlockPos(1, 1, 1));
        ServerPlayer owner = player(helper, new BlockPos(10, 4, 10));
        sitter.tame(owner);
        sitter.setOrderedToSit(true);
        follower.tame(owner);
        Vec3 sitterStart = helper.absoluteVec(Vec3.atBottomCenterOf(sitAt));
        helper.assertTrue(follower.distanceTo(owner) > 12.0, "the follower starts too close: " + follower.distanceTo(owner));
        helper.succeedWhen(() -> {
            helper.assertTrue(follower.distanceTo(owner) < 5.0, "the follower is " + follower.distanceTo(owner) + " blocks from its owner");
            helper.assertTrue(sitter.position().distanceTo(sitterStart) < 1.0, "the sitting pet moved to " + sitter.position());
            helper.assertTrue(sitter.isInSittingPose(), "the sitting pet is not in its sitting pose");
            leave(helper, owner);
        });
    }

    @GameTest(structure = ARENA, maxTicks = 200)
    public void petAttacksWhatHurtItsOwner(GameTestHelper helper) {
        MsmAnimal pet = helper.spawn(type("tb_pet"), new BlockPos(2, 1, 5));
        MsmAnimal sibling = helper.spawnWithNoFreeWill(type("tb_pet"), new BlockPos(2, 1, 8));
        Zombie zombie = helper.spawnWithNoFreeWill(EntityTypes.ZOMBIE, new BlockPos(8, 1, 5));
        ServerPlayer owner = player(helper, new BlockPos(5, 1, 5));
        pet.tame(owner);
        sibling.tame(owner);
        helper.assertFalse(pet.wantsToAttack(sibling, owner), "the pet wants to attack another pet of its owner");
        helper.assertFalse(pet.wantsToAttack(owner, owner), "the pet wants to attack its owner");
        helper.assertTrue(pet.wantsToAttack(zombie, owner), "the pet does not want to attack the zombie");
        // A mock player is not ticked: OwnerHurtByTargetGoal starts when the hurt timestamp (the owner's tickCount) differs
        // from 0, and it needs the owner's last damage source, so the zombie really hurts the owner. A player is
        // invulnerable until its client reports the world loaded, which a mock player's never does: the packet says so.
        owner.tickCount = 5;
        owner.connection.handleAcceptPlayerLoad(new ServerboundPlayerLoadedPacket());
        helper.assertTrue(owner.hurtServer(helper.getLevel(), helper.getLevel().damageSources().mobAttack(zombie), 1.0f),
                "the zombie could not hurt the owner");
        helper.assertTrue(owner.getLastHurtByMob() == zombie, "the owner's attacker is " + owner.getLastHurtByMob());
        helper.succeedWhen(() -> {
            helper.assertTrue(pet.getTarget() == zombie, "the pet's target is " + pet.getTarget());
            helper.assertTrue(zombie.getLastHurtByMob() == pet, "the pet has not hit the zombie");
            leave(helper, owner);
        });
    }
}
