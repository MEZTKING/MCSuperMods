package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.client.controls.RuntimeKeys;
import dev.mcsupermods.runtime.client.vehicle.EngineSound;
import dev.mcsupermods.runtime.client.vehicle.LocalTurret;
import dev.mcsupermods.runtime.client.vehicle.MsmVehicleRenderer;
import dev.mcsupermods.runtime.client.vehicle.VehicleClient;
import dev.mcsupermods.runtime.client.vehicle.VehicleExhaust;
import dev.mcsupermods.runtime.client.vehicle.VehicleInput;
import dev.mcsupermods.runtime.client.vehicle.VehicleModel;
import dev.mcsupermods.runtime.client.vehicle.VehicleRenderState;
import dev.mcsupermods.runtime.controls.KeyBinds.RuntimeKey;
import dev.mcsupermods.runtime.registry.vehicle.MsmVehicle;
import dev.mcsupermods.runtime.registry.vehicle.VehicleWeapons;
import java.nio.file.Path;
import java.util.List;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerConnection;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestDedicatedServerContext;
import net.minecraft.client.CameraType;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * Client GameTest for the vehicle client (B418, ADR 0090 D4, D7, D8, D10) against a dedicated server made by
 * {@code createServer()} (ADR 0091 D7), on a flat stone pad laid round the player:
 *
 * <ul>
 *   <li><b>Drawing.</b> Every vehicle type draws with {@link MsmVehicleRenderer} (no GeckoLib), its model has cubes, and
 *       the bones named by {@code parts} and {@code turret} are found; paint ({@code DATA_PAINT}) swaps the texture and a
 *       hit makes the hull wobble.</li>
 *   <li><b>Driving.</b> The player gets into {@code msm_test:vh_car}, holds forward and then right: the driver's client
 *       moves the car and the server sees it move and turn; meanwhile the wheels roll, the steering turns, the engine loop
 *       plays with its pitch above idle, exhaust appears, and the third-person camera distance is the car's
 *       {@code camera.distance} as the server set it. Getting out stops the engine loop.</li>
 *   <li><b>Turret.</b> In {@code msm_test:vh_gunship} the gunner looks 60 degrees right and 20 up: the local turret and the
 *       server's synched turret both get there within the limits, and the frame draws the local angles.</li>
 *   <li><b>Firing.</b> With the fire key the shooter's client predicts the shot (sound and muzzle flash at once), the
 *       server shoots a projectile owned by the player, and the cannon's recoil pushes the driver-moved gunship back.</li>
 * </ul>
 *
 * <p>Screenshots (kept in {@code build/run/clientGameTest/screenshots/}, never compared): {@code msm_vehicle_ingame} (the
 * tank on the pad, seen from beside it), {@code msm_vehicle_driving} (third person in the car) and
 * {@code msm_vehicle_dashboard} (seated in the gunship, turret turned, the dashboard at the bottom right).
 */
