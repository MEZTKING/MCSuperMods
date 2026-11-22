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
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
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
 * {@code build/run/clientGameTest/screenshots/}. Boats and repainted fluids (B536, the later client briefs) add their
 * own methods here.
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
}
