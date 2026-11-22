package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.client.vanilla.MsmVanillaRenderState;
import dev.mcsupermods.runtime.client.vanilla.MsmVanillaRenderer;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.List;
import java.util.Locale;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestServerContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.renderer.entity.BoatRenderer;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.entity.RaftRenderer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.Vec3;

/**
 * Client GameTest for the looks of mobs 2 (ADR 0109 D3 to D5 as amended after B524; B532), run by
 * {@code ./gradlew runClientGameTest [-Pmc=26.4]} (headless: see {@code MsmParticleClientGameTest}). In a singleplayer
 * world, on a stone pad at y 99, three test mobs drawn by the runtime's own renderer ({@code renderer: vanilla}): a
 * hovering {@code mob2_hover} with its AI, a {@code mob2_roost} hanging under a stone block (set roosting on the server,
 * without AI so it stays), and a {@code mob2_dead} hurt below half its health (without AI, so it keeps playing dead).
 *
 * <p>Checked on the client: the hovering mob holds 3 to 5 blocks over the pad, the roosting and playing dead flags reached
 * the client, and {@link MsmVanillaRenderer#extractRenderState} draws the roosting mob upside down and the one playing
 * dead fallen over (death time 20). Screenshot {@code msm_mobs2_hover_roost_dead_<mc>} in
 * {@code build/run/clientGameTest/screenshots/}. Then {@link #boats} (B536): project boats drawn by vanilla's renderers.
 * Then {@link #batchTwoLooks} (B541): a villager of a project type, a project cauldron and pets on both shoulders.
 * Repainted fluids (the later client briefs) add their own method here.
 */
