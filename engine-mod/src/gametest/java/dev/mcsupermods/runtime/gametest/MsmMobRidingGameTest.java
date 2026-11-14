package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.registry.MsmAnimal;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.mob.MobRiding;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Riding (ADR 0071 D3; B293) on the {@code rd_*} definitions in {@code msm/msm_test/entity/}: {@code rd_horse} (saddle,
 * jump 0.7, seat offset, {@code on_mount}, speed 1.5), {@code rd_pair} (no saddle, two seats), {@code rd_pet} (animal,
 * tamed, {@code controlled_by: owner}), {@code rd_flyer} ({@code fly}, jump 0.5). Players act through
 * {@code Player.interactOn}, the call the server's interact packet makes. Steering itself runs on the rider's client
 * (plan limit M1), so the input and speed hooks are called on the driver's riding module directly.
 */
public class MsmMobRidingGameTest {
    private static final BlockPos MID = new BlockPos(1, 2, 1);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    @SuppressWarnings("unchecked")
    private static <T extends Mob> EntityType<T> type(String path) {
        return (EntityType<T>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    private static PathfinderMob spawn(GameTestHelper helper, String path, BlockPos pos) {
        return helper.spawnWithNoFreeWill(type(path), pos);
    }

    private static MobRiding riding(PathfinderMob mob) {
        return ((MsmMob) mob).driver().riding();
    }

    /** A survival player in the level (vanilla's interact path needs a {@code ServerPlayer}). Removed by {@link #remove}. */
    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(Vec3.atBottomCenterOf(MID.east(2))));
        player.setGameMode(GameType.SURVIVAL);
        return player;
    }

    private static void remove(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            player.stopRiding();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    /** A right click on the mob with whatever is in the main hand. */
    private static void click(ServerPlayer player, PathfinderMob mob) {
        player.interactOn(mob, InteractionHand.MAIN_HAND, mob.position());
    }

    private static void assertNear(GameTestHelper helper, double actual, double expected, String what) {
        helper.assertTrue(Math.abs(actual - expected) < 1e-4, what + ": expected " + expected + ", got " + actual);
    }

    private static void assertVec(GameTestHelper helper, Vec3 actual, double x, double y, double z, String what) {
        helper.assertTrue(Math.abs(actual.x - x) < 1e-4 && Math.abs(actual.y - y) < 1e-4 && Math.abs(actual.z - z) < 1e-4,
                what + ": expected (" + x + ", " + y + ", " + z + "), got " + actual);
    }

    private static long saddlesNear(GameTestHelper helper, PathfinderMob mob) {
        return helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(mob.blockPosition()).inflate(3),
                e -> e.getItem().is(Items.SADDLE)).size();
    }

    /** Records the events of one definition. */
    private static final class Recorder implements EventListener, AutoCloseable {
        final Identifier owner;
        final List<String> events = new ArrayList<>();
        final List<EventContext> contexts = new ArrayList<>();

        Recorder(String owner) {
            this.owner = id(owner);
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (owner.equals(this.owner)) {
                events.add(event.getPath());
                contexts.add(ctx);
            }
        }

        @Override
        public void onAction(Identifier owner, Identifier event, Action action, EventContext ctx) {}

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    // Saddle (ADR 0071 D3, plan limit M13)

