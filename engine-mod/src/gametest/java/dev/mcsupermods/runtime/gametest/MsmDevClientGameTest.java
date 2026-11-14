package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import dev.mcsupermods.runtime.client.dev.DevClient;
import dev.mcsupermods.runtime.client.dev.DevWorldSettings;
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
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.world.Difficulty;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.levelgen.FlatLevelSource;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.ReadOnlyScoreInfo;
import net.minecraft.world.scores.ScoreHolder;

/**
 * Client GameTest for the dev client (ADR 0084 D2, D4, D5, D6; B374), run by {@code ./gradlew runClientGameTest
 * [-Pmc=26.4]} after {@link MsmParticleClientGameTest} (headless: see that class). It plays the app's part in
 * {@code <gameDir>/msm-dev/} the way {@code @msm/interop} {@code fabric/dev-session.ts} writes the files, and checks:
 *
 * <ol>
 *   <li>with a {@code dev.json} the client writes {@code status.json} with state {@code title};</li>
 *   <li>a play request at the title screen is consumed and creates and joins {@code saves/msm-test-msm_test} (flat,
 *       creative, easy, commands on, the fixed seed), the server side's dev mode is on and its setup function ran once
 *       (setup and refill), and the status says {@code world} with the request handled;</li>
 *   <li>a reload request with assets runs {@code /reload} on the integrated server (one more
 *       {@code END_DATA_PACK_RELOAD}) and reloads the resource packs;</li>
 *   <li>a reopen request leaves and opens the same world again, which refills (the refill section runs again);</li>
 *   <li>a quit request leaves the world and calls the stop action (replaced here: the test cannot stop its own game);</li>
 *   <li>a second play request opens the existing world (refill again, no second setup);</li>
 *   <li>a reload request outside a world is handled as failed with a plain message.</li>
 * </ol>
 *
 * <p>Not covered here (the user's in-game check on Windows with Prism): the first launch from Prism, the real
 * {@code Minecraft.stop()} and the jar lock, and what the resource reload looks like.
 */
