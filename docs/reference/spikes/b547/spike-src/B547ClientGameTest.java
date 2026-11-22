package dev.mcsupermods.runtime.gametest.spike6;

import com.google.gson.GsonBuilder;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import java.util.stream.Stream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import net.fabricmc.fabric.api.client.gametest.v1.FabricClientGameTest;
import net.fabricmc.fabric.api.client.gametest.v1.context.ClientGameTestContext;
import net.fabricmc.fabric.api.client.gametest.v1.context.TestSingleplayerContext;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.components.AbstractWidget;
import net.minecraft.client.gui.screens.LevelLoadingScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.TitleScreen;
import net.minecraft.client.gui.screens.worldselection.WorldCreationUiState;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.server.IntegratedServer;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.stats.Stats;
import net.minecraft.world.Difficulty;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.LevelSettings;
import net.minecraft.world.level.WorldDataConfiguration;
import net.minecraft.world.level.DataPackConfig;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.entity.StructureBlockEntity;
import net.minecraft.world.level.block.state.properties.StructureMode;
import net.minecraft.world.level.levelgen.WorldOptions;
import net.minecraft.world.level.levelgen.presets.WorldPreset;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.ReadOnlyScoreInfo;
import net.minecraft.world.scores.ScoreHolder;

/**
 * B547 spike (throwaway) client GameTest: worlds made the way a player and Play make them, with the spike's data in this
 * mod's resources ({@code data/b547/}). Sections: the Create World screen's world types and a void world made through it
 * with the first-join route (Y2, Y4, Y7, Y13, Y16, ADR 0116 D3); {@code createFreshLevel} with a preset from mod data and
 * the dimension_origin island (Y1, Y2, Y5, Y15); a preset only in a folder pack placed before creation (Y15); a world
 * copied as a map with {@code datapacks/} and {@code resources.zip} (Y14). Results go to
 * {@code <gameDir>/msm-b547/client-<mc>.json}.
 */
public class B547ClientGameTest implements FabricClientGameTest {
    static final Map<String, Object> R = new TreeMap<>();
    static final Map<String, Long> JOIN_TICK = new LinkedHashMap<>();
    static boolean listening;

    static String mc() {
        return FabricLoader.getInstance().getModContainer("minecraft").orElseThrow().getMetadata().getVersion().getFriendlyString();
    }

    static void put(String key, Object value) {
        R.put(key, value);
        System.out.println("[b547] " + key + " = " + value);
        try {
            Path out = FabricLoader.getInstance().getGameDir().resolve("msm-b547");
            Files.createDirectories(out);
            Files.writeString(out.resolve("client-" + mc() + ".json"),
                    new GsonBuilder().setPrettyPrinting().serializeNulls().create().toJson(R), StandardCharsets.UTF_8);
        } catch (Throwable e) {
            System.out.println("[b547] write failed: " + e);
        }
    }

    interface Body {
        void run() throws Throwable;
    }

    static void section(String name, Body body) {
        try {
            body.run();
        } catch (Throwable t) {
            put(name + ".error", t.toString());
            t.printStackTrace(System.out);
        }
    }

    static Identifier id(String s) {
        return Identifier.parse(s);
    }

    // ---- server access from the test thread ------------------------------------------------------------------------

    static MinecraftServer server(ClientGameTestContext context) {
        return context.computeOnClient(Minecraft::getSingleplayerServer);
    }

    static <T> T onServer(ClientGameTestContext context, Function<MinecraftServer, T> body) {
        MinecraftServer server = server(context);
        CompletableFuture<T> future = new CompletableFuture<>();
        server.execute(() -> {
            try {
                future.complete(body.apply(server));
            } catch (Throwable t) {
                future.completeExceptionally(t);
            }
        });
        context.waitFor(mc -> future.isDone(), 2_400);
        return future.join();
    }

    static void cmd(ClientGameTestContext context, String command) {
        onServer(context, s -> {
            s.getCommands().performPrefixedCommand(s.createCommandSourceStack(), command);
            return null;
        });
    }

    static ServerPlayer player(MinecraftServer s) {
        return s.getPlayerList().getPlayers().getFirst();
    }

    static int score(MinecraftServer s, String holder, String objective) {
        Objective o = s.getScoreboard().getObjective(objective);
        if (o == null) {
            return Integer.MIN_VALUE;
        }
        ReadOnlyScoreInfo info = s.getScoreboard().getPlayerScoreInfo(ScoreHolder.forNameOnly(holder), o);
        return info == null ? Integer.MIN_VALUE : info.value();
    }

    static String block(ServerLevel level, int x, int y, int z) {
        return level.getBlockState(new BlockPos(x, y, z)).toString();
    }

