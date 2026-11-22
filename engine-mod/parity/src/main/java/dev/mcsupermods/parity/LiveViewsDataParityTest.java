package dev.mcsupermods.parity;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.serialization.JsonOps;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Stream;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.advancements.AdvancementNode;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.HolderSet;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.chat.ChatType;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.TextColor;
import net.minecraft.network.chat.contents.PlainTextContents;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.tags.TagKey;
import net.minecraft.util.RandomSource;
import net.minecraft.world.Container;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.damagesource.DamageType;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.Pose;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.enchantment.Enchantment;
import net.minecraft.world.item.enchantment.EnchantmentHelper;
import net.minecraft.world.item.enchantment.EnchantmentInstance;
import net.minecraft.world.item.enchantment.ItemEnchantments;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.scores.Objective;
import net.minecraft.world.scores.ReadOnlyScoreInfo;
import net.minecraft.world.scores.ScoreHolder;

/**
 * Parity of the live views of batch 2, data (ADR 0120 D9, plan brief B607): what the real game does with the files of
 * {@code fixtures/live-views}, MSM's own loot tables, predicates, item modifiers, tags, enchantments, advancements,
 * dialogs, damage and chat types and functions.
 *
 * <p>The fixture's lowered data pack is mod data of a jar of its own ({@code msm_live_views_fixture}, the parity
 * build's {@code liveViewsFixtureJar} task), loaded only by the {@code liveViewsParity} task, so its wool loot tables,
 * merged and replaced vanilla tags and load function are never active in another parity run. Each test measures one
 * section through the game's own commands and methods: tables rolled {@value #ROLLS} times by {@code loot insert}
 * ({@code loot}, {@code mine <pos> mainhand} as a mock player holding the tool, {@code kill} on a mob with a
 * {@code DeathLootTable}), blocks blown up {@value #EXPLOSIONS} times, predicates tested by
 * {@code execute if predicate} in set-up situations, modifiers applied by {@code item modify}, tags read from the
 * registries, functions run as a mock player and the world read back, the advancement tree as the server lays it out.
 * Every case records the situation it was measured in, in the shape of {@code @msm/sim}'s {@code Situation}.
 *
 * <p>{@code MSM_LIVE_VIEWS_EXPECTATIONS} names {@code fixtures/live-views/expectations.json}. Without
 * {@code MSM_LIVE_VIEWS_UPDATE} the measurements are compared with this target's section: exact for everything but
 * the rates of random outcomes, which may differ by {@link #allowed} (B600's 2L1 tolerance of 2 points, 3 for
 * explosions, widened to five standard deviations of the difference of two samples where that is larger). With it
 * (the task's {@code -PupdateLiveViewsParity}) each test writes its section instead. Run with
 * {@code --gametest-filter msm_parity_tests:live_views_data_parity_test_*}.
 */
public class LiveViewsDataParityTest {
    static final String NS = "live_views";
    static final String EXPECTATIONS_ENV = "MSM_LIVE_VIEWS_EXPECTATIONS";
    static final String UPDATE_ENV = "MSM_LIVE_VIEWS_UPDATE";
    static final String TARGET_ENV = "MSM_LIVE_VIEWS_TARGET";
    static final int FORMAT = 1;
    static final int ROLLS = 10_000;
    static final int EXPLOSIONS = 2_000;
    static final int PREDICATE_TESTS = 10_000;
    static final double LOOT_POINTS = 0.02;
    static final double EXPLOSION_POINTS = 0.03;
    private static final String ARENA = "msm_parity_tests:arena";

    // --- loot ---------------------------------------------------------------------------------------------------------

    /** Tables rolled with {@code loot insert <chest> loot <table>} as a mock player. */
    static final List<String> SOURCE_TABLES = List.of("weights", "rolls_uniform", "count_uniform", "count_binomial",
            "count_add", "count_weighted", "count_dispatch", "random_chance", "alternatives", "group", "sequence",
            "nested", "tag_expand", "tag_all", "limit", "empty_weight", "two_pools", "table_modifier",
            "enchant_levels_book", "enchant_levels_sword", "enchant_levels_own", "enchant_randomly_book",
            "enchant_randomly_own", "set_damage", "chest_like", "set_item", "discard", "modifier_ref", "condition_ref",
            "sequence_modifier");

    @GameTest(structure = ARENA, maxTicks = 20)
    public void rollsTables(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        BlockPos chestPos = helper.absolutePos(new BlockPos(1, 1, 1));
        Container chest = chest(level, chestPos);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        CommandSourceStack source = op(player.createCommandSourceStack());
        JsonObject section = new JsonObject();
        for (String table : SOURCE_TABLES) {
            JsonObject situation = new JsonObject();
            situation.addProperty("context", "minecraft:chest");
            situation.add("thisEntity", entity("minecraft:player"));
            section.add(table, roll(server, source, chest, "loot insert " + at(chestPos) + " loot " + NS + ":" + table,
                    NS + ":" + table, situation, ROLLS));
        }
        finish(helper, "loot", section, LOOT_POINTS);
    }

    /** Wool block tables, mined with each tool; the four explosion tables only by hand and with Silk Touch. */
    static final List<String> MINED = List.of("white_wool", "orange_wool", "magenta_wool", "light_blue_wool",
            "yellow_wool", "lime_wool", "brown_wool", "pink_wool", "gray_wool", "light_gray_wool");

