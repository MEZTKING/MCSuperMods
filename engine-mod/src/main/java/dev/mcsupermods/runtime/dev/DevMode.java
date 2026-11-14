package dev.mcsupermods.runtime.dev;

import dev.mcsupermods.runtime.MsmRuntime;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.function.Function;
import net.fabricmc.api.EnvType;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.server.MinecraftServer;

/**
 * Runtime dev mode, server side (ADR 0084 D4). Decided once per server at {@code SERVER_STARTING} (before the script host
 * loads, so {@code MsmRuntime} registers this first) and cleared at {@code SERVER_STOPPED}:
 *
 * <ul>
 *   <li>On for the integrated server of a client (Fabric environment {@code CLIENT}) when
 *       {@code <gameDir>/msm-dev/dev.json} is a valid dev file.</li>
 *   <li>On for a GameTest run (Fabric API's {@value #GAMETEST_PROPERTY} system property is set) when the system property
 *       {@value #TEST_ROOT_PROPERTY} names a folder holding a valid {@code dev.json}. Fabric's GameTest server reports
 *       itself as dedicated, so this route does not ask.</li>
 *   <li>Off otherwise: a dedicated server ({@link MinecraftServer#isDedicatedServer()}, or the {@code SERVER}
 *       environment) that is not a GameTest run never reads {@code msm-dev/} or the test root, whatever is in its
 *       folder and whatever properties it was given.</li>
 * </ul>
 *
 * <p>When on, it logs {@code [msm_runtime] dev mode for <namespaces> (singleplayer test world)} once, loads the event
 * overlays ({@link EventOverlay}) and reloads them on {@code END_DATA_PACK_RELOAD}; the script scanner reads the script
 * overlays; {@link DevSetup} runs the setup function when a player joins the test world. Nothing is written into the dev
 * folder by the server side.
 */
public final class DevMode {
    /** The GameTest system property naming a folder that plays the part of {@code msm-dev/}. */
    public static final String TEST_ROOT_PROPERTY = "msm.dev.testRoot";
    /** Set by Fabric API (and Loom's {@code runGameTest}) on a GameTest server. */
    public static final String GAMETEST_PROPERTY = "fabric-api.gametest";

    /**
     * Dev mode of the running server.
     *
     * @param root the dev folder ({@code <gameDir>/msm-dev}, or the GameTest root)
     * @param info its {@code dev.json}
     */
    public record State(Path root, DevFiles.DevInfo info) {
        public Path overlayMsm() {
            return root.resolve(DevFiles.OVERLAY_FOLDER).resolve("msm");
        }

        public Path setupFunction() {
            return root.resolve(DevFiles.SETUP_FUNCTION_FILE);
        }
    }

    /**
     * The outcome of {@link #decide}.
     *
     * @param state   present when dev mode is on
     * @param problem a line to log when a dev file was found but is not valid (dev mode then stays off), else null
     */
    public record Decision(Optional<State> state, String problem) {
        static final Decision OFF = new Decision(Optional.empty(), null);
    }

    private static volatile State current;

    private DevMode() {}

    /** Registers the lifecycle and join listeners; call before {@code ScriptBridges.register()}. */
    public static void register() {
        DevSetup.register();
        ServerLifecycleEvents.SERVER_STARTING.register(DevMode::decideFor);
        ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, resources, success) -> dataPackReloaded(server));
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> {
            current = null;
            EventOverlay.clear();
            DevSetup.serverStopped();
        });
        ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
            State state = current;
            if (state != null) {
                DevSetup.playerJoined(server, state, handler.player);
            }
        });
    }

    /** Dev mode of the running server, or null when off (always null on a dedicated server). */
    public static State current() {
        return current;
    }

    public static boolean active() {
        return current != null;
    }

    /**
     * Whether dev mode is on, from the facts alone. Pure apart from {@code readText}, which returns a file's text or null
     * when it cannot be read; outside a GameTest run it is never called for a dedicated server or a server environment.
     *
     * @param gameTest         a GameTest run ({@value #GAMETEST_PROPERTY} set); only then is {@code testRootProperty} read
     * @param testRootProperty the value of {@value #TEST_ROOT_PROPERTY}, or null
     */
    public static Decision decide(boolean client, boolean dedicatedServer, boolean gameTest, Path gameDir, String testRootProperty,
            Function<Path, String> readText) {
        Path root;
        if (gameTest && testRootProperty != null && !testRootProperty.isBlank()) {
            root = Path.of(testRootProperty);
        } else if (client && !dedicatedServer) {
            root = gameDir.resolve(DevFiles.DEV_FOLDER);
        } else {
            return Decision.OFF;
        }
        Path infoFile = root.resolve(DevFiles.DEV_INFO_FILE);
        String text = readText.apply(infoFile);
        if (text == null) {
            return Decision.OFF;
        }
        Optional<DevFiles.DevInfo> info = DevFiles.parseDevInfo(text);
        if (info.isEmpty()) {
            return new Decision(Optional.empty(), infoFile + " is not a valid dev file; dev mode is off");
        }
        return new Decision(Optional.of(new State(root, info.get())), null);
    }

    /** A file's text, or null when it is missing or cannot be read. */
    static String readOrNull(Path file) {
        try {
            return Files.isRegularFile(file) ? Files.readString(file, StandardCharsets.UTF_8) : null;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    /**
     * {@code SERVER_STARTING}: decides dev mode for {@code server}, logs the dev mode line when on and loads the event
     * overlays. GameTests call it again on the running server after setting {@value #TEST_ROOT_PROPERTY} (a GameTest
     * class is first initialised when its first test runs, after the server started).
     */
    public static void decideFor(MinecraftServer server) {
        FabricLoader loader = FabricLoader.getInstance();
        Decision decision = decide(loader.getEnvironmentType() == EnvType.CLIENT, server.isDedicatedServer(),
                System.getProperty(GAMETEST_PROPERTY) != null, loader.getGameDir(), System.getProperty(TEST_ROOT_PROPERTY), DevMode::readOrNull);
        if (decision.problem() != null) {
            MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, decision.problem());
        }
        current = decision.state().orElse(null);
        EventOverlay.clear();
        State state = current;
        if (state != null) {
            MsmRuntime.LOGGER.info("[{}] dev mode for {} (singleplayer test world)", MsmRuntime.MOD_ID,
                    String.join(", ", state.info().namespaces()));
            EventOverlay.reload(state);
        }
    }

    /** {@code END_DATA_PACK_RELOAD}: the event overlays are read again (scripts reload through the script host). */
    public static void dataPackReloaded(MinecraftServer server) {
        State state = current;
        if (state != null) {
            EventOverlay.reload(state);
        }
    }
}