public class MsmVehicleClientGameTest implements FabricClientGameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static ServerPlayer player(MinecraftServer server) {
        return server.getPlayerList().getPlayers().getFirst();
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        try (TestDedicatedServerContext server = context.worldBuilder().createServer()) {
            try (TestDedicatedServerConnection connection = server.connect()) {
                // Set directly, not by command: the command's chat line would cover the screenshots.
                server.runOnServer(s -> player(s).setGameMode(GameType.CREATIVE));
                server.runCommand("time set noon");
                server.runCommand("weather clear");
                pad(server);
                connection.waitForChunksRender();
                context.waitTicks(10);
                context.runOnClient(mc -> mc.gui.toastManager().clear());

                drawing(context, server);
                driving(context, server);
                turretAndFiring(context, server);
            }
        }
    }

    /** A flat stone pad 41 by 41 with air above it, the player in its middle facing south. */
    private static void pad(TestDedicatedServerContext server) {
        int[] at = server.computeOnServer(s -> {
            ServerPlayer p = player(s);
            return new int[] {p.blockPosition().getX(), p.blockPosition().getY(), p.blockPosition().getZ()};
        });
        int x = at[0];
        int y = at[1];
        int z = at[2];
        server.runCommand("fill " + (x - 20) + " " + (y - 1) + " " + (z - 20) + " " + (x + 20) + " " + (y - 1) + " " + (z + 20) + " stone");
        server.runCommand("fill " + (x - 20) + " " + y + " " + (z - 20) + " " + (x + 20) + " " + (y + 6) + " " + (z + 20) + " air");
        centre = new Vec3(x + 0.5, y, z + 0.5);
        home(server);
    }

    /** The middle of the pad. */
    private static Vec3 centre;

    /** Puts the player back in the middle of the pad, facing south. */
    private static void home(TestDedicatedServerContext server) {
        server.runOnServer(s -> player(s).connection.teleport(centre.x, centre.y, centre.z, 0, 0));
    }

    @SuppressWarnings("unchecked")
    private static EntityType<MsmVehicle> type(String path) {
        return (EntityType<MsmVehicle>) BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
    }

    /** Spawns {@code path} at the player plus {@code forward} blocks south and {@code side} east, facing {@code yaw}; its id. */
    private static int spawn(TestDedicatedServerContext server, String path, double side, double forward, float yaw) {
        return server.computeOnServer(s -> {
            ServerPlayer p = player(s);
            MsmVehicle vehicle = type(path).create(p.level(), EntitySpawnReason.COMMAND);
            vehicle.snapTo(p.getX() + side, p.getY(), p.getZ() + forward, yaw, 0);
            p.level().addFreshEntity(vehicle);
            return vehicle.getId();
        });
    }

    private static MsmVehicle clientVehicle(Minecraft mc, int id) {
        return mc.level != null && mc.level.getEntity(id) instanceof MsmVehicle v ? v : null;
    }

    private static MsmVehicle serverVehicle(MinecraftServer s, int id) {
        return player(s).level().getEntity(id) instanceof MsmVehicle v ? v : null;
    }

    private static void mount(ClientGameTestContext context, TestDedicatedServerContext server, int id) {
        server.runOnServer(s -> player(s).startRiding(serverVehicle(s, id)));
        context.waitFor(mc -> mc.player.getVehicle() instanceof MsmVehicle v && v.getId() == id, 100);
        context.waitTicks(5);
    }

    private static void dismount(ClientGameTestContext context, TestDedicatedServerContext server) {
        server.runOnServer(s -> player(s).stopRiding());
        context.waitFor(mc -> mc.player.getVehicle() == null, 100);
    }

    private static void remove(TestDedicatedServerContext server, int id) {
        server.runOnServer(s -> {
            MsmVehicle v = serverVehicle(s, id);
            if (v != null) {
                v.discard();
            }
        });
    }

    private static VehicleRenderState renderState(Minecraft mc, int id) {
        MsmVehicle vehicle = clientVehicle(mc, id);
        @SuppressWarnings("unchecked")
        EntityRenderer<MsmVehicle, VehicleRenderState> renderer = (EntityRenderer<MsmVehicle, VehicleRenderState>) (EntityRenderer<?, ?>) mc
                .getEntityRenderDispatcher().getRenderer(vehicle);
        return renderer.createRenderState(vehicle, 0);
    }

    // Drawing

    private static void drawing(ClientGameTestContext context, TestDedicatedServerContext server) {
        List<String> types = List.of("vh_car", "vh_tank", "vh_gunship", "vh_kart", "vh_heli", "vh_plane", "vh_boat", "vh_raft", "vh_amphi");
        int[] ids = new int[types.size()];
        for (int i = 0; i < types.size(); i++) {
            ids[i] = spawn(server, types.get(i), -12 + 3 * i, -8, 0);
        }
        context.waitFor(mc -> {
            for (int id : ids) {
                if (clientVehicle(mc, id) == null) {
                    return false;
                }
            }
            return true;
        }, 100);
        context.runOnClient(mc -> {
            for (int i = 0; i < ids.length; i++) {
                MsmVehicle vehicle = clientVehicle(mc, ids[i]);
                EntityRenderer<?, ?> renderer = mc.getEntityRenderDispatcher().getRenderer(vehicle);
                check(renderer instanceof MsmVehicleRenderer, types.get(i) + " is drawn by " + renderer.getClass().getName());
                check(((MsmVehicleRenderer) renderer).model().drawsSomething(), types.get(i) + "'s model has no cubes");
            }
            VehicleModel.Bones car = ((MsmVehicleRenderer) mc.getEntityRenderDispatcher().getRenderer(clientVehicle(mc, ids[0]))).model().bones();
            check(car.wheels().size() == 2 && car.steering().size() == 2 && car.rotors().size() == 1, "the car's parts: " + car);
            VehicleModel.Bones tank = ((MsmVehicleRenderer) mc.getEntityRenderDispatcher().getRenderer(clientVehicle(mc, ids[1]))).model().bones();
            check(tank.turret() != null && tank.barrel() != null, "the tank's turret bones: " + tank);
        });
        for (int i = 2; i < ids.length; i++) {
            remove(server, ids[i]);
        }

        // Paint: DATA_PAINT swaps the texture.
        int car = ids[0];
        Identifier base = Identifier.fromNamespaceAndPath("msm_test", "textures/entity/golem.png");
        Identifier red = Identifier.fromNamespaceAndPath("msm_test", "textures/entity/vh_paint.png");
        check(base.equals(context.computeOnClient(mc -> renderState(mc, car).texture)), "the car's base texture");
        server.runOnServer(s -> serverVehicle(s, car).paint().set("red"));
        context.waitFor(mc -> red.equals(renderState(mc, car).texture), 100);

        // A hit: the hull wobbles while the hurt time runs down.
        server.runOnServer(s -> {
            MsmVehicle v = serverVehicle(s, car);
            v.setHurtDir(1);
            v.setHurtTime(10);
            v.setDamage(10);
        });
        context.waitFor(mc -> renderState(mc, car).wobble != 0, 40);
        check(MsmVehicleRenderer.wobble(0, 10, 40, 1) == 0 && MsmVehicleRenderer.wobble(5, 0, 40, 1) == 0, "no wobble without hurt time or damage");

        // The tank seen from beside it, turret turned, for the screenshot.
        int tank = ids[1];
        server.runOnServer(s -> {
            serverVehicle(s, tank).setTurret(50, -10);
            serverVehicle(s, car).setDamage(0);
            ServerPlayer p = player(s);
            MsmVehicle t = serverVehicle(s, tank);
            p.connection.teleport(t.getX() + 3.5, t.getY(), t.getZ() - 3.5, 45, 20);
        });
        context.waitTicks(20);
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.waitFor(mc -> Math.abs(renderState(mc, tank).turretYaw - 50) < 0.5f, 100);
        Path shot = context.takeScreenshot("msm_vehicle_ingame");
        check(shot.toFile().isFile(), "no screenshot at " + shot);
        remove(server, tank);
        remove(server, car);
        home(server);
        context.waitTicks(5);
    }

    // Driving

    private static void driving(ClientGameTestContext context, TestDedicatedServerContext server) {
        int car = spawn(server, "vh_car", 0, 0, 0);
        context.waitFor(mc -> clientVehicle(mc, car) != null, 100);
        mount(context, server, car);
        check(context.computeOnClient(mc -> clientVehicle(mc, car).isLocalInstanceAuthoritative()), "the driver's client does not move the car");
        context.waitFor(mc -> mc.player.getAttributeValue(Attributes.CAMERA_DISTANCE) == 6, 40);
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.THIRD_PERSON_BACK));

        Vec3 start = server.computeOnServer(s -> serverVehicle(s, car).position());
        float startYaw = server.computeOnServer(s -> serverVehicle(s, car).getYRot());
        int exhaust = context.computeOnClient(mc -> VehicleExhaust.spawned());
        float wheelStart = context.computeOnClient(mc -> VehicleClient.motion(clientVehicle(mc, car)).wheel);
        context.waitFor(mc -> VehicleClient.engineSound(clientVehicle(mc, car)) != null, 40);
        float idlePitch = context.computeOnClient(mc -> VehicleClient.engineSound(clientVehicle(mc, car)).enginePitch());

        context.getInput().holdKey(o -> o.keyUp);
        context.waitTicks(15);
        float drivingPitch = context.computeOnClient(mc -> VehicleClient.engineSound(clientVehicle(mc, car)).enginePitch());
        float wheel = context.computeOnClient(mc -> VehicleClient.motion(clientVehicle(mc, car)).wheel);
        context.getInput().holdKey(o -> o.keyRight);
        context.waitTicks(10);
        float steer = context.computeOnClient(mc -> VehicleClient.motion(clientVehicle(mc, car)).steer);
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.takeScreenshot("msm_vehicle_driving");
        context.getInput().releaseKey(o -> o.keyUp);
        context.getInput().releaseKey(o -> o.keyRight);
        context.waitTicks(20);
        // Measured standing still: while moving, the frame's camera and the tick's eye position are a step apart.
        double camera = context.computeOnClient(mc -> mc.gameRenderer.mainCamera().position().distanceTo(mc.player.getEyePosition()));

        Vec3 end = server.computeOnServer(s -> serverVehicle(s, car).position());
        float endYaw = server.computeOnServer(s -> serverVehicle(s, car).getYRot());
        check(start.distanceTo(end) > 2, "the server saw the car move only " + start.distanceTo(end));
        check(Math.abs(net.minecraft.util.Mth.wrapDegrees(endYaw - startYaw)) > 10, "the server saw the car turn only " + (endYaw - startYaw));
        check(drivingPitch > idlePitch + 0.2f && drivingPitch <= EngineSound.MAX_PITCH, "engine pitch " + idlePitch + " idle, " + drivingPitch + " driving");
        check(Math.abs(wheel - wheelStart) > 1, "the wheels rolled " + (wheel - wheelStart));
        check(steer > 0.5f, "the steering turned only " + steer);
        check(context.computeOnClient(mc -> VehicleExhaust.spawned()) - exhaust >= 5, "too little exhaust");
        check(camera > 4 && camera < 6.05, "third-person camera at " + camera + " blocks, camera.distance is 6");

        dismount(context, server);
        context.waitTicks(2);
        check(context.computeOnClient(mc -> VehicleClient.engineSound(clientVehicle(mc, car)) == null), "the engine loop goes on without a driver");
        check(context.computeOnClient(mc -> mc.player.getAttributeValue(Attributes.CAMERA_DISTANCE)) == 4, "the camera distance stays after getting out");
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.FIRST_PERSON));
        remove(server, car);
    }

    // Turret and firing

    private static void turretAndFiring(ClientGameTestContext context, TestDedicatedServerContext server) {
        home(server);
        context.waitTicks(5);
        int ship = spawn(server, "vh_gunship", 0, 0, 0);
        context.waitFor(mc -> clientVehicle(mc, ship) != null, 100);
        mount(context, server, ship);

        // The gunner looks 60 degrees right of the hull and 20 up.
        context.runOnClient(mc -> {
            mc.player.setYRot(clientVehicle(mc, ship).getYRot() + 60);
            mc.player.setXRot(-20);
        });
        context.waitTicks(30);
        float[] local = context.computeOnClient(mc -> LocalTurret.isLocal(clientVehicle(mc, ship)) ? LocalTurret.current() : null);
        check(local != null, "the gunner's client does not turn the turret itself");
        check(Math.abs(local[0] - 60) < 0.5f && Math.abs(local[1] + 20) < 0.5f, "local turret " + local[0] + ", " + local[1]);
        float[] synched = server.computeOnServer(s -> new float[] {serverVehicle(s, ship).turretYaw(), serverVehicle(s, ship).turretPitch()});
        check(Math.abs(synched[0] - 60) < 0.5f && Math.abs(synched[1] + 20) < 0.5f, "server turret " + synched[0] + ", " + synched[1]);
        VehicleRenderState drawn = context.computeOnClient(mc -> renderState(mc, ship));
        check(Math.abs(drawn.turretYaw - local[0]) < 0.5f && Math.abs(drawn.turretPitch - local[1]) < 0.5f, "drawn turret " + drawn.turretYaw);
        // Past the yaw limit (90): the turret stops at it.
        context.runOnClient(mc -> mc.player.setYRot(clientVehicle(mc, ship).getYRot() + 150));
        context.waitTicks(25);
        float limited = context.computeOnClient(mc -> LocalTurret.current()[0]);
        check(Math.abs(limited - 90) < 0.5f, "the local turret passed its limit: " + limited);
        context.runOnClient(mc -> {
            mc.player.setYRot(clientVehicle(mc, ship).getYRot());
            mc.player.setXRot(0);
        });
        context.waitTicks(25);
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.THIRD_PERSON_BACK));
        context.runOnClient(mc -> mc.gui.toastManager().clear());
        context.waitTicks(10);
        context.takeScreenshot("msm_vehicle_dashboard");

        // The cannon (weapon 0, fire key, recoil 0.2): predicted at once, shot by the server, recoil on the driven hull.
        server.runOnServer(s -> serverVehicle(s, ship).weapons().setAmmo(0, 4));
        context.waitFor(mc -> clientVehicle(mc, ship).ammo(0) == 4, 40);
        int predicted = context.computeOnClient(mc -> VehicleInput.predicted());
        int sounds = context.computeOnClient(mc -> VehicleInput.sounds());
        int flashes = context.computeOnClient(mc -> VehicleInput.flashes());
        Vec3 before = server.computeOnServer(s -> serverVehicle(s, ship).position());
        Vec3 aim = server.computeOnServer(s -> {
            MsmVehicle v = serverVehicle(s, ship);
            VehicleWeapons.Aim a = v.weapons().aim(v.definition().weapons().getFirst());
            return Vec3.directionFromRotation(a.pitch(), a.yaw());
        });
        KeyMapping fire = context.computeOnClient(mc -> RuntimeKeys.mapping(RuntimeKey.FIRE));
        context.getInput().holdKeyFor(fire, 3);
        check(context.computeOnClient(mc -> VehicleInput.predicted()) == predicted + 1, "the shot was not predicted");
        check(context.computeOnClient(mc -> VehicleInput.sounds()) == sounds + 1, "the shooter's client did not play the cannon");
        check(context.computeOnClient(mc -> VehicleInput.flashes()) == flashes + 1, "no muzzle flash");
        server.waitFor(s -> serverVehicle(s, ship).ammo(0) == 3, 40);
        check(server.computeOnServer(s -> !player(s).level().getEntitiesOfClass(Projectile.class, player(s).getBoundingBox().inflate(48),
                p -> p.getOwner() == player(s)).isEmpty()), "no projectile owned by the player");
        context.waitTicks(10);
        Vec3 after = server.computeOnServer(s -> serverVehicle(s, ship).position());
        double back = after.subtract(before).dot(new Vec3(aim.x, 0, aim.z).normalize());
        check(back < -0.1, "the recoil moved the driven gunship by " + back + " along the aim");
        check(context.computeOnClient(mc -> VehicleInput.flashes()) == flashes + 1, "the server's answer flashed the shooter's muzzle again");

        dismount(context, server);
        remove(server, ship);
        context.runOnClient(mc -> mc.options.setCameraType(CameraType.FIRST_PERSON));
    }
}
