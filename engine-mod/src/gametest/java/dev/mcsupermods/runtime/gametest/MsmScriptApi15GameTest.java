package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.controls.KeyBinds;
import dev.mcsupermods.runtime.controls.KeyBinds.RuntimeKey;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventListener;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.hud.HudServer;
import dev.mcsupermods.runtime.hud.HudSync;
import dev.mcsupermods.runtime.net.KeyPayload;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.animal.sheep.Sheep;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.vehicle.minecart.Minecart;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;

/**
 * Script API 1.5 (ADR 0089 D8, ADR 0088 D6, ADR 0090 D11; plan B421) through {@code msm/msm_test/script/api15.js}:
 * {@code Player.showHud}, {@code hideHud} and {@code setHud}; {@code Entity.vehicle}, {@code passengers},
 * {@code isVehicle} and {@code asVehicle}; the {@code Vehicle} members {@code fuel}, {@code setFuel},
 * {@code damageTaken}, {@code setDamageTaken}, {@code ammo}, {@code setAmmo} and {@code driver}; and the events
 * {@code key.pressed}, {@code key.released}, {@code vehicle.mounted}, {@code vehicle.dismounted}, {@code vehicle.fired}
 * and {@code vehicle.destroyed}. The event handlers note what they see per player or vehicle UUID and the
 * {@code api15_report} handler logs and forgets those notes, so tests running at the same time do not mix. Vehicles:
 * {@code msm_test:vh_kart} (fuel capacity 250, health 10, two seats, {@code on_mount}/{@code on_dismount}/
 * {@code on_destroy}) and {@code msm_test:vh_tank} (weapon {@code cannon}, snowballs, capacity 10). Keys go through
 * {@link KeyBinds#receive}, as the network receiver does.
 */
public class MsmScriptApi15GameTest {
    private static final String SCRIPT = "msm_test:api15: ";
    private static final Vec3 MID = new Vec3(3.5, 1, 3.5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static ScriptHost host(GameTestHelper helper) {
        ScriptHost host = ScriptHost.current();
        helper.assertTrue(host != null, "no ScriptHost: SERVER_STARTING did not load scripts");
        return host;
    }

    private static void run(GameTestHelper helper, String handler, EventContext ctx) {
        ScriptHost host = host(helper);
        host.action(id("api15"), id("api15"), id(handler), ctx);
        helper.assertTrue(host.handlerErrors().stream().noneMatch(e -> e.startsWith("script msm_test:api15:")),
                "api15.js errors: " + host.handlerErrors());
    }

    /** The last {@code msm.log} line of api15.js that starts with {@code start}, without the script prefix. */
    private static String logged(GameTestHelper helper, String start) {
        List<String> logs = host(helper).recentLogs();
        for (int i = logs.size() - 1; i >= 0; i--) {
            if (logs.get(i).startsWith(SCRIPT + start)) {
                return logs.get(i).substring(SCRIPT.length() + start.length());
            }
        }
        return null;
    }

    /** What the event handlers noted for {@code entity} since the last report, comma-separated. */
    private static String report(GameTestHelper helper, Entity entity) {
        EventContext ctx = entity instanceof ServerPlayer p ? EventContext.forItem(helper.getLevel(), p)
                : EventContext.forEntity(helper.getLevel(), entity, null);
        run(helper, "api15_report", ctx);
        return logged(helper, "report " + entity.getStringUUID() + " ");
    }

    private static void eq(GameTestHelper helper, Object actual, Object expected, String message) {
        helper.assertTrue(Objects.equals(actual, expected), message + ": expected <" + expected + ">, got <" + actual + ">");
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(MID));
        player.setGameMode(GameType.SURVIVAL);
        return player;
    }

    private static void remove(GameTestHelper helper, ServerPlayer... players) {
        for (ServerPlayer player : players) {
            player.stopRiding();
            helper.getLevel().getServer().getPlayerList().remove(player);
        }
    }

