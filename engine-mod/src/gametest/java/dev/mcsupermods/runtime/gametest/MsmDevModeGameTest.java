package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.dev.DevFiles;
import dev.mcsupermods.runtime.dev.DevMode;
import dev.mcsupermods.runtime.dev.DevSetup;
import dev.mcsupermods.runtime.dev.EventOverlay;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import dev.mcsupermods.runtime.scripting.ScriptScanner;
import dev.mcsupermods.runtime.scripting.ScriptSource;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.stream.Stream;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Runtime dev mode, server side (ADR 0084 D4, D6; B369). Fabric's GameTest server reports itself as dedicated, so dev
 * mode is on here only through the GameTest run's system property {@value DevMode#TEST_ROOT_PROPERTY}: this class sets it, when the build has not, to a fresh
 * {@code msm-dev-gametest/} folder in the run directory with a {@code dev.json} for {@code msm_dev_test} and
 * {@code msm_test}. A GameTest class is first initialised when its first test runs, after {@code SERVER_STARTING}, so each
 * test first calls {@link DevMode#decideFor} (the {@code SERVER_STARTING} listener) when dev mode is still off. Its
 * {@code world} names a folder the GameTest world is not, so mock players joining never run the setup function by
 * themselves.
 *
 * <p>No real {@code /reload} here: it would reset the scripts other tests use (see {@code MsmMachineRecipeGameTest}).
 * The overlay tests call {@link DevMode#dataPackReloaded}, which is what the {@code END_DATA_PACK_RELOAD} listener runs,
 * and a detached script host, whose load is what {@code END_DATA_PACK_RELOAD} runs. Each test writes its files, checks and
 * removes them in one tick, so no other test sees an overlay; the only definition overlaid is {@code msm_dev_test:dev_switch},
 * which no other test uses, and the script overlay keeps {@code msm_test:util}'s behaviour and adds one log line.
 */
public class MsmDevModeGameTest {
    private static final Path ROOT;
    private static final BlockPos AT = new BlockPos(1, 2, 1);
    private static final Identifier SWITCH = Identifier.fromNamespaceAndPath("msm_dev_test", "dev_switch");
    private static final String WORLD = "msm-test-msm_dev_test";

    static {
        String property = System.getProperty(DevMode.TEST_ROOT_PROPERTY);
        ROOT = (property == null || property.isBlank() ? Path.of("msm-dev-gametest") : Path.of(property)).toAbsolutePath().normalize();
        deleteTree(ROOT);
        write(ROOT.resolve(DevFiles.DEV_INFO_FILE), "{\n  \"appVersion\": \"gametest\",\n  \"format\": 1,\n  \"namespaces\": [\"msm_dev_test\", "
                + "\"msm_test\"],\n  \"target\": \"gametest\",\n  \"world\": \"" + WORLD + "\"\n}\n");
        System.setProperty(DevMode.TEST_ROOT_PROPERTY, ROOT.toString());
    }

    /** Dev mode for this run: decided again on the running server when the property came after its start. */
    private static DevMode.State devMode(GameTestHelper helper) {
        if (DevMode.current() == null) {
            DevMode.decideFor(helper.getLevel().getServer());
        }
        DevMode.State state = DevMode.current();
        helper.assertTrue(state != null, "dev mode is off with " + DevMode.TEST_ROOT_PROPERTY + "=" + ROOT);
        return state;
    }

    // ---- the decision ---------------------------------------------------------------------------------------

    /**
     * On only for a client (the integrated server) with a valid {@code msm-dev/dev.json}, or in a GameTest run with the test
     * root property; a dedicated server or a server environment outside a GameTest run never reads a file, even with the
     * test root property.
     */
    @GameTest
    public void decisionOnlyForClientsOrTheTestRoot(GameTestHelper helper) {
        Path game = Path.of("game");
        String valid = "{\"appVersion\":\"1\",\"format\":1,\"namespaces\":[\"ns\"],\"target\":\"mc-26.3\",\"world\":\"msm-test-ns\"}";
        List<Path> reads = new ArrayList<>();
        Map<Path, String> files = Map.of(game.resolve("msm-dev/dev.json"), valid, Path.of("root/dev.json"), valid);
        java.util.function.Function<Path, String> reader = p -> {
            reads.add(p);
            return files.get(p);
        };
        DevMode.Decision client = DevMode.decide(true, false, false, game, null, reader);
        helper.assertTrue(client.state().isPresent(), "client with dev.json: off");
        helper.assertValueEqual(client.state().get().root(), game.resolve("msm-dev"), "client root");
        helper.assertValueEqual(client.state().get().info().world(), "msm-test-ns", "world");
        helper.assertTrue(DevMode.decide(true, false, false, Path.of("other"), null, reader).state().isEmpty(), "client without dev.json: on");
        reads.clear();
        helper.assertTrue(DevMode.decide(false, true, false, game, null, reader).state().isEmpty(), "dedicated server: on");
        helper.assertTrue(DevMode.decide(true, true, false, game, null, reader).state().isEmpty(), "dedicated flag on a client: on");
        helper.assertTrue(DevMode.decide(false, false, false, game, null, reader).state().isEmpty(), "server environment without the property: on");
        helper.assertTrue(DevMode.decide(false, true, false, game, "root", reader).state().isEmpty(), "dedicated server with the root but no GameTest: on");
        helper.assertValueEqual(reads, List.of(), "files read for a dedicated server or a server environment");
        helper.assertTrue(DevMode.decide(false, false, true, game, "root", reader).state().isPresent(), "GameTest root: off");
        helper.assertTrue(DevMode.decide(false, true, true, game, "root", reader).state().isPresent(), "GameTest root on a dedicated-style server: off");
        DevMode.Decision broken = DevMode.decide(true, false, false, game, null, p -> "{\"format\":1}");
        helper.assertTrue(broken.state().isEmpty() && broken.problem() != null && broken.problem().contains("not a valid dev file"),
                "invalid dev.json: " + broken);
        helper.succeed();
    }

    /** Dev mode is on in this run, for the test root, and the GameTest world is not the dev session's test world. */
    @GameTest
    public void devModeIsOnForTheTestRoot(GameTestHelper helper) {
        DevMode.State state = devMode(helper);
        helper.assertValueEqual(state.root(), ROOT, "dev root");
        helper.assertValueEqual(state.info().namespaces(), List.of("msm_dev_test", "msm_test"), "namespaces");
        MinecraftServer server = helper.getLevel().getServer();
        helper.assertFalse(DevSetup.isDevWorld(server, state.info()), "GameTest world " + DevSetup.worldFolder(server));
        helper.succeed();
    }

    // ---- event overlays --------------------------------------------------------------------------------------

    /**
     * The overlay replaces the block's {@code on_interact} actions only after a reload; an overlay that adds a trigger or
     * a component, breaks an event or names an unknown definition logs one error and keeps the events in use; removing
     * the overlay falls back to the jar's events; the server writes nothing into the dev folder.
     */
    @GameTest
    public void eventOverlayReplacesOnlyEvents(GameTestHelper helper) {
        devMode(helper);
        MinecraftServer server = helper.getLevel().getServer();
        Path overlay = ROOT.resolve("overlay/msm/msm_dev_test/block/dev_switch.json");
        Path unknown = ROOT.resolve("overlay/msm/msm_dev_test/block/no_such_block.json");
        helper.setBlock(AT, BuiltInRegistries.BLOCK.getValue(SWITCH));
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.setGameMode(GameType.SURVIVAL);
        try {
            helper.assertValueEqual(press(helper, player), Blocks.GOLD_BLOCK, "jar events");

            write(overlay, definition("", "minecraft:diamond_block", ""));
            helper.assertValueEqual(press(helper, player), Blocks.GOLD_BLOCK, "overlay used before the reload");
            Map<String, String> before = snapshot();
            DevMode.dataPackReloaded(server);
            helper.assertValueEqual(snapshot(), before, "dev folder after the reload");
            helper.assertValueEqual(EventOverlay.lastErrors(), List.of(), "errors");
            helper.assertValueEqual(EventOverlay.size(), 1, "overlays");
            helper.assertValueEqual(press(helper, player), Blocks.DIAMOND_BLOCK, "overlay events after the reload");

            // A new trigger (msm:on_place with its event): one error, the overlay's events stay.
            write(overlay, definition(",\n    \"msm:on_place\": {\"event\": \"msm_dev_test:placed\"}", "minecraft:emerald_block",
                    ",\n    \"msm_dev_test:placed\": {\"actions\": [{\"type\": \"set_block_state\", \"state\": \"minecraft:stone\"}]}"));
            refused(helper, server, "msm:on_place added");
            helper.assertValueEqual(press(helper, player), Blocks.DIAMOND_BLOCK, "events after a new trigger");

            // A new component: one error.
            write(overlay, definition(",\n    \"msm:light_emitter\": {\"level\": 4}", "minecraft:emerald_block", ""));
            refused(helper, server, "msm:light_emitter added");
            helper.assertValueEqual(press(helper, player), Blocks.DIAMOND_BLOCK, "events after a new component");

            // A broken event (unknown action type): the definition's own check refuses it.
            write(overlay, "{\"format\": 1, \"events\": {\"msm_dev_test:use\": {\"actions\": [{\"type\": \"no_such_action\"}]}}}");
            refused(helper, server, "msm_dev_test:use");
            helper.assertValueEqual(press(helper, player), Blocks.DIAMOND_BLOCK, "events after a broken event");

            // Events only, without the other keys: accepted.
            write(overlay, "{\"events\": {\"msm_dev_test:use\": {\"actions\": [{\"offset\": [0, 1, 0], \"state\": \"minecraft:emerald_block\","
                    + " \"type\": \"set_block_state\"}]}}}");
            DevMode.dataPackReloaded(server);
            helper.assertValueEqual(EventOverlay.lastErrors(), List.of(), "errors of an events-only overlay");
            helper.assertValueEqual(press(helper, player), Blocks.EMERALD_BLOCK, "events-only overlay");

            // An unknown definition: one error; the other overlay still applies.
            write(unknown, definition("", "minecraft:stone", ""));
            refused(helper, server, "a new block needs a restart");
            helper.assertValueEqual(press(helper, player), Blocks.EMERALD_BLOCK, "events beside an unknown overlay");

            // Removed: back to the jar's events.
            deleteTree(ROOT.resolve("overlay"));
            DevMode.dataPackReloaded(server);
            helper.assertValueEqual(EventOverlay.lastErrors(), List.of(), "errors without overlays");
            helper.assertValueEqual(EventOverlay.size(), 0, "overlays left");
            helper.assertValueEqual(press(helper, player), Blocks.GOLD_BLOCK, "jar events after the overlay was removed");
        } finally {
            deleteTree(ROOT.resolve("overlay"));
            DevMode.dataPackReloaded(server);
        }
        helper.succeed();
    }

    private static void refused(GameTestHelper helper, MinecraftServer server, String reason) {
        Map<String, String> before = snapshot();
        DevMode.dataPackReloaded(server);
        helper.assertValueEqual(snapshot(), before, "dev folder after the reload");
        List<String> errors = EventOverlay.lastErrors();
        helper.assertValueEqual(errors.size(), 1, "errors: " + errors);
        helper.assertTrue(errors.get(0).contains(reason) && errors.get(0).endsWith("the events in use are kept"), "error: " + errors.get(0));
    }

    /** The dev switch's definition with extra components, the use event's block and extra events. */
    private static String definition(String components, String state, String events) {
        return "{\n  \"components\": {\n    \"msm:on_interact\": {\"event\": \"msm_dev_test:use\"}" + components + "\n  },\n"
                + "  \"events\": {\n    \"msm_dev_test:use\": {\"actions\": [{\"offset\": [0, 1, 0], \"state\": \"" + state
                + "\", \"type\": \"set_block_state\"}]}" + events + "\n  },\n  \"format\": 1\n}\n";
    }

    /** Right-clicks the switch with an empty hand and returns the block placed above (then cleared). */
    private static Block press(GameTestHelper helper, ServerPlayer player) {
        helper.setBlock(AT.above(), Blocks.AIR);
        BlockPos abs = helper.absolutePos(AT);
        BlockHitResult hit = new BlockHitResult(Vec3.atCenterOf(abs), Direction.UP, abs, false);
        player.gameMode.useItemOn(player, helper.getLevel(), player.getItemInHand(InteractionHand.MAIN_HAND), InteractionHand.MAIN_HAND, hit);
        Block above = helper.getBlockState(AT.above()).getBlock();
        helper.setBlock(AT.above(), Blocks.AIR);
        return above;
    }

    // ---- script overlays -------------------------------------------------------------------------------------

    /**
     * A script overlay with a jar script's id replaces that script (same mod, same place) in the scan the host loads on
     * {@code END_DATA_PACK_RELOAD}; one in a namespace outside the dev session is ignored with an error.
     */
    @GameTest
    public void scriptOverlayReplacesTheJarScript(GameTestHelper helper) {
        devMode(helper);
        MinecraftServer server = helper.getLevel().getServer();
        Identifier util = Identifier.fromNamespaceAndPath("msm_test", "util");
        try {
            ScriptScanner.Result jar = ScriptScanner.scanAllMods();
            ScriptSource original = find(jar, util).orElseThrow();
            helper.assertValueEqual(original.file(), "msm/msm_test/script/util.js", "jar file");
            write(ROOT.resolve("overlay/msm/msm_test/script/util.js"), original.source() + "\nmsm.log.info(\"util from the dev overlay\");\n");
            write(ROOT.resolve("overlay/msm/msm_test_b/script/outside.js"), "\"use strict\";\n");
            Map<String, String> before = snapshot();
            ScriptScanner.Result dev = ScriptScanner.scanAllMods();
            ScriptSource replaced = find(dev, util).orElseThrow();
            helper.assertValueEqual(replaced.file(), "msm-dev/overlay/msm/msm_test/script/util.js", "overlay file");
            helper.assertValueEqual(replaced.modId(), original.modId(), "mod of the replaced script");
            helper.assertValueEqual(dev.scripts().size(), jar.scripts().size(), "scripts");
            helper.assertValueEqual(dev.scripts().indexOf(replaced), jar.scripts().indexOf(original), "place of the replaced script");
            helper.assertTrue(dev.errors().stream().anyMatch(e -> e.contains("msm_test_b") && e.contains("not one of this dev session's")),
                    "errors: " + dev.errors());
            helper.assertFalse(dev.scripts().stream().anyMatch(s -> s.id().getNamespace().equals("msm_test_b") && s.id().getPath().equals("outside")),
                    "a script outside the session was read");
            ScriptHost host = ScriptHost.detached(server);
            helper.assertTrue(ScriptLogs.of(host).contains("msm_test:util: util from the dev overlay"), "logs: " + ScriptLogs.of(host));
            helper.assertTrue(ScriptLogs.of(host).contains("msm_test:util: util evaluated"), "logs: " + ScriptLogs.of(host));
            helper.assertValueEqual(snapshot(), before, "dev folder after the scans");
        } finally {
            deleteTree(ROOT.resolve("overlay"));
        }
        helper.succeed();
    }

    private static Optional<ScriptSource> find(ScriptScanner.Result result, Identifier id) {
        return result.scripts().stream().filter(s -> s.id().equals(id)).findFirst();
    }

    // ---- setup function --------------------------------------------------------------------------------------

    /**
     * The setup function: setup and refill on a world without the marker, then the refill only; a line that does not
     * parse is counted and logged; nothing is written into the dev folder.
     */
    @GameTest
    public void setupRunsOnceThenTheRefill(GameTestHelper helper) {
        devMode(helper);
        MinecraftServer server = helper.getLevel().getServer();
        BlockPos setupAt = helper.absolutePos(AT);
        BlockPos refillAt = helper.absolutePos(AT.east());
        Path file = ROOT.resolve(DevFiles.SETUP_FUNCTION_FILE);
        try {
            write(file, "# MCSuperMods test world\n" + DevFiles.SETUP_SECTION + "\nsetblock " + xyz(setupAt) + " minecraft:gold_block\n"
                    + "this is not a command\n" + DevFiles.REFILL_SECTION + "\n# a comment\nsetblock " + xyz(refillAt)
                    + " minecraft:diamond_block\nexecute if block " + xyz(refillAt) + " minecraft:stone run setblock " + xyz(refillAt)
                    + " minecraft:air\n");
            DevSetup.clearMarker(server);
            helper.assertValueEqual(DevSetup.run(server, ROOT.resolve("no_such.mcfunction")), DevSetup.Result.NONE, "missing file");
            helper.assertFalse(DevSetup.marked(server), "marker set without a file");
            Map<String, String> before = snapshot();
            DevSetup.Result first = DevSetup.run(server, file);
            helper.assertValueEqual(first, new DevSetup.Result(true, 4, 1, 1), "first run");
            helper.assertTrue(DevSetup.marked(server), "marker after the setup");
            helper.assertBlockPresent(Blocks.GOLD_BLOCK, AT);
            helper.assertBlockPresent(Blocks.DIAMOND_BLOCK, AT.east());
            helper.setBlock(AT, Blocks.AIR);
            helper.setBlock(AT.east(), Blocks.AIR);
            DevSetup.Result second = DevSetup.run(server, file);
            helper.assertValueEqual(second, new DevSetup.Result(false, 2, 0, 1), "second run");
            helper.assertBlockPresent(Blocks.AIR, AT);
            helper.assertBlockPresent(Blocks.DIAMOND_BLOCK, AT.east());
            helper.assertValueEqual(snapshot(), before, "dev folder after the runs");
        } finally {
            DevSetup.clearMarker(server);
            try {
                Files.deleteIfExists(file);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            }
        }
        helper.succeed();
    }

    private static String xyz(BlockPos pos) {
        return pos.getX() + " " + pos.getY() + " " + pos.getZ();
    }

    // ---- files -----------------------------------------------------------------------------------------------

    /** Every file under the dev root with its size, time and text. */
    private static Map<String, String> snapshot() {
        Map<String, String> out = new TreeMap<>();
        try (Stream<Path> walk = Files.walk(ROOT)) {
            for (Path p : walk.toList()) {
                String rel = ROOT.relativize(p).toString();
                out.put(rel, Files.isDirectory(p) ? "dir" : Files.size(p) + " " + Files.getLastModifiedTime(p) + " "
                        + Files.readString(p, StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        return out;
    }

    private static void write(Path file, String text) {
        try {
            Files.createDirectories(file.getParent());
            Files.writeString(file, text, StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static void deleteTree(Path root) {
        if (!Files.exists(root)) {
            return;
        }
        try (Stream<Path> walk = Files.walk(root)) {
            for (Path p : walk.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(p);
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