    @GameTest
    public void aSaddleFromTheHandEquipsAndDropsOnDeath(GameTestHelper helper) {
        PathfinderMob mob = spawn(helper, "rd_horse", MID);
        ServerPlayer player = player(helper);
        helper.assertTrue(mob.canUseSlot(EquipmentSlot.SADDLE), "rd_horse cannot use the saddle slot");
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SADDLE));
        click(player, mob);
        helper.assertTrue(mob.isSaddled(), "the saddle did not equip");
        helper.assertTrue(mob.getItemBySlot(EquipmentSlot.SADDLE).is(Items.SADDLE), "saddle slot: " + mob.getItemBySlot(EquipmentSlot.SADDLE));
        helper.assertTrue(player.getMainHandItem().isEmpty(), "the saddle was not used up: " + player.getMainHandItem());
        helper.assertFalse(player.isPassenger(), "saddling also mounted");
        helper.assertTrue(riding(mob).saddleBoneVisible(), "saddle bone hidden while saddled");
        helper.assertValueEqual(riding(mob).saddleBone().orElse(""), "saddle", "saddle_bone");
        mob.kill(helper.getLevel());
        helper.assertValueEqual(saddlesNear(helper, mob), 1L, "saddles dropped on death");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest
    public void shearsTakeTheSaddleOff(GameTestHelper helper) {
        PathfinderMob mob = spawn(helper, "rd_horse", MID);
        mob.setItemSlot(EquipmentSlot.SADDLE, new ItemStack(Items.SADDLE));
        ServerPlayer player = player(helper);
        player.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.SHEARS));
        click(player, mob);
        helper.assertFalse(mob.isSaddled(), "shears left the saddle on");
        helper.assertFalse(riding(mob).saddleBoneVisible(), "saddle bone shown without a saddle");
        helper.assertValueEqual(saddlesNear(helper, mob), 1L, "saddles dropped by the shears");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest
    public void onlyAMountWithASaddleHasTheSaddleSlot(GameTestHelper helper) {
        helper.assertFalse(spawn(helper, "rd_pair", MID).canUseSlot(EquipmentSlot.SADDLE), "saddle: false has a saddle slot");
        helper.assertFalse(spawn(helper, "minimal", MID.east()).canUseSlot(EquipmentSlot.SADDLE), "a mob without msm:rideable has a saddle slot");
        helper.assertTrue(spawn(helper, "rd_horse", MID.south()).canUseSlot(EquipmentSlot.MAINHAND), "other slots changed");
        helper.succeed();
    }

    // Control

    @GameTest
    public void anUnsaddledMountSeatsButOnlyASaddledOneObeys(GameTestHelper helper) {
        PathfinderMob mob = spawn(helper, "rd_horse", MID);
        ServerPlayer player = player(helper);
        click(player, mob);
        helper.assertTrue(player.getVehicle() == mob, "an empty hand did not mount rd_horse");
        helper.assertTrue(mob.getControllingPassenger() == null, "an unsaddled rd_horse obeys " + mob.getControllingPassenger());
        mob.setItemSlot(EquipmentSlot.SADDLE, new ItemStack(Items.SADDLE));
        helper.assertTrue(mob.getControllingPassenger() == player, "a saddled rd_horse does not obey its rider");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest
    public void aSneakingClickDoesNotMount(GameTestHelper helper) {
        PathfinderMob mob = spawn(helper, "rd_pair", MID);
        ServerPlayer player = player(helper);
        player.setShiftKeyDown(true);
        click(player, mob);
        helper.assertFalse(player.isPassenger(), "a sneaking click mounted");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest
    public void controlledByOwnerRefusesAStranger(GameTestHelper helper) {
        MsmAnimal mob = (MsmAnimal) spawn(helper, "rd_pet", MID);
        ServerPlayer owner = player(helper);
        ServerPlayer stranger = player(helper);
        mob.tame(owner);
        click(stranger, mob);
        helper.assertFalse(stranger.isPassenger(), "a stranger took the owner's seat");
        stranger.startRiding(mob); // as /ride would: seated, never in control
        helper.assertTrue(stranger.getVehicle() == mob, "/ride-style mount refused");
        helper.assertTrue(mob.getControllingPassenger() == null, "a stranger steers: " + mob.getControllingPassenger());
        stranger.stopRiding();
        click(owner, mob);
        helper.assertTrue(owner.getVehicle() == mob, "the owner did not mount");
        helper.assertTrue(mob.getControllingPassenger() == owner, "the owner does not steer");
        remove(helper, owner, stranger);
        helper.succeed();
    }

    @GameTest
    public void twoPassengersSitOneBehindTheOther(GameTestHelper helper) {
        PathfinderMob mob = spawn(helper, "rd_pair", MID);
        mob.setYRot(0);
        ServerPlayer first = player(helper);
        ServerPlayer second = player(helper);
        ServerPlayer third = player(helper);
        click(first, mob);
        click(second, mob);
        click(third, mob);
        helper.assertValueEqual(mob.getPassengers().size(), 2, "passengers");
        helper.assertTrue(first.getVehicle() == mob && second.getVehicle() == mob, "the first two are not seated");
        helper.assertFalse(third.isPassenger(), "a third passenger sat on passengers: 2");
        helper.assertTrue(mob.getControllingPassenger() == first, "saddle: false, the first passenger does not steer");
        var dims = mob.getDimensions(mob.getPose());
        Vec3 front = riding(mob).getPassengerAttachmentPoint(first, dims, 1.0f, Vec3.ZERO);
        Vec3 back = riding(mob).getPassengerAttachmentPoint(second, dims, 1.0f, Vec3.ZERO);
        assertVec(helper, front, 0, 1.4, 0, "first seat on top of the hitbox");
        assertVec(helper, back, 0, 1.4, -0.7, "second seat behind");
        remove(helper, first, second, third);
        helper.succeed();
    }

    @GameTest
    public void riderOffsetPlacesTheSeatAndTurnsWithTheMob(GameTestHelper helper) {
        PathfinderMob mob = spawn(helper, "rd_horse", MID);
        ServerPlayer player = player(helper);
        click(player, mob);
        var dims = mob.getDimensions(mob.getPose());
        mob.setYRot(0);
        assertVec(helper, riding(mob).getPassengerAttachmentPoint(player, dims, 1.0f, Vec3.ZERO), 0, 1.1, -0.2, "seat facing south");
        mob.setYRot(90); // facing west: the seat 0.2 behind is 0.2 east
        assertVec(helper, riding(mob).getPassengerAttachmentPoint(player, dims, 1.0f, Vec3.ZERO), 0.2, 1.1, 0, "seat facing west");
        assertVec(helper, riding(mob).getPassengerAttachmentPoint(player, dims, 0.5f, Vec3.ZERO), 0.1, 0.55, 0, "seat at half scale");
        remove(helper, player);
        helper.succeed();
    }

    // Jumping, steering and speed (the rider's client runs these; plan limit M1)

    @GameTest
    public void canJumpMatchesJump(GameTestHelper helper) {
        PathfinderMob horse = spawn(helper, "rd_horse", MID);
        assertNear(helper, horse.getAttributeBaseValue(Attributes.JUMP_STRENGTH), 0.7, "jump_strength of rd_horse");
        helper.assertFalse(riding(horse).canJump(), "an unsaddled rd_horse shows a jump bar");
        riding(horse).onPlayerJump(90);
        assertNear(helper, riding(horse).pendingJump(), 0, "jump pending without a saddle");
        horse.setItemSlot(EquipmentSlot.SADDLE, new ItemStack(Items.SADDLE));
        helper.assertTrue(riding(horse).canJump(), "a saddled rd_horse with jump 0.7 shows no jump bar");
        riding(horse).onPlayerJump(45);
        assertNear(helper, riding(horse).pendingJump(), 0.4 + 0.4 * 45 / 90.0, "jump scale at half charge");
        riding(horse).onPlayerJump(100);
        assertNear(helper, riding(horse).pendingJump(), 1.0, "jump scale at full charge");
        helper.assertFalse(riding(spawn(helper, "rd_pair", MID.east())).canJump(), "jump 0 shows a jump bar");
        helper.assertFalse(riding(spawn(helper, "rd_flyer", MID.south())).canJump(), "a flying mount shows a jump bar");
        helper.succeed();
    }

    @GameTest
    public void aWalkingMountTakesTheRidersInputViewAndSpeed(GameTestHelper helper) {
        PathfinderMob mob = spawn(helper, "rd_horse", MID);
        mob.setItemSlot(EquipmentSlot.SADDLE, new ItemStack(Items.SADDLE));
        ServerPlayer player = player(helper);
        click(player, mob);
        MobRiding riding = riding(mob);
        player.xxa = 1;
        player.zza = 1;
        assertVec(helper, riding.getRiddenInput(player, Vec3.ZERO, Vec3.ZERO), 0.5, 0, 1, "forward and strafe");
        player.zza = -1;
        assertVec(helper, riding.getRiddenInput(player, Vec3.ZERO, Vec3.ZERO), 0.5, 0, -0.25, "backwards");
        assertNear(helper, riding.getRiddenSpeed(player, 0), 0.2 * 1.5, "movement_speed times speed");
        player.setYRot(135);
        player.setXRot(40);
        riding.tickRidden(player, Vec3.ZERO, () -> {});
        assertNear(helper, mob.getYRot(), 135, "the mob's yaw");
        assertNear(helper, mob.yBodyRot, 135, "the mob's body yaw");
        assertNear(helper, mob.getXRot(), 20, "the mob's pitch (half the rider's)");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest
    public void aFlyingMountFollowsTheViewAndRisesOnJump(GameTestHelper helper) {
        PathfinderMob mob = spawn(helper, "rd_flyer", MID);
        ServerPlayer player = player(helper);
        click(player, mob);
        helper.assertTrue(mob.getControllingPassenger() == player, "saddle: false, the rider does not steer");
        MobRiding riding = riding(mob);
        player.zza = 1;
        player.setXRot(-30); // looking up
        assertVec(helper, riding.getRiddenInput(player, Vec3.ZERO, Vec3.ZERO), 0, 0.5, Math.cos(Math.toRadians(30)), "forward looking up");
        player.zza = 0;
        player.setJumping(true);
        assertVec(helper, riding.getRiddenInput(player, Vec3.ZERO, Vec3.ZERO), 0, 0.5, 0, "jump held");
        player.setJumping(false);
        player.zza = -1;
        player.setXRot(0);
        assertVec(helper, riding.getRiddenInput(player, Vec3.ZERO, Vec3.ZERO), 0, 0, -0.5, "backwards");
        remove(helper, player);
        helper.succeed();
    }

    // on_mount

    @GameTest
    public void onMountFiresOncePerMount(GameTestHelper helper) {
        try (Recorder recorder = new Recorder("rd_horse")) {
            PathfinderMob mob = spawn(helper, "rd_horse", MID);
            ServerPlayer player = player(helper);
            click(player, mob);
            click(player, mob); // already seated: nothing
            helper.assertValueEqual(recorder.events, List.of("rd_mounted"), "events after mounting");
            helper.assertTrue(recorder.contexts.getFirst().player() == player, "on_mount player: " + recorder.contexts.getFirst().player());
            player.stopRiding();
            click(player, mob);
            helper.assertValueEqual(recorder.events.size(), 2, "events after mounting again");
            remove(helper, player);
        }
        helper.succeed();
    }
}
