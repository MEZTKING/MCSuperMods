package dev.mcsupermods.runtime.gametest;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.tree.ArgumentCommandNode;
import com.mojang.brigadier.tree.CommandNode;
import dev.mcsupermods.runtime.commands.CommandArguments;
import dev.mcsupermods.runtime.commands.CommandBuilder;
import dev.mcsupermods.runtime.loader.CommandParser;
import dev.mcsupermods.runtime.loader.CommandParser.Argument;
import dev.mcsupermods.runtime.loader.CommandParser.Command;
import dev.mcsupermods.runtime.registry.MsmCreativeTabs;
import dev.mcsupermods.runtime.scripting.ScriptHost;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandBuildContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.synchronization.ArgumentTypeInfos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.item.CreativeModeTab;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for the 32 argument types of ADR 0111 D2 (as amended after B525; plan B533) and the tab hand order of D7. Every
 * type is built by {@link CommandArguments#type} into four test commands on a fresh dispatcher (eight arguments each, the
 * most a definition takes), run as typed, and each argument's macro value and script value is checked; every type must be
 * one the game can send to players' command trees ({@code ArgumentTypeInfos}). The definition {@code cmd_types}
 * ({@code /msm_types <dimension> <time> <team colour> <hex colour> <rotation> <biome or tag> <game mode> [int range]},
 * function {@code msm_test:cmd/types} copying the macros into storage {@code msm_test:b533_out}) runs the real path:
 * {@code MsmCommands}, the function's macros and the {@code command} script event (logged by api16.js). The tab
 * {@code tab_hand} ({@code by_hand}: {@code tab_n3}, {@code minecraft:emerald}, {@code tab_n1}, an unknown id and the
 * emerald again; no members of its own) is built on the server as the client does.
 */
public class MsmCommand2GameTest {
    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    private static void eq(GameTestHelper helper, Object actual, Object expected, String message) {
        helper.assertTrue(Objects.equals(actual, expected), message + ": expected <" + expected + ">, got <" + actual + ">");
    }

    /** As the server's own command trees get it: the registries with the loot tables (for {@code loot_table}). */
    private static CommandBuildContext buildContext(MinecraftServer server) {
        return CommandBuildContext.simple(server.reloadableRegistries().lookup(), server.getWorldData().enabledFeatures());
    }

    /** A test command {@code name} with one argument per {@code types} entry, named {@code a0}, {@code a1}, ... */
    private static Command command(GameTestHelper helper, String name, String... types) {
        StringBuilder json = new StringBuilder("{\"format\":1,\"name\":\"" + name + "\",\"arguments\":[");
        for (int i = 0; i < types.length; i++) {
            json.append(i == 0 ? "" : ",").append("{\"name\":\"a").append(i).append("\",\"type\":\"").append(types[i]).append("\"}");
        }
        json.append("]}");
        var parsed = CommandParser.parse(JsonParser.parseString(json.toString()));
        helper.assertTrue(parsed.definition().isPresent(), "test command " + name + ": " + parsed.errors());
        return parsed.definition().get();
    }

    /** What a run of a test command handed on: the macro tag and the script JSON. */
    private record Values(CompoundTag macros, JsonObject json) {}

    /** Runs {@code input} on a fresh dispatcher holding only {@code def}, as {@code MsmCommands.run} reads the arguments. */
    private static Values run(GameTestHelper helper, Command def, CommandSourceStack source, String input) {
        MinecraftServer server = helper.getLevel().getServer();
        CommandDispatcher<CommandSourceStack> dispatcher = new CommandDispatcher<>();
        Values values = new Values(new CompoundTag(), new JsonObject());
        dispatcher.register(CommandBuilder.build(def.name(), def, buildContext(server), (context, present) -> {
            for (int i = 0; i < present; i++) {
                CommandArguments.put(context, def.arguments().get(i), values.macros(), values.json());
            }
            return 1;
        }));
        try {
            int result = dispatcher.execute(input, source);
            eq(helper, result, 1, "result of " + input);
        } catch (Exception e) {
            throw new AssertionError("'" + input + "' failed: " + e.getMessage(), e);
        }
        return values;
    }