public class MsmDevClientGameTest implements FabricClientGameTest {
    private static final String NAMESPACE = "msm_test";
    private static final String WORLD = DevWorldSettings.WORLD_FOLDER_PREFIX + NAMESPACE;
    private static final String OBJECTIVE = "msm_dev_client";
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
        Path dev = FabricLoader.getInstance().getGameDir().resolve("msm-dev");
        Path saves = context.computeOnClient(mc -> mc.getLevelSource().getBaseDir());
        deleteTree(dev);
        deleteTree(saves.resolve(WORLD));
        AtomicInteger stops = new AtomicInteger();
        Runnable previousStop = DevClient.replaceStopAction(stops::incrementAndGet);
        try {
            writeDevFiles(dev);
            context.waitFor(mc -> DevClient.active(), 100);
            waitForStatus(context, dev, s -> "title".equals(string(s, "state")) && s.get("world").isJsonNull(), 200);

            // Play: a new test world is created and joined.
            write(dev.resolve("play.json"), "{\n  \"format\": 1,\n  \"seq\": 1,\n  \"world\": \"" + WORLD + "\"\n}\n");
            context.setScreen(TitleScreen::new);
            waitForWorld(context);
            check(!Files.exists(dev.resolve("play.json")), "play.json was not consumed");
            check(Files.isDirectory(saves.resolve(WORLD)), "no world folder " + saves.resolve(WORLD));
            IntegratedServer server = context.computeOnClient(Minecraft::getSingleplayerServer);
            check(DevSetup.worldFolder(server).equals(WORLD), "opened " + DevSetup.worldFolder(server) + ", not " + WORLD);
            check(server.getWorldData().getGameType() == GameType.CREATIVE, "game type " + server.getWorldData().getGameType());
            check(server.getWorldData().getDifficulty() == Difficulty.EASY, "difficulty " + server.getWorldData().getDifficulty());
            check(server.getWorldData().isAllowCommands(), "commands are off");
            check(server.overworld().getSeed() == DevWorldSettings.SEED, "seed " + server.overworld().getSeed());
            check(server.overworld().getChunkSource().getGenerator() instanceof FlatLevelSource,
                    "not flat: " + server.overworld().getChunkSource().getGenerator());
            check(DevMode.active(), "server-side dev mode is off");
            waitForScore(context, "refills", 1);
            check(score(context, "setups") == 1, "setup ran " + score(context, "setups") + " times");
            waitForStatus(context, dev, s -> handled(s, 1, true) && "world".equals(string(s, "state")) && WORLD.equals(string(s, "world")),
                    200);
            context.waitTicks(40);
            context.takeScreenshot("msm_dev_test_world");

            // Reload with assets: /reload on the integrated server, then the resource packs.
            int reloadsBefore = RELOADS.get();
            writeRequest(dev, 2, "reload", true, 3);
            waitForStatus(context, dev, s -> handled(s, 2, true) && "world".equals(string(s, "state")), REQUEST_TICKS);
            check(RELOADS.get() == reloadsBefore + 1, "data pack reloads " + (RELOADS.get() - reloadsBefore) + ", expected 1");

            // Reopen: the same world again, which refills.
            writeRequest(dev, 3, "reopen", false, 1);
            waitForStatus(context, dev, s -> handled(s, 3, true) && "world".equals(string(s, "state")), OPEN_TICKS);
            waitForWorld(context);
            waitForScore(context, "refills", 2);
            check(score(context, "setups") == 1, "setup ran again on reopen");

            // Quit: leaves the world and stops (here: counts).
            writeRequest(dev, 4, "quit", false, 0);
            context.waitFor(mc -> stops.get() == 1 && mc.level == null && mc.getSingleplayerServer() == null, OPEN_TICKS);
            waitForStatus(context, dev, s -> handled(s, 4, true) && s.get("world").isJsonNull(), 200);
            context.setScreen(TitleScreen::new);

            // Play again: the existing world opens.
            write(dev.resolve("play.json"), "{\n  \"format\": 1,\n  \"seq\": 5,\n  \"world\": \"" + WORLD + "\"\n}\n");
            context.setScreen(TitleScreen::new);
            waitForWorld(context);
            waitForScore(context, "refills", 3);
            check(score(context, "setups") == 1, "setup ran again on a second Play");
            waitForStatus(context, dev, s -> handled(s, 5, true) && "world".equals(string(s, "state")), 200);

            writeRequest(dev, 6, "quit", false, 0);
            context.waitFor(mc -> stops.get() == 2 && mc.level == null && mc.getSingleplayerServer() == null, OPEN_TICKS);
            context.setScreen(TitleScreen::new);

            // A reload outside a world fails in plain words.
            writeRequest(dev, 7, "reload", false, 1);
            waitForStatus(context, dev, s -> handled(s, 7, false) && s.getAsJsonObject("handled").has("message"), 200);
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
        write(dev.resolve("setup.mcfunction"), "# MCSuperMods test world (client GameTest)\n# msm:setup\n"
                + "scoreboard objectives add " + OBJECTIVE + " dummy\nscoreboard players add setups " + OBJECTIVE + " 1\n"
                + "# msm:refill\nscoreboard players add refills " + OBJECTIVE + " 1\n");
    }

    private static void writeRequest(Path dev, int seq, String action, boolean assets, int changes) {
        write(dev.resolve("request.json"), "{\n  \"action\": \"" + action + "\",\n  \"assets\": " + assets + ",\n  \"changes\": "
                + changes + ",\n  \"format\": 1,\n  \"seq\": " + seq + "\n}\n");
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
                return s != null && s.get("format").getAsInt() == 1 && s.get("time").getAsLong() > 0 && string(s, "runtime") != null
                        && test.test(s);
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

    /** A score of the setup function's objective on the integrated server (the server is idle between test steps). */
    private static int score(ClientGameTestContext context, String holder) {
        return context.computeOnClient(mc -> score(mc, holder));
    }

    private static void waitForScore(ClientGameTestContext context, String holder, int value) {
        try {
            context.waitFor(mc -> score(mc, holder) == value, 200);
        } catch (AssertionError | RuntimeException e) {
            throw new AssertionError(holder + " is " + score(context, holder) + ", expected " + value, e);
        }
    }

    private static int score(Minecraft mc, String holder) {
        IntegratedServer server = mc.getSingleplayerServer();
        if (server == null) {
            return -1;
        }
        Objective objective = server.getScoreboard().getObjective(OBJECTIVE);
        if (objective == null) {
            return 0;
        }
        ReadOnlyScoreInfo info = server.getScoreboard().getPlayerScoreInfo(ScoreHolder.forNameOnly(holder), objective);
        return info == null ? 0 : info.value();
    }

    private static void check(boolean condition, String message) {
        if (!condition) {
            throw new AssertionError(message);
        }
    }
}
