package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.client.dev.DevClient;
import dev.mcsupermods.runtime.client.dev.DevWorldSettings;
import dev.mcsupermods.runtime.dev.DevFiles;
import dev.mcsupermods.runtime.dev.DevMode;
import dev.mcsupermods.runtime.dev.DevSetup;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Predicate;
import java.util.stream.Stream;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.SharedConstants;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.server.packs.PackType;
import net.minecraft.server.packs.metadata.pack.PackFormat;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.levelgen.FlatLevelSource;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.ReadOnlyScoreInfo;
import net.minecraft.world.scores.ScoreHolder;

/**
 * Client GameTest for Play my game (ADR 0116 D1, B554), run by {@code ./gradlew runClientGameTest [-Pmc=26.4]} after
 * {@link MsmDevClientGameTest} (headless: see {@link MsmParticleClientGameTest}). It plays the app's part in
 * {@code <gameDir>/msm-dev/} as {@code @msm/interop} {@code fabric/dev-session.ts} writes the files for a data-only
 * project: the world setup's world preset is only in the dev data pack, placed in {@code saves/msm-game-msm_test/datapacks/}
 * before the world is made (B547 Y15). It checks:
 *
 * <ol>
 *   <li>a game play request ({@code kind: "game"}) creates and joins {@code msm-game-msm_test} with that preset (a void flat
 *       world), the request's game mode (adventure) and difficulty (hard), structures on, commands on and a random seed,
 *       which {@code status.json} reports;</li>
 *   <li>the world's own data pack makes the island on the first join (a {@code minecraft:tick} advancement, as the games
 *       plugin's start does) and the player stands on it;</li>
 *   <li>no setup function runs (no test area, chests or game rule changes), although {@code setup.mcfunction} has lines;</li>
 *   <li>a reload request works in the game world, and a reopen request opens it again past the experimental settings
 *       screen (B547 Y14);</li>
 *   <li>after a quit, a second game play request opens the same world (the same seed, the island made once).</li>
 * </ol>
 */
public class MsmPlayMyGameClientGameTest implements FabricClientGameTest {
    private static final String NAMESPACE = "msm_test";
    private static final String WORLD = DevWorldSettings.GAME_FOLDER_PREFIX + NAMESPACE;
    private static final String PRESET = NAMESPACE + ":play_my_game";
    private static final String SETUP_OBJECTIVE = "msm_play_setup";
    private static final String GAME_OBJECTIVE = "msm_play_game";
    private static final int OPEN_TICKS = 3_000;
    private static final int REQUEST_TICKS = 2_400;
    private static final AtomicInteger RELOADS = new AtomicInteger();
    private static boolean listening;