    /** The JSON text of argument {@code a<i>}. */
    private static String json(Values v, int i) {
        return String.valueOf(v.json().get("a" + i));
    }

    private static String macro(Values v, int i) {
        return v.macros().getStringOr("a" + i, "<missing>");
    }

    /** Each of the 32 types builds, and the game can send it to a player's command tree. */
    @GameTest
    public void everyNewTypeReachesTheClientTree(GameTestHelper helper) {
        CommandBuildContext context = buildContext(helper.getLevel().getServer());
        List<String> problems = new ArrayList<>();
        int built = 0;
        for (CommandParser.ArgumentType type : CommandParser.ArgumentType.values()) {
            if (type.ordinal() < CommandParser.ArgumentType.DIMENSION.ordinal()) {
                continue;
            }
            Argument arg = new Argument("x", type, java.util.Optional.empty(), java.util.Optional.empty(), false);
            try {
                ArgumentType<?> brigadier = CommandArguments.type(arg, context);
                if (!ArgumentTypeInfos.isClassRecognized(brigadier.getClass())) {
                    problems.add(type.serialName() + ": " + brigadier.getClass().getName() + " is not sent to clients");
                } else {
                    ArgumentTypeInfos.unpack(brigadier);
                }
                built++;
            } catch (RuntimeException e) {
                problems.add(type.serialName() + ": " + e);
            }
        }
        eq(helper, problems, List.of(), "argument types");
        eq(helper, built, 32, "types built");
        // The real tree: /msm_types's argument nodes.
        CommandNode<CommandSourceStack> node = helper.getLevel().getServer().getCommands().getDispatcher().getRoot().getChild("msm_types");
        helper.assertTrue(node != null, "/msm_types is not registered");
        int nodes = 0;
        while (!node.getChildren().isEmpty()) {
            node = node.getChildren().iterator().next();
            if (node instanceof ArgumentCommandNode<CommandSourceStack, ?> arg) {
                helper.assertTrue(ArgumentTypeInfos.isClassRecognized(arg.getType().getClass()), arg.getName() + " is not sent to clients");
                nodes++;
            }
        }
        eq(helper, nodes, 8, "argument nodes of /msm_types");
        helper.succeed();
    }

