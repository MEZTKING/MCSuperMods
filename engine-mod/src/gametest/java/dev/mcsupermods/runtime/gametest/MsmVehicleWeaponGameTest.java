package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.controls.KeyBinds;
import dev.mcsupermods.runtime.controls.KeyBinds.RuntimeKey;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import dev.mcsupermods.runtime.net.KeyPayload;
import dev.mcsupermods.runtime.registry.MsmThrownItem;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.registry.vehicle.VehicleTurret;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.entity.projectile.throwableitemprojectile.Snowball;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Vehicle weapons and turrets (ADR 0090 D6, D7; B417) on {@code msm_test:vh_gunship}: seat 0 fires {@code cannon} (key
 * fire, {@code msm_test:vh_shell} with 4 shells of ammunition, cooldown 40, muzzle on the barrel, recoil, {@code on_fire})
 * and {@code gun} (key second, arrows, automatic every 5 ticks, endless, muzzle on the hull); seat 1 fires {@code rear}
 * (key fire, snowballs, 2 per shot, capacity 8). The turret ({@code turret} and {@code barrel}) turns 5 degrees a tick
 * within yaw -90..90 and pitch -30..10. {@code vh_shell} is a project throwable whose {@code on_hit_block} runs
 * {@code explode} (power 2, breaking blocks). Keys go through {@link KeyBinds#receive}, as the network receiver does.
 */
public class MsmVehicleWeaponGameTest {
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

    /** A stone floor at y 0 over the test area. */
    private static void floor(GameTestHelper helper) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                helper.setBlock(x, 0, z, Blocks.STONE);
            }
        }
    }

    /** A stone wall at z 7 (x 0 to 7, y 1 to 3) that stops arrows and snowballs inside the test area. */
    private static void wall(GameTestHelper helper) {
        for (int x = 0; x < 8; x++) {
            for (int y = 1; y <= 3; y++) {
                helper.setBlock(x, y, 7, Blocks.STONE);
            }
        }
    }

    /** Removes every projectile {@code owner} shot near {@code around}, so none flies into another test. */
    private static void clear(GameTestHelper helper, Vec3 around, ServerPlayer owner) {
        shotBy(helper, around, owner, Projectile.class).forEach(Projectile::discard);
    }

    /** A gunship at {@code at} (relative) facing {@code yaw}. */
    private static MsmVehicle gunship(GameTestHelper helper, Vec3 at, float yaw) {
        MsmVehicle vehicle = helper.spawn(type("vh_gunship"), at);
        vehicle.snapTo(vehicle.getX(), vehicle.getY(), vehicle.getZ(), yaw, 0);
        return vehicle;
    }

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

    private static void press(ServerPlayer player, RuntimeKey key) {
        KeyBinds.receive(player, new KeyPayload(key.id(), true));
    }

    private static void release(ServerPlayer player, RuntimeKey key) {
        KeyBinds.receive(player, new KeyPayload(key.id(), false));
    }

    private static InteractionResult click(ServerPlayer player, MsmVehicle vehicle, ItemStack stack) {
        player.setItemInHand(InteractionHand.MAIN_HAND, stack);
        return player.interactOn(vehicle, InteractionHand.MAIN_HAND, vehicle.position());
    }

    /** Projectiles of {@code type} owned by {@code owner} near {@code around}. */
    private static <P extends Projectile> List<P> shotBy(GameTestHelper helper, Vec3 around, ServerPlayer owner, Class<P> type) {
        return helper.getLevel().getEntitiesOfClass(type, new AABB(around, around).inflate(24), p -> p.getOwner() == owner);
    }

    private static void assertNear(GameTestHelper helper, double actual, double expected, double tolerance, String what) {
        helper.assertTrue(Math.abs(actual - expected) <= tolerance, what + ": expected " + expected + " (+-" + tolerance + "), got " + actual);
    }

    private static void assertNear(GameTestHelper helper, Vec3 actual, Vec3 expected, double tolerance, String what) {
        helper.assertTrue(actual.distanceTo(expected) <= tolerance, what + ": expected " + expected + " (+-" + tolerance + "), got " + actual);
    }

    /** Events named {@code path} as they run, of any owner. */
    private static final class Seen implements EventListener, AutoCloseable {
        final String path;
        final List<EventContext> contexts = new ArrayList<>();

        Seen(String path) {
            this.path = path;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (event.getNamespace().equals("msm_test") && event.getPath().equals(path)) {
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

    // Seats and keys

    @GameTest(maxTicks = 20)
    public void seatsFireTheirOwnWeapons(GameTestHelper helper) {
        floor(helper);
        MsmVehicle ship = gunship(helper, new Vec3(3.5, 1, 3.5), 0);
        VehicleDefinition def = ship.definition();
        helper.assertValueEqual(def.weaponsOfSeat(0), List.of("cannon", "gun"), "driver's weapons");
        helper.assertValueEqual(def.weaponsOfSeat(1), List.of("rear"), "second seat's weapons");
        MsmVehicle tank = helper.spawn(type("vh_tank"), new Vec3(3.5, 3, 3.5));
        helper.assertValueEqual(tank.definition().weaponsOfSeat(0), List.of("cannon"), "the default: every weapon for the driver");
        helper.assertValueEqual(tank.definition().weaponsOfSeat(1), List.of(), "the default: none for other seats");

        ServerPlayer driver = player(helper, new Vec3(3.5, 1, 1));
        ServerPlayer gunner = player(helper, new Vec3(3.5, 1, 1));
        helper.assertTrue(driver.startRiding(ship) && gunner.startRiding(ship), "not seated");
        ship.weapons().setAmmo(0, 4);
        ship.weapons().setAmmo(2, 8);
        Vec3 at = ship.position();
        // The gunner's fire key fires the rear gun only: two snowballs of ammunition, no shell.
        press(gunner, RuntimeKey.FIRE);
        release(gunner, RuntimeKey.FIRE);
        helper.assertValueEqual(shotBy(helper, at, gunner, Snowball.class).size(), 1, "rear gun shots");
        helper.assertValueEqual(ship.ammo(2), 6, "rear gun ammunition after one shot of two");
        helper.assertValueEqual(ship.ammo(0), 4, "the cannon did not fire for the second seat");
        // The second key from the second seat fires nothing (its seat has no weapon on it).
        press(gunner, RuntimeKey.SECOND);
        release(gunner, RuntimeKey.SECOND);
        helper.assertValueEqual(shotBy(helper, at, gunner, AbstractArrow.class).size(), 0, "arrows from the second seat");
        // The driver's fire key fires the cannon only.
        press(driver, RuntimeKey.FIRE);
        release(driver, RuntimeKey.FIRE);
        helper.assertValueEqual(shotBy(helper, at, driver, MsmThrownItem.class).size(), 1, "cannon shots");
        helper.assertValueEqual(shotBy(helper, at, driver, Snowball.class).size(), 0, "rear gun shots by the driver");
        helper.assertValueEqual(ship.ammo(0), 3, "cannon ammunition");
        // Someone on foot fires nothing.
        ServerPlayer walker = player(helper, new Vec3(1, 1, 1));
        helper.assertValueEqual(ship.weapons().fire(helper.getLevel(), walker, VehicleDefinition.WeaponKey.FIRE), 0, "shots from outside");
        clear(helper, at, driver);
        clear(helper, at, gunner);
        remove(helper, driver, gunner, walker);
        helper.succeed();
    }

    // Ammunition

    @GameTest(maxTicks = 20)
    public void ammunitionIsLoadedByUsingItAndUsedByShots(GameTestHelper helper) {
        floor(helper);
        MsmVehicle ship = gunship(helper, new Vec3(3.5, 1, 3.5), 0);
        ServerPlayer player = player(helper, new Vec3(3.5, 1, 1));
        ItemStack shells = new ItemStack(item("vh_shell"), 3);
        helper.assertValueEqual(click(player, ship, shells), InteractionResult.SUCCESS, "loading three shells");
        helper.assertValueEqual(ship.ammo(0), 3, "loaded");
        helper.assertTrue(player.getMainHandItem().isEmpty(), "the shells were not used up");
        ItemStack more = new ItemStack(item("vh_shell"), 5);
        click(player, ship, more);
        helper.assertValueEqual(ship.ammo(0), 4, "loaded up to the capacity");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 4, "shells left after filling up");
        helper.assertTrue(player.getVehicle() == null, "got in while loading");
        // Full: the click passes on and the player gets in.
        click(player, ship, player.getMainHandItem());
        helper.assertTrue(player.getVehicle() == ship, "a click with a full weapon did not get in");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 4, "shells used by a full weapon");
        // Snowballs load the rear gun (seated or not), however few.
        click(player, ship, new ItemStack(Items.SNOWBALL, 3));
        helper.assertValueEqual(ship.ammo(2), 3, "snowballs loaded from the seat");
        // Shots use the rounds; no rounds, no shot.
        var level = helper.getLevel();
        for (int i = 0; i < 4; i++) {
            helper.assertTrue(ship.weapons().fireWeapon(level, 0, player), "shot " + i);
            ship.setReadyAt(0, 0);
            clear(helper, ship.position(), player);
        }
        helper.assertValueEqual(ship.ammo(0), 0, "cannon ammunition after four shots");
        helper.assertFalse(ship.weapons().fireWeapon(level, 0, player), "a shot without ammunition");
        helper.assertTrue(ship.weapons().fireWeapon(level, 2, player), "a rear shot with three rounds");
        ship.setReadyAt(2, 0);
        helper.assertValueEqual(ship.ammo(2), 1, "rear ammunition after a shot of two");
        helper.assertFalse(ship.weapons().fireWeapon(level, 2, player), "a rear shot with one round of two");
        // An endless weapon always has ammunition.
        helper.assertTrue(ship.weapons().fireWeapon(level, 1, player), "the endless gun");
        clear(helper, ship.position(), player);
        // A creative player's stack is not used up and fills the weapon.
        player.setGameMode(GameType.CREATIVE);
        click(player, ship, new ItemStack(item("vh_shell"), 1));
        helper.assertValueEqual(ship.ammo(0), 4, "creative loading fills up");
        helper.assertValueEqual(player.getMainHandItem().getCount(), 1, "creative shells used up");
        remove(helper, player);
        helper.succeed();
    }

    // Cooldown and automatic fire

    @GameTest(maxTicks = 120)
    public void theCooldownHoldsTheNextShot(GameTestHelper helper) {
        floor(helper);
        MsmVehicle ship = gunship(helper, new Vec3(3.5, 1, 3.5), 0);
        ServerPlayer driver = player(helper, new Vec3(3.5, 1, 1));
        helper.assertTrue(driver.startRiding(ship), "not seated");
        ship.weapons().setAmmo(0, 4);
        long start = helper.getLevel().getGameTime();
        press(driver, RuntimeKey.FIRE);
        release(driver, RuntimeKey.FIRE);
        clear(helper, ship.position(), driver);
        helper.assertValueEqual(ship.ammo(0), 3, "first shot");
        helper.assertValueEqual(ship.readyAt(0) - start, 40L, "reload left (the dashboard's readyAt - gameTime)");
        press(driver, RuntimeKey.FIRE);
        release(driver, RuntimeKey.FIRE);
        helper.assertValueEqual(ship.ammo(0), 3, "a shot during the cooldown");
        helper.runAfterDelay(20, () -> {
            press(driver, RuntimeKey.FIRE);
            release(driver, RuntimeKey.FIRE);
            helper.assertValueEqual(ship.ammo(0), 3, "a shot half way through the cooldown");
        });
        helper.runAfterDelay(41, () -> {
            press(driver, RuntimeKey.FIRE);
            clear(helper, ship.position(), driver);
            helper.assertValueEqual(ship.ammo(0), 2, "a shot after the cooldown");
        });
        // Not automatic: held for another 50 ticks, longer than the cooldown, it does not fire again.
        helper.runAfterDelay(41 + 50, () -> {
            helper.assertValueEqual(ship.ammo(0), 2, "a held key fired a weapon that is not automatic");
            release(driver, RuntimeKey.FIRE);
            remove(helper, driver);
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 60)
    public void automaticWeaponsFireWhileHeld(GameTestHelper helper) {
        floor(helper);
        wall(helper);
        MsmVehicle ship = gunship(helper, new Vec3(3.5, 1, 1.5), 0);
        ServerPlayer driver = player(helper, new Vec3(3.5, 1, 1));
        helper.assertTrue(driver.startRiding(ship), "not seated");
        Vec3 at = ship.position();
        press(driver, RuntimeKey.SECOND);
        helper.assertValueEqual(shotBy(helper, at, driver, AbstractArrow.class).size(), 1, "the press fires at once");
        // Held for 22 ticks: the press, then every 5 ticks (at 5, 10, 15 and 20).
        helper.runAfterDelay(22, () -> {
            release(driver, RuntimeKey.SECOND);
            int shots = shotBy(helper, at, driver, AbstractArrow.class).size();
            helper.assertTrue(shots == 5, "shots while held 22 ticks at a cooldown of 5: " + shots);
        });
        helper.runAfterDelay(40, () -> {
            helper.assertValueEqual(shotBy(helper, at, driver, AbstractArrow.class).size(), 5, "shots after the release");
            clear(helper, at, driver);
            remove(helper, driver);
            helper.succeed();
        });
    }

    // Projectiles

    @GameTest(maxTicks = 20)
    public void shotsStartAtTheMuzzleWithTheShooterAsOwner(GameTestHelper helper) {
        floor(helper);
        var level = helper.getLevel();
        // The gun on the hull, the hull facing west (yaw 90): forwards is -x, right is -z.
        MsmVehicle ship = gunship(helper, new Vec3(3.5, 1, 3.5), 90);
        ServerPlayer player = player(helper, new Vec3(1, 1, 1));
        helper.assertTrue(ship.weapons().fireWeapon(level, 1, player), "gun");
        List<AbstractArrow> arrows = shotBy(helper, ship.position(), player, AbstractArrow.class);
        helper.assertValueEqual(arrows.size(), 1, "arrows");
        AbstractArrow arrow = arrows.getFirst();
        helper.assertTrue(arrow.getOwner() == player, "the arrow's owner is not the shooter");
        assertNear(helper, arrow.position().subtract(ship.position()), new Vec3(-1.2, 0.6, -0.5), 1e-3, "the gun's muzzle");
        assertNear(helper, arrow.getDeltaMovement(), new Vec3(-2, 0, 0), 1e-3, "the gun's shot along the hull");
        helper.assertValueEqual(arrow.pickup, AbstractArrow.Pickup.CREATIVE_ONLY, "an endless gun's arrow pickup");

        // The cannon on the barrel follows the turret: yaw 30 from the hull (facing south) and 10 degrees up.
        MsmVehicle tankish = gunship(helper, new Vec3(3.5, 4, 3.5), 0);
        tankish.setTurret(30, -10);
        tankish.weapons().setAmmo(0, 1);
        helper.assertTrue(tankish.weapons().fireWeapon(level, 0, player), "cannon");
        List<MsmThrownItem> shells = shotBy(helper, tankish.position(), player, MsmThrownItem.class);
        helper.assertValueEqual(shells.size(), 1, "shells");
        MsmThrownItem shell = shells.getFirst();
        helper.assertTrue(shell.getOwner() == player, "the shell's owner is not the shooter");
        helper.assertTrue(shell.getItem().is(item("vh_shell")), "the shell is not a vh_shell");
        double sin10 = Math.sin(Math.toRadians(10));
        double cos10 = Math.cos(Math.toRadians(10));
        double forwards = 1.5 * cos10;
        assertNear(helper, shell.position().subtract(tankish.position()), new Vec3(-forwards * 0.5, 1 + 1.5 * sin10,
                forwards * Math.cos(Math.toRadians(30))), 1e-3, "the cannon's muzzle on the turned barrel");
        Vec3 aim = shell.getDeltaMovement().normalize();
        assertNear(helper, aim, new Vec3(-0.5 * cos10, sin10, Math.cos(Math.toRadians(30)) * cos10), 1e-3, "the cannon's aim");
        assertNear(helper, shell.getDeltaMovement().length(), 1.5, 1e-3, "the cannon's speed");
        // Recoil pushes the vehicle back against the shot, horizontally.
        Vec3 push = tankish.getDeltaMovement();
        assertNear(helper, push.horizontalDistance(), 0.2, 1e-3, "recoil");
        helper.assertTrue(push.x > 0 && push.z < 0, "recoil not against the shot: " + push);
        clear(helper, ship.position(), player);
        remove(helper, player);
        helper.succeed();
    }

    @GameTest(maxTicks = 60)
    public void aThrowableShellExplodesWhereItHits(GameTestHelper helper) {
        floor(helper);
        // A wall of dirt ahead of a gunship facing south (+z), obsidian behind it.
        for (int x = 1; x <= 6; x++) {
            for (int y = 1; y <= 4; y++) {
                helper.setBlock(x, y, 6, Blocks.DIRT);
                helper.setBlock(x, y, 7, Blocks.OBSIDIAN);
            }
        }
        MsmVehicle ship = gunship(helper, new Vec3(3.5, 1, 1.5), 0);
        ServerPlayer driver = player(helper, new Vec3(3.5, 1, 1));
        helper.assertTrue(driver.startRiding(ship), "not seated");
        driver.setYRot(0);
        driver.setXRot(0);
        ship.weapons().setAmmo(0, 1);
        Seen fired = new Seen("vh_fired");
        Seen burst = new Seen("vh_shell_burst");
        press(driver, RuntimeKey.FIRE);
        release(driver, RuntimeKey.FIRE);
        helper.assertValueEqual(fired.contexts.size(), 1, "on_fire");
        helper.assertTrue(fired.contexts.getFirst().entity() == ship && fired.contexts.getFirst().player() == driver,
                "on_fire: self is not the vehicle or the player not the shooter");
        helper.succeedWhen(() -> {
            helper.assertValueEqual(burst.contexts.size(), 1, "the shell's on_hit_block");
            int broken = 0;
            for (int x = 1; x <= 6; x++) {
                for (int y = 1; y <= 4; y++) {
                    if (helper.getBlockState(new BlockPos(x, y, 6)).isAir()) {
                        broken++;
                    }
                }
            }
            helper.assertTrue(broken > 0, "the explosion broke no block of the wall");
            fired.close();
            burst.close();
            remove(helper, driver);
        });
    }

    // Turret

    @GameTest(maxTicks = 100)
    public void theTurretFollowsTheGunnerWithinItsLimitsAndTurnRate(GameTestHelper helper) {
        floor(helper);
        MsmVehicle ship = gunship(helper, new Vec3(3.5, 1, 3.5), 0);
        ServerPlayer gunner = player(helper, new Vec3(3.5, 1, 1));
        helper.assertTrue(gunner.startRiding(ship), "not seated");
        helper.assertTrue(ship.turret().gunner() == gunner, "the driver is not the gunner");
        // Looking behind and far up: the turret stops at its limits, 90 degrees and 30 up.
        gunner.setYRot(170);
        gunner.setXRot(-60);
        float[] sample = new float[2];
        helper.runAfterDelay(3, () -> sample[0] = ship.turretYaw());
        helper.runAfterDelay(4, () -> {
            sample[1] = ship.turretYaw();
            assertNear(helper, sample[1] - sample[0], 5, 1e-4, "yaw turned in one tick (turn_rate 5)");
        });
        helper.runAfterDelay(25, () -> {
            assertNear(helper, ship.turretYaw(), 90, 1e-4, "yaw at its limit");
            assertNear(helper, ship.turretPitch(), -30, 1e-4, "pitch at its limit");
            gunner.setYRot(50);
            gunner.setXRot(5);
        });
        helper.runAfterDelay(45, () -> {
            assertNear(helper, ship.turretYaw(), 50, 1e-4, "yaw following the look");
            assertNear(helper, ship.turretPitch(), 5, 1e-4, "pitch following the look");
            // The hull turns 20 degrees; the aim in the world stays on the look.
            ship.setYRot(20);
        });
        helper.runAfterDelay(55, () -> {
            assertNear(helper, ship.turretYaw(), 30, 1e-4, "yaw after the hull turned");
            assertNear(helper, ship.getYRot() + ship.turretYaw(), 50, 1e-4, "the aim in the world after the hull turned");
            remove(helper, gunner);
        });
        helper.runAfterDelay(60, () -> {
            // Nobody aims: the turret stays.
            assertNear(helper, ship.turretYaw(), 30, 1e-4, "yaw without a gunner");
            helper.succeed();
        });
    }

    @GameTest(maxTicks = 20)
    public void theTurretStepIsPure(GameTestHelper helper) {
        Optional<List<Float>> none = Optional.empty();
        // Without limits the shorter way round, across 180.
        assertNear(helper, VehicleTurret.stepYaw(170, -170, none, 6), 176, 1e-4, "across 180");
        assertNear(helper, VehicleTurret.stepYaw(176, -170, none, 6), -178, 1e-4, "wrapped");
        assertNear(helper, VehicleTurret.stepYaw(10, 12, none, 6), 12, 1e-4, "reaching the target");
        // With limits the straight way, never through the forbidden part.
        Optional<List<Float>> front = Optional.of(List.of(-90f, 90f));
        assertNear(helper, VehicleTurret.stepYaw(80, -170, front, 6), 74, 1e-4, "within limits towards a target behind");
        assertNear(helper, VehicleTurret.stepYaw(120, 0, front, 6), 84, 1e-4, "an angle outside the limits");
        // Pitch.
        assertNear(helper, VehicleTurret.stepPitch(0, -60, Optional.of(List.of(10f, -30f)), 6), -6, 1e-4, "pitch up");
        assertNear(helper, VehicleTurret.stepPitch(-28, -60, Optional.of(List.of(-30f, 10f)), 6), -30, 1e-4, "pitch limit");
        assertNear(helper, VehicleTurret.stepPitch(0, 95, none, 45), 45, 1e-4, "pitch without limits");
        helper.succeed();
    }
}