    @Override
    public void runTest(ClientGameTestContext context) {
        if (!listening) {
            listening = true;
            ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, resources, success) -> RELOADS.incrementAndGet());
        }
        Path dev = FabricLoader.getInstance().getGameDir().resolve(DevFiles.DEV_FOLDER);
        Path saves = context.computeOnClient(mc -> mc.getLevelSource().getBaseDir());
        deleteTree(dev);
        deleteTree(saves.resolve(WORLD));
        AtomicInteger stops = new AtomicInteger();
        Runnable previousStop = DevClient.replaceStopAction(stops::incrementAndGet);
        try {
            writeDevFiles(dev);
            writeDevDataPack(saves.resolve(WORLD).resolve("datapacks").resolve("msm-dev"));
            context.waitFor(mc -> DevClient.active(), 100);
            waitForStatus(context, dev, s -> "title".equals(string(s, "state")), 200);

            // Play my game: the world is made from the dev data pack's preset and joined.
            writePlay(dev, 1);
            context.setScreen(TitleScreen::new);
            waitForWorld(context);
            check(!Files.exists(dev.resolve("play.json")), "play.json was not consumed");
            check(Files.isRegularFile(saves.resolve(WORLD).resolve("level.dat")), "no level.dat in " + saves.resolve(WORLD));
            IntegratedServer server = context.computeOnClient(Minecraft::getSingleplayerServer);
            check(DevSetup.worldFolder(server).equals(WORLD), "opened " + DevSetup.worldFolder(server) + ", not " + WORLD);
            check(server.getWorldData().getGameType() == GameType.ADVENTURE, "game type " + server.getWorldData().getGameType());
            check(server.getWorldData().getDifficulty() == Difficulty.HARD, "difficulty " + server.getWorldData().getDifficulty());
            check(!server.getWorldData().isHardcore(), "hardcore");
            check(server.getWorldData().isAllowCommands(), "commands are off");
            check(server.getWorldGenSettings().options().generateStructures(), "structures are off");
            check(!server.getWorldGenSettings().options().generateBonusChest(), "a bonus chest");
            long seed = server.overworld().getSeed();
            check(seed != DevWorldSettings.SEED, "the test world's fixed seed");
            check(server.overworld().getChunkSource().getGenerator() instanceof FlatLevelSource,
                    "not the void preset: " + server.overworld().getChunkSource().getGenerator());
            check(server.getPackRepository().getSelectedIds().contains("file/msm-dev"),
                    "the dev data pack is not enabled: " + server.getPackRepository().getSelectedIds());
            check(DevMode.active(), "server-side dev mode is off");
            String seedText = Long.toString(seed);
            waitForStatus(context, dev, s -> handled(s, 1, true) && "world".equals(string(s, "state")) && WORLD.equals(string(s, "world"))
                    && seedText.equals(string(s, "seed")), 200);

            // The world's own start: the island on the first join, and the player on it.
            waitForScore(context, GAME_OBJECTIVE, "starts", 1);
            context.waitFor(mc -> onIsland(mc), 200);
            context.waitTicks(40);
            check(context.computeOnClient(MsmPlayMyGameClientGameTest::onIsland), "the player is not on the island");
            check(context.computeOnClient(mc -> objective(mc, SETUP_OBJECTIVE)) == null, "the setup function ran in a game world");
            context.takeScreenshot("msm_play_my_game");

            // Reload in the game world.
            int reloadsBefore = RELOADS.get();
            writeRequest(dev, 2, "reload", false, 1);
            waitForStatus(context, dev, s -> handled(s, 2, true) && "world".equals(string(s, "state")), REQUEST_TICKS);
            check(RELOADS.get() == reloadsBefore + 1, "data pack reloads " + (RELOADS.get() - reloadsBefore) + ", expected 1");

            // Reopen: past the experimental settings screen, the same world again.
            writeRequest(dev, 3, "reopen", false, 1);
            waitForStatus(context, dev, s -> handled(s, 3, true) && "world".equals(string(s, "state")) && WORLD.equals(string(s, "world")),
                    OPEN_TICKS);
            waitForWorld(context);
            check(score(context, GAME_OBJECTIVE, "starts") == 1, "the island was made again on reopen");

            // Quit, then Play my game again: the existing world opens with its seed.
            writeRequest(dev, 4, "quit", false, 0);
            context.waitFor(mc -> stops.get() == 1 && mc.level == null && mc.getSingleplayerServer() == null, OPEN_TICKS);
            waitForStatus(context, dev, s -> handled(s, 4, true) && s.get("world").isJsonNull() && !s.has("seed"), 200);
            writePlay(dev, 5);
            context.setScreen(TitleScreen::new);
            waitForWorld(context);
            waitForStatus(context, dev, s -> handled(s, 5, true) && seedText.equals(string(s, "seed")), OPEN_TICKS);
            check(context.computeOnClient(mc -> mc.getSingleplayerServer().overworld().getSeed()) == seed, "another seed");
            check(score(context, GAME_OBJECTIVE, "starts") == 1, "the island was made again on a second Play");
            check(context.computeOnClient(mc -> objective(mc, SETUP_OBJECTIVE)) == null, "the setup function ran on a second Play");

            writeRequest(dev, 6, "quit", false, 0);
            context.waitFor(mc -> stops.get() == 2 && mc.level == null && mc.getSingleplayerServer() == null, OPEN_TICKS);
            context.setScreen(TitleScreen::new);
        } finally {
            DevClient.replaceStopAction(previousStop);
            context.runOnClient(mc -> {
                if (mc.level != null) {
                    mc.level.disconnect(ClientLevel.DEFAULT_QUIT_MESSAGE);
                    mc.disconnectWithSavingScreen();
                }
            });
            context.setScreen(TitleScreen::new);
            deleteTree(dev);
            context.waitFor(mc -> !DevClient.active(), 100);
            deleteTree(saves.resolve(WORLD));
        }
    }

    private static void writeDevFiles(Path dev) {
        write(dev.resolve("dev.json"), "{\n  \"appVersion\": \"0.0.0-test\",\n  \"format\": 1,\n  \"namespaces\": [\n    \""
                + NAMESPACE + "\"\n  ],\n  \"target\": \"mc-test\",\n  \"world\": \"" + WORLD + "\"\n}\n");
        // Lines a test world would run; a game world must run none of them.
        write(dev.resolve("setup.mcfunction"), "# msm:setup\nscoreboard objectives add " + SETUP_OBJECTIVE + " dummy\n"
                + "gamerule advance_time false\n# msm:refill\nscoreboard objectives add " + SETUP_OBJECTIVE + " dummy\n");
    }

    /**
     * The data-only project's lowered files as the dev data pack: a void world preset (a flat overworld without layers,
     * no features, no structure sets, as the games plugin writes {@code void}), and the first-join start that makes a 5 by 5
     * island under the spawn.
     */
    private static void writeDevDataPack(Path pack) {
        PackFormat format = SharedConstants.getCurrentVersion().packVersion(PackType.SERVER_DATA);
        write(pack.resolve("pack.mcmeta"), "{\"pack\":{\"description\":\"MCSuperMods test changes\",\"max_format\":[" + format.major()
                + "," + format.minor() + "],\"min_format\":[" + format.major() + "," + format.minor() + "],\"pack_format\":"
                + format.major() + "}}");
        write(pack.resolve("data/" + NAMESPACE + "/worldgen/world_preset/play_my_game.json"), "{\"dimensions\":{"
                + "\"minecraft:overworld\":{\"type\":\"minecraft:overworld\",\"generator\":{\"type\":\"minecraft:flat\",\"settings\":{"
                + "\"biome\":\"minecraft:plains\",\"features\":false,\"lakes\":false,\"layers\":[],\"structure_overrides\":[]}}},"
                + "\"minecraft:the_nether\":{\"type\":\"minecraft:the_nether\",\"generator\":{\"type\":\"minecraft:noise\","
                + "\"settings\":\"minecraft:nether\",\"biome_source\":{\"type\":\"minecraft:multi_noise\",\"preset\":\"minecraft:nether\"}}},"
                + "\"minecraft:the_end\":{\"type\":\"minecraft:the_end\",\"generator\":{\"type\":\"minecraft:noise\","
                + "\"settings\":\"minecraft:end\",\"biome_source\":{\"type\":\"minecraft:the_end\"}}}}}");
        write(pack.resolve("data/" + NAMESPACE + "/advancement/play_my_game/first_join.json"),
                "{\"criteria\":{\"join\":{\"trigger\":\"minecraft:tick\"}},\"rewards\":{\"function\":\"" + NAMESPACE
                        + ":play_my_game/start\"}}");
        write(pack.resolve("data/" + NAMESPACE + "/function/play_my_game/start.mcfunction"), String.join("\n",
                "scoreboard objectives add " + GAME_OBJECTIVE + " dummy",
                "scoreboard players add starts " + GAME_OBJECTIVE + " 1",
                "forceload add -8 -8 7 7",
                "fill -2 63 -2 2 63 2 minecraft:grass_block",
                "setworldspawn 0 64 0",
                "forceload remove -8 -8 7 7",
                "tp @s 0.5 64 0.5",
                ""));
    }

    private static void writePlay(Path dev, int seq) {
        write(dev.resolve("play.json"), "{\n  \"difficulty\": \"hard\",\n  \"format\": 1,\n  \"gameMode\": \"adventure\",\n"
                + "  \"kind\": \"game\",\n  \"preset\": \"" + PRESET + "\",\n  \"seq\": " + seq + ",\n  \"world\": \"" + WORLD + "\"\n}\n");
    }

    private static void writeRequest(Path dev, int seq, String action, boolean assets, int changes) {
        write(dev.resolve("request.json"), "{\n  \"action\": \"" + action + "\",\n  \"assets\": " + assets + ",\n  \"changes\": "
                + changes + ",\n  \"format\": 1,\n  \"seq\": " + seq + "\n}\n");
    }

    /**
     * Whether the player stands on the island's grass, as the client sees it (the client level: reading the server's level
     * from the client thread would wait on the server, which the test framework holds between client ticks).
     */
    private static boolean onIsland(Minecraft mc) {
        if (mc.player == null || mc.level == null) {
            return false;
        }
        return mc.player.onGround() && mc.player.getY() >= 64.0
                && mc.level.getBlockState(mc.player.blockPosition().below()).is(Blocks.GRASS_BLOCK);
    }

    /** Writes as the app does: a temporary file moved into place. */
    private static void write(Path file, String text) {
        try {
            Files.createDirectories(file.getParent());
            Path temp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.writeString(temp, text, StandardCharsets.UTF_8);
            Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void deleteTree(Path root) {
        if (!Files.exists(root)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void waitForWorld(ClientGameTestContext context) {
        context.waitFor(mc -> mc.level != null && mc.player != null && mc.getSingleplayerServer() != null
                && !(mc.gui.screen() instanceof LevelLoadingScreen), OPEN_TICKS);
    }

    private static JsonObject status(Path dev) {
        try {
            Path file = dev.resolve("status.json");
            if (!Files.isRegularFile(file)) {
                return null;
            }
            JsonElement json = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8));
            return json.isJsonObject() ? json.getAsJsonObject() : null;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private static void waitForStatus(ClientGameTestContext context, Path dev, Predicate<JsonObject> test, int ticks) {
        try {
            context.waitFor(mc -> {
                JsonObject s = status(dev);
                return s != null && s.get("format").getAsInt() == 1 && s.get("time").getAsLong() > 0 && test.test(s);
            }, ticks);
        } catch (AssertionError | RuntimeException e) {
            throw new AssertionError("status.json is " + status(dev), e);
        }
    }

    private static String string(JsonObject obj, String key) {
        JsonElement value = obj.get(key);
        return value != null && value.isJsonPrimitive() ? value.getAsString() : null;
    }

    private static boolean handled(JsonObject status, long seq, boolean ok) {
        return status.get("handled") instanceof JsonObject h && h.get("seq").getAsLong() == seq && h.get("ok").getAsBoolean() == ok;
    }

    private static Objective objective(Minecraft mc, String name) {
        IntegratedServer server = mc.getSingleplayerServer();
        return server == null ? null : server.getScoreboard().getObjective(name);
    }

    private static int score(ClientGameTestContext context, String objective, String holder) {
        return context.computeOnClient(mc -> score(mc, objective, holder));
    }

    private static void waitForScore(ClientGameTestContext context, String objective, String holder, int value) {
        try {
            context.waitFor(mc -> score(mc, objective, holder) == value, 200);
        } catch (AssertionError | RuntimeException e) {
            throw new AssertionError(holder + " is " + score(context, objective, holder) + ", expected " + value, e);
        }
    }

    private static int score(Minecraft mc, String objectiveName, String holder) {
        Objective objective = objective(mc, objectiveName);
        if (objective == null) {
            return mc.getSingleplayerServer() == null ? -1 : 0;
        }
        ReadOnlyScoreInfo info = mc.getSingleplayerServer().getScoreboard().getPlayerScoreInfo(ScoreHolder.forNameOnly(holder), objective);
        return info == null ? 0 : info.value();
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }
}