    /** Every new type hands on its value: the macro value and the script value of ADR 0111 D2. */
    @GameTest
    public void everyNewTypeHandsOnItsValue(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533cmd", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL)) {
            ServerPlayer p = r.player();
            CommandSourceStack source = p.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER).withSuppressedOutput();
            server.getCommands().performPrefixedCommand(source, "scoreboard objectives add b533obj dummy");
            server.getCommands().performPrefixedCommand(source, "team add b533team");
            try {
                String uuid = "dd12be42-52a9-4a91-a8a1-11c01849e498";
                Values a = run(helper, command(helper, "b533_a", "dimension", "time", "team_colour", "hex_colour", "rotation", "angle", "uuid",
                        "objective"), source, "b533_a minecraft:the_nether 3d red FF8800 90 0 -90 " + uuid + " b533obj");
                Map<String, String> got = new LinkedHashMap<>();
                got.put("dimension", macro(a, 0) + " | " + json(a, 0));
                got.put("time", a.macros().getIntOr("a1", -1) + " | " + json(a, 1));
                got.put("team_colour", macro(a, 2) + " | " + json(a, 2));
                got.put("hex_colour", macro(a, 3) + " | " + json(a, 3));
                got.put("rotation", macro(a, 4) + " | " + json(a, 4));
                got.put("angle", a.macros().getFloatOr("a5", 0) + " | " + json(a, 5));
                got.put("uuid", macro(a, 6) + " | " + json(a, 6));
                got.put("objective", macro(a, 7) + " | " + json(a, 7));
                Values b = run(helper, command(helper, "b533_b", "score_holder", "score_holders", "item_predicate", "block_predicate", "effect",
                        "enchantment", "biome", "biome_or_tag"), source,
                        "b533_b Alex @s #minecraft:logs minecraft:stone minecraft:speed minecraft:sharpness minecraft:plains #minecraft:is_forest");
                got.put("score_holder", macro(b, 0) + " | " + json(b, 0));
                got.put("score_holders", macro(b, 1) + " | " + json(b, 1));
                got.put("item_predicate", macro(b, 2) + " | " + json(b, 2));
                got.put("block_predicate", macro(b, 3) + " | " + json(b, 3));
                got.put("effect", macro(b, 4) + " | " + json(b, 4));
                got.put("enchantment", macro(b, 5) + " | " + json(b, 5));
                got.put("biome", macro(b, 6) + " | " + json(b, 6));
                got.put("biome_or_tag", macro(b, 7) + " | " + json(b, 7));
                Values c = run(helper, command(helper, "b533_c", "structure", "structure_or_tag", "entity_type", "particle", "game_mode",
                        "text_component", "int_range", "identifier"), source,
                        "b533_c minecraft:village_plains #minecraft:village minecraft:pig minecraft:dust{color:[1.0,0.0,0.0],scale:1.0} creative"
                                + " {text:\"hi\",color:\"gold\"} 1..5 msm_test:thing");
                got.put("structure", macro(c, 0) + " | " + json(c, 0));
                got.put("structure_or_tag", macro(c, 1) + " | " + json(c, 1));
                got.put("entity_type", macro(c, 2) + " | " + json(c, 2));
                got.put("particle", macro(c, 3) + " | " + json(c, 3));
                got.put("game_mode", macro(c, 4) + " | " + json(c, 4));
                got.put("text_component", macro(c, 5) + " | " + json(c, 5));
                got.put("int_range", macro(c, 6) + " | " + json(c, 6));
                got.put("identifier", macro(c, 7) + " | " + json(c, 7));
                Values d = run(helper, command(helper, "b533_d", "team", "slot", "nbt", "dialog", "loot_table", "advancement", "recipe",
                        "message"), source, "b533_d b533team hotbar.3 {a:1b,b:\"x\"} msm_test:b533_hello minecraft:chests/simple_dungeon"
                                + " msm_test:b533/granted minecraft:oak_planks hello @s");
                got.put("team", macro(d, 0) + " | " + json(d, 0));
                got.put("slot", macro(d, 1) + " | " + json(d, 1));
                got.put("nbt", macro(d, 2) + " | " + json(d, 2));
                got.put("dialog", macro(d, 3) + " | " + json(d, 3));
                got.put("loot_table", macro(d, 4) + " | " + json(d, 4));
                got.put("advancement", macro(d, 5) + " | " + json(d, 5));
                got.put("recipe", macro(d, 6) + " | " + json(d, 6));
                got.put("message", macro(d, 7) + " | " + json(d, 7));
                Map<String, String> expected = new LinkedHashMap<>();
                expected.put("dimension", "minecraft:the_nether | \"minecraft:the_nether\"");
                expected.put("time", "72000 | 72000");
                expected.put("team_colour", "red | \"red\"");
                expected.put("hex_colour", "#FF8800 | \"#FF8800\"");
                expected.put("rotation", "90.0 0.0 | [90.0,0.0]");
                expected.put("angle", "-90.0 | -90.0");
                expected.put("uuid", uuid + " | \"" + uuid + "\"");
                expected.put("objective", "b533obj | \"b533obj\"");
                expected.put("score_holder", "Alex | \"Alex\"");
                expected.put("score_holders", "b533cmd | [\"b533cmd\"]");
                expected.put("item_predicate", "#minecraft:logs | \"#minecraft:logs\"");
                expected.put("block_predicate", "minecraft:stone | \"minecraft:stone\"");
                expected.put("effect", "minecraft:speed | \"minecraft:speed\"");
                expected.put("enchantment", "minecraft:sharpness | \"minecraft:sharpness\"");
                expected.put("biome", "minecraft:plains | \"minecraft:plains\"");
                expected.put("biome_or_tag", "#minecraft:is_forest | \"#minecraft:is_forest\"");
                expected.put("structure", "minecraft:village_plains | \"minecraft:village_plains\"");
                expected.put("structure_or_tag", "#minecraft:village | \"#minecraft:village\"");
                expected.put("entity_type", "minecraft:pig | \"minecraft:pig\"");
                expected.put("particle", "minecraft:dust | \"minecraft:dust\"");
                expected.put("game_mode", "creative | \"creative\"");
                expected.put("text_component", "{text:\"hi\",color:\"gold\"} | \"hi\"");
                expected.put("int_range", "1..5 | {\"min\":1,\"max\":5}");
                expected.put("identifier", "msm_test:thing | \"msm_test:thing\"");
                expected.put("team", "b533team | \"b533team\"");
                expected.put("slot", "hotbar.3 | \"hotbar.3\"");
                expected.put("nbt", "{a:1b,b:\"x\"} | \"{a:1b,b:\\\"x\\\"}\"");
                expected.put("dialog", "msm_test:b533_hello | \"msm_test:b533_hello\"");
                expected.put("loot_table", "minecraft:chests/simple_dungeon | \"minecraft:chests/simple_dungeon\"");
                expected.put("advancement", "msm_test:b533/granted | \"msm_test:b533/granted\"");
                expected.put("recipe", "minecraft:oak_planks | \"minecraft:oak_planks\"");
                expected.put("message", "hello b533cmd | \"hello b533cmd\"");
                List<String> wrong = new ArrayList<>();
                expected.forEach((type, want) -> {
                    if (!want.equals(got.get(type))) {
                        wrong.add(type + ": expected <" + want + ">, got <" + got.get(type) + ">");
                    }
                });
                eq(helper, wrong, List.of(), "values");
                eq(helper, got.size(), 32, "types checked");
            } finally {
                server.getCommands().performPrefixedCommand(source, "scoreboard objectives remove b533obj");
                server.getCommands().performPrefixedCommand(source, "team remove b533team");
            }
        }
        helper.succeed();
    }

    /** An unknown structure, an unknown advancement and a missing objective are refused when the command runs. */
    @GameTest
    public void keyTypesAreCheckedWhenTheCommandRuns(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533keys", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL)) {
            CommandSourceStack source = r.player().createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER)
                    .withSuppressedOutput();
            Command def = command(helper, "b533_keys", "structure");
            CommandDispatcher<CommandSourceStack> dispatcher = new CommandDispatcher<>();
            boolean[] ran = new boolean[1];
            dispatcher.register(CommandBuilder.build(def.name(), def, buildContext(server), (context, present) -> {
                CommandArguments.put(context, def.arguments().get(0), new CompoundTag(), new JsonObject());
                ran[0] = true;
                return 1;
            }));
            boolean refused = false;
            try {
                dispatcher.execute("b533_keys msm_test:no_such_structure", source);
            } catch (Exception e) {
                refused = true;
            }
            helper.assertTrue(refused && !ran[0], "an unknown structure was taken");
        }
        helper.succeed();
    }

    /**
     * The project command {@code /msm_types} takes the new types: its function gets the macro values (storage
     * {@code msm_test:b533_out}) and the {@code command} script event gets the arguments.
     */
    @GameTest
    public void aProjectCommandTakesTheNewTypes(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        try (RecordingPlayers.Recorded r = RecordingPlayers.join(helper, "b533types", new Vec3(2.5, 1, 2.5), GameType.SURVIVAL)) {
            ServerPlayer p = r.player();
            CommandSourceStack source = p.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER).withSuppressedOutput();
            server.getCommands().performPrefixedCommand(source, "msm_types minecraft:the_nether 20s red FF8800 90 0 #minecraft:is_forest creative 2..");
            CompoundTag out = server.getCommandStorage().get(Identifier.fromNamespaceAndPath("msm_test", "b533_out"));
            Map<String, String> got = new LinkedHashMap<>();
            for (String key : List.of("dim", "time", "colour", "hex", "rot", "biome", "mode")) {
                got.put(key, out.getStringOr(key, "<missing>"));
            }
            eq(helper, got, Map.of("dim", "minecraft:the_nether", "time", "400", "colour", "red", "hex", "#FF8800", "rot", "90.0 0.0", "biome",
                    "#minecraft:is_forest", "mode", "creative"), "macro values");
            ScriptHost host = ScriptHost.current();
            helper.assertTrue(host != null, "no ScriptHost");
            String prefix = "msm_test:api16: command msm_test:cmd_types msm_types " + p.getStringUUID() + " ";
            String line = ScriptLogs.of(host).stream().filter(l -> l.startsWith(prefix)).reduce((x, y) -> y).orElse(null);
            eq(helper, line == null ? null : line.substring(prefix.length()), "{\"dim\":\"minecraft:the_nether\",\"time\":400,\"colour\":\"red\","
                    + "\"hex\":\"#FF8800\",\"rot\":[90,0],\"biome\":\"#minecraft:is_forest\",\"mode\":\"creative\",\"range\":{\"min\":2}} true",
                    "the command event's args");
        }
        helper.succeed();
    }

    // ---- creative tab, by hand (ADR 0111 D7) ----------------------------------------------------------

    /** {@code tab_hand} shows its listed items in order: a listed id twice shows once, an unknown id is left out and warns. */
    @GameTest
    public void aTabByHandListsItsItemsInOrder(GameTestHelper helper) {
        MinecraftServer server = helper.getLevel().getServer();
        CreativeModeTab tab = BuiltInRegistries.CREATIVE_MODE_TAB.getValue(id("tab_hand"));
        helper.assertTrue(tab != null, "tab_hand not registered");
        tab.buildContents(new CreativeModeTab.ItemDisplayParameters(server.getWorldData().enabledFeatures(), true, server.registryAccess()));
        eq(helper, tab.getDisplayItems().stream().map(ItemStack::getItem).map(BuiltInRegistries.ITEM::getKey).toList(),
                List.of(id("tab_n3"), Identifier.withDefaultNamespace("emerald"), id("tab_n1")), "tab_hand contents");
        helper.assertTrue(MsmCreativeTabs.lastWarnings().stream().anyMatch(w -> w.contains("msm_test:tab_hand") && w.contains("msm_test:no_such_item")),
                "no warning for the unknown item: " + MsmCreativeTabs.lastWarnings());
        helper.succeed();
    }

    /** The hand order itself: listed members first (their own stacks), listed non-members as new stacks, then the rest. */
    @GameTest
    public void handOrderPutsTheListFirst(GameTestHelper helper) {
        ItemStack stone = new ItemStack(Items.STONE);
        ItemStack dirt = new ItemStack(Items.DIRT);
        ItemStack emeralds = new ItemStack(Items.EMERALD, 2);
        List<ItemStack> members = List.of(stone, dirt, emeralds);
        List<ItemStack> ordered = MsmCreativeTabs.handOrder(members, List.of(Identifier.withDefaultNamespace("emerald"),
                Identifier.withDefaultNamespace("diamond"), id("no_such_item"), Identifier.withDefaultNamespace("stone"),
                Identifier.withDefaultNamespace("emerald")));
        eq(helper, ordered.size(), 4, "stacks");
        helper.assertTrue(ordered.get(0) == emeralds, "the member's own emerald stack first");
        helper.assertTrue(ordered.get(1).is(Items.DIAMOND), "a listed non-member second");
        helper.assertTrue(ordered.get(2) == stone && ordered.get(3) == dirt, "then stone (listed) and dirt (not listed)");
        eq(helper, members.size(), 3, "the members are not changed");
        helper.succeed();
    }
}
