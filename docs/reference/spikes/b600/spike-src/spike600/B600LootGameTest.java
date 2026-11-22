package dev.mcsupermods.runtime.gametest.spike600;

import static dev.mcsupermods.runtime.gametest.spike600.B600Help.R;

import com.mojang.brigadier.ParseResults;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.Container;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;

/**
 * B600 spike (throwaway), 2S2 and 2S3: MSM's own fixture loot tables rolled 10,000 times each by the game's own
 * {@code /loot insert} into a chest that is read and emptied after every roll. Recorded per table: for every item key
 * (item, enchantments, damage bucket) how many rolls gave how many of it, and the time taken.
 */
public class B600LootGameTest {
    static final int N = 10_000;

    /** Rolls {@code command} n times and returns the histogram per key and the time. */
    static Map<String, Object> roll(MinecraftServer server, CommandSourceStack source, Container chest, String command, int n,
            boolean preParsed) {
        Map<String, Map<Integer, Integer>> hist = new TreeMap<>();
        Map<String, Integer> total = new TreeMap<>();
        chest.clearContent();
        ParseResults<CommandSourceStack> parsed = preParsed ? server.getCommands().getDispatcher().parse(command, source) : null;
        long t0 = System.nanoTime();
        for (int i = 0; i < n; i++) {
            if (parsed != null) {
                server.getCommands().performCommand(parsed, command);
            } else {
                server.getCommands().performPrefixedCommand(source, command);
            }
            Map<String, Integer> got = B600Help.drain(chest);
            for (var e : got.entrySet()) {
                hist.computeIfAbsent(e.getKey(), k -> new TreeMap<>()).merge(e.getValue(), 1, Integer::sum);
                total.merge(e.getKey(), e.getValue(), Integer::sum);
            }
        }
        long ms = (System.nanoTime() - t0) / 1_000_000;
        // rolls giving none of a key
        for (var e : hist.entrySet()) {
            int some = e.getValue().values().stream().mapToInt(Integer::intValue).sum();
            if (some < n) {
                e.getValue().put(0, n - some);
            }
        }
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("n", n);
        m.put("ms", ms);
        m.put("total", total);
        m.put("hist", hist);
        return m;
    }

    static String at(BlockPos p) {
        return p.getX() + " " + p.getY() + " " + p.getZ();
    }

    static final List<String> SOURCE_TABLES = List.of("weights", "rolls_uniform", "count_uniform", "count_binomial", "count_add",
            "count_weighted", "count_dispatch", "random_chance", "alternatives", "group", "sequence", "nested", "tag_expand",
            "tag_all", "limit", "empty_weight", "luck", "two_pools", "table_modifier", "enchant_levels_book", "enchant_levels_sword",
            "enchant_randomly_book", "set_damage", "chest_like");

    @GameTest(maxTicks = 2000)
    public void lootSource(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        BlockPos chestPos = helper.absolutePos(new BlockPos(1, 1, 1));
        level.setBlockAndUpdate(chestPos, Blocks.CHEST.defaultBlockState());
        Container chest = B600Help.chest(level, chestPos);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        CommandSourceStack src = B600Help.op(player.createCommandSourceStack());
        for (String t : SOURCE_TABLES) {
            R.section("loot." + t, () -> R.put("loot." + t, roll(server, src, chest, "loot insert " + at(chestPos) + " loot msm_b600:" + t, N, false)));
        }
        R.section("loot.weights.preparsed", () -> R.put("loot.weights.preparsed",
                roll(server, src, chest, "loot insert " + at(chestPos) + " loot msm_b600:weights", N, true)));
        // Luck: the same table rolled by a player with luck 2 and from the console.
        R.section("loot.luck.player2", () -> {
            player.getAttribute(Attributes.LUCK).setBaseValue(2.0);
            R.put("loot.luck.player2", roll(server, src, chest, "loot insert " + at(chestPos) + " loot msm_b600:luck", N, false));
            player.getAttribute(Attributes.LUCK).setBaseValue(0.0);
        });
        R.section("loot.luck.console", () -> R.put("loot.luck.console", roll(server,
                B600Help.op(server.createCommandSourceStack()), chest, "loot insert " + at(chestPos) + " loot msm_b600:luck", N, false)));
        helper.succeed();
    }

