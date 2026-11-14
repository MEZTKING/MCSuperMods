package dev.mcsupermods.runtime.client.dev;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.Action;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.DevRequest;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.GameState;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.Handled;
import dev.mcsupermods.runtime.client.dev.DevClientFiles.PlayRequest;
import dev.mcsupermods.runtime.dev.DevFiles;
import dev.mcsupermods.runtime.dev.DevSetup;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.FileTime;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.atomic.AtomicInteger;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.screen.v1.ScreenEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.network.chat.Component;

/**
 * Runtime dev mode, client side (ADR 0084 D2, D4, D5, D6; B374). Inert unless {@code <gameDir>/msm-dev/dev.json} is a valid
 * dev file (looked at every {@value DevWorldSettings#REQUEST_POLL_TICKS} ticks, so a {@code dev.json} written while the game
 * runs counts from then on). Through Fabric events only, no Mixin:
 *
 * <ul>
 *   <li>{@code ScreenEvents.AFTER_INIT} on the title screen looks at {@code play.json} at once (and the tick poll again
 *       while the title screen shows, once the start-up loading overlay is gone). A new play request (its {@code seq}
 *       above the last handled) is consumed (the file is deleted) and opens {@code saves/<world>} with
 *       {@code WorldOpenFlows.openWorld}, or creates it with {@code createFreshLevel} and {@link DevWorldSettings} when the
 *       folder does not exist.</li>
 *   <li>{@code ClientTickEvents.END_CLIENT_TICK} polls {@code request.json}'s modification time every
 *       {@value DevWorldSettings#REQUEST_POLL_TICKS} ticks and handles a new request: {@code reload} runs {@code /reload}
 *       on the integrated server through its command dispatcher (the server side reloads the overlays and scripts, B369),
 *       waits for Fabric's {@code END_DATA_PACK_RELOAD}, then reloads the resource packs when {@code assets}; {@code reopen}
 *       saves, leaves and opens the same world again (the server side then refills the chests, as on every first join of
 *       a server run); {@code quit} saves, leaves and stops the game. Reload and reopen say
 *       {@code MCSuperMods: reloaded (N changes)} or {@code MCSuperMods: reopened the test world (N changes)} in chat.</li>
 *   <li>{@code status.json} is written every {@value DevWorldSettings#STATUS_WRITE_TICKS} ticks, at once when the state
 *       changes or a request is handled, and before the game stops on a quit request.</li>
 * </ul>
 *
 * <p>Every request is handled once: the last handled {@code seq} starts from the previous run's {@code status.json}. All
 * work runs on the client thread; the only cross-thread fact is the reload count from the server thread.
 */
public final class DevClient {
    /** What is under way. */
    private enum Phase {
        /** The world is being left (reopen). */
        LEAVING,
        /** The world is being opened or created. */
        OPENING,
        /** {@code /reload} was sent; waiting for {@code END_DATA_PACK_RELOAD}. */
        RELOADING_DATA,
        /** {@code reloadResourcePacks()} is running. */
        RELOADING_ASSETS
    }

    /** One request under way. */
    private static final class Pending {
        final long seq;
        /** The request's action, or null for a play request. */
        final Action action;
        final boolean assets;
        final int changes;
        final String world;
        Phase phase;
        int startTick;
        int reloadsBefore;
        CompletableFuture<Void> assetsReload;
        boolean cancelled;

        Pending(long seq, Action action, boolean assets, int changes, String world, Phase phase, int startTick) {
            this.seq = seq;
            this.action = action;
            this.assets = assets;
            this.changes = changes;
            this.world = world;
            this.phase = phase;
            this.startTick = startTick;
        }

        String what() {
            return action == null ? "play" : action.json();
        }
    }

    private static final DevClient INSTANCE = new DevClient();
    private static volatile Runnable stopAction = () -> Minecraft.getInstance().stop();

    private final AtomicInteger reloads = new AtomicInteger();
    private volatile boolean lastReloadOk = true;

    private Path devDir;
    private FileTime infoTime;
    private boolean active;
    private boolean titleShown;
    private int tick;
    private FileTime requestTime;
    private long requestSize = -1;
    private long lastHandledSeq;
    private Handled handled;
    private Pending pending;
    private GameState lastState;
    private String lastWorld;
    private boolean statusDirty;
    private boolean statusWriteFailed;
    private String runtimeVersion;

    private DevClient() {}