    @SuppressWarnings("unchecked")
    private static MsmVehicle vehicle(GameTestHelper helper, String path) {
        return helper.spawn((EntityType<MsmVehicle>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path)), MID);
    }

    private static void floor(GameTestHelper helper) {
        for (int x = 0; x < 8; x++) {
            for (int z = 0; z < 8; z++) {
                helper.setBlock(x, 0, z, Blocks.STONE);
            }
        }
    }

    private static void key(ServerPlayer player, Identifier key, boolean pressed) {
        KeyBinds.receive(player, new KeyPayload(key, pressed));
    }

    // ---- Player HUD members ----------------------------------------------------------------------------

    @GameTest
    public void hudMembersShowHideAndSetTheElementsOfThePlayer(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        run(helper, "api15_hud", EventContext.forItem(helper.getLevel(), player));
        eq(helper, logged(helper, "hud "), "show:true bar:true text:true hide:true unknownSet:false unknownShow:false unknownHide:false"
                + " nan:false bool:TypeError badId:TypeError missing:TypeError", "results");
        int hidden = HudServer.index(id("hud_hidden")).orElseThrow();
        int text = HudServer.index(id("hud_set_text")).orElseThrow();
        eq(helper, HudSync.visible(player, hidden), true, "showHud");
        eq(helper, HudSync.visible(player, text), false, "hideHud");
        helper.runAfterDelay(1, () -> {
            eq(helper, HudServer.sentValue(player, id("hud_set_bar")), 7.0, "setHud number (NaN changed nothing)");
            eq(helper, HudServer.sentValue(player, id("hud_set_text")), "hello", "setHud text");
            remove(helper, player);
            helper.succeed();
        });
    }

    // ---- Riding and the Vehicle members ----------------------------------------------------------------

    @GameTest
    public void ridingMembersSeeVehiclesPassengersAndOtherMounts(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = vehicle(helper, "vh_kart");
        ServerPlayer driver = player(helper);
        ServerPlayer rider = player(helper);
        helper.assertTrue(driver.startRiding(kart) && rider.startRiding(kart), "both get in");
        Minecart cart = helper.spawn(EntityTypes.MINECART, new BlockPos(1, 1, 1));
        Sheep sheep = helper.spawn(EntityTypes.SHEEP, new BlockPos(1, 1, 1));
        sheep.setNoAi(true);
        helper.assertTrue(sheep.startRiding(cart, true, true), "the sheep rides the minecart");
        run(helper, "api15_riding", EventContext.forEntity(helper.getLevel(), kart, driver, sheep));
        eq(helper, logged(helper, "riding "), "true true 2 true true true true false true 0 true true minecraft:minecart false true true"
                + " assign:TypeError", "riding");
        remove(helper, driver, rider);
        helper.succeed();
    }

    @GameTest
    public void fuelDamageAndDriverMembersReadAndWriteTheVehicle(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = vehicle(helper, "vh_kart");
        ServerPlayer driver = player(helper);
        helper.assertTrue(driver.startRiding(kart), "gets in");
        run(helper, "api15_fuel", EventContext.forEntity(helper.getLevel(), kart, driver));
        eq(helper, logged(helper, "fuel "), "0 100 250 0 12 0 3.5 0 true ammo:RangeError fuelArg:TypeError", "fuel and damage");
        eq(helper, kart.fuel().fuel(), 12, "the fuel reached the vehicle");
        eq(helper, kart.getDamage(), 2.0f, "the damage reached the vehicle");
        helper.assertFalse(kart.isRemoved(), "damage below the maximum leaves it");
        remove(helper, driver);
        helper.succeed();
    }

    @GameTest
    public void ammoMembersFindWeaponsByIdOrIndex(GameTestHelper helper) {
        floor(helper);
        MsmVehicle tank = vehicle(helper, "vh_tank");
        run(helper, "api15_ammo", EventContext.forEntity(helper.getLevel(), tank, null));
        eq(helper, logged(helper, "ammo "), "0 4 10 0 none unknownId:RangeError index:RangeError fraction:RangeError negative:RangeError"
                + " missing:TypeError", "ammo");
        eq(helper, tank.ammo(0), 6, "the rounds reached the vehicle");
        helper.succeed();
    }

    // ---- Events ----------------------------------------------------------------------------------------

    /** Events named {@code path} as they run, in order, of any owner. */
    private static final class Seen implements EventListener, AutoCloseable {
        final String path;
        final List<EventContext> contexts = new ArrayList<>();

        Seen(String path) {
            this.path = path;
            EventRunner.addListener(this);
        }

        @Override
        public void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {
            if (event.equals(id(path))) {
                contexts.add(ctx);
            }
        }

        @Override
        public void close() {
            EventRunner.removeListener(this);
        }
    }

    @GameTest
    public void keyEventsReportProjectKeyBindsOnly(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        report(helper, player);
        key(player, id("kb_basic"), true);
        key(player, id("kb_basic"), false);
        // The cooldown refuses the second press, and its release then reports nothing either.
        key(player, id("kb_cooldown"), true);
        key(player, id("kb_cooldown"), false);
        key(player, id("kb_cooldown"), true);
        key(player, id("kb_cooldown"), false);
        // The runtime's own keys are not key binds.
        key(player, RuntimeKey.HORN.id(), true);
        key(player, RuntimeKey.HORN.id(), false);
        eq(helper, report(helper, player), "pressed msm_test:kb_basic true,released msm_test:kb_basic,pressed msm_test:kb_cooldown true,"
                + "released msm_test:kb_cooldown", "key events");
        remove(helper, player);
        helper.succeed();
    }

    @GameTest
    public void mountAndDismountEventsFollowTheDefinitionsEvents(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = vehicle(helper, "vh_kart");
        ServerPlayer driver = player(helper);
        ServerPlayer rider = player(helper);
        report(helper, driver);
        report(helper, rider);
        report(helper, kart);
        try (Seen in = new Seen("in"); Seen out = new Seen("out")) {
            helper.assertTrue(driver.startRiding(kart), "the driver gets in");
            helper.assertTrue(rider.startRiding(kart), "the rider gets in");
            rider.stopRiding();
            eq(helper, in.contexts.size(), 2, "on_mount ran for both");
            eq(helper, out.contexts.size(), 1, "on_dismount ran for the rider");
        }
        eq(helper, report(helper, driver), "mounted msm_test:vh_kart true true true", "driver");
        eq(helper, report(helper, rider), "mounted msm_test:vh_kart true false true,dismounted msm_test:vh_kart true", "rider");
        eq(helper, report(helper, kart), "mounted,mounted,dismounted", "vehicle");
        remove(helper, driver, rider);
        helper.succeed();
    }

    @GameTest
    public void firedEventNamesTheWeaponAfterTheShot(GameTestHelper helper) {
        floor(helper);
        MsmVehicle tank = vehicle(helper, "vh_tank");
        ServerPlayer driver = player(helper);
        helper.assertTrue(driver.startRiding(tank), "gets in");
        tank.weapons().setAmmo(0, 3);
        report(helper, driver);
        ServerLevel level = helper.getLevel();
        helper.assertTrue(tank.weapons().fireWeapon(level, 0, driver), "the cannon fires");
        eq(helper, report(helper, driver), "fired msm_test:vh_tank cannon 2", "fired");
        helper.assertFalse(tank.weapons().fireWeapon(level, 0, driver), "cooling down");
        eq(helper, report(helper, driver), "", "a shot that did not happen reports nothing");
        level.getEntitiesOfClass(Projectile.class, new AABB(tank.position(), tank.position()).inflate(24), p -> p.getOwner() == driver)
                .forEach(Projectile::discard);
        remove(helper, driver);
        helper.succeed();
    }

    @GameTest
    public void destroyedEventByAScriptRunsBeforeTheRidersGetOut(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = vehicle(helper, "vh_kart");
        ServerPlayer driver = player(helper);
        helper.assertTrue(driver.startRiding(kart), "gets in");
        report(helper, kart);
        report(helper, driver);
        try (Seen wrecked = new Seen("wrecked")) {
            run(helper, "api15_wreck", EventContext.forEntity(helper.getLevel(), kart, null));
            eq(helper, wrecked.contexts.size(), 1, "on_destroy ran");
        }
        helper.assertTrue(kart.isRemoved(), "setDamageTaken at health.max destroys the vehicle");
        eq(helper, report(helper, kart), "destroyed none 1,dismounted", "vehicle");
        eq(helper, report(helper, driver), "dismounted msm_test:vh_kart true", "driver");
        List<ItemEntity> drops = helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(kart.position(), kart.position()).inflate(3),
                e -> e.getItem().is(kart.item()));
        eq(helper, drops.size(), 1, "the item dropped");
        drops.forEach(Entity::discard);
        remove(helper, driver);
        helper.succeed();
    }

    @GameTest
    public void destroyedEventNamesThePlayerWhoDestroyedIt(GameTestHelper helper) {
        floor(helper);
        MsmVehicle kart = vehicle(helper, "vh_kart");
        ServerPlayer player = player(helper);
        report(helper, kart);
        report(helper, player);
        kart.hurtServer(helper.getLevel(), helper.getLevel().damageSources().playerAttack(player), 20);
        helper.assertTrue(kart.isRemoved(), "destroyed");
        eq(helper, report(helper, kart), "destroyed " + player.getStringUUID() + " 0", "vehicle");
        eq(helper, report(helper, player), "destroyed msm_test:vh_kart", "player");
        helper.getLevel().getEntitiesOfClass(ItemEntity.class, new AABB(kart.position(), kart.position()).inflate(3)).forEach(Entity::discard);
        remove(helper, player);
        helper.succeed();
    }
}