public class MsmMobs2ClientGameTest implements FabricClientGameTest {
    private static final int Y = 100;
    private static final Vec3 HOVER = new Vec3(4.5, Y, 6.5);
    private static final BlockPos CEILING = new BlockPos(9, Y + 3, 6);
    private static final Vec3 DEAD = new Vec3(14.5, Y, 6.5);

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }

    private static ServerPlayer player(List<ServerPlayer> players) {
        return players.getFirst();
    }

    private static String version() {
        return FabricLoader.getInstance().getModContainer("minecraft").orElseThrow().getMetadata().getVersion().getFriendlyString()
                .replaceAll("[^A-Za-z0-9.]+", "_");
    }

    @Override
    public void runTest(ClientGameTestContext context) {
        String mc = version();
        try (TestSingleplayerContext world = context.worldBuilder().create()) {
            TestServerContext server = world.getServer();
            server.runCommand("time set noon");
            server.runCommand("weather clear");
            server.runOnServer(s -> player(s.getPlayerList().getPlayers()).setGameMode(GameType.CREATIVE));
            int[] ids = build(server);
            stand(context, world, 9.5, Y, 15.5, 180f, 5f);
            context.waitTicks(100);
            check(context, ids);
            context.takeScreenshot("msm_mobs2_hover_roost_dead_" + mc);
            batchTwoLooks(context, world, mc);
            boats(context, world, mc);
        }
    }

    private static Mob spawn(ServerLevel level, String path, Vec3 at, boolean ai) {
        EntityType<?> type = BuiltInRegistries.ENTITY_TYPE.getValue(id(path));
        check(BuiltInRegistries.ENTITY_TYPE.containsKey(id(path)), "entity " + id(path) + " is not registered");
        Entity entity = type.create(level, EntitySpawnReason.COMMAND);
        check(entity instanceof Mob, path + " is not a mob");
        Mob mob = (Mob) entity;
        mob.snapTo(at.x, at.y, at.z, 0f, 0f);
        mob.setYHeadRot(0f);
        mob.setYBodyRot(0f);
        mob.setNoAi(!ai);
        mob.setPersistenceRequired();
        level.addFreshEntity(mob);
        return mob;
    }

    /** The pad, the ceiling block and the three mobs; returns their ids (hover, roost, dead). */
    private static int[] build(TestServerContext server) {
        return server.computeOnServer(s -> {
            ServerLevel level = s.overworld();
            for (int x = -2; x <= 20; x++) {
                for (int z = -2; z <= 18; z++) {
                    level.setBlock(new BlockPos(x, Y - 1, z), Blocks.STONE.defaultBlockState(), 2);
                    for (int y = Y; y <= Y + 8; y++) {
                        level.setBlock(new BlockPos(x, y, z), Blocks.AIR.defaultBlockState(), 2);
                    }
                }
            }
            level.setBlock(CEILING, Blocks.STONE.defaultBlockState(), 2);
            Mob hover = spawn(level, "mob2_hover", HOVER, true);
            Mob roost = spawn(level, "mob2_roost", new Vec3(CEILING.getX() + 0.5, Y, CEILING.getZ() + 0.5), false);
            ((MsmMob) roost).driver().habits().setRoosting(true,
                    new Vec3(CEILING.getX() + 0.5, CEILING.getY() - roost.getBbHeight(), CEILING.getZ() + 0.5));
            Mob dead = spawn(level, "mob2_dead", DEAD, false);
            dead.hurtServer(level, level.damageSources().generic(), 12.0f);
            check(((MsmMob) dead).driver().habits().playingDead(), "mob2_dead is not playing dead on the server");
            return new int[] {hover.getId(), roost.getId(), dead.getId()};
        });
    }

    private static void stand(ClientGameTestContext context, TestSingleplayerContext world, double x, double y, double z, float yaw, float pitch) {
        TestServerContext server = world.getServer();
        server.runOnServer(s -> {
            ServerPlayer p = player(s.getPlayerList().getPlayers());
            p.getAbilities().flying = true;
            p.onUpdateAbilities();
        });
        server.runCommand(String.format(Locale.ROOT, "tp @a %.2f %.2f %.2f %.1f %.1f", x, y, z, yaw, pitch));
        context.waitTicks(10);
        context.getInput().lookAt(yaw, pitch);
        world.getConnection().waitForChunksRender();
        context.waitTicks(10);
        context.runOnClient(mc -> mc.gui.toastManager().clear());
    }

    @SuppressWarnings("unchecked")
    private static MsmVanillaRenderState state(net.minecraft.client.Minecraft mc, Mob mob) {
        EntityRenderer<?, ?> renderer = mc.getEntityRenderDispatcher().getRenderer(mob);
        check(renderer instanceof MsmVanillaRenderer, mob.getType() + " is drawn by " + renderer.getClass().getSimpleName());
        MsmVanillaRenderer vanilla = (MsmVanillaRenderer) renderer;
        MsmVanillaRenderState state = vanilla.createRenderState();
        vanilla.extractRenderState(mob, state, 0f);
        return state;
    }

    private static void check(ClientGameTestContext context, int[] ids) {
        context.waitFor(mc -> mc.level != null && mc.level.getEntity(ids[2]) != null && mc.level.getEntity(ids[1]) != null, 100);
        context.runOnClient(mc -> {
            Mob hover = (Mob) mc.level.getEntity(ids[0]);
            Mob roost = (Mob) mc.level.getEntity(ids[1]);
            Mob dead = (Mob) mc.level.getEntity(ids[2]);
            check(hover != null, "the hovering mob is not on the client");
            double over = hover.getY() - Y;
            check(over > 3.0 && over < 5.0, "the client's hovering mob is " + over + " blocks over the pad");
            check(roost.getEntityData().get(((MsmMob) roost).roostingData()), "the roosting flag did not reach the client");
            check(Math.abs(roost.getBoundingBox().maxY - CEILING.getY()) < 1.0e-3, "the client's roosting mob's top is at "
                    + roost.getBoundingBox().maxY);
            check(state(mc, roost).isUpsideDown, "the roosting mob is not drawn upside down");
            check(dead.getEntityData().get(((MsmMob) dead).playingDeadData()), "the playing dead flag did not reach the client");
            check(state(mc, dead).deathTime >= 20.0f, "the mob playing dead is not drawn fallen over");
            check(!state(mc, hover).isUpsideDown && state(mc, hover).deathTime == 0.0f, "the hovering mob is drawn in a pose");
        });
    }

    /** Where {@link #batchTwoLooks} builds: open stone east of the mobs, west of nothing else. */
    private static final int LOOK_X = 40;

    private static int count(java.nio.file.Path path, java.util.function.IntPredicate rgb) {
        try (java.io.InputStream in = java.nio.file.Files.newInputStream(path);
                com.mojang.blaze3d.platform.NativeImage image = com.mojang.blaze3d.platform.NativeImage.read(in)) {
            int n = 0;
            for (int y = 0; y < image.getHeight(); y++) {
                for (int x = 0; x < image.getWidth(); x++) {
                    if (rgb.test(image.getPixel(x, y) & 0xFFFFFF)) {
                        n++;
                    }
                }
            }
            return n;
        } catch (java.io.IOException e) {
            throw new java.io.UncheckedIOException(e);
        }
    }

    /** The test villager type's cyan robe ({@code textures/entity/villager/type/vt_blossom.png}, 0x00C8D2), as shaded. */
    private static boolean cyan(int rgb) {
        int r = (rgb >> 16) & 255;
        int g = (rgb >> 8) & 255;
        int b = rgb & 255;
        return r < 40 && g > 70 && b > 70 && Math.abs(g - b) < 40;
    }

    /** The missing texture's magenta. */
    private static boolean magenta(int rgb) {
        int r = (rgb >> 16) & 255;
        int g = (rgb >> 8) & 255;
        int b = rgb & 255;
        return r > 200 && b > 200 && g < 40;
    }

    /**
     * The looks of batch 2 that need no picture of their own beyond the test mod's (B541, ADR 0112 D4):
     *
     * <ul>
     *   <li>a plains villager, then the same villager given the project type {@code vt_blossom} (ADR 0107 D5): its type
     *       picture ({@code msm_test:textures/entity/villager/type/vt_blossom.png}, a cyan robe) replaces the plains
     *       clothes, so the second screenshot holds cyan and the first none ({@code msm_villager_type_<mc>});</li>
     *   <li>beside it vanilla's water cauldron and the project cauldron {@code mix_goo_cauldron} at level 3 (ADR 0108 D2;
     *       the test mod's block state and models as the lowering writes them, over vanilla's templates): no missing
     *       texture is drawn. The project cauldron's content is the fluid's still picture untinted (no block colour
     *       provider), the open check of B531, so the screenshot shows it grey beside vanilla's blue water;</li>
     *   <li>two {@code shoulder_pet}s on both of the player's shoulders (ADR 0109 D2), checked on the client at the two
     *       shoulders, seen from the front ({@code msm_shoulders_<mc>}).</li>
     * </ul>
     */
    private static void batchTwoLooks(ClientGameTestContext context, TestSingleplayerContext world, String mc) {
        TestServerContext server = world.getServer();
        int villagerId = server.computeOnServer(s -> {
            ServerLevel level = s.overworld();
            for (int x = LOOK_X - 2; x <= LOOK_X + 14; x++) {
                for (int z = -2; z <= 14; z++) {
                    level.setBlock(new BlockPos(x, Y - 1, z), Blocks.STONE.defaultBlockState(), 2);
                    for (int y = Y; y <= Y + 6; y++) {
                        level.setBlock(new BlockPos(x, y, z), Blocks.AIR.defaultBlockState(), 2);
                    }
                }
            }
            level.setBlock(new BlockPos(LOOK_X + 2, Y, 4), Blocks.WATER_CAULDRON.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.LayeredCauldronBlock.LEVEL, 3), 2);
            net.minecraft.world.level.block.Block goo = BuiltInRegistries.BLOCK.getValue(id("mix_goo_cauldron"));
            check(BuiltInRegistries.BLOCK.containsKey(id("mix_goo_cauldron")), "no mix_goo_cauldron");
            level.setBlock(new BlockPos(LOOK_X + 4, Y, 4), goo.defaultBlockState()
                    .setValue(net.minecraft.world.level.block.LayeredCauldronBlock.LEVEL, 3), 2);
            net.minecraft.world.entity.npc.villager.Villager villager = net.minecraft.world.entity.EntityTypes.VILLAGER.create(level, EntitySpawnReason.COMMAND);
            check(villager != null, "no villager");
            villager.snapTo(LOOK_X + 7.5, Y, 4.5, 0f, 0f);
            villager.setYHeadRot(0f);
            villager.yBodyRot = 0f;
            villager.setNoAi(true);
            villager.setSilent(true);
            level.addFreshEntity(villager);
            return villager.getId();
        });
        stand(context, world, LOOK_X + 5.5, Y, 9.5, 180f, 15f);
        context.waitTicks(20);
        int before = count(context.takeScreenshot("msm_villager_plains_" + mc), MsmMobs2ClientGameTest::cyan);
        server.runOnServer(s -> {
            var villager = (net.minecraft.world.entity.npc.villager.Villager) s.overworld().getEntity(villagerId);
            check(villager != null, "the villager is gone");
            var type = BuiltInRegistries.VILLAGER_TYPE.wrapAsHolder(BuiltInRegistries.VILLAGER_TYPE.getValue(id("vt_blossom")));
            villager.setVillagerData(villager.getVillagerData().withType(type));
        });
        context.waitTicks(10);
        boolean synced = context.computeOnClient(client -> client.level.getEntity(villagerId)
                instanceof net.minecraft.world.entity.npc.villager.Villager v && v.getVillagerData().type().is(id("vt_blossom")));
        check(synced, "the client's villager is not of the type vt_blossom");
        java.nio.file.Path shot = context.takeScreenshot("msm_villager_type_" + mc);
        int after = count(shot, MsmMobs2ClientGameTest::cyan);
        check(before < 10, "cyan on a plains villager: " + before + " pixels");
        check(after > 60, "the vt_blossom picture was not drawn: " + after + " cyan pixels (" + before + " before)");
        int missing = count(shot, MsmMobs2ClientGameTest::magenta);
        check(missing < 20, "the missing texture is drawn (the cauldrons?): " + missing + " magenta pixels");

        // Two pets on both shoulders, seen from the front.
        int[] pets = server.computeOnServer(s -> {
            ServerLevel level = s.overworld();
            ServerPlayer owner = player(s.getPlayerList().getPlayers());
            owner.getAbilities().flying = false;
            owner.onUpdateAbilities();
            owner.snapTo(LOOK_X + 5.5, Y, 9.5, 180f, 0f);
            owner.setOnGround(true);
            int[] out = new int[2];
            for (int i = 0; i < 2; i++) {
                Mob pet = spawn(level, "shoulder_pet", new Vec3(LOOK_X + 4.5 + 2 * i, Y, 8.5), true);
                ((net.minecraft.world.entity.TamableAnimal) pet).tame(owner);
                check(((MsmMob) pet).driver().shoulder().perch(owner), "pet " + i + " did not perch: "
                        + ((MsmMob) pet).driver().shoulder().refusal(owner));
                out[i] = pet.getId();
            }
            return out;
        });
        context.runOnClient(client -> client.options.setCameraType(net.minecraft.client.CameraType.THIRD_PERSON_FRONT));
        context.waitTicks(20);
        context.runOnClient(client -> {
            for (int id : pets) {
                Entity pet = client.level.getEntity(id);
                check(pet != null, "a pet is not on the client");
                check(pet.position().distanceTo(client.player.position()) < 1.6 && pet.getY() > client.player.getY() + 1.0,
                        "a pet is not on a shoulder on the client: " + pet.position() + ", player " + client.player.position());
            }
            Entity a = client.level.getEntity(pets[0]);
            Entity b = client.level.getEntity(pets[1]);
            check(a.position().distanceTo(b.position()) > 0.4, "both pets sit on one shoulder on the client");
            client.gui.toastManager().clear();
        });
        context.takeScreenshot("msm_shoulders_" + mc);
        context.runOnClient(client -> client.options.setCameraType(net.minecraft.client.CameraType.FIRST_PERSON));
        server.runOnServer(s -> {
            for (int id : pets) {
                Entity pet = s.overworld().getEntity(id);
                if (pet != null) {
                    ((MsmMob) pet).driver().shoulder().unperch();
                    pet.discard();
                }
            }
        });
    }

    private static final int BOAT_Z = 30;

    /**
     * Project boats (ADR 0110 D2, B536): on a pool at y 99 the test items {@code bt_maple_boat} and its chest boat,
     * {@code bt_reed_raft} and its chest raft (pictures in the test mod's {@code textures/entity/boat/} and
     * {@code chest_boat/}), and {@code bt_plain_boat} with vanilla's oak pictures. Checked on the client: each is drawn by
     * vanilla's {@link BoatRenderer} (the rafts by {@link RaftRenderer}). Screenshots {@code msm_boats_<mc>}, then
     * {@code msm_boat_riding_<mc>} with the player in the maple boat.
     */
    private static void boats(ClientGameTestContext context, TestSingleplayerContext world, String mc) {
        TestServerContext server = world.getServer();
        List<String> paths = List.of("bt_maple_boat", "bt_maple_chest_boat", "bt_reed_raft", "bt_reed_chest_raft", "bt_plain_boat");
        int[] ids = server.computeOnServer(s -> {
            ServerLevel level = s.overworld();
            for (int x = -2; x <= 20; x++) {
                for (int z = BOAT_Z - 2; z <= BOAT_Z + 12; z++) {
                    boolean water = x >= 0 && x <= 18 && z >= BOAT_Z && z <= BOAT_Z + 10;
                    level.setBlock(new BlockPos(x, Y - 2, z), Blocks.STONE.defaultBlockState(), 2);
                    level.setBlock(new BlockPos(x, Y - 1, z), water ? Blocks.WATER.defaultBlockState() : Blocks.STONE.defaultBlockState(), 2);
                    for (int y = Y; y <= Y + 8; y++) {
                        level.setBlock(new BlockPos(x, y, z), Blocks.AIR.defaultBlockState(), 2);
                    }
                }
            }
            int[] out = new int[paths.size()];
            for (int i = 0; i < paths.size(); i++) {
                EntityType<?> type = BuiltInRegistries.ENTITY_TYPE.getValue(id(paths.get(i)));
                check(BuiltInRegistries.ENTITY_TYPE.containsKey(id(paths.get(i))), "boat " + paths.get(i) + " is not registered");
                Entity boat = type.create(level, EntitySpawnReason.COMMAND);
                check(boat instanceof AbstractBoat, paths.get(i) + " is not a boat");
                boat.snapTo(1.5 + i * 3.5, Y - 0.4, BOAT_Z + 5.5, 90f, 0f);
                level.addFreshEntity(boat);
                out[i] = boat.getId();
            }
            return out;
        });
        stand(context, world, 8.5, Y + 2, BOAT_Z + 12.5, 180f, 25f);
        context.waitTicks(40);
        context.waitFor(mc2 -> mc2.level != null && java.util.Arrays.stream(ids).allMatch(i -> mc2.level.getEntity(i) != null), 100);
        context.runOnClient(client -> {
            for (int i = 0; i < ids.length; i++) {
                Entity boat = client.level.getEntity(ids[i]);
                EntityRenderer<?, ?> renderer = client.getEntityRenderDispatcher().getRenderer(boat);
                boolean raft = paths.get(i).contains("raft");
                check(raft ? renderer instanceof RaftRenderer : renderer instanceof BoatRenderer,
                        paths.get(i) + " is drawn by " + renderer.getClass().getSimpleName());
            }
        });
        context.takeScreenshot("msm_boats_" + mc);
        server.runOnServer(s -> {
            ServerPlayer p = player(s.getPlayerList().getPlayers());
            p.getAbilities().flying = false;
            p.onUpdateAbilities();
            p.startRiding(s.overworld().getEntity(ids[0]), true, true);
        });
        context.waitFor(client -> client.player != null && client.player.getVehicle() != null && client.player.getVehicle().getId() == ids[0], 100);
        context.getInput().lookAt(180f, 20f);
        context.waitTicks(20);
        context.runOnClient(client -> client.gui.toastManager().clear());
        context.takeScreenshot("msm_boat_riding_" + mc);
    }
}
