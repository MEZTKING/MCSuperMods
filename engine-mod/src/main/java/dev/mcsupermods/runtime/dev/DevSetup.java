package dev.mcsupermods.runtime.dev;

import com.mojang.brigadier.ParseResults;
import com.mojang.serialization.Codec;
import dev.mcsupermods.runtime.MsmRuntime;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import net.fabricmc.fabric.api.attachment.v1.AttachmentRegistry;
import net.fabricmc.fabric.api.attachment.v1.AttachmentType;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.storage.LevelResource;

/**
 * The test world's setup function (ADR 0084 D2): {@code <dev folder>/setup.mcfunction}, written by the app (B366), run
 * through the command dispatcher as the server at the world spawn, after the first player joins the test world (the
 * world whose folder name is {@code dev.json}'s {@code world}) in each server run:
 *
 * <ul>
 *   <li>a new world (no marker yet): the {@code # msm:setup} lines, then the {@code # msm:refill} lines, then the marker
 *       is set;</li>
 *   <li>a world with the marker: the refill lines only.</li>
 * </ul>
 *
 * <p>The marker is the persistent level attachment {@code msm_runtime:dev_setup} on the overworld (saved in the world's
 * own saved data, never in the dev folder). Each server run refills once, so opening the world again (Play, or a reopen
 * request) refills the chests; {@code /reload} does not. A line that does not parse logs an error; a line that ran but
 * did nothing (such as an {@code execute if} whose test failed) is counted in one info line.
 *
 * <p>A Play my game world ({@code msm-game-<ns>}, ADR 0116 D1, B554) runs no setup function at all, whatever the file
 * holds: no test area, chests or game rule changes. The game's own data pack functions set it up, as for a player.
 */
public final class DevSetup {
    public static final Identifier ID = Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, "dev_setup");
    public static final AttachmentType<Boolean> MARKER = AttachmentRegistry.create(ID, builder -> builder.persistent(Codec.BOOL));

    private static final AtomicBoolean RAN_THIS_START = new AtomicBoolean();

    /**
     * What a run did.
     *
     * @param setup      the setup section ran (a new world)
     * @param lines      lines run
     * @param invalid    lines that did not parse (each logged as an error)
     * @param didNothing lines that parsed but reported no success
     */
    public record Result(boolean setup, int lines, int invalid, int didNothing) {
        public static final Result NONE = new Result(false, 0, 0, 0);
    }

    private DevSetup() {}

    /** Registers the attachment type (class initialisation). */
    static void register() {
        MsmRuntime.LOGGER.debug("[{}] registered attachment {}", MsmRuntime.MOD_ID, MARKER.identifier());
    }

    static void serverStopped() {
        RAN_THIS_START.set(false);
    }

    /** {@code JOIN} in dev mode: the first join of this server run in the test world runs the function (next tick). */
    static void playerJoined(MinecraftServer server, DevMode.State state, ServerPlayer player) {
        if (!isDevWorld(server, state.info()) || !RAN_THIS_START.compareAndSet(false, true)) {
            return;
        }
        if (DevFiles.isGameWorldFolder(worldFolder(server))) {
            MsmRuntime.LOGGER.info("[{}] dev: {} is a game world; no setup function, test area or chests", MsmRuntime.MOD_ID,
                    worldFolder(server));
            return;
        }
        server.execute(() -> run(server, state.setupFunction()));
    }

    /** Whether the server's world folder is the dev session's test world. */
    public static boolean isDevWorld(MinecraftServer server, DevFiles.DevInfo info) {
        return worldFolder(server).equals(info.world());
    }

    /** The folder name of the server's world in {@code saves/}. */
    public static String worldFolder(MinecraftServer server) {
        Path root = server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize();
        Path name = root.getFileName();
        return name == null ? "" : name.toString();
    }

    /** Whether the overworld carries the marker (the setup has run in this world). */
    public static boolean marked(MinecraftServer server) {
        return server.overworld().getAttachedOrElse(MARKER, false);
    }

    /** Removes the marker (GameTests). */
    public static void clearMarker(MinecraftServer server) {
        server.overworld().removeAttached(MARKER);
    }

    /**
     * Runs the setup function file: setup and refill on a world without the marker (then sets it), refill only on one
     * with it. A missing or empty file runs nothing and sets no marker. Reads the file only.
     */
    public static Result run(MinecraftServer server, Path setupFile) {
        DevFiles.SetupFunction fn = DevFiles.parseSetupFunction(DevMode.readOrNull(setupFile));
        if (fn.setup().isEmpty() && fn.refill().isEmpty()) {
            return Result.NONE;
        }
        ServerLevel overworld = server.overworld();
        boolean fresh = !overworld.getAttachedOrElse(MARKER, false);
        List<String> lines = new ArrayList<>();
        if (fresh) {
            lines.addAll(fn.setup());
        }
        lines.addAll(fn.refill());
        CommandSourceStack source = server.createCommandSourceStack().withSuppressedOutput();
        int invalid = 0;
        int didNothing = 0;
        for (String line : lines) {
            String command = line.startsWith("/") ? line.substring(1) : line;
            ParseResults<CommandSourceStack> parse = server.getCommands().getDispatcher().parse(command, source);
            if (parse.getReader().canRead() || parse.getContext().getLastChild().getCommand() == null) {
                invalid++;
                MsmRuntime.LOGGER.error("[{}] dev setup: not a valid command: {}", MsmRuntime.MOD_ID, line);
                continue;
            }
            boolean[] succeeded = {false};
            CommandSourceStack counted = source.withCallback((success, value) -> {
                if (success) {
                    succeeded[0] = true;
                }
            });
            server.getCommands().performPrefixedCommand(counted, command);
            if (!succeeded[0]) {
                didNothing++;
            }
        }
        if (fresh) {
            overworld.setAttached(MARKER, true);
        }
        MsmRuntime.LOGGER.info("[{}] dev setup: {} ({} line(s), {} did nothing, {} invalid)", MsmRuntime.MOD_ID,
                fresh ? "set up the test world and filled the chests" : "refilled the chests", lines.size(), didNothing, invalid);
        return new Result(fresh, lines.size(), invalid, didNothing);
    }
}
