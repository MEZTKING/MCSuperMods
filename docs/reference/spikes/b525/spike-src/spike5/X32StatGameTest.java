package dev.mcsupermods.runtime.gametest.spike5;

import static dev.mcsupermods.runtime.gametest.spike5.B525Help.R;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.stats.Stats;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.criteria.ObjectiveCriteria;

/**
 * B525 spike (throwaway), X32: custom statistics registered at start in {@code custom_stat}; a player's stat raised by
 * {@code awardStat}, the scoreboard criterion {@code minecraft.custom:<ns>.<path>} made by a player's command and
 * counting, and the player's saved stats file.
 */
public class X32StatGameTest {
    @GameTest(maxTicks = 40)
    public void x32Stats(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        MinecraftServer server = helper.getLevel().getServer();
        try (B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(2, 1, 2), GameType.SURVIVAL, "Counter")) {
            CommandSourceStack source = ears.player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
            R.section("X32", () -> {
                m.put("registry", BuiltInRegistries.CUSTOM_STAT.keySet().stream().filter(k -> k.getNamespace().equals(B525Mod.NS)).map(Object::toString)
                        .sorted().toList());
                m.put("criterion.byName", ObjectiveCriteria.byName("minecraft.custom:msm_b525.spike_stat").map(c -> c.getName()).orElse("none"));
                try {
                    m.put("criterion.colonForm", ObjectiveCriteria.byName("minecraft.custom:msm_b525:spike_stat").map(c -> c.getName()).orElse("none"));
                } catch (RuntimeException e) {
                    m.put("criterion.colonForm", e.toString());
                }
                m.put("criterion.inCustomNames", ObjectiveCriteria.getCustomCriteriaNames().stream().filter(n -> n.contains("msm_b525")).sorted().toList());
                List<String> steps = new ArrayList<>();
                for (String cmd : List.of("scoreboard objectives add b525s minecraft.custom:msm_b525.spike_stat",
                        "scoreboard objectives add b525d minecraft.custom:msm_b525.spike_distance")) {
                    server.getCommands().performPrefixedCommand(source, cmd);
                    steps.add(cmd + " -> " + X30ArgumentGameTest.chat(ears.packets()));
                }
                try {
                    m.put("freshIdentifierInstance", Stats.CUSTOM.get(B525Mod.id("spike_stat")).getName());
                } catch (RuntimeException e) {
                    m.put("freshIdentifierInstance", e.toString());
                }
                var stat = Stats.CUSTOM.get(B525Mod.stat("spike_stat"));
                ears.player.awardStat(B525Mod.stat("spike_stat"), 3);
                ears.player.awardStat(B525Mod.stat("spike_stat"));
                ears.player.awardStat(B525Mod.stat("spike_distance"), 250);
                m.put("statValue", ears.player.getStats().getValue(stat));
                m.put("statFormatted", stat.format(ears.player.getStats().getValue(stat)));
                var distance = Stats.CUSTOM.get(B525Mod.stat("spike_distance"));
                m.put("distanceFormatted", distance.format(ears.player.getStats().getValue(distance)));
                var time = Stats.CUSTOM.get(B525Mod.stat("spike_time"));
                m.put("timeFormatted", time.format(1234));
                Objective s = server.getScoreboard().getObjective("b525s");
                Objective d = server.getScoreboard().getObjective("b525d");
                m.put("score.b525s", s == null ? "no objective" : server.getScoreboard().getPlayerScoreInfo(ears.player, s).value());
                m.put("score.b525d", d == null ? "no objective" : server.getScoreboard().getPlayerScoreInfo(ears.player, d).value());
                server.getCommands().performPrefixedCommand(source, "scoreboard players get @s b525s");
                steps.add("scoreboard players get @s b525s -> " + X30ArgumentGameTest.chat(ears.packets()));
                m.put("commands", steps);
                ears.player.getStats().save();
                Path file = server.getWorldPath(LevelResource.PLAYER_STATS_DIR).resolve(ears.player.getStringUUID() + ".json");
                String json = Files.exists(file) ? Files.readString(file) : "no file " + file;
                int i = json.indexOf("msm_b525");
                m.put("statsFile", i < 0 ? json.substring(0, Math.min(200, json.length())) : json.substring(Math.max(0, i - 40), Math.min(json.length(), i + 120)));
            });
        }
        R.put("X32", m);
        helper.succeed();
    }
}