    @GameTest(maxTicks = 2000)
    public void lootMine(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        BlockPos chestPos = helper.absolutePos(new BlockPos(1, 1, 1));
        BlockPos blockPos = helper.absolutePos(new BlockPos(3, 1, 1));
        level.setBlockAndUpdate(chestPos, Blocks.CHEST.defaultBlockState());
        Container chest = B600Help.chest(level, chestPos);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        CommandSourceStack src = B600Help.op(player.createCommandSourceStack());
        Map<String, ItemStack> tools = new LinkedHashMap<>();
        tools.put("hand", ItemStack.EMPTY);
        tools.put("pick", new ItemStack(Items.DIAMOND_PICKAXE));
        for (int lvl : new int[] {1, 2, 3}) {
            ItemStack s = new ItemStack(Items.DIAMOND_PICKAXE);
            s.enchant(B600Help.enchantment(server, "minecraft:fortune"), lvl);
            tools.put("fortune" + lvl, s);
        }
        ItemStack silk = new ItemStack(Items.DIAMOND_PICKAXE);
        silk.enchant(B600Help.enchantment(server, "minecraft:silk_touch"), 1);
        tools.put("silk", silk);
        for (String wool : List.of("white_wool", "orange_wool", "magenta_wool", "light_blue_wool", "yellow_wool", "lime_wool",
                "pink_wool", "gray_wool", "light_gray_wool")) {
            level.setBlockAndUpdate(blockPos, BuiltInRegistries.BLOCK.getValue(Identifier.withDefaultNamespace(wool)).defaultBlockState());
            for (var tool : tools.entrySet()) {
                if (List.of("lime_wool", "pink_wool", "gray_wool", "light_gray_wool").contains(wool)
                        && !List.of("hand", "silk").contains(tool.getKey())) {
                    continue;
                }
                player.setItemSlot(EquipmentSlot.MAINHAND, tool.getValue().copy());
                String key = "mine." + wool + "." + tool.getKey();
                R.section(key, () -> R.put(key, roll(server, src, chest, "loot insert " + at(chestPos) + " mine " + at(blockPos)
                        + " mainhand", N, false)));
            }
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 2000)
    public void lootKill(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        BlockPos chestPos = helper.absolutePos(new BlockPos(1, 1, 1));
        level.setBlockAndUpdate(chestPos, Blocks.CHEST.defaultBlockState());
        Container chest = B600Help.chest(level, chestPos);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        CommandSourceStack src = B600Help.op(player.createCommandSourceStack());
        BlockPos mob = helper.absolutePos(new BlockPos(4, 1, 4));
        for (String table : List.of("looting", "looting_limit")) {
            String tag = "b600v_" + table;
            B600Help.run(server, B600Help.op(server.createCommandSourceStack()), "summon minecraft:zombie " + at(mob)
                    + " {NoAI:1b,Silent:1b,PersistenceRequired:1b,Tags:[\"" + tag + "\"],DeathLootTable:\"msm_b600:" + table + "\"}");
            String cmd = "loot insert " + at(chestPos) + " kill @e[tag=" + tag + ",limit=1]";
            for (int lvl : new int[] {0, 1, 3}) {
                ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
                if (lvl > 0) {
                    sword.enchant(B600Help.enchantment(server, "minecraft:looting"), lvl);
                }
                player.setItemSlot(EquipmentSlot.MAINHAND, sword);
                String key = "kill." + table + ".player.looting" + lvl;
                R.section(key, () -> R.put(key, roll(server, src, chest, cmd, N, false)));
            }
            String key = "kill." + table + ".console";
            R.section(key, () -> R.put(key, roll(server, B600Help.op(server.createCommandSourceStack()), chest, cmd, N, false)));
        }
        helper.succeed();
    }

    @GameTest(maxTicks = 2000)
    public void explosions(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        int n = 2000;
        BlockPos pos = helper.absolutePos(new BlockPos(4, 6, 4));
        for (String wool : List.of("pink_wool", "gray_wool", "light_gray_wool")) {
            for (Level.ExplosionInteraction how : List.of(Level.ExplosionInteraction.BLOCK, Level.ExplosionInteraction.TNT)) {
                for (float power : new float[] {2f, 4f}) {
                    String key = "explode." + wool + "." + how.name().toLowerCase() + "." + (int) power;
                    R.section(key, () -> {
                        Map<Integer, Integer> hist = new TreeMap<>();
                        long t0 = System.nanoTime();
                        for (int i = 0; i < n; i++) {
                            level.setBlockAndUpdate(pos, BuiltInRegistries.BLOCK.getValue(Identifier.withDefaultNamespace(wool)).defaultBlockState());
                            level.explode(null, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, power, how);
                            int apples = 0;
                            for (ItemEntity e : level.getEntitiesOfClass(ItemEntity.class, new AABB(pos).inflate(6))) {
                                if (e.getItem().is(Items.APPLE)) {
                                    apples += e.getItem().getCount();
                                }
                                e.discard();
                            }
                            hist.merge(apples, 1, Integer::sum);
                        }
                        Map<String, Object> m = new LinkedHashMap<>();
                        m.put("n", n);
                        m.put("ms", (System.nanoTime() - t0) / 1_000_000);
                        m.put("hist", hist);
                        R.put(key, m);
                    });
                }
            }
        }
        helper.succeed();
    }
}
