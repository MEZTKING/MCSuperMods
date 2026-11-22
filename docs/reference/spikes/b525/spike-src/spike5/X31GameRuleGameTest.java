package dev.mcsupermods.runtime.gametest.spike5;

import static dev.mcsupermods.runtime.gametest.spike5.B525Help.R;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtAccounter;
import net.minecraft.nbt.NbtIo;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.storage.LevelResource;

/**
 * B525 spike (throwaway), X31: own game rules, one boolean and one whole number by Fabric's {@code GameRuleBuilder} and
 * one boolean put straight into the vanilla {@code game_rule} registry. Set and read with {@code /gamerule} by a player,
 * out of range, the Fabric change callback, the {@code /gamerule} tree, the rule in {@code visitGameRuleTypes}, and the
 * world files that hold the value after a save.
 */
public class X31GameRuleGameTest {
    @GameTest(maxTicks = 40)
    public void x31GameRules(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        MinecraftServer server = helper.getLevel().getServer();
        GameRules rules = server.getGameRules();
        try (B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(2, 1, 2), GameType.CREATIVE, "Ruler")) {
            CommandSourceStack source = ears.player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
            R.section("X31.registry", () -> {
                m.put("registry.ids", BuiltInRegistries.GAME_RULE.keySet().stream().filter(k -> k.getNamespace().equals(B525Mod.NS)).map(Object::toString)
                        .sorted().toList());
                m.put("registry.vanillaCount", BuiltInRegistries.GAME_RULE.keySet().stream().filter(k -> k.getNamespace().equals("minecraft")).count());
                m.put("available", rules.availableRules().filter(r -> r.getIdentifier().getNamespace().equals(B525Mod.NS)).map(r -> r.id() + " "
                        + r.gameRuleType() + " " + r.category() + " default " + r.defaultValue() + " key " + r.getDescriptionId()).toList());
                var node = server.getCommands().getDispatcher().getRoot().getChild("gamerule");
                m.put("gameruleTree", node == null ? "missing" : node.getChildren().stream().map(n -> n.getName())
                        .filter(n -> n.contains(B525Mod.NS) || n.contains("spike")).sorted().toList());
                m.put("gameruleTreeSample", node == null ? "missing" : node.getChildren().stream().map(n -> n.getName()).sorted().limit(5).toList());
            });
            R.section("X31.commands", () -> {
                List<String> steps = new ArrayList<>();
                for (String cmd : List.of("gamerule msm_b525:spike_count", "gamerule msm_b525:spike_count 7", "gamerule msm_b525:spike_count",
                        "gamerule msm_b525:spike_count 11", "gamerule msm_b525:spike_flag false", "gamerule msm_b525:spike_vanilla true",
                        "gamerule spike_count 5", "gamerule minecraft:keep_inventory")) {
                    server.getCommands().performPrefixedCommand(source, cmd);
                    steps.add(cmd + " -> " + X30ArgumentGameTest.chat(ears.packets()));
                }
                steps.add("values: count " + rules.get(B525Mod.COUNT) + ", flag " + rules.get(B525Mod.FLAG) + ", vanilla " + rules.get(B525Mod.VANILLA_FLAG));
                m.put("commands", steps);
                m.put("events", B525Mod.EVENTS.stream().filter(e -> e.contains("game rule")).toList());
            });
            R.section("X31.saved", () -> {
                server.saveEverything(true, true, true);
                Path root = server.getWorldPath(LevelResource.ROOT);
                List<String> found = new ArrayList<>();
                try (Stream<Path> files = Files.walk(root)) {
                    for (Path f : files.filter(Files::isRegularFile).filter(p -> p.toString().endsWith(".dat")).toList()) {
                        try {
                            CompoundTag tag = NbtIo.readCompressed(f, NbtAccounter.unlimitedHeap());
                            String text = tag.toString();
                            int i = text.indexOf("spike_count");
                            if (i >= 0) {
                                found.add(root.relativize(f) + ": ..." + text.substring(Math.max(0, i - 60), Math.min(text.length(), i + 140)) + "...");
                            }
                        } catch (Exception e) {
                            // not a compressed NBT file
                        }
                    }
                }
                m.put("savedIn", found);
            });
            // Back to the defaults for the other tests.
            rules.set(B525Mod.COUNT, 3, server);
            rules.set(B525Mod.FLAG, true, server);
            rules.set(B525Mod.VANILLA_FLAG, false, server);
        }
        R.put("X31", m);
        helper.succeed();
    }
}
