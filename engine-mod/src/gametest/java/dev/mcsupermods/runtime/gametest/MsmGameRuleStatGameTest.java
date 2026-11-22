package dev.mcsupermods.runtime.gametest;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmGameRules;
import dev.mcsupermods.runtime.registry.MsmStats;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtAccounter;
import net.minecraft.nbt.NbtIo;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.stats.Stat;
import net.minecraft.stats.Stats;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.gamerules.GameRule;
import net.minecraft.world.level.gamerules.GameRuleCategory;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.criteria.ObjectiveCriteria;

/**
 * GameTests for project game rules and statistics (ADR 0111 D5, D6 and their amendment after B525; plan B533). Definitions
 * in {@code msm/msm_test/game_rule/}: {@code b533_count} (integer 0..10, default 3, player), {@code b533_flag} (boolean,
 * default true, mobs), {@code b533_script_flag} and {@code b533_script_level} (changed only by
 * {@code MsmScriptApi17GameTest}), {@code b533_broken} (a boolean with {@code max}: refused) and
 * {@code msm/minecraft/game_rule/keep_inventory} (vanilla's id: refused); in {@code msm/msm_test/stat/}: {@code b533_count}
 * (default), {@code b533_far} (distance), {@code b533_long} (time), {@code b533_script} (the script test's) and
 * {@code msm/minecraft/stat/jump} (vanilla's id: refused). Only this class changes {@code b533_count} and {@code b533_flag},
 * and each test puts the default back.
 */