    /** Registers the client hooks; called once from the client entrypoint. Inert without {@code msm-dev/dev.json}. */
    public static void register() {
        ScreenEvents.AFTER_INIT.register((client, screen, width, height) -> {
            if (screen instanceof TitleScreen) {
                INSTANCE.titleShown = true;
            }
        });
        ClientTickEvents.END_CLIENT_TICK.register(INSTANCE::tick);
        ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, resources, success) -> {
            INSTANCE.lastReloadOk = success;
            INSTANCE.reloads.incrementAndGet();
        });
    }

    /** Whether the dev client is on (a valid {@code dev.json} was seen at the last poll). */
    public static boolean active() {
        return INSTANCE.active;
    }

    /**
     * Replaces what a quit request finally calls ({@code Minecraft.stop()}) and returns the previous action. For the
     * client GameTest only, which cannot stop the game it runs in.
     */
    public static Runnable replaceStopAction(Runnable action) {
        Runnable previous = stopAction;
        stopAction = action;
        return previous;
    }

    private void tick(Minecraft mc) {
        tick++;
        boolean poll = tick % DevWorldSettings.REQUEST_POLL_TICKS == 0 || titleShown;
        if (poll) {
            refreshInfo();
        }
        if (!active) {
            titleShown = false;
            return;
        }
        if (pending != null) {
            advance(mc);
        } else if (poll) {
            if (atTitle(mc)) {
                checkPlayRequest(mc);
            }
            if (pending == null) {
                checkRequest(mc);
            }
        }
        titleShown = false;
        GameState state = state(mc);
        String world = state == GameState.WORLD ? worldFolder(mc) : null;
        if (statusDirty || state != lastState || !Objects.equals(world, lastWorld) || tick % DevWorldSettings.STATUS_WRITE_TICKS == 0) {
            writeStatus(state, world);
        }
    }

    // ---- dev.json ----

    private void refreshInfo() {
        if (devDir == null) {
            devDir = FabricLoader.getInstance().getGameDir().resolve(DevFiles.DEV_FOLDER);
        }
        Path info = devDir.resolve(DevFiles.DEV_INFO_FILE);
        FileTime time;
        try {
            time = Files.isRegularFile(info) ? Files.getLastModifiedTime(info) : null;
        } catch (IOException | RuntimeException e) {
            time = null;
        }
        if (time == null) {
            if (active) {
                MsmRuntime.LOGGER.info("[{}] dev client off: {} is gone", MsmRuntime.MOD_ID, info);
            }
            active = false;
            infoTime = null;
            return;
        }
        if (time.equals(infoTime)) {
            return;
        }
        infoTime = time;
        boolean valid = DevFiles.parseDevInfo(read(info)).isPresent();
        if (!valid) {
            if (active) {
                MsmRuntime.LOGGER.info("[{}] dev client off", MsmRuntime.MOD_ID);
            }
            MsmRuntime.LOGGER.error("[{}] {} is not a valid dev file; the dev client is off", MsmRuntime.MOD_ID, info);
            active = false;
            return;
        }
        if (!active) {
            active = true;
            pending = null;
            handled = DevClientFiles.previousHandled(read(devDir.resolve(DevClientFiles.STATUS_FILE))).orElse(null);
            lastHandledSeq = handled == null ? 0 : handled.seq();
            requestTime = null;
            requestSize = -1;
            lastState = null;
            statusDirty = true;
            MsmRuntime.LOGGER.info("[{}] dev client on: play and reload requests from {}", MsmRuntime.MOD_ID, devDir);
        }
    }

    // ---- play.json ----

    private static boolean atTitle(Minecraft mc) {
        return mc.gui.screen() instanceof TitleScreen && mc.gui.overlay() == null && mc.level == null
                && mc.getSingleplayerServer() == null;
    }

    private void checkPlayRequest(Minecraft mc) {
        Path file = devDir.resolve(DevClientFiles.PLAY_REQUEST_FILE);
        String text = read(file);
        if (text == null) {
            return;
        }
        Optional<PlayRequest> request = DevClientFiles.parsePlayRequest(text);
        delete(file);
        if (request.isEmpty()) {
            MsmRuntime.LOGGER.error("[{}] {} is not a valid play request; ignored", MsmRuntime.MOD_ID, file);
            return;
        }
        if (request.get().seq() <= lastHandledSeq) {
            return;
        }
        MsmRuntime.LOGGER.info("[{}] dev play request {}: opening {}", MsmRuntime.MOD_ID, request.get().seq(), request.get().world());
        pending = new Pending(request.get().seq(), null, false, 0, request.get().world(), Phase.OPENING, tick);
        openWorld(mc, pending);
    }

    /** Opens {@code p.world}, creating it when the folder does not exist; the outcome is followed by {@link #advance}. */
    private void openWorld(Minecraft mc, Pending p) {
        p.phase = Phase.OPENING;
        p.startTick = tick;
        try {
            if (mc.getLevelSource().levelExists(p.world)) {
                mc.createWorldOpenFlows().openWorld(p.world, () -> {
                    p.cancelled = true;
                    mc.gui.setScreen(new TitleScreen());
                });
            } else {
                MsmRuntime.LOGGER.info("[{}] dev: creating the test world {}", MsmRuntime.MOD_ID, p.world);
                mc.createWorldOpenFlows().createFreshLevel(p.world, DevWorldSettings.levelSettings(p.world),
                        DevWorldSettings.worldOptions(), DevWorldSettings::dimensions, new TitleScreen());
            }
        } catch (RuntimeException e) {
            MsmRuntime.LOGGER.error("[{}] dev: opening {} failed", MsmRuntime.MOD_ID, p.world, e);
            finish(mc, false, "The test world could not be opened; see the game log.");
        }
    }

    // ---- request.json ----

    private void checkRequest(Minecraft mc) {
        Path file = devDir.resolve(DevClientFiles.REQUEST_FILE);
        FileTime time;
        long size;
        try {
            if (!Files.isRegularFile(file)) {
                return;
            }
            time = Files.getLastModifiedTime(file);
            size = Files.size(file);
        } catch (IOException | RuntimeException e) {
            return;
        }
        if (time.equals(requestTime) && size == requestSize) {
            return;
        }
        Optional<DevRequest> parsed = DevClientFiles.parseRequest(read(file));
        requestTime = time;
        requestSize = size;
        if (parsed.isEmpty()) {
            MsmRuntime.LOGGER.error("[{}] {} is not a valid request; ignored", MsmRuntime.MOD_ID, file);
            return;
        }
        DevRequest request = parsed.get();
        if (request.seq() <= lastHandledSeq) {
            return;
        }
        MsmRuntime.LOGGER.info("[{}] dev request {}: {}", MsmRuntime.MOD_ID, request.seq(), request.action().json());
        IntegratedServer server = mc.getSingleplayerServer();
        boolean inWorld = server != null && mc.level != null;
        switch (request.action()) {
            case RELOAD -> {
                pending = new Pending(request.seq(), Action.RELOAD, request.assets(), request.changes(), null, Phase.RELOADING_DATA, tick);
                if (!inWorld) {
                    finish(mc, false, "The test world is not open, so nothing was reloaded.");
                    return;
                }
                pending.reloadsBefore = reloads.get();
                server.execute(() -> server.getCommands().performPrefixedCommand(server.createCommandSourceStack(), "reload"));
            }
            case REOPEN -> {
                String world = inWorld ? DevSetup.worldFolder(server) : null;
                pending = new Pending(request.seq(), Action.REOPEN, request.assets(), request.changes(), world, Phase.LEAVING, tick);
                if (!inWorld || !DevFiles.isWorldFolder(world)) {
                    finish(mc, false, "The test world is not open, so it was not reopened.");
                    return;
                }
                leave(mc);
            }
            case QUIT -> {
                pending = new Pending(request.seq(), Action.QUIT, false, 0, null, Phase.LEAVING, tick);
                if (mc.level != null) {
                    leave(mc);
                }
                finish(mc, true, null);
                writeStatus(state(mc), null);
                MsmRuntime.LOGGER.info("[{}] dev: stopping the game (quit request)", MsmRuntime.MOD_ID);
                stopAction.run();
            }
        }
    }

    /** Saves and leaves the world, as the pause screen's "Save and Quit to Title" (blocks until the server stopped). */
    private static void leave(Minecraft mc) {
        if (mc.level != null) {
            mc.level.disconnect(ClientLevel.DEFAULT_QUIT_MESSAGE);
        }
        mc.disconnectWithSavingScreen();
    }

    // ---- requests under way ----

    private static boolean inWorld(Minecraft mc) {
        return mc.level != null && mc.player != null && mc.getSingleplayerServer() != null
                && !(mc.gui.screen() instanceof LevelLoadingScreen);
    }

    private void advance(Minecraft mc) {
        Pending p = pending;
        int elapsed = tick - p.startTick;
        switch (p.phase) {
            case LEAVING -> {
                if (mc.level == null && mc.getSingleplayerServer() == null) {
                    openWorld(mc, p);
                } else if (elapsed > DevWorldSettings.OPEN_TIMEOUT_TICKS) {
                    finish(mc, false, "The test world did not close.");
                }
            }
            case OPENING -> {
                if (inWorld(mc)) {
                    afterData(mc, p);
                } else if (p.cancelled) {
                    finish(mc, false, "Opening the test world was cancelled.");
                } else if (mc.level == null && mc.gui.screen() instanceof TitleScreen
                        && elapsed > DevWorldSettings.OPEN_FAILED_GRACE_TICKS) {
                    finish(mc, false, "The test world could not be opened; see the game log.");
                } else if (elapsed > DevWorldSettings.OPEN_TIMEOUT_TICKS) {
                    finish(mc, false, "The test world did not open in time.");
                }
            }
            case RELOADING_DATA -> {
                if (reloads.get() > p.reloadsBefore) {
                    if (lastReloadOk) {
                        afterData(mc, p);
                    } else {
                        finish(mc, false, "The data packs did not reload; see the game log.");
                    }
                } else if (mc.level == null) {
                    finish(mc, false, "The test world closed during the reload.");
                } else if (elapsed > DevWorldSettings.RELOAD_TIMEOUT_TICKS) {
                    finish(mc, false, "The reload did not finish in time.");
                }
            }
            case RELOADING_ASSETS -> {
                if (p.assetsReload.isDone()) {
                    if (p.assetsReload.isCompletedExceptionally()) {
                        finish(mc, false, "The resource packs did not reload; see the game log.");
                    } else {
                        finish(mc, true, null);
                    }
                } else if (elapsed > DevWorldSettings.RELOAD_TIMEOUT_TICKS) {
                    finish(mc, false, "The resource packs did not reload in time.");
                }
            }
        }
    }

    /** The data part is done (world open or data packs reloaded): reload the resource packs when asked, else finish. */
    private void afterData(Minecraft mc, Pending p) {
        if (p.assets) {
            p.phase = Phase.RELOADING_ASSETS;
            p.startTick = tick;
            p.assetsReload = mc.reloadResourcePacks();
        } else {
            finish(mc, true, null);
        }
    }

    private void finish(Minecraft mc, boolean ok, String message) {
        Pending p = pending;
        pending = null;
        handled = new Handled(p.seq, ok, ok ? null : message);
        lastHandledSeq = Math.max(lastHandledSeq, p.seq);
        statusDirty = true;
        if (ok) {
            MsmRuntime.LOGGER.info("[{}] dev {} {} done", MsmRuntime.MOD_ID, p.what(), p.seq);
        } else {
            MsmRuntime.LOGGER.warn("[{}] dev {} {} failed: {}", MsmRuntime.MOD_ID, p.what(), p.seq, message);
        }
        if (mc.player != null) {
            if (!ok) {
                mc.player.sendSystemMessage(Component.literal("MCSuperMods: " + message));
            } else if (p.action == Action.RELOAD || p.action == Action.REOPEN) {
                mc.player.sendSystemMessage(Component.literal(DevClientFiles.chatLine(p.action, p.changes)));
            }
        }
    }

    // ---- status.json ----

    private GameState state(Minecraft mc) {
        Pending p = pending;
        if (p != null && (p.phase == Phase.LEAVING || p.phase == Phase.OPENING)) {
            return GameState.LOADING;
        }
        if (mc.level != null) {
            return GameState.WORLD;
        }
        return mc.gui.overlay() != null ? GameState.LOADING : GameState.TITLE;
    }

    private static String worldFolder(Minecraft mc) {
        IntegratedServer server = mc.getSingleplayerServer();
        return server == null ? null : DevSetup.worldFolder(server);
    }

    private void writeStatus(GameState state, String world) {
        lastState = state;
        lastWorld = world;
        statusDirty = false;
        if (runtimeVersion == null) {
            runtimeVersion = FabricLoader.getInstance().getModContainer(MsmRuntime.MOD_ID)
                    .map(m -> m.getMetadata().getVersion().getFriendlyString()).orElse("unknown");
        }
        String text = DevClientFiles.statusText(
                new DevClientFiles.Status(state, world, handled, System.currentTimeMillis(), runtimeVersion));
        Path file = devDir.resolve(DevClientFiles.STATUS_FILE);
        Path temp = devDir.resolve(DevClientFiles.STATUS_FILE + ".tmp");
        try {
            Files.writeString(temp, text, StandardCharsets.UTF_8);
            try {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (AtomicMoveNotSupportedException e) {
                Files.move(temp, file, StandardCopyOption.REPLACE_EXISTING);
            }
            statusWriteFailed = false;
        } catch (IOException | RuntimeException e) {
            // The app may hold the file for a moment while reading it (Windows); the next regular write tries again.
            if (!statusWriteFailed) {
                statusWriteFailed = true;
                MsmRuntime.LOGGER.warn("[{}] dev: could not write {}: {}", MsmRuntime.MOD_ID, file, e.toString());
            }
        }
    }

    // ---- files ----

    private static String read(Path file) {
        try {
            return Files.isRegularFile(file) ? Files.readString(file, StandardCharsets.UTF_8) : null;
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private static void delete(Path file) {
        try {
            Files.deleteIfExists(file);
        } catch (IOException | RuntimeException e) {
            MsmRuntime.LOGGER.warn("[{}] dev: could not remove {}: {}", MsmRuntime.MOD_ID, file, e.toString());
        }
    }
}