    static Map<String, Integer> census(ServerLevel level, Vec3 centre, double radius) {
        Map<String, Integer> out = new TreeMap<>();
        for (Entity e : level.getAllEntities()) {
            if (e.position().distanceTo(centre) <= radius) {
                out.merge(BuiltInRegistries.ENTITY_TYPE.getKey(e.getType()).toString(), 1, Integer::sum);
            }
        }
        return out;
    }

    static Map<String, Object> playerInfo(MinecraftServer s) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (s.getPlayerList().getPlayers().isEmpty()) {
            out.put("player", "none");
            return out;
        }
        ServerPlayer p = player(s);
        out.put("dimension", p.level().dimension().identifier().toString());
        out.put("pos", String.format("%.2f %.2f %.2f", p.getX(), p.getY(), p.getZ()));
        out.put("health", p.getHealth());
        out.put("gameMode", p.gameMode.getGameModeForPlayer().toString());
        out.put("respawnData", String.valueOf(s.overworld().getRespawnData()));
        out.put("joins", score(s, p.getScoreboardName(), "b547.joins"));
        out.put("rewardY", score(s, p.getScoreboardName(), "b547.c"));
        out.put("serverTick", s.getTickCount());
        out.put("rewardSaw", score(s, "#x", "b547.spawn") + " " + score(s, "#y", "b547.spawn") + " " + score(s, "#z", "b547.spawn")
                + " at gametime " + score(s, "#t", "b547.spawn"));
        out.put("gametime", s.overworld().getGameTime());
        return out;
    }

    static int waitDim(ClientGameTestContext context, ResourceKey<Level> dim) {
        return context.waitFor(mc -> mc.player != null && mc.player.level().dimension() == dim && mc.getSingleplayerServer() != null
                && !mc.getSingleplayerServer().getPlayerList().getPlayers().isEmpty()
                && player(mc.getSingleplayerServer()).level().dimension() == dim, 1_200);
    }

    static void sprint(ClientGameTestContext context, int ticks) {
        cmd(context, "tick sprint " + ticks);
        context.waitFor(mc -> !mc.getSingleplayerServer().tickRateManager().isSprinting(), 60_000);
    }

    static void waitForWorld(ClientGameTestContext context) {
        context.waitFor(mc -> mc.level != null && mc.player != null && mc.getSingleplayerServer() != null
                && !(mc.gui.screen() instanceof LevelLoadingScreen), 6_000);
    }

    static void leave(ClientGameTestContext context) {
        context.runOnClient(mc -> {
            if (mc.level != null) {
                mc.level.disconnect(ClientLevel.DEFAULT_QUIT_MESSAGE);
                mc.disconnectWithSavingScreen();
            }
        });
        context.setScreen(TitleScreen::new);
        context.waitFor(mc -> mc.getSingleplayerServer() == null && mc.level == null, 2_400);
        context.waitTicks(200);
    }

    static void deleteTree(Path root) throws IOException {
        if (!Files.exists(root)) {
            return;
        }
        try (Stream<Path> paths = Files.walk(root)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.deleteIfExists(path);
            }
        }
    }

    static List<String> listTree(Path root, int depth) throws IOException {
        List<String> out = new ArrayList<>();
        if (!Files.exists(root)) {
            return out;
        }
        try (Stream<Path> paths = Files.walk(root, depth)) {
            paths.filter(p -> !p.toString().contains("region") && !p.equals(root)).forEach(p -> out.add(root.relativize(p).toString()));
        }
        out.sort(String::compareTo);
        return out;
    }

    static int dataFormat() {
        return mc().startsWith("26.3") ? 121 : 126;
    }

    static int resourceFormat() {
        return mc().startsWith("26.3") ? 97 : 102;
    }

    static int resourceMinor() {
        return mc().startsWith("26.3") ? 1 : 0;
    }

    static String mcmeta(int format, String description) {
        return mcmeta(format, 0, description);
    }

    static String mcmeta(int format, int minor, String description) {
        return "{\"pack\":{\"description\":\"" + description + "\",\"min_format\":[" + format + ",0],\"max_format\":[" + format
                + "," + minor + "],\"pack_format\":" + format + "}}";
    }

    static void write(Path file, String text) throws IOException {
        Files.createDirectories(file.getParent());
        Files.writeString(file, text, StandardCharsets.UTF_8);
    }

    static Map<String, Object> screenInfo(Minecraft mc) {
        Map<String, Object> out = new LinkedHashMap<>();
        Screen screen = mc.gui.screen();
        out.put("class", screen == null ? "none" : screen.getClass().getName());
        if (screen != null) {
            out.put("title", screen.getTitle().getString());
            List<String> buttons = new ArrayList<>();
            for (var child : screen.children()) {
                if (child instanceof AbstractWidget w) {
                    Component m = w.getMessage();
                    String key = m.getContents() instanceof TranslatableContents t ? t.getKey() : "";
                    buttons.add(m.getString() + " {" + key + "}");
                }
            }
            out.put("widgets", buttons);
        }
        return out;
    }

    // ---- the test ----------------------------------------------------------------------------------------------------

    @Override
    public void runTest(ClientGameTestContext context) {
        if (!listening) {
            listening = true;
            ServerPlayConnectionEvents.JOIN.register((handler, sender, server) ->
                    JOIN_TICK.put(handler.player.getScoreboardName() + "@" + server.getWorldPath(LevelResource.ROOT).getFileName(),
                            (long) server.getTickCount()));
        }
        put("mc", mc());
        String only = "ABCD";
        try {
            Path f = FabricLoader.getInstance().getGameDir().resolve("msm-b547/sections.txt");
            if (Files.exists(f)) {
                only = Files.readString(f).trim();
            }
        } catch (IOException e) {
            // all sections
        }
        put("sections", only);
        if (only.contains("A")) section("A", () -> createScreenWorld(context));
        if (only.contains("B")) section("B", () -> freshLevelWorld(context));
        if (only.contains("C")) section("C", () -> devPackWorld(context));
        if (only.contains("D")) section("D", () -> mapWorld(context));
        put("done", true);
        context.setScreen(TitleScreen::new);
        context.waitTicks(100);
    }

    // A: the Create World screen path with a void preset of no structure sets: the first-join route.
    void createScreenWorld(ClientGameTestContext context) throws Throwable {
        List<String> types = new ArrayList<>();
        TestSingleplayerContext sp = context.worldBuilder().setUseConsistentSettings(false).adjustSettings(state -> {
            for (WorldCreationUiState.WorldTypeEntry e : state.getNormalPresetList()) {
                types.add(e.preset().unwrapKey().map(k -> k.identifier().toString()).orElse("?") + " = " + e.describePreset().getString());
            }
            for (WorldCreationUiState.WorldTypeEntry e : state.getNormalPresetList()) {
                if (e.preset().unwrapKey().map(k -> k.identifier().toString().equals("b547:void_plain")).orElse(false)) {
                    state.setWorldType(e);
                }
            }
            state.setName("b547-screen");
            state.setSeed("547");
            state.setGameMode(WorldCreationUiState.SelectedGameMode.SURVIVAL);
            state.setDifficulty(Difficulty.NORMAL);
            state.setAllowCommands(true);
            state.setGenerateStructures(true);
            types.add("chosen = " + state.getWorldType().describePreset().getString());
        }).create();
        put("A.worldTypes", types);
        waitForWorld(context);
        Path worldDir = onServer(context, s -> s.getWorldPath(LevelResource.ROOT)).toAbsolutePath().normalize();
        put("A.joinTicks", new LinkedHashMap<>(JOIN_TICK));
        put("A.atJoin", onServer(context, B547ClientGameTest::playerInfo));
        context.waitTicks(20);
        put("A.after20", onServer(context, B547ClientGameTest::playerInfo));
        put("A.island", onServer(context, s -> "gold " + block(s.overworld(), 0, 66, 0) + " / grass " + block(s.overworld(), -2, 65, -2)
                + " / chest " + block(s.overworld(), -1, 65, -1)));
        put("A.firstOk", onServer(context, s -> score(s, "#first_ok", "b547.c")));
        put("A.inventory", onServer(context, s -> player(s).getInventory().getItem(0).toString()));
        context.waitTicks(100);
        put("A.after120", onServer(context, B547ClientGameTest::playerInfo));
        context.takeScreenshot("b547_A_first_join_" + mc());

        // Y13: the function bridge (a data pack function running a project command as the player), then after /reload.
        put("A.bridgeFunctionLoaded", onServer(context, s -> s.getFunctions().get(id("b547:bridge")).isPresent()));
        cmd(context, "execute as @a run function b547:bridge");
        context.waitTicks(5);
        put("A.bridgeHeard", onServer(context, s -> score(s, "#heard", "b547.c") + " self " + score(s, player(s).getScoreboardName(), "b547.heard")));
        cmd(context, "function b547:bridge_server");
        context.waitTicks(5);
        put("A.bridgeHeardFromServerSource", onServer(context, s -> score(s, "#heard", "b547.c")));
        cmd(context, "reload");
        context.waitTicks(60);
        put("A.bridgeAfterReloadLoaded", onServer(context, s -> s.getFunctions().get(id("b547:bridge")).isPresent()));
        cmd(context, "execute as @a run function b547:bridge");
        context.waitTicks(5);
        put("A.bridgeHeardAfterReload", onServer(context, s -> score(s, "#heard", "b547.c")));

        // ADR 0116 D3: where a structure block's save goes.
        put("A.structureSave", onServer(context, s -> {
            ServerLevel level = s.overworld();
            BlockPos at = new BlockPos(20, 70, 20);
            level.setBlockAndUpdate(at, Blocks.STRUCTURE_BLOCK.defaultBlockState());
            for (int x = 1; x <= 3; x++) {
                level.setBlockAndUpdate(at.offset(x, 0, 0), Blocks.GOLD_BLOCK.defaultBlockState());
            }
            StructureBlockEntity be = (StructureBlockEntity) level.getBlockEntity(at);
            be.setMode(StructureMode.SAVE);
            be.setStructureName("b547:saved_build");
            be.setStructurePos(new BlockPos(1, 0, 0));
            be.setStructureSize(new net.minecraft.core.Vec3i(3, 1, 1));
            return be.saveStructure();
        }));
        List<String> generated = new ArrayList<>();
        try (Stream<Path> paths = Files.walk(worldDir)) {
            paths.filter(p -> p.toString().endsWith(".nbt") && p.toString().contains("saved_build")).forEach(p -> generated.add(worldDir.relativize(p).toString()));
        }
        put("A.structureSaveFiles", generated);

        // Y16: can_break by /give and item replace, in adventure mode.
        cmd(context, "give @a minecraft:diamond_pickaxe[minecraft:can_break={blocks:\"minecraft:stone\"}]");
        cmd(context, "item replace entity @a weapon.mainhand with minecraft:diamond_pickaxe[can_break=[{blocks:\"minecraft:stone\"},{blocks:\"#minecraft:logs\"}]]");
        cmd(context, "loot give @a loot b547:can_break_pick");
        cmd(context, "gamemode adventure @a");
        put("A.adventure", onServer(context, s -> {
            ServerPlayer p = player(s);
            ServerLevel level = s.overworld();
            Map<String, Object> out = new LinkedHashMap<>();
            List<String> inv = new ArrayList<>();
            for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
                ItemStack stack = p.getInventory().getItem(i);
                if (!stack.isEmpty()) {
                    inv.add(i + ": " + stack + " " + stack.getComponentsPatch());
                }
            }
            out.put("inventory", inv);
            BlockPos stone = new BlockPos(2, 66, 2);
            BlockPos dirt = new BlockPos(3, 66, 2);
            BlockPos log = new BlockPos(4, 66, 2);
            level.setBlockAndUpdate(stone, Blocks.STONE.defaultBlockState());
            level.setBlockAndUpdate(dirt, Blocks.DIRT.defaultBlockState());
            level.setBlockAndUpdate(log, Blocks.OAK_LOG.defaultBlockState());
            out.put("breakStone", p.gameMode.destroyBlock(stone) + " now " + level.getBlockState(stone));
            out.put("breakDirt", p.gameMode.destroyBlock(dirt) + " now " + level.getBlockState(dirt));
            out.put("breakLog", p.gameMode.destroyBlock(log) + " now " + level.getBlockState(log));
            p.setItemInHand(InteractionHand.MAIN_HAND, ItemStack.EMPTY);
            level.setBlockAndUpdate(dirt, Blocks.DIRT.defaultBlockState());
            out.put("breakDirtEmptyHand", p.gameMode.destroyBlock(dirt) + " now " + level.getBlockState(dirt));
            return out;
        }));
        cmd(context, "gamemode survival @a");

        // Y7: mob spawns on a platform in the sky biome (plains-like lists) and in minecraft:the_void, by night and day.
        put("A.spawns", spawns(context));

        // Y2 and Y4: death and respawn, then leave and rejoin; the first-join reward must not run again.
        cmd(context, "tp @a -1.5 66 -1.5");
        cmd(context, "kill @a");
        context.waitTicks(20);
        context.runOnClient(mc -> mc.player.respawn());
        context.waitTicks(40);
        put("A.afterRespawn", onServer(context, B547ClientGameTest::playerInfo));
        put("A.firstPlacings", onServer(context, s -> score(s, "#first_places", "b547.c")));
        sp.close();
        TestSingleplayerContext again = sp.getWorldSave().open();
        waitForWorld(context);
        context.waitTicks(40);
        put("A.afterRejoin", onServer(context, B547ClientGameTest::playerInfo));
        put("A.firstPlacingsAfterRejoin", onServer(context, s -> score(s, "#first_places", "b547.c")));
        put("A.worldFolder", listTree(worldDir, 2));
        again.close();
        deleteTree(worldDir);
    }

    Map<String, Object> spawns(ClientGameTestContext context) {
        Map<String, Object> out = new LinkedHashMap<>();
        cmd(context, "difficulty normal");
        cmd(context, "gamerule spawn_monsters true");
        for (String dim : new String[] {"minecraft:overworld", "b547:tv_off"}) {
            String in = "execute in " + dim + " run ";
            cmd(context, in + "forceload add -64 -64 63 63");
            cmd(context, in + "fill 24 100 24 56 100 56 minecraft:grass_block");
            cmd(context, in + "fill -2 100 -2 2 100 2 minecraft:glass");
            cmd(context, in + "tp @a 0.5 101 0.5");
            cmd(context, "effect give @a minecraft:resistance 600 255 true");
            cmd(context, "gamemode creative @a");
            cmd(context, "time set noon");
            context.waitTicks(20);
            sprint(context, 1200);
            out.put(dim + ".day1200", onServer(context, s -> census(s.getLevel(ResourceKey.create(Registries.DIMENSION, id(dim))), new Vec3(40, 101, 40), 40)));
            cmd(context, "time set midnight");
            sprint(context, 1200);
            out.put(dim + ".night1200", onServer(context, s -> census(s.getLevel(ResourceKey.create(Registries.DIMENSION, id(dim))), new Vec3(40, 101, 40), 40)));
            onServer(context, s -> {
                ServerPlayer p = player(s);
                p.getStats().setValue(p, Stats.CUSTOM.get(Stats.TIME_SINCE_REST), 200_000);
                return null;
            });
            cmd(context, "gamemode survival @a");
            sprint(context, 1200);
            out.put(dim + ".night2400_insomnia", onServer(context, s -> census(s.getLevel(ResourceKey.create(Registries.DIMENSION, id(dim))), player(s).position(), 64)));
            cmd(context, "execute in " + dim + " run kill @e[type=!minecraft:player]");
            cmd(context, in + "forceload remove -64 -64 63 63");
        }
        cmd(context, "execute in minecraft:overworld run tp @a -1.5 66 -1.5");
        cmd(context, "time set noon");
        return out;
    }

    // B: createFreshLevel (Play's path) with b547:void from this mod's data: the dimension_origin island, spawn, the End.
    void freshLevelWorld(ClientGameTestContext context) throws Throwable {
        Path saves = context.computeOnClient(mc -> mc.getLevelSource().getBaseDir());
        deleteTree(saves.resolve("b547-fresh"));
        context.runOnClient(mc -> mc.createWorldOpenFlows().createFreshLevel("b547-fresh",
                new LevelSettings("B547 fresh", GameType.SURVIVAL, new LevelSettings.DifficultySettings(Difficulty.NORMAL, false, false), true,
                        WorldDataConfiguration.DEFAULT),
                new WorldOptions(547L, true, false),
                registries -> registries.lookupOrThrow(Registries.WORLD_PRESET)
                        .getOrThrow(ResourceKey.create(Registries.WORLD_PRESET, id("b547:void"))).value().createWorldDimensions(),
                new TitleScreen()));
        waitForWorld(context);
        put("B.atJoin", onServer(context, B547ClientGameTest::playerInfo));
        put("B.generator", onServer(context, s -> s.overworld().getChunkSource().getGenerator().getClass().getSimpleName()));
        put("B.packs", onServer(context, s -> List.copyOf(s.getPackRepository().getSelectedIds())));
        put("B.island", onServer(context, s -> {
            Map<String, String> out = new LinkedHashMap<>();
            ServerLevel l = s.overworld();
            for (int x = -5; x <= 5; x++) {
                for (int z = -5; z <= 5; z++) {
                    for (int y = 62; y <= 67; y++) {
                        String b = block(l, x, y, z);
                        if (b.contains("gold") || b.contains("chest")) {
                            out.put(x + " " + y + " " + z, b);
                        }
                    }
                }
            }
            return out;
        }));
        context.waitTicks(100);
        put("B.after100", onServer(context, B547ClientGameTest::playerInfo));
        context.takeScreenshot("b547_B_fresh_" + mc());

        // Y5: the void End and Nether.
        put("B.end", endTrip(context));
        put("B.portals", portals(context));
        leave(context);
        put("B.folder", listTree(saves.resolve("b547-fresh"), 2));
    }

    Map<String, Object> endTrip(ClientGameTestContext context) {
        Map<String, Object> out = new LinkedHashMap<>();
        cmd(context, "gamemode creative @a");
        cmd(context, "execute in minecraft:the_end run forceload add -112 -112 111 111");
        cmd(context, "execute in minecraft:the_end run fill -3 100 -3 3 100 3 minecraft:obsidian");
        cmd(context, "execute in minecraft:the_end run tp @a 0.5 101 0.5");
        out.put("ticksToArrive", waitDim(context, Level.END));
        context.waitTicks(200);
        out.put("arrived", onServer(context, B547ClientGameTest::playerInfo));
        out.put("dragonFight", onServer(context, s -> String.valueOf(s.getLevel(Level.END).getDragonFight())));
        out.put("dragons", onServer(context, s -> s.getLevel(Level.END).getDragons().size()));
        out.put("blocksNearOrigin", onServer(context, s -> scan(s.getLevel(Level.END), -8, 8, -64, 255, -8, 8, true)));
        context.takeScreenshot("b547_B_end_" + mc());
        cmd(context, "execute in minecraft:the_end run fill 27 100 27 33 100 33 minecraft:obsidian");
        cmd(context, "execute in minecraft:the_end run tp @a 30.5 101 30.5");
        context.waitTicks(20);
        cmd(context, "execute in minecraft:the_end run kill @e[type=minecraft:ender_dragon]");
        context.waitTicks(400);
        out.put("dragonsAfterKill", onServer(context, s -> s.getLevel(Level.END).getDragons().size()));
        out.put("afterKillNearOrigin", onServer(context, s -> scan(s.getLevel(Level.END), -8, 8, -64, 255, -8, 8, true)));
        out.put("gateways", onServer(context, s -> scanFor(s.getLevel(Level.END), -110, 110, 0, 200, -110, 110, "end_gateway")));
        out.put("dragonFightAfter", onServer(context, s -> String.valueOf(s.getLevel(Level.END).getDragonFight())));
        cmd(context, "execute in minecraft:overworld run tp @a 0.5 66 0.5");
        out.put("ticksToReturn", waitDim(context, Level.OVERWORLD));
        context.waitTicks(20);
        out.put("back", onServer(context, B547ClientGameTest::playerInfo));
        cmd(context, "execute in minecraft:the_end run forceload remove -112 -112 111 111");
        return out;
    }

    static Map<String, Integer> scan(ServerLevel level, int x0, int x1, int y0, int y1, int z0, int z1, boolean nonAir) {
        Map<String, Integer> out = new TreeMap<>();
        for (int x = x0; x <= x1; x++) {
            for (int y = y0; y <= y1; y++) {
                for (int z = z0; z <= z1; z++) {
                    var state = level.getBlockState(new BlockPos(x, y, z));
                    if (!state.isAir()) {
                        out.merge(BuiltInRegistries.BLOCK.getKey(state.getBlock()) + (out.size() < 40 ? "" : ""), 1, Integer::sum);
                    }
                }
            }
        }
        return out;
    }

    static List<String> scanFor(ServerLevel level, int x0, int x1, int y0, int y1, int z0, int z1, String name) {
        List<String> out = new ArrayList<>();
        for (int x = x0; x <= x1; x++) {
            for (int y = y0; y <= y1; y++) {
                for (int z = z0; z <= z1; z++) {
                    var state = level.getBlockState(new BlockPos(x, y, z));
                    if (BuiltInRegistries.BLOCK.getKey(state.getBlock()).getPath().equals(name) && out.size() < 40) {
                        out.add(x + " " + y + " " + z);
                    }
                }
            }
        }
        return out;
    }

    Map<String, Object> portals(ClientGameTestContext context) {
        Map<String, Object> out = new LinkedHashMap<>();
        // An End portal frame ring at 30 70 30 (inside 31..33): 11 eyes placed by setblock, the 12th by using an eye.
        cmd(context, "forceload add 16 16 63 63");
        cmd(context, "fill 28 69 28 36 69 36 minecraft:stone");
        String[] frames = {
            "31 70 30 south", "32 70 30 south", "33 70 30 south",
            "31 70 34 north", "32 70 34 north", "33 70 34 north",
            "30 70 31 east", "30 70 32 east", "30 70 33 east",
            "34 70 31 west", "34 70 32 west", "34 70 33 west"};
        for (int i = 0; i < frames.length; i++) {
            String[] f = frames[i].split(" ");
            cmd(context, "setblock " + f[0] + " " + f[1] + " " + f[2] + " minecraft:end_portal_frame[facing=" + f[3] + ",eye=" + (i < 11) + "]");
        }
        out.put("frameAfterSetblock11", onServer(context, s -> block(s.overworld(), 32, 70, 32)));
        out.put("useEye", onServer(context, s -> {
            ServerPlayer p = player(s);
            p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.ENDER_EYE));
            BlockPos last = new BlockPos(34, 70, 33);
            return p.gameMode.useItemOn(p, s.overworld(), p.getMainHandItem(), InteractionHand.MAIN_HAND,
                    new BlockHitResult(Vec3.atCenterOf(last), Direction.UP, last, false)).toString();
        }));
        out.put("frameAfterEye", onServer(context, s -> block(s.overworld(), 32, 70, 32) + " / " + block(s.overworld(), 34, 70, 33)));
        // All twelve eyes by setblock in a second ring at 40 70 30.
        for (String frame : frames) {
            String[] f = frame.split(" ");
            int x = Integer.parseInt(f[0]) + 10;
            cmd(context, "setblock " + x + " 70 " + f[2] + " minecraft:end_portal_frame[facing=" + f[3] + ",eye=true]");
        }
        out.put("allTwelveBySetblock", onServer(context, s -> block(s.overworld(), 42, 70, 32)));
        // A Nether portal: obsidian frame at 50 70 30, lit by flint and steel; then stand in it.
        cmd(context, "fill 50 70 30 53 74 30 minecraft:obsidian");
        cmd(context, "fill 51 71 30 52 73 30 minecraft:air");
        out.put("light", onServer(context, s -> {
            ServerPlayer p = player(s);
            p.setItemInHand(InteractionHand.MAIN_HAND, new ItemStack(Items.FLINT_AND_STEEL));
            BlockPos base = new BlockPos(51, 70, 30);
            return p.gameMode.useItemOn(p, s.overworld(), p.getMainHandItem(), InteractionHand.MAIN_HAND,
                    new BlockHitResult(Vec3.atCenterOf(base), Direction.UP, base, false)).toString();
        }));
        out.put("netherPortalBlock", onServer(context, s -> block(s.overworld(), 51, 71, 30)));
        cmd(context, "gamemode survival @a");
        cmd(context, "tp @a 51.5 71 30.5");
        try {
            context.waitFor(mc -> mc.getSingleplayerServer() != null && !mc.getSingleplayerServer().getPlayerList().getPlayers().isEmpty()
                    && player(mc.getSingleplayerServer()).level().dimension() == Level.NETHER, 600);
        } catch (Throwable t) {
            out.put("netherTimeout", t.toString());
        }
        context.waitTicks(40);
        out.put("inNether", onServer(context, B547ClientGameTest::playerInfo));
        out.put("netherAround", onServer(context, s -> {
            ServerPlayer p = player(s);
            BlockPos at = p.blockPosition();
            return scan((ServerLevel) p.level(), at.getX() - 4, at.getX() + 4, at.getY() - 3, at.getY() + 4, at.getZ() - 4, at.getZ() + 4, true);
        }));
        context.takeScreenshot("b547_B_nether_" + mc());
        cmd(context, "execute in minecraft:overworld run tp @a 0.5 66 0.5");
        context.waitTicks(20);
        return out;
    }

    // C: a world preset only in a folder pack in the world's datapacks/ before createFreshLevel (Play for data-only projects).
    void devPackWorld(ClientGameTestContext context) throws Throwable {
        Path saves = context.computeOnClient(mc -> mc.getLevelSource().getBaseDir());
        for (String variant : new String[] {"default", "listed"}) {
            String folder = "b547-dev-" + variant;
            deleteTree(saves.resolve(folder));
            Path pack = saves.resolve(folder).resolve("datapacks").resolve("b547dev");
            write(pack.resolve("pack.mcmeta"), mcmeta(dataFormat(), "B547 dev pack"));
            write(pack.resolve("data/b547dev/worldgen/biome/sky.json"), Files.readString(
                    FabricLoader.getInstance().getModContainer("msm_runtime_gametest").orElseThrow().findPath("data/b547/worldgen/biome/sky.json").orElseThrow()));
            write(pack.resolve("data/b547dev/worldgen/world_preset/void.json"), "{\"dimensions\":{\"minecraft:overworld\":{\"type\":\"minecraft:overworld\","
                    + "\"generator\":{\"type\":\"minecraft:flat\",\"settings\":{\"biome\":\"b547dev:sky\",\"layers\":[{\"block\":\"minecraft:glass\",\"height\":1}],"
                    + "\"features\":false,\"lakes\":false,\"structure_overrides\":[]}}},"
                    + "\"minecraft:the_nether\":{\"type\":\"minecraft:the_nether\",\"generator\":{\"type\":\"minecraft:noise\",\"settings\":\"minecraft:nether\","
                    + "\"biome_source\":{\"type\":\"minecraft:multi_noise\",\"preset\":\"minecraft:nether\"}}},"
                    + "\"minecraft:the_end\":{\"type\":\"minecraft:the_end\",\"generator\":{\"type\":\"minecraft:noise\",\"settings\":\"minecraft:end\","
                    + "\"biome_source\":{\"type\":\"minecraft:the_end\"}}}}}");
            write(pack.resolve("data/b547dev/function/hello.mcfunction"), "scoreboard objectives add b547.dev dummy\nscoreboard players add #hello b547.dev 1\n");
            write(pack.resolve("data/minecraft/tags/function/load.json"), "{\"values\":[\"b547dev:hello\"]}");
            WorldDataConfiguration config = variant.equals("default") ? WorldDataConfiguration.DEFAULT
                    : new WorldDataConfiguration(new DataPackConfig(List.of("vanilla", "file/b547dev"), List.of()), WorldDataConfiguration.DEFAULT.enabledFeatures());
            List<String> lookup = new ArrayList<>();
            context.runOnClient(mc -> mc.createWorldOpenFlows().createFreshLevel(folder,
                    new LevelSettings("B547 dev " + variant, GameType.SURVIVAL, new LevelSettings.DifficultySettings(Difficulty.NORMAL, false, false), true, config),
                    new WorldOptions(547L, true, false),
                    registries -> {
                        var presets = registries.lookupOrThrow(Registries.WORLD_PRESET);
                        var key = ResourceKey.create(Registries.WORLD_PRESET, id("b547dev:void"));
                        var found = presets.get(key);
                        lookup.add("found " + found.isPresent());
                        ResourceKey<WorldPreset> use = found.isPresent() ? key : ResourceKey.create(Registries.WORLD_PRESET, id("minecraft:flat"));
                        return presets.getOrThrow(use).value().createWorldDimensions();
                    },
                    new TitleScreen()));
            try {
                waitForWorld(context);
                context.waitTicks(20);
                put("C." + variant + ".lookup", lookup);
                put("C." + variant + ".packs", onServer(context, s -> List.copyOf(s.getPackRepository().getSelectedIds())));
                put("C." + variant + ".hello", onServer(context, s -> score(s, "#hello", "b547.dev")));
                put("C." + variant + ".biomeAtSpawn", onServer(context, s -> s.overworld().getBiome(player(s).blockPosition()).unwrapKey().map(k -> k.identifier().toString()).orElse("?")));
                put("C." + variant + ".player", onServer(context, B547ClientGameTest::playerInfo));
                leave(context);
            } catch (Throwable t) {
                put("C." + variant + ".lookup", lookup);
                put("C." + variant + ".screen", context.computeOnClient(B547ClientGameTest::screenInfo));
                context.takeScreenshot("b547_C_" + variant + "_" + mc());
                throw t;
            } finally {
                context.setScreen(TitleScreen::new);
            }
            deleteTree(saves.resolve(folder));
        }
    }

    // D: a map: the B world copied with its pack in datapacks/ and a resources.zip, player data left out, then opened.
    void mapWorld(ClientGameTestContext context) throws Throwable {
        Path saves = context.computeOnClient(mc -> mc.getLevelSource().getBaseDir());
        Path from = saves.resolve("b547-fresh");
        Path to = saves.resolve("b547-map");
        deleteTree(to);
        try (Stream<Path> paths = Files.walk(from)) {
            for (Path p : paths.toList()) {
                Path rel = from.relativize(p);
                String r = rel.toString();
                if (r.startsWith("players") || r.equals("session.lock") || r.equals("level.dat_old")) {
                    continue;
                }
                Path dst = to.resolve(rel);
                if (Files.isDirectory(p)) {
                    Files.createDirectories(dst);
                } else {
                    Files.copy(p, dst);
                }
            }
        }
        Path pack = to.resolve("datapacks").resolve("b547map");
        write(pack.resolve("pack.mcmeta"), mcmeta(dataFormat(), "B547 map pack"));
        write(pack.resolve("data/b547map/function/hello.mcfunction"), "scoreboard objectives add b547.map dummy\nscoreboard players add #hello b547.map 1\n");
        write(pack.resolve("data/minecraft/tags/function/load.json"), "{\"values\":[\"b547map:hello\"]}");
        try (OutputStream os = Files.newOutputStream(to.resolve("resources.zip")); ZipOutputStream zip = new ZipOutputStream(os)) {
            zip.putNextEntry(new ZipEntry("pack.mcmeta"));
            zip.write(mcmeta(resourceFormat(), resourceMinor(), "B547 map resources").getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
            zip.putNextEntry(new ZipEntry("assets/minecraft/lang/en_us.json"));
            zip.write("{\"block.minecraft.stone\":\"B547 Map Stone\"}".getBytes(StandardCharsets.UTF_8));
            zip.closeEntry();
        }
        put("D.copied", listTree(to, 1));
        context.runOnClient(mc -> mc.createWorldOpenFlows().openWorld("b547-map", () -> {}));
        List<String> clicks = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            context.waitTicks(60);
            boolean inWorld = context.computeOnClient(mc -> mc.level != null && mc.player != null);
            if (inWorld) {
                break;
            }
            put("D.screen" + i, context.computeOnClient(B547ClientGameTest::screenInfo));
            context.takeScreenshot("b547_D_screen" + i + "_" + mc());
            for (String key : new String[] {"selectWorld.backupJoinSkipButton", "gui.yes", "gui.proceed", "gui.ok", "gui.done"}) {
                if (context.tryClickScreenButton(key)) {
                    clicks.add(i + ": " + key);
                    break;
                }
            }
        }
        put("D.clicks", clicks);
        waitForWorld(context);
        context.waitTicks(40);
        put("D.packs", onServer(context, s -> List.copyOf(s.getPackRepository().getSelectedIds())));
        put("D.hello", onServer(context, s -> score(s, "#hello", "b547.map")));
        put("D.resourcePacks", context.computeOnClient(mc -> List.copyOf(mc.getResourcePackRepository().getSelectedIds())));
        context.waitTicks(100);
        put("D.stoneName", context.computeOnClient(mc -> Blocks.STONE.getName().getString()));
        put("D.screenInWorld", context.computeOnClient(B547ClientGameTest::screenInfo));
        put("D.player", onServer(context, B547ClientGameTest::playerInfo));
        put("D.firstJoinAgain", onServer(context, s -> score(s, "#first_places", "b547.c")));
        context.takeScreenshot("b547_D_map_" + mc());
        leave(context);
        put("D.folderAfter", listTree(to, 1));
        deleteTree(to);
        deleteTree(from);
    }
}