public class MsmGameRuleStatGameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static void eq(GameTestHelper helper, Object actual, Object expected, String message) {
        helper.assertTrue(Objects.equals(actual, expected), message + ": expected <" + expected + ">, got <" + actual + ">");
    }

    @SuppressWarnings("unchecked")
    private static <T> GameRule<T> rule(GameTestHelper helper, String path) {
        GameRule<?> rule = BuiltInRegistries.GAME_RULE.getValue(id(path));
        helper.assertTrue(rule != null, "game rule msm_test:" + path + " not registered");
        return (GameRule<T>) rule;
    }

    /** The report, the registry, the categories, the defaults and the refused definitions. */
    @GameTest
    public void gameRulesRegisterAtStart(GameTestHelper helper) {
        eq(helper, MsmRuntime.report().gameRules(), List.of(id("b533_count"), id("b533_flag"), id("b533_script_flag"), id("b533_script_level")),
                "registered game rules (logged as 'registered 4 game rule(s)')");
        eq(helper, MsmGameRules.rules().keySet().stream().toList(), MsmRuntime.report().gameRules(), "the rules");
        GameRule<Integer> count = rule(helper, "b533_count");
        GameRule<Boolean> flag = rule(helper, "b533_flag");
        eq(helper, count.category(), GameRuleCategory.PLAYER, "b533_count category");
        eq(helper, flag.category(), GameRuleCategory.MOBS, "b533_flag category");
        eq(helper, rule(helper, "b533_script_flag").category(), GameRuleCategory.MISC, "the default category");
        eq(helper, count.defaultValue(), 3, "b533_count default");
        eq(helper, flag.defaultValue(), true, "b533_flag default");
        eq(helper, rule(helper, "b533_script_flag").defaultValue(), false, "a boolean without default");
        eq(helper, count.getDescriptionId(), "gamerule.msm_test.b533_count", "the language key");
        helper.assertFalse(BuiltInRegistries.GAME_RULE.containsKey(id("b533_broken")), "a refused rule registered");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("game_rule/b533_broken.json") && e.contains("max")), "no error for b533_broken: " + errors);
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("game rule minecraft:keep_inventory") && e.contains("already a game rule")),
                "no error for the vanilla id: " + errors);
        eq(helper, BuiltInRegistries.GAME_RULE.getValue(Identifier.withDefaultNamespace("keep_inventory")), GameRules.KEEP_INVENTORY,
                "vanilla's keep_inventory untouched");
        helper.succeed();
    }

    /**
     * {@code /gamerule msm_test:b533_count 7} sets it (and the tree has the rule), out of range is refused, the boolean
     * rule takes {@code false}; the values are written to the world's {@code data/minecraft/game_rules.dat} on a save, so
     * they come back after a restart.
     */
    @GameTest(maxTicks = 40)
    public void gameRulesAreSetByCommandAndSavedWithTheWorld(GameTestHelper helper) throws Exception {
        MinecraftServer server = helper.getLevel().getServer();
        GameRules rules = server.getGameRules();
        GameRule<Integer> count = rule(helper, "b533_count");
        GameRule<Boolean> flag = rule(helper, "b533_flag");
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533gamerule", new Vec3(2.5, 1, 2.5), GameType.CREATIVE)) {
            CommandSourceStack source = r.player().createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER).withSuppressedOutput();
            var node = server.getCommands().getDispatcher().getRoot().getChild("gamerule");
            helper.assertTrue(node != null && node.getChild("msm_test:b533_count") != null && node.getChild("msm_test:b533_flag") != null,
                    "the /gamerule tree has no project rules");
            server.getCommands().performPrefixedCommand(source, "gamerule msm_test:b533_count 7");
            eq(helper, rules.get(count), 7, "set by command");
            server.getCommands().performPrefixedCommand(source, "gamerule msm_test:b533_count 11");
            eq(helper, rules.get(count), 7, "out of range refused");
            server.getCommands().performPrefixedCommand(source, "gamerule msm_test:b533_flag false");
            eq(helper, rules.get(flag), false, "the boolean rule");
            server.saveEverything(true, true, true);
            Path file = server.getWorldPath(LevelResource.ROOT).resolve("data").resolve("minecraft").resolve("game_rules.dat");
            helper.assertTrue(Files.exists(file), "no " + file);
            CompoundTag tag = NbtIo.readCompressed(file, NbtAccounter.unlimitedHeap());
            String text = tag.toString();
            helper.assertTrue(text.contains("\"msm_test:b533_count\":7"), "b533_count not saved: " + text);
            helper.assertTrue(text.contains("\"msm_test:b533_flag\":0b"), "b533_flag not saved: " + text);
        } finally {
            rules.set(count, 3, server);
            rules.set(flag, true, server);
        }
        helper.succeed();
    }

    /** The statistics registered in {@code custom_stat} with their formatters; vanilla's {@code jump} is refused. */
    @GameTest
    public void statisticsRegisterAtStart(GameTestHelper helper) {
        eq(helper, MsmRuntime.report().stats(), List.of(id("b533_count"), id("b533_far"), id("b533_long"), id("b533_script")),
                "registered statistics (logged as 'registered 4 statistic(s)')");
        Identifier registered = BuiltInRegistries.CUSTOM_STAT.getValue(id("b533_far"));
        helper.assertTrue(registered != null, "b533_far not in custom_stat");
        Stat<Identifier> far = Stats.CUSTOM.get(registered);
        helper.assertTrue(far == MsmStats.stat(id("b533_far")), "the registered statistic");
        eq(helper, far.format(250), "2.50 m", "distance");
        eq(helper, Stats.CUSTOM.get(BuiltInRegistries.CUSTOM_STAT.getValue(id("b533_long"))).format(1234), "1.03 min", "time");
        eq(helper, Stats.CUSTOM.get(BuiltInRegistries.CUSTOM_STAT.getValue(id("b533_count"))).format(4), "4", "default");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("statistic minecraft:jump") && e.contains("already a custom statistic")),
                "no error for the vanilla id: " + errors);
        helper.succeed();
    }

    /**
     * The criterion {@code minecraft.custom:msm_test.b533_count} names the statistic; an objective made with it by
     * {@code /scoreboard} counts what the player is awarded, and the value is in the player's saved statistics.
     */
    @GameTest(maxTicks = 40)
    public void aStatisticCountsInTheScoreboardAndIsSaved(GameTestHelper helper) throws Exception {
        MinecraftServer server = helper.getLevel().getServer();
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533score", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL)) {
            ServerPlayer p = r.player();
            eq(helper, ObjectiveCriteria.byName("minecraft.custom:msm_test.b533_count").map(ObjectiveCriteria::getName).orElse("none"),
                    "minecraft.custom:msm_test.b533_count", "the criterion");
            CommandSourceStack source = p.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER).withSuppressedOutput();
            server.getCommands().performPrefixedCommand(source, "scoreboard objectives add b533s minecraft.custom:msm_test.b533_count");
            Objective objective = server.getScoreboard().getObjective("b533s");
            helper.assertTrue(objective != null, "no objective");
            Identifier registered = BuiltInRegistries.CUSTOM_STAT.getValue(id("b533_count"));
            p.awardStat(registered, 3);
            p.awardStat(registered);
            eq(helper, p.getStats().getValue(Stats.CUSTOM.get(registered)), 4, "the statistic");
            eq(helper, server.getScoreboard().getPlayerScoreInfo(p, objective).value(), 4, "the score");
            p.getStats().save();
            Path file = server.getWorldPath(LevelResource.PLAYER_STATS_DIR).resolve(p.getStringUUID() + ".json");
            String json = Files.readString(file);
            helper.assertTrue(json.contains("\"msm_test:b533_count\": 4"), "not in the stats file: " + json);
            server.getScoreboard().removeObjective(objective);
            Files.deleteIfExists(file);
        }
        helper.succeed();
    }
}