    @GameTest(structure = ARENA, maxTicks = 20)
    public void minesBlocks(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        BlockPos chestPos = helper.absolutePos(new BlockPos(1, 1, 1));
        BlockPos blockPos = helper.absolutePos(new BlockPos(3, 1, 1));
        Container chest = chest(level, chestPos);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        CommandSourceStack source = op(player.createCommandSourceStack());
        Map<String, Integer> tools = new LinkedHashMap<>();
        tools.put("hand", -1);
        tools.put("pickaxe", 0);
        tools.put("fortune1", 1);
        tools.put("fortune2", 2);
        tools.put("fortune3", 3);
        tools.put("silk_touch", -2);
        JsonObject section = new JsonObject();
        for (String wool : MINED) {
            boolean explosionTable = List.of("pink_wool", "gray_wool", "light_gray_wool").contains(wool);
            level.setBlockAndUpdate(blockPos, BuiltInRegistries.BLOCK.getValue(Identifier.withDefaultNamespace(wool))
                    .defaultBlockState());
            for (Map.Entry<String, Integer> tool : tools.entrySet()) {
                if (explosionTable && !List.of("hand", "silk_touch").contains(tool.getKey())) continue;
                ItemStack stack = tool.getValue() == -1 ? ItemStack.EMPTY : new ItemStack(Items.DIAMOND_PICKAXE);
                JsonObject toolSample = null;
                if (tool.getValue() != -1) {
                    toolSample = itemSample("minecraft:diamond_pickaxe");
                    if (tool.getValue() != 0) {
                        String enchantment = tool.getValue() > 0 ? "minecraft:fortune" : "minecraft:silk_touch";
                        int lvl = Math.max(1, tool.getValue());
                        stack.enchant(enchantment(server, enchantment), lvl);
                        JsonObject enchantments = new JsonObject();
                        enchantments.addProperty(enchantment, lvl);
                        toolSample.add("enchantments", enchantments);
                    }
                }
                player.setItemSlot(EquipmentSlot.MAINHAND, stack);
                JsonObject situation = new JsonObject();
                situation.addProperty("context", "minecraft:block");
                situation.add("block", block("minecraft:" + wool));
                if (toolSample != null) situation.add("tool", toolSample);
                situation.add("thisEntity", entity("minecraft:player"));
                section.add(wool + "." + tool.getKey(), roll(server, source, chest, "loot insert " + at(chestPos)
                        + " mine " + at(blockPos) + " mainhand", "minecraft:blocks/" + wool, situation, ROLLS));
            }
        }
        player.setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY);
        finish(helper, "mined", section, LOOT_POINTS);
    }

    @GameTest(structure = ARENA, maxTicks = 20)
    public void killsMobs(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        BlockPos chestPos = helper.absolutePos(new BlockPos(1, 1, 1));
        Container chest = chest(level, chestPos);
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        CommandSourceStack asPlayer = op(player.createCommandSourceStack());
        CommandSourceStack console = op(server.createCommandSourceStack().withLevel(level));
        BlockPos mob = helper.absolutePos(new BlockPos(5, 1, 5));
        JsonObject section = new JsonObject();
        for (String table : List.of("looting", "looting_limit")) {
            String tag = "lv_" + table;
            run(server, console, "summon minecraft:zombie " + at(mob) + " {NoAI:1b,Silent:1b,PersistenceRequired:1b,"
                    + "Tags:[\"" + tag + "\"],DeathLootTable:\"" + NS + ":" + table + "\"}");
            String command = "loot insert " + at(chestPos) + " kill @e[tag=" + tag + ",limit=1]";
            for (int lvl : new int[] {0, 1, 3}) {
                ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
                JsonObject weapon = itemSample("minecraft:diamond_sword");
                if (lvl > 0) {
                    sword.enchant(enchantment(server, "minecraft:looting"), lvl);
                    JsonObject enchantments = new JsonObject();
                    enchantments.addProperty("minecraft:looting", lvl);
                    weapon.add("enchantments", enchantments);
                }
                player.setItemSlot(EquipmentSlot.MAINHAND, sword);
                JsonObject killer = entity("minecraft:player");
                killer.addProperty("player", true);
                killer.add("weapon", weapon);
                JsonObject situation = new JsonObject();
                situation.addProperty("context", "minecraft:entity");
                situation.add("thisEntity", entity("minecraft:zombie"));
                situation.add("killer", killer);
                section.add(table + ".player_looting" + lvl, roll(server, asPlayer, chest, command, NS + ":" + table,
                        situation, ROLLS));
            }
            JsonObject situation = new JsonObject();
            situation.addProperty("context", "minecraft:entity");
            situation.add("thisEntity", entity("minecraft:zombie"));
            section.add(table + ".no_killer", roll(server, console, chest, command, NS + ":" + table, situation, ROLLS));
            run(server, console, "kill @e[tag=" + tag + "]");
        }
        finish(helper, "killed", section, LOOT_POINTS);
    }

    @GameTest(structure = ARENA, maxTicks = 20)
    public void explodesBlocks(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        // High in the air, so the blasts break nothing but the block and reach no other test.
        BlockPos pos = helper.absolutePos(new BlockPos(5, 48, 5));
        JsonObject section = new JsonObject();
        record Blast(Level.ExplosionInteraction how, float power) {}
        List<Blast> blasts = List.of(new Blast(Level.ExplosionInteraction.BLOCK, 2f),
                new Blast(Level.ExplosionInteraction.BLOCK, 4f), new Blast(Level.ExplosionInteraction.TNT, 4f));
        for (String wool : List.of("pink_wool", "gray_wool", "light_gray_wool")) {
            for (Blast blast : blasts) {
                boolean decays = blast.how() == Level.ExplosionInteraction.BLOCK;
                Map<String, Map<Integer, Integer>> histogram = new TreeMap<>();
                long start = System.nanoTime();
                for (int i = 0; i < EXPLOSIONS; i++) {
                    level.setBlockAndUpdate(pos, BuiltInRegistries.BLOCK.getValue(Identifier.withDefaultNamespace(wool))
                            .defaultBlockState());
                    level.explode(null, pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5, blast.power(), blast.how());
                    Map<String, Integer> got = new TreeMap<>();
                    for (ItemEntity e : level.getEntitiesOfClass(ItemEntity.class, new AABB(pos).inflate(8))) {
                        if (e.getItem().is(Items.APPLE)) got.merge(key(e.getItem()), e.getItem().getCount(), Integer::sum);
                        e.discard();
                    }
                    count(histogram, got);
                }
                JsonObject situation = new JsonObject();
                situation.addProperty("context", "minecraft:block");
                situation.add("block", block("minecraft:" + wool));
                JsonObject explosion = new JsonObject();
                explosion.addProperty("power", blast.power());
                explosion.addProperty("decays", decays);
                situation.add("explosion", explosion);
                String name = wool + "." + (decays ? "block" : "tnt") + (int) blast.power();
                section.add(name, rollCase("minecraft:blocks/" + wool, situation, EXPLOSIONS, histogram, new TreeMap<>()));
                log(name + ": " + EXPLOSIONS + " explosions in " + (System.nanoTime() - start) / 1_000_000 + " ms");
            }
        }
        finish(helper, "exploded", section, EXPLOSION_POINTS);
    }

    /** Rolls {@code command} {@code n} times into the chest, read and emptied after every roll. */
    static JsonObject roll(MinecraftServer server, CommandSourceStack source, Container chest, String command,
            String table, JsonObject situation, int n) {
        Map<String, Map<Integer, Integer>> histogram = new TreeMap<>();
        Map<String, Integer> enchantments = new TreeMap<>();
        chest.clearContent();
        long start = System.nanoTime();
        for (int i = 0; i < n; i++) {
            run(server, source, command);
            Map<String, Integer> got = new TreeMap<>();
            Set<String> enchanted = new TreeSet<>();
            for (int slot = 0; slot < chest.getContainerSize(); slot++) {
                ItemStack stack = chest.getItem(slot);
                if (stack.isEmpty()) continue;
                got.merge(key(stack), stack.getCount(), Integer::sum);
                enchanted.addAll(enchantmentKeys(stack));
            }
            chest.clearContent();
            count(histogram, got);
            for (String e : enchanted) enchantments.merge(e, 1, Integer::sum);
        }
        log(table + " (" + command.split(" ")[5] + "): " + n + " rolls in "
                + (System.nanoTime() - start) / 1_000_000 + " ms");
        return rollCase(table, situation, n, histogram, enchantments);
    }

    /** Adds one roll's totals per key to the histogram (count to rolls). */
    static void count(Map<String, Map<Integer, Integer>> histogram, Map<String, Integer> got) {
        for (Map.Entry<String, Integer> e : got.entrySet()) {
            histogram.computeIfAbsent(e.getKey(), k -> new TreeMap<>()).merge(e.getValue(), 1, Integer::sum);
        }
    }

    static JsonObject rollCase(String table, JsonObject situation, int n, Map<String, Map<Integer, Integer>> histogram,
            Map<String, Integer> enchantments) {
        JsonObject out = new JsonObject();
        out.addProperty("table", table);
        out.add("situation", situation);
        out.addProperty("rolls", n);
        JsonObject items = new JsonObject();
        for (Map.Entry<String, Map<Integer, Integer>> e : histogram.entrySet()) {
            JsonObject counts = new JsonObject();
            int some = 0;
            for (Map.Entry<Integer, Integer> c : e.getValue().entrySet()) {
                counts.addProperty(Integer.toString(c.getKey()), c.getValue());
                some += c.getValue();
            }
            if (some < n) counts.addProperty("0", n - some);
            items.add(e.getKey(), counts);
        }
        out.add("items", items);
        if (!enchantments.isEmpty()) {
            JsonObject e = new JsonObject();
            enchantments.forEach(e::addProperty);
            out.add("enchantments", e);
        }
        return out;
    }

    /** The key of a stack: its item, and {@code worn=<n>} (damage in twentieths of the durability) when damaged. */
    static String key(ItemStack stack) {
        StringBuilder b = new StringBuilder(BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
        if (stack.isDamageableItem() && stack.getDamageValue() > 0) {
            b.append(" worn=").append(stack.getDamageValue() * 20 / stack.getMaxDamage());
        }
        return b.toString();
    }

    /** {@code <enchantment id>=<level>} for every enchantment on the stack or stored in it. */
    static List<String> enchantmentKeys(ItemStack stack) {
        List<String> out = new ArrayList<>();
        for (ItemEnchantments e : new ItemEnchantments[] {stack.get(DataComponents.ENCHANTMENTS),
                stack.get(DataComponents.STORED_ENCHANTMENTS)}) {
            if (e == null) continue;
            for (var entry : e.entrySet()) {
                out.add(entry.getKey().unwrapKey().map(k -> k.identifier().toString()).orElse("?") + "="
                        + entry.getIntValue());
            }
        }
        return out;
    }

    // --- predicates -----------------------------------------------------------------------------------------------------

    @GameTest(structure = ARENA, maxTicks = 400)
    public void testsPredicates(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        BlockPos here = helper.absolutePos(new BlockPos(1, 1, 1));
        CommandSourceStack console = op(server.createCommandSourceStack().withLevel(level)
                .withPosition(Vec3.atCenterOf(here)));
        CommandSourceStack asPlayer = op(player.createCommandSourceStack().withPosition(Vec3.atCenterOf(here)));
        String biome = level.getBiome(here).unwrapKey().map(k -> k.identifier().toString()).orElse("?");
        JsonObject section = new JsonObject();
        JsonObject command = situation("minecraft:command", null);
        // Random ones, tested many times.
        for (String p : List.of("chance30", "all_any", "all_two", "ref_chance")) {
            section.add(p, predicate(server, console, p, command, PREDICATE_TESTS));
        }
        section.add("inverted_zero", predicate(server, console, "inverted_zero", command, 1));
        section.add("int_check", predicate(server, console, "int_check", command, 1));
        section.add("always", predicate(server, console, "always", command, 1));
        // What a command source does not have: the game answers no (or yes for the explosion and bonus ones).
        JsonObject playerHere = situation("minecraft:command", entity("minecraft:player"));
        for (String p : List.of("tool_any", "killed_by_player", "survives_explosion", "table_bonus", "damage_fire")) {
            section.add(p + ".player", predicate(server, asPlayer, p, playerHere, 1));
            section.add(p + ".console", predicate(server, console, p, command, 1));
        }
        section.add("is_player.player", predicate(server, asPlayer, "is_player", playerHere, 1));
        section.add("is_player.console", predicate(server, console, "is_player", command, 1));
        // Sneaking: the player crouching and standing.
        player.setShiftKeyDown(true);
        player.setPose(Pose.CROUCHING);
        section.add("sneaking.crouching", predicate(server, asPlayer, "sneaking",
                situation("minecraft:command", withFlag(entity("minecraft:player"), "is_sneaking", true)), 1));
        player.setPose(Pose.STANDING);
        player.setShiftKeyDown(false);
        section.add("sneaking.standing", predicate(server, asPlayer, "sneaking",
                situation("minecraft:command", withFlag(entity("minecraft:player"), "is_sneaking", false)), 1));
        section.add("sneaking.console", predicate(server, console, "sneaking", command, 1));
        // Places.
        JsonObject inBiome = situation("minecraft:command", null);
        inBiome.addProperty("biome", biome);
        section.add("plains", predicate(server, console, "plains", inBiome, 1));
        JsonObject low = situation("minecraft:command", null);
        low.add("position", position(Vec3.atCenterOf(here)));
        section.add("high.here", predicate(server, console, "high", low, 1));
        Vec3 up = new Vec3(here.getX() + 0.5, 150.5, here.getZ() + 0.5);
        JsonObject high = situation("minecraft:command", null);
        high.add("position", position(up));
        section.add("high.at150", predicate(server, console.withPosition(up), "high", high, 1));
        // Scores.
        run(server, console, "scoreboard objectives add lv_pred dummy");
        for (int score : new int[] {3, 6}) {
            run(server, console, "scoreboard players set " + player.getScoreboardName() + " lv_pred " + score);
            JsonObject scores = new JsonObject();
            scores.addProperty("lv_pred", score);
            JsonObject entity = entity("minecraft:player");
            entity.add("scores", scores);
            section.add("score5.at" + score, predicate(server, asPlayer, "score5",
                    situation("minecraft:command", entity), 1));
        }
        section.add("score5.console", predicate(server, console, "score5", command, 1));
        // Time of day on the overworld clock.
        for (int ticks : new int[] {1000, 13000, 25000}) {
            run(server, console, "time set " + ticks);
            JsonObject at = situation("minecraft:command", null);
            JsonObject time = new JsonObject();
            time.addProperty("clock", "minecraft:overworld");
            time.addProperty("ticks", ticks);
            at.add("time", time);
            section.add("day.at" + ticks, predicate(server, console, "day", at, 1));
        }
        // Weather turns over ticks: rain, then 150 ticks later the test; then clear, and 150 ticks later again.
        run(server, console, "weather rain");
        helper.runAfterDelay(150, () -> {
            section.add("raining.rain", predicate(server, console, "raining", weather(true), 1));
            run(server, console, "weather clear");
            helper.runAfterDelay(150, () -> {
                section.add("raining.clear", predicate(server, console, "raining", weather(false), 1));
                finish(helper, "predicates", section, LOOT_POINTS);
            });
        });
    }

    static JsonObject predicate(MinecraftServer server, CommandSourceStack source, String name, JsonObject situation,
            int tests) {
        int yes = 0;
        long start = System.nanoTime();
        for (int i = 0; i < tests; i++) {
            run(server, op(server.createCommandSourceStack()), "data remove storage " + NS + ":out v");
            run(server, source, "execute store success storage " + NS + ":out v int 1 if predicate " + NS + ":" + name);
            if (server.getCommandStorage().get(Identifier.fromNamespaceAndPath(NS, "out")).getIntOr("v", 0) == 1) yes++;
        }
        if (tests > 1) log("predicate " + name + ": " + tests + " tests in " + (System.nanoTime() - start) / 1_000_000 + " ms");
        JsonObject out = new JsonObject();
        out.addProperty("predicate", NS + ":" + name);
        out.add("situation", situation.deepCopy());
        out.addProperty("tests", tests);
        out.addProperty("yes", yes);
        return out;
    }

    static JsonObject situation(String context, JsonObject thisEntity) {
        JsonObject s = new JsonObject();
        s.addProperty("context", context);
        if (thisEntity != null) s.add("thisEntity", thisEntity);
        return s;
    }

    static JsonObject weather(boolean raining) {
        JsonObject s = situation("minecraft:command", null);
        JsonObject w = new JsonObject();
        w.addProperty("raining", raining);
        w.addProperty("thundering", false);
        s.add("weather", w);
        return s;
    }

    static JsonObject withFlag(JsonObject entity, String flag, boolean value) {
        JsonObject flags = new JsonObject();
        flags.addProperty(flag, value);
        entity.add("flags", flags);
        return entity;
    }

    /**
     * A position for the situation: the height only, as x and z 0 (GameTests are placed at random x and z on every
     * start, and the fixture's location tests read only the height).
     */
    static JsonArray position(Vec3 v) {
        JsonArray a = new JsonArray();
        a.add(0);
        a.add(v.y);
        a.add(0);
        return a;
    }

    // --- item modifiers -------------------------------------------------------------------------------------------------

    @GameTest(structure = ARENA, maxTicks = 20)
    public void appliesModifiers(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        BlockPos chestPos = helper.absolutePos(new BlockPos(1, 1, 1));
        Container chest = chest(level, chestPos);
        CommandSourceStack console = op(server.createCommandSourceStack().withLevel(level));
        JsonObject section = new JsonObject();
        Map<String, ItemStack> cases = new LinkedHashMap<>();
        for (String m : List.of("mod_set_name", "mod_set_lore", "mod_set_damage", "mod_set_enchantments",
                "mod_set_count", "mod_rarity")) {
            cases.put(m, new ItemStack(Items.DIAMOND_SWORD));
        }
        cases.put("mod_smelt", new ItemStack(Items.RAW_IRON, 3));
        for (String m : List.of("mod_sequence", "mod_never", "mod_ref")) cases.put(m, new ItemStack(Items.DIAMOND));
        for (Map.Entry<String, ItemStack> c : cases.entrySet()) {
            chest.clearContent();
            chest.setItem(0, c.getValue().copy());
            run(server, console, "item modify block " + at(chestPos) + " container.0 " + NS + ":" + c.getKey());
            JsonObject out = new JsonObject();
            out.addProperty("modifier", NS + ":" + c.getKey());
            out.add("situation", situation("minecraft:command", null));
            out.add("before", encode(server, c.getValue()));
            out.add("after", encode(server, chest.getItem(0)));
            section.add(c.getKey(), out);
        }
        chest.clearContent();
        finish(helper, "modifiers", section, LOOT_POINTS);
    }

    static JsonElement encode(MinecraftServer server, ItemStack stack) {
        if (stack.isEmpty()) return new JsonObject();
        return ItemStack.CODEC.encodeStart(server.registryAccess().createSerializationContext(JsonOps.INSTANCE), stack)
                .getOrThrow();
    }

    // --- enchantments ---------------------------------------------------------------------------------------------------

    @GameTest(maxTicks = 20)
    public void readsEnchantments(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        JsonObject section = new JsonObject();
        JsonObject own = new JsonObject();
        for (String name : List.of("spike", "spike_curse", "spike_ten")) {
            Holder<Enchantment> h = enchantment(server, NS + ":" + name);
            Enchantment e = h.value();
            JsonObject o = new JsonObject();
            o.addProperty("maxLevel", e.getMaxLevel());
            o.addProperty("weight", e.getWeight());
            o.addProperty("anvilCost", e.getAnvilCost());
            JsonObject costs = new JsonObject();
            JsonArray names = new JsonArray();
            for (int l = 1; l <= e.getMaxLevel(); l++) {
                JsonArray c = new JsonArray();
                c.add(e.getMinCost(l));
                c.add(e.getMaxCost(l));
                costs.add(Integer.toString(l), c);
                names.add(describe(Enchantment.getFullname(h, l)));
            }
            o.add("costs", costs);
            o.add("names", names);
            own.add(NS + ":" + name, o);
        }
        section.add("own", own);
        // The enchanting table's picks among the fixture's own enchantments, at a seed.
        RandomSource random = RandomSource.create(607L);
        ItemStack sword = new ItemStack(Items.DIAMOND_SWORD);
        List<Holder<Enchantment>> ownHolders = List.of(enchantment(server, NS + ":spike"),
                enchantment(server, NS + ":spike_curse"), enchantment(server, NS + ":spike_ten"));
        JsonObject picks = new JsonObject();
        for (int cost : new int[] {1, 5, 10, 15, 20, 25, 30, 35, 40}) {
            Map<String, Integer> histogram = new TreeMap<>();
            for (int i = 0; i < ROLLS; i++) {
                List<EnchantmentInstance> got = EnchantmentHelper.selectEnchantment(random, sword, cost,
                        ownHolders.stream());
                List<String> parts = new ArrayList<>();
                for (EnchantmentInstance x : got) {
                    parts.add(x.enchantment().unwrapKey().map(k -> k.identifier().toString()).orElse("?") + "="
                            + x.level());
                }
                histogram.merge(parts.isEmpty() ? "none" : String.join("+", parts), 1, Integer::sum);
            }
            JsonObject h = new JsonObject();
            histogram.forEach(h::addProperty);
            picks.add(Integer.toString(cost), h);
        }
        JsonObject table = new JsonObject();
        table.addProperty("item", "minecraft:diamond_sword");
        table.addProperty("draws", ROLLS);
        table.add("picksAtCost", picks);
        section.add("enchanting", table);
        finish(helper, "enchantments", section, LOOT_POINTS);
    }

    /**
     * A component as its translation key, its number of arguments, its colour and its plain text parts (never a string
     * the game resolves from its language file).
     */
    static JsonElement describe(Component c) {
        JsonObject m = new JsonObject();
        if (c.getContents() instanceof TranslatableContents t) {
            m.addProperty("key", t.getKey());
            m.addProperty("arguments", t.getArgs().length);
        } else if (c.getContents() instanceof PlainTextContents p) {
            m.addProperty("text", p.text());
        }
        TextColor color = c.getStyle().getColor();
        if (color != null) m.addProperty("color", color.serialize());
        if (!c.getSiblings().isEmpty()) {
            JsonArray siblings = new JsonArray();
            for (Component s : c.getSiblings()) siblings.add(describe(s));
            m.add("siblings", siblings);
        }
        return m;
    }

    // --- tags, registries, advancements, lines ----------------------------------------------------------------------

    @GameTest(maxTicks = 20)
    public void resolvesTags(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        JsonObject section = new JsonObject();
        for (String t : List.of("three", "plain", "tags_inside", "with_optional", "with_missing", "names_missing",
                "cycle_a", "cycle_b", "dupes", "spiky")) {
            section.add("item:" + NS + ":" + t, members(server, Registries.ITEM, Identifier.fromNamespaceAndPath(NS, t)));
        }
        section.add("item:minecraft:wool", members(server, Registries.ITEM, Identifier.withDefaultNamespace("wool")));
        JsonObject logs = new JsonObject();
        HolderSet.Named<?> logSet = server.registryAccess().lookupOrThrow(Registries.ITEM)
                .get(TagKey.create(Registries.ITEM, Identifier.withDefaultNamespace("logs"))).orElseThrow();
        logs.addProperty("hasStone", logSet.stream().anyMatch(h -> h.is(Identifier.withDefaultNamespace("stone"))));
        logs.addProperty("hasOakLog", logSet.stream().anyMatch(h -> h.is(Identifier.withDefaultNamespace("oak_log"))));
        section.add("item:minecraft:logs", logs);
        section.add("block:" + NS + ":soft", members(server, Registries.BLOCK, Identifier.fromNamespaceAndPath(NS, "soft")));
        section.add("entity_type:" + NS + ":undead_pair", members(server, Registries.ENTITY_TYPE,
                Identifier.fromNamespaceAndPath(NS, "undead_pair")));
        section.add("enchantment:" + NS + ":own", members(server, Registries.ENCHANTMENT,
                Identifier.fromNamespaceAndPath(NS, "own")));
        HolderSet.Named<Enchantment> curse = server.registryAccess().lookupOrThrow(Registries.ENCHANTMENT)
                .get(TagKey.create(Registries.ENCHANTMENT, Identifier.withDefaultNamespace("curse"))).orElseThrow();
        JsonObject curses = new JsonObject();
        curses.addProperty("hasOwnCurse", curse.stream().anyMatch(h -> h.is(Identifier.fromNamespaceAndPath(NS,
                "spike_curse"))));
        section.add("enchantment:minecraft:curse", curses);
        finish(helper, "tags", section, LOOT_POINTS);
    }

    /** A tag's members, sorted, or null when the tag did not load. */
    static <T> JsonElement members(MinecraftServer server, ResourceKey<? extends net.minecraft.core.Registry<T>> registry,
            Identifier id) {
        var set = server.registryAccess().lookupOrThrow(registry).get(TagKey.create(registry, id));
        if (set.isEmpty()) return com.google.gson.JsonNull.INSTANCE;
        JsonArray out = new JsonArray();
        set.get().stream().map(h -> h.unwrapKey().map(k -> k.identifier().toString()).orElse("?")).sorted()
                .forEach(out::add);
        return out;
    }

    @GameTest(maxTicks = 20)
    public void loadsEverything(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        JsonObject section = new JsonObject();
        var access = server.registryAccess();
        section.add("dialog", ids(access.lookupOrThrow(Registries.DIALOG).listElementIds().map(ResourceKey::identifier)));
        section.add("damage_type", ids(access.lookupOrThrow(Registries.DAMAGE_TYPE).listElementIds().map(ResourceKey::identifier)));
        section.add("chat_type", ids(access.lookupOrThrow(Registries.CHAT_TYPE).listElementIds().map(ResourceKey::identifier)));
        section.add("enchantment", ids(access.lookupOrThrow(Registries.ENCHANTMENT).listElementIds().map(ResourceKey::identifier)));
        section.add("trial_spawner", ids(access.lookupOrThrow(Registries.TRIAL_SPAWNER_CONFIG).listElementIds()
                .map(ResourceKey::identifier)));
        section.add("block_transformer", ids(access.lookupOrThrow(Registries.BLOCK_TRANSFORMER).listElementIds()
                .map(ResourceKey::identifier)));
        var reloadable = server.reloadableRegistries().lookup();
        section.add("loot_table", ids(reloadable.lookupOrThrow(Registries.LOOT_TABLE).listElementIds().map(ResourceKey::identifier)));
        section.add("predicate", ids(reloadable.lookupOrThrow(Registries.PREDICATE).listElementIds().map(ResourceKey::identifier)));
        section.add("item_modifier", ids(reloadable.lookupOrThrow(Registries.ITEM_MODIFIER).listElementIds()
                .map(ResourceKey::identifier)));
        List<Identifier> functions = new ArrayList<>();
        server.getFunctions().getFunctionNames().forEach(functions::add);
        section.add("function", ids(functions.stream()));
        // The death lines of the fixture's damage types and the fixture's chat type, as keys and argument counts.
        JsonObject lines = new JsonObject();
        ServerPlayer victim = helper.makeMockServerPlayerInLevel();
        ServerPlayer killer = helper.makeMockServerPlayerInLevel();
        for (String t : List.of("zap", "zap_fall", "zap_design")) {
            Holder<DamageType> h = access.lookupOrThrow(Registries.DAMAGE_TYPE)
                    .getOrThrow(ResourceKey.create(Registries.DAMAGE_TYPE, Identifier.fromNamespaceAndPath(NS, t)));
            JsonObject e = new JsonObject();
            e.add("alone", describe(new DamageSource(h).getLocalizedDeathMessage(victim)));
            e.add("byPlayer", describe(new DamageSource(h, killer).getLocalizedDeathMessage(victim)));
            lines.add(NS + ":" + t, e);
        }
        ChatType.Bound bound = ChatType.bind(ResourceKey.create(Registries.CHAT_TYPE,
                Identifier.fromNamespaceAndPath(NS, "shout")), access, Component.literal("Ann"))
                .withTargetName(Component.literal("Bob"));
        JsonObject chat = new JsonObject();
        chat.add("chat", describe(bound.decorate(Component.literal("Hello"))));
        chat.add("narration", describe(bound.decorateNarration(Component.literal("Hello"))));
        JsonObject style = new JsonObject();
        Component decorated = bound.decorate(Component.literal("Hello"));
        style.addProperty("bold", decorated.getStyle().isBold());
        chat.add("style", style);
        lines.add(NS + ":shout", chat);
        section.add("lines", lines);
        // The load function ran (minecraft:load).
        Objective load = server.getScoreboard().getObjective("lv_load");
        ReadOnlyScoreInfo loaded = load == null ? null
                : server.getScoreboard().getPlayerScoreInfo(ScoreHolder.forNameOnly("#loaded"), load);
        section.addProperty("loadFunctionScore", loaded == null ? -1 : loaded.value());
        finish(helper, "registries", section, LOOT_POINTS);
    }

    static JsonArray ids(Stream<Identifier> ids) {
        JsonArray out = new JsonArray();
        ids.map(Identifier::toString).filter(s -> s.startsWith(NS + ":")).sorted().forEach(out::add);
        return out;
    }

    @GameTest(maxTicks = 20)
    public void laysOutAdvancements(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        JsonObject section = new JsonObject();
        JsonObject nodes = new JsonObject();
        JsonArray roots = new JsonArray();
        var tree = server.getAdvancements().tree();
        List<String> rootIds = new ArrayList<>();
        tree.roots().forEach(r -> rootIds.add(r.holder().id().toString()));
        rootIds.stream().filter(s -> s.startsWith(NS + ":")).sorted().forEach(roots::add);
        for (AdvancementNode n : tree.nodes()) {
            if (!n.holder().id().getNamespace().equals(NS)) continue;
            JsonObject e = new JsonObject();
            e.addProperty("parent", n.parent() == null ? null : n.parent().holder().id().toString());
            e.addProperty("root", n.root().holder().id().toString());
            JsonArray children = new JsonArray();
            List<String> childIds = new ArrayList<>();
            n.children().forEach(c -> childIds.add(c.holder().id().toString()));
            childIds.stream().sorted().forEach(children::add);
            e.add("children", children);
            n.advancement().display().ifPresentOrElse(d -> {
                e.addProperty("frame", d.type().getSerializedName());
                e.addProperty("hidden", d.hidden());
            }, () -> e.addProperty("display", false));
            // The column (x, the depth among advancements with a display). The row (y) follows the game's own
            // order of siblings, which changes from one server start to the next, so it is not recorded.
            e.addProperty("x", n.x());
            nodes.add(n.holder().id().toString(), e);
        }
        section.add("roots", roots);
        section.add("nodes", nodes);
        finish(helper, "advancements", section, LOOT_POINTS);
    }

    // --- functions ------------------------------------------------------------------------------------------------------

    /** The function cases: name, then the command that runs it (as the player, at the case's spot). */
    static final List<String[]> FUNCTIONS = List.of(
            new String[] {"scores", "function " + NS + ":scores"},
            new String[] {"blocks", "function " + NS + ":blocks"},
            new String[] {"items", "function " + NS + ":items"},
            new String[] {"effects", "function " + NS + ":effects"},
            new String[] {"branch", "function " + NS + ":branch"},
            new String[] {"macro", "function " + NS + ":macro {n:7,item:\"emerald\",count:2}"},
            new String[] {"calls", "function " + NS + ":calls"});

    @GameTest(structure = ARENA, maxTicks = 20)
    public void runsFunctions(GameTestHelper helper) {
        ServerLevel level = helper.getLevel();
        MinecraftServer server = level.getServer();
        JsonObject section = new JsonObject();
        for (String[] c : FUNCTIONS) {
            BlockPos origin = helper.absolutePos(new BlockPos(2, 1, 5));
            clearBox(level, origin);
            ServerPlayer player = helper.makeMockServerPlayerInLevel();
            player.getInventory().clearContent();
            player.removeAllEffects();
            CommandSourceStack source = op(player.createCommandSourceStack().withPosition(Vec3.atBottomCenterOf(origin)));
            // Mock players may share a name, so their scores are reset between cases.
            run(server, source, "scoreboard players reset @s");
            run(server, source, c[1]);
            JsonObject out = new JsonObject();
            out.addProperty("run", c[1]);
            out.addProperty("as", "minecraft:player");
            out.add("observed", observe(server, level, player, origin));
            section.add(c[0], out);
            clearBox(level, origin);
            player.discard();
        }
        finish(helper, "functions", section, LOOT_POINTS);
    }

    /** Clears the box the functions build in (x 0 to 5, y 0 to 2, z -1 to 1 from the spot) to air. */
    static void clearBox(ServerLevel level, BlockPos origin) {
        for (BlockPos p : BlockPos.betweenClosed(origin.offset(0, 0, -1), origin.offset(5, 2, 1))) {
            level.setBlockAndUpdate(p, Blocks.AIR.defaultBlockState());
        }
    }

    static JsonObject observe(MinecraftServer server, ServerLevel level, ServerPlayer player, BlockPos origin) {
        JsonObject out = new JsonObject();
        JsonObject scores = new JsonObject();
        for (Objective o : server.getScoreboard().getObjectives()) {
            if (!o.getName().startsWith("lv_") || o.getName().equals("lv_pred") || o.getName().equals("lv_load")) continue;
            ReadOnlyScoreInfo info = server.getScoreboard().getPlayerScoreInfo(player, o);
            if (info != null) scores.addProperty(o.getName(), info.value());
        }
        out.add("scores", scores);
        JsonArray tags = new JsonArray();
        player.entityTags().stream().filter(t -> t.startsWith("lv_")).sorted().forEach(tags::add);
        out.add("tags", tags);
        Map<String, Integer> inventory = new TreeMap<>();
        for (int i = 0; i < player.getInventory().getContainerSize(); i++) {
            ItemStack s = player.getInventory().getItem(i);
            if (!s.isEmpty()) inventory.merge(BuiltInRegistries.ITEM.getKey(s.getItem()).toString(), s.getCount(), Integer::sum);
        }
        JsonObject inv = new JsonObject();
        inventory.forEach(inv::addProperty);
        out.add("inventory", inv);
        JsonObject effects = new JsonObject();
        for (MobEffectInstance e : player.getActiveEffects()) {
            JsonObject o = new JsonObject();
            o.addProperty("amplifier", e.getAmplifier());
            o.addProperty("particles", e.isVisible());
            effects.add(e.getEffect().unwrapKey().map(k -> k.identifier().toString()).orElse("?"), o);
        }
        out.add("effects", effects);
        JsonObject blocks = new JsonObject();
        for (BlockPos p : BlockPos.betweenClosed(origin.offset(0, 0, -1), origin.offset(5, 2, 1))) {
            var state = level.getBlockState(p);
            if (state.isAir()) continue;
            BlockPos d = p.subtract(origin);
            blocks.addProperty(d.getX() + "," + d.getY() + "," + d.getZ(),
                    BuiltInRegistries.BLOCK.getKey(state.getBlock()).toString());
        }
        out.add("blocks", blocks);
        return out;
    }

    // --- shared -----------------------------------------------------------------------------------------------------

    static CommandSourceStack op(CommandSourceStack source) {
        return source.withPermission(LevelBasedPermissionSet.GAMEMASTER).withSuppressedOutput();
    }

    static void run(MinecraftServer server, CommandSourceStack source, String command) {
        server.getCommands().performPrefixedCommand(source, command);
    }

    static Holder<Enchantment> enchantment(MinecraftServer server, String id) {
        return server.registryAccess().lookupOrThrow(Registries.ENCHANTMENT)
                .getOrThrow(ResourceKey.create(Registries.ENCHANTMENT, Identifier.parse(id)));
    }

    static Container chest(ServerLevel level, BlockPos pos) {
        level.setBlockAndUpdate(pos, Blocks.CHEST.defaultBlockState());
        Container chest = (Container) level.getBlockEntity(pos);
        chest.clearContent();
        return chest;
    }

    static String at(BlockPos p) {
        return p.getX() + " " + p.getY() + " " + p.getZ();
    }

    static JsonObject entity(String type) {
        JsonObject e = new JsonObject();
        e.addProperty("type", type);
        return e;
    }

    static JsonObject itemSample(String id) {
        JsonObject e = new JsonObject();
        e.addProperty("id", id);
        e.addProperty("count", 1);
        return e;
    }

    static JsonObject block(String id) {
        JsonObject e = new JsonObject();
        e.addProperty("id", id);
        return e;
    }

    static void log(String line) {
        System.out.println("[msm live views parity] " + line);
    }

    // --- recording and checking -------------------------------------------------------------------------------------

    /** Writes the section (update mode) or checks it against the expectations, then ends the test. */
    static void finish(GameTestHelper helper, String name, JsonObject measured, double points) {
        String file = System.getenv(EXPECTATIONS_ENV);
        helper.assertTrue(file != null && !file.isBlank(), EXPECTATIONS_ENV + " is not set; run the parity build's"
                + " liveViewsParity task");
        String target = target();
        try {
            if (System.getenv(UPDATE_ENV) != null && !System.getenv(UPDATE_ENV).isBlank()) {
                writeSection(Path.of(file), target, name, measured);
                log("wrote " + target + " " + name + " (" + measured.size() + " cases)");
                helper.succeed();
                return;
            }
            JsonObject root = JsonParser.parseString(Files.readString(Path.of(file), StandardCharsets.UTF_8))
                    .getAsJsonObject();
            JsonObject targets = root.getAsJsonObject("targets");
            JsonObject section = targets == null || !targets.has(target) ? null
                    : targets.getAsJsonObject(target).getAsJsonObject(name);
            helper.assertTrue(section != null, "expectations.json has no " + name + " section for " + target
                    + "; run the parity build's liveViewsParity task with -PupdateLiveViewsParity");
            List<String> problems = new ArrayList<>();
            compare(name, section, measured, points, problems);
            helper.assertTrue(problems.isEmpty(), "the real game differs from expectations.json (" + target + " "
                    + name + "): " + String.join("; ", problems.subList(0, Math.min(problems.size(), 8)))
                    + (problems.size() > 8 ? "; and " + (problems.size() - 8) + " more" : ""));
            log("checked " + target + " " + name + " (" + measured.size() + " cases)");
            helper.succeed();
        } catch (IOException e) {
            throw new IllegalStateException("expectations.json: " + e, e);
        }
    }

    static String target() {
        String fromEnv = System.getenv(TARGET_ENV);
        if (fromEnv != null && !fromEnv.isBlank()) return fromEnv;
        throw new IllegalStateException(TARGET_ENV + " is not set; run the parity build's liveViewsParity task");
    }

    /**
     * The rates of random outcomes (rolls, predicate tests, enchanting picks) may differ by {@link #allowed}; all other
     * values must be equal.
     */
    static void compare(String path, JsonElement expected, JsonElement measured, double points, List<String> problems) {
        if (expected.isJsonObject() && measured.isJsonObject()) {
            JsonObject e = expected.getAsJsonObject();
            JsonObject m = measured.getAsJsonObject();
            if (e.has("rolls") && e.has("items") && m.has("rolls")) {
                compareRolls(path, e, m, points, problems);
                return;
            }
            if (e.has("tests") && e.has("yes") && m.has("tests") && e.get("tests").getAsInt() > 1) {
                checkRate(path, e.get("yes").getAsInt(), e.get("tests").getAsInt(), m.get("yes").getAsInt(),
                        m.get("tests").getAsInt(), points, problems);
                compare(path + ".situation", e.get("situation"), m.get("situation"), points, problems);
                return;
            }
            if (e.has("draws") && e.has("picksAtCost")) {
                int n = e.get("draws").getAsInt();
                JsonObject ep = e.getAsJsonObject("picksAtCost");
                JsonObject mp = m.getAsJsonObject("picksAtCost");
                Set<String> costs = new TreeSet<>(ep.keySet());
                costs.addAll(mp.keySet());
                for (String cost : costs) {
                    JsonObject ec = ep.has(cost) ? ep.getAsJsonObject(cost) : new JsonObject();
                    JsonObject mc = mp.has(cost) ? mp.getAsJsonObject(cost) : new JsonObject();
                    Set<String> keys = new TreeSet<>(ec.keySet());
                    keys.addAll(mc.keySet());
                    for (String k : keys) {
                        checkRate(path + ".picksAtCost." + cost + "." + k, ec.has(k) ? ec.get(k).getAsInt() : 0, n,
                                mc.has(k) ? mc.get(k).getAsInt() : 0, m.get("draws").getAsInt(), points, problems);
                    }
                }
                return;
            }
            Set<String> keys = new TreeSet<>(e.keySet());
            keys.addAll(m.keySet());
            for (String k : keys) {
                if (!e.has(k)) problems.add(path + "." + k + ": not expected");
                else if (!m.has(k)) problems.add(path + "." + k + ": missing");
                else compare(path + "." + k, e.get(k), m.get(k), points, problems);
            }
            return;
        }
        if (!expected.equals(measured)) {
            // Numbers that are the same value written differently (5 and 5.0) are equal.
            if (expected.isJsonPrimitive() && measured.isJsonPrimitive() && expected.getAsJsonPrimitive().isNumber()
                    && measured.getAsJsonPrimitive().isNumber()
                    && expected.getAsDouble() == measured.getAsDouble()) {
                return;
            }
            String text = measured.toString();
            problems.add(path + ": expected " + expected + ", measured " + (text.length() > 200 ? text.substring(0, 200)
                    + "..." : text));
        }
    }

    static void compareRolls(String path, JsonObject e, JsonObject m, double points, List<String> problems) {
        compare(path + ".table", e.get("table"), m.get("table"), points, problems);
        compare(path + ".situation", e.get("situation"), m.get("situation"), points, problems);
        int en = e.get("rolls").getAsInt();
        int mn = m.get("rolls").getAsInt();
        JsonObject ei = e.getAsJsonObject("items");
        JsonObject mi = m.getAsJsonObject("items");
        Set<String> items = new TreeSet<>(ei.keySet());
        items.addAll(mi.keySet());
        for (String item : items) {
            JsonObject ec = ei.has(item) ? ei.getAsJsonObject(item) : new JsonObject();
            JsonObject mc = mi.has(item) ? mi.getAsJsonObject(item) : new JsonObject();
            Set<String> counts = new TreeSet<>(ec.keySet());
            counts.addAll(mc.keySet());
            for (String count : counts) {
                // An item never seen counts as "0 of it" in every roll.
                int expectedRolls = ec.has(count) ? ec.get(count).getAsInt() : (ec.size() == 0 && count.equals("0") ? en : 0);
                int measuredRolls = mc.has(count) ? mc.get(count).getAsInt() : (mc.size() == 0 && count.equals("0") ? mn : 0);
                checkRate(path + ".items." + item + "." + count, expectedRolls, en, measuredRolls, mn, points, problems);
            }
        }
        JsonObject ee = e.has("enchantments") ? e.getAsJsonObject("enchantments") : new JsonObject();
        JsonObject me = m.has("enchantments") ? m.getAsJsonObject("enchantments") : new JsonObject();
        Set<String> enchantments = new TreeSet<>(ee.keySet());
        enchantments.addAll(me.keySet());
        for (String k : enchantments) {
            checkRate(path + ".enchantments." + k, ee.has(k) ? ee.get(k).getAsInt() : 0, en,
                    me.has(k) ? me.get(k).getAsInt() : 0, mn, points, problems);
        }
    }

    static void checkRate(String path, int expectedHits, int expectedN, int measuredHits, int measuredN, double points,
            List<String> problems) {
        double a = expectedHits / (double) expectedN;
        double b = measuredHits / (double) measuredN;
        double limit = allowed(a, expectedN, b, measuredN, points);
        if (Math.abs(a - b) > limit) {
            problems.add(String.format(java.util.Locale.ROOT, "%s: %.4f expected, %.4f measured (allowed %.4f)", path,
                    a, b, limit));
        }
    }

    /**
     * The allowed difference between two measured rates: the plan's points (2L1), or five standard deviations of the
     * difference of two samples of these sizes where that is larger (two runs of the game differ by chance as well).
     */
    static double allowed(double a, int n1, double b, int n2, double points) {
        double p = (a * n1 + b * n2) / (n1 + n2);
        double sd = Math.sqrt(p * (1 - p) * (1.0 / n1 + 1.0 / n2));
        return Math.max(points, 5 * sd);
    }

    /** Writes one section of this target into the expectations file (sorted keys, two-space indents). */
    static synchronized void writeSection(Path file, String target, String name, JsonObject measured)
            throws IOException {
        JsonObject root = Files.isRegularFile(file)
                ? JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject()
                : new JsonObject();
        root.addProperty("format", FORMAT);
        root.addProperty("about", "Measured by LiveViewsDataParityTest on the real game (ADR 0120 D9, B607): what each"
                + " target's server did with the files of fixtures/live-views. loot, mined, killed: tables rolled "
                + ROLLS + " times by loot insert; items are counts of rolls by the total of each item key (the item id,"
                + " and worn=<damage in twentieths of the durability> when damaged); enchantments are rolls with"
                + " each id=level on a stack. exploded: " + EXPLOSIONS + " explosions of the block. predicates: tests"
                + " and yes answers by execute if predicate. modifiers: the stack before and after item modify."
                + " tags: members as the registry resolved them (null when the tag did not load). functions: what a"
                + " mock player and the box at its spot (x 0 to 5, y 0 to 2, z -1 to 1) held after the run."
                + " Every case has the situation it was measured in, in @msm/sim's Situation shape. Rates may differ"
                + " by 2 points (3 for explosions) or five standard deviations of the difference, whichever is"
                + " larger. Rewritten by the parity build's liveViewsParity task with -PupdateLiveViewsParity;"
                + " never edited by hand.");
        root.addProperty("rolls", ROLLS);
        root.addProperty("explosions", EXPLOSIONS);
        JsonObject targets = root.has("targets") ? root.getAsJsonObject("targets") : new JsonObject();
        JsonObject section = targets.has(target) ? targets.getAsJsonObject(target) : new JsonObject();
        section.add(name, measured);
        targets.add(target, section);
        root.add("targets", targets);
        StringBuilder out = new StringBuilder();
        WorldgenParityTest.writeJson(out, root, 0);
        out.append('\n');
        if (file.getParent() != null) Files.createDirectories(file.getParent());
        Files.writeString(file, out.toString(), StandardCharsets.UTF_8);
    }
}
