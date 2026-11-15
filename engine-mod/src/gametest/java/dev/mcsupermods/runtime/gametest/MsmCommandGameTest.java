package dev.mcsupermods.runtime.gametest;

import com.mojang.brigadier.ParseResults;
import com.mojang.brigadier.tree.CommandNode;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.commands.MsmCommands;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSource;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.Tag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.contents.TranslatableContents;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.EntityTypes;
import net.minecraft.world.entity.decoration.ArmorStand;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.GameType;
import net.minecraft.world.phys.Vec3;

/**
 * GameTests for project commands (ADR 0096 D1; B454). Definitions in {@code msm/msm_test/command/}: {@code cmd_args_a}
 * ({@code /msm_args_a <i 1..64> <n> <w> <b> <p> <e>}, function {@code msm_test:cmd/args_a}) and {@code cmd_args_b}
 * ({@code /msm_args_b <ps> <pos> <bp> <it> <bl> <t...>}) copy every macro value into storage {@code msm_test:cmd_out};
 * {@code cmd_event} ({@code /msm_event}, actions on self and other, a function tagging {@code @s}); {@code cmd_op}
 * (permission 2, aliases {@code msm_op_alias} and {@code msm_op_other}, feedback); {@code cmd_optional} (an optional
 * second argument); {@code cmd_script} (neither function nor event); {@code cmd_clash} (name {@code give}, alias
 * {@code msm_clash_ok}); {@code cmd_zdup} (name {@code msm_op_alias}, which {@code cmd_op} has); {@code cmd_broken}
 * (an invalid name). Commands run through {@code Commands.performPrefixedCommand}, as typed in chat; a source's messages
 * are recorded with {@code withSource}. Storage keys are per test, so tests running together never share one.
 */
public class MsmCommandGameTest {
    private static final Identifier OUT = Identifier.fromNamespaceAndPath("msm_test", "cmd_out");
    /** The macro storage of the test mod's commands, {@code <mod id>:args}. */
    private static final Identifier ARGS = Identifier.fromNamespaceAndPath("msm_runtime_gametest", "args");

    private static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath("msm_test", path);
    }

    /** Records what a command source is told. */
    private static final class Recorder implements CommandSource {
        final List<Component> messages = new ArrayList<>();

        @Override
        public void sendSystemMessage(Component message) {
            messages.add(message);
        }

        @Override
        public boolean acceptsSuccess() {
            return true;
        }

        @Override
        public boolean acceptsFailure() {
            return true;
        }

        @Override
        public boolean shouldInformAdmins() {
            return false;
        }

        boolean saidKey(String key) {
            return messages.stream().anyMatch(m -> m.getContents() instanceof TranslatableContents t && t.getKey().equals(key));
        }
    }

    @SuppressWarnings("removal") // the only GameTestHelper player that is in the level; no replacement in 26.3
    private static ServerPlayer player(GameTestHelper helper) {
        ServerPlayer player = helper.makeMockServerPlayerInLevel();
        player.snapTo(helper.absoluteVec(new Vec3(1.5, 1, 1.5)));
        player.setGameMode(GameType.SURVIVAL);
        return player;
    }

    private static MinecraftServer server(GameTestHelper helper) {
        return helper.getLevel().getServer();
    }

    private static void run(CommandSourceStack source, String command) {
        source.getServer().getCommands().performPrefixedCommand(source, command);
    }

    private static CompoundTag out(GameTestHelper helper) {
        return server(helper).getCommandStorage().get(OUT);
    }

    private static String outString(GameTestHelper helper, String key) {
        return out(helper).getStringOr(key, "<missing>");
    }

    private static void clear(GameTestHelper helper, String... keys) {
        CompoundTag tag = out(helper);
        for (String key : keys) {
            tag.remove(key);
        }
        server(helper).getCommandStorage().set(OUT, tag);
    }

    private static CommandSourceStack gamemaster(ServerPlayer player, Recorder recorder) {
        return player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER).withSource(recorder);
    }

    private static void remove(GameTestHelper helper, ServerPlayer player) {
        server(helper).getPlayerList().remove(player);
    }

    /** Integer, number, word, boolean, player and entity reach the function as macro values (and the storage as tags). */
    @GameTest
    public void argumentsReachTheFunctionAsMacrosA(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        ArmorStand stand = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(2.5, 1, 2.5));
        clear(helper, "i", "n", "w", "b", "p", "e");
        Recorder recorder = new Recorder();
        // A UUID is no player selector (it may name any entity): the player is picked by a tag. Mock players share a name.
        player.addTag("msm_cmd_a");
        String who = "@a[tag=msm_cmd_a,limit=1]";
        run(gamemaster(player, recorder), "msm_args_a 5 2.5 hello true " + who + " " + stand.getStringUUID());
        helper.assertValueEqual(outString(helper, "i"), "5", "integer macro " + recorder.messages);
        helper.assertValueEqual(outString(helper, "n"), "2.5", "number macro");
        helper.assertValueEqual(outString(helper, "w"), "hello", "word macro");
        helper.assertValueEqual(outString(helper, "b"), "1", "boolean macro (a byte)");
        helper.assertValueEqual(outString(helper, "p"), player.getStringUUID(), "player macro (UUID)");
        helper.assertValueEqual(outString(helper, "e"), stand.getStringUUID(), "entity macro (UUID)");
        CompoundTag args = server(helper).getCommandStorage().get(ARGS);
        helper.assertValueEqual(args.get("i").getId(), Tag.TAG_INT, "integer as an int tag");
        helper.assertValueEqual(args.get("n").getId(), Tag.TAG_DOUBLE, "number as a double tag");
        helper.assertValueEqual(args.get("b").getId(), Tag.TAG_BYTE, "boolean as a byte tag");
        // Out of range: Brigadier refuses the command before it runs.
        clear(helper, "i");
        run(gamemaster(player, recorder), "msm_args_a 65 2.5 hello true " + who + " " + stand.getStringUUID());
        helper.assertValueEqual(outString(helper, "i"), "<missing>", "65 is above max 64");
        remove(helper, player);
        helper.succeed();
    }

    /** Players, position, block position, item, block and text reach the function as macro values. */
    @GameTest
    public void argumentsReachTheFunctionAsMacrosB(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        clear(helper, "ps", "pos", "bp", "it", "bl", "t");
        Recorder recorder = new Recorder();
        player.addTag("msm_cmd_b");
        String who = "@a[tag=msm_cmd_b]";
        run(gamemaster(player, recorder), "msm_args_b " + who
                + " 1.5 64 -2.25 3 70 -4 minecraft:diamond_sword[minecraft:damage=3] minecraft:oak_stairs[facing=east] hello there world");
        helper.assertValueEqual(outString(helper, "ps"), player.getName().getString(), "players macro (names) " + recorder.messages);
        helper.assertValueEqual(outString(helper, "pos"), "1.5 64.0 -2.25", "position macro (doubles)");
        helper.assertValueEqual(outString(helper, "bp"), "3 70 -4", "block position macro (integers)");
        helper.assertValueEqual(outString(helper, "it"), "minecraft:diamond_sword", "item macro (the id)");
        helper.assertValueEqual(outString(helper, "bl"), "minecraft:oak_stairs", "block macro (the id)");
        helper.assertValueEqual(outString(helper, "t"), "hello there world", "text macro (the rest of the line)");
        // Macro text is raw (as vanilla's and the eject's): quotes reach the storage unescaped.
        run(gamemaster(player, recorder), "msm_args_b " + who + " 0 0 0 0 0 0 minecraft:stone minecraft:stone say \"hi\" \\o/");
        helper.assertValueEqual(server(helper).getCommandStorage().get(ARGS).getStringOr("t", ""), "say \"hi\" \\o/", "raw text");
        remove(helper, player);
        helper.succeed();
    }

    /** Several players: their names separated by spaces. */
    @GameTest
    public void playersAreNamesSeparatedBySpaces(GameTestHelper helper) {
        ServerPlayer a = player(helper);
        ServerPlayer b = player(helper);
        a.addTag("msm_cmd_crowd");
        b.addTag("msm_cmd_crowd");
        Recorder recorder = new Recorder();
        run(gamemaster(a, recorder), "msm_args_b @a[tag=msm_cmd_crowd] 0 0 0 0 0 0 minecraft:stone minecraft:stone x");
        String names = server(helper).getCommandStorage().get(ARGS).getStringOr("ps", "");
        // Mock players share one name.
        helper.assertValueEqual(names, a.getName().getString() + " " + b.getName().getString(), "both names");
        remove(helper, a);
        remove(helper, b);
        helper.succeed();
    }

    /**
     * {@code execute as} with two entities runs the command twice; each function call gets its own values, although both
     * share the storage {@code <mod id>:args} (measured: the queued {@code function ... with storage} runs before the next
     * fork writes the storage).
     */
    @GameTest
    public void forkedRunsKeepTheirOwnValues(GameTestHelper helper) {
        ArmorStand a = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(1.5, 1, 1.5));
        ArmorStand b = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(3.5, 1, 3.5));
        a.addTag("msm_cmd_race");
        b.addTag("msm_cmd_race");
        clear(helper, "race");
        run(server(helper).createCommandSourceStack().withSuppressedOutput(), "execute as @e[tag=msm_cmd_race] at @s run msm_race ~ ~ ~");
        List<String> got = out(helper).getListOrEmpty("race").stream().map(t -> t.asString().orElse("")).sorted().toList();
        List<String> expected = java.util.stream.Stream.of(a, b).map(e -> e.blockPosition())
                .map(p -> p.getX() + " " + p.getY() + " " + p.getZ()).sorted().toList();
        helper.assertValueEqual(got, expected, "one value per fork");
        helper.succeed();
    }

    /** The event's actions run with the player as self and other; its function runs as the player. */
    @GameTest
    public void eventRunsWithThePlayerAsSelf(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        run(player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.ALL), "msm_event");
        helper.assertTrue(player.hasEffect(MobEffects.GLOWING), "apply_effect self");
        helper.assertTrue(player.hasEffect(MobEffects.SLOWNESS), "apply_effect other (trigger_event)");
        helper.assertTrue(player.getInventory().countItem(Items.DIAMOND) == 1, "give_item to the player");
        helper.assertTrue(player.entityTags().contains("msm_cmd_self"), "run_function as the player");
        remove(helper, player);
        helper.succeed();
    }

    /** Run as another entity ({@code execute as}), that entity is self; from the console nothing has a self. */
    @GameTest
    public void eventRunsWithTheSourceEntityAsSelf(GameTestHelper helper) {
        ArmorStand stand = helper.spawn(EntityTypes.ARMOR_STAND, new Vec3(2.5, 1, 2.5));
        CommandSourceStack console = server(helper).createCommandSourceStack().withSuppressedOutput();
        run(console, "execute as " + stand.getStringUUID() + " run msm_event");
        helper.assertTrue(stand.hasEffect(MobEffects.GLOWING), "apply_effect self on the entity");
        helper.assertTrue(stand.hasEffect(MobEffects.SLOWNESS), "apply_effect other on the entity");
        helper.assertTrue(stand.entityTags().contains("msm_cmd_self"), "run_function as the entity");
        run(console.withPosition(helper.absoluteVec(new Vec3(4.5, 1, 4.5))), "msm_event"); // no entity: no target, no error
        helper.succeed();
    }

    /** Permission 2 refuses a player without it; with it, the function runs and the feedback is sent. */
    @GameTest
    public void permissionRefusesAndAllows(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        clear(helper, "op");
        Recorder recorder = new Recorder();
        CommandSourceStack plain = player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.ALL).withSource(recorder);
        ParseResults<CommandSourceStack> parsed = server(helper).getCommands().getDispatcher().parse("msm_op", plain);
        helper.assertTrue(parsed.getContext().getNodes().isEmpty(), "a player without permission 2 sees no msm_op");
        run(plain, "msm_op");
        helper.assertValueEqual(outString(helper, "op"), "<missing>", "refused: the function did not run");
        helper.assertFalse(recorder.saidKey("command.msm_test.cmd_op.feedback"), "no feedback when refused");
        run(gamemaster(player, recorder), "msm_op");
        helper.assertValueEqual(outString(helper, "op"), "ran", "the function ran");
        helper.assertTrue(recorder.saidKey("command.msm_test.cmd_op.feedback"), "feedback: " + recorder.messages);
        remove(helper, player);
        helper.succeed();
    }

    /** Every alias runs the command; a project command naming a taken literal loses it. */
    @GameTest
    public void aliasesRunTheSameCommand(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        for (String alias : List.of("msm_op_alias", "msm_op_other")) {
            clear(helper, "op");
            Recorder recorder = new Recorder();
            run(gamemaster(player, recorder), alias);
            helper.assertValueEqual(outString(helper, "op"), "ran", alias + " ran the function");
            helper.assertTrue(recorder.saidKey("command.msm_test.cmd_op.feedback"), alias + " feedback");
        }
        helper.assertTrue(MsmCommands.command(id("cmd_op")).orElseThrow().literals().equals(List.of("msm_op", "msm_op_alias", "msm_op_other")),
                "cmd_op keeps its literals");
        helper.assertTrue(MsmCommands.command(id("cmd_zdup")).isEmpty(), "cmd_zdup has no literal left");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("cmd_zdup") && e.contains("/msm_op_alias") && e.contains("msm_test:cmd_op")),
                "no error for the taken literal: " + errors);
        remove(helper, player);
        helper.succeed();
    }

    /** A left-out optional argument: the command runs from the last required one. */
    @GameTest
    public void optionalArgumentsMayBeLeftOut(GameTestHelper helper) {
        ServerPlayer player = player(helper);
        Recorder recorder = new Recorder();
        clear(helper, "opt");
        run(gamemaster(player, recorder), "msm_optional");
        helper.assertValueEqual(outString(helper, "opt"), "<missing>", "the required argument is missing");
        run(gamemaster(player, recorder), "msm_optional one");
        helper.assertValueEqual(outString(helper, "opt"), "one", "without the optional argument");
        helper.assertFalse(server(helper).getCommandStorage().get(ARGS).contains("b"), "a left-out argument has no value");
        run(gamemaster(player, recorder), "msm_optional two 7");
        helper.assertValueEqual(outString(helper, "opt"), "two", "with the optional argument");
        helper.assertValueEqual(server(helper).getCommandStorage().get(ARGS).getIntOr("b", 0), 7, "the optional value");
        remove(helper, player);
        helper.succeed();
    }

    /** A command with neither function nor event only fires the script event and sends its feedback. */
    @GameTest
    public void scriptOnlyCommandSendsFeedback(GameTestHelper helper) {
        Recorder recorder = new Recorder();
        int[] result = {-1};
        CommandSourceStack source = server(helper).createCommandSourceStack().withSource(recorder)
                .withCallback((success, value) -> result[0] = success ? value : 0);
        run(source, "msm_script");
        helper.assertValueEqual(result[0], 1, "the command's result");
        helper.assertTrue(recorder.saidKey("command.msm_test.cmd_script.feedback"), "feedback: " + recorder.messages);
        helper.succeed();
    }

    /** A literal vanilla already has is a load error; the vanilla command stays and the other literals register. */
    @GameTest
    public void vanillaNameClashIsALoadError(GameTestHelper helper) {
        CommandNode<CommandSourceStack> root = server(helper).getCommands().getDispatcher().getRoot();
        helper.assertTrue(root.getChild("msm_clash_ok") != null, "the clashing command's alias registered");
        helper.assertTrue(MsmCommands.lastRegistrationErrors().stream().anyMatch(e -> e.contains("msm_test:cmd_clash") && e.contains("/give ")),
                "no error for /give: " + MsmCommands.lastRegistrationErrors());
        // /give is still vanilla's: it gives the item.
        ServerPlayer player = player(helper);
        clear(helper, "op");
        run(gamemaster(player, new Recorder()), "give @s minecraft:apple");
        helper.assertTrue(player.getInventory().countItem(Items.APPLE) == 1, "vanilla /give");
        helper.assertValueEqual(outString(helper, "op"), "<missing>", "/give did not run the project function");
        remove(helper, player);
        helper.succeed();
    }

    /**
     * Fabric's {@code CommandRegistrationCallback} runs again whenever vanilla builds a new {@code Commands}, as a
     * {@code /reload} does (B440 S8): every literal is registered again and the clash is found again. A real
     * {@code /reload} would reset the scripts of the tests running alongside ({@link #reloadKeepsTheCommands}).
     */
    @GameTest
    public void newCommandTreesGetTheCommandsAgain(GameTestHelper helper) {
        MinecraftServer server = server(helper);
        Commands fresh = new Commands(Commands.CommandSelection.DEDICATED, Commands.createValidationContext(server.registryAccess()));
        CommandNode<CommandSourceStack> root = fresh.getDispatcher().getRoot();
        for (String literal : List.of("msm_args_a", "msm_args_b", "msm_event", "msm_op", "msm_op_alias", "msm_op_other", "msm_optional",
                "msm_script", "msm_clash_ok", "msm_race")) {
            helper.assertTrue(root.getChild(literal) != null, "/" + literal + " in the new tree");
        }
        helper.assertTrue(root.getChild("give") != null && root.getChild("give") != server.getCommands().getDispatcher().getRoot().getChild("give"),
                "the new tree has its own /give");
        helper.assertTrue(MsmCommands.lastRegistrationErrors().stream().anyMatch(e -> e.contains("/give ")), "the clash is found again");
        helper.succeed();
    }

    /** A real {@code /reload} (manual only: it reloads every test's scripts): the commands are there afterwards. */
    @GameTest(manualOnly = true, maxTicks = 400)
    public void reloadKeepsTheCommands(GameTestHelper helper) {
        MinecraftServer server = server(helper);
        CommandNode<CommandSourceStack> before = server.getCommands().getDispatcher().getRoot();
        run(server.createCommandSourceStack().withSuppressedOutput(), "reload");
        helper.succeedWhen(() -> {
            CommandNode<CommandSourceStack> root = server.getCommands().getDispatcher().getRoot();
            helper.assertTrue(root != before, "not reloaded yet");
            helper.assertTrue(root.getChild("msm_op") != null && root.getChild("msm_clash_ok") != null, "commands after the reload");
        });
    }

    /** The report and log lines: registered commands, refused definitions. */
    @GameTest
    public void reportListsTheCommands(GameTestHelper helper) {
        List<Identifier> commands = MsmRuntime.report().commands();
        List<Identifier> expected = List.of(id("cmd_args_a"), id("cmd_args_b"), id("cmd_clash"), id("cmd_event"), id("cmd_op"), id("cmd_optional"),
                id("cmd_race"), id("cmd_script"));
        helper.assertValueEqual(commands, expected, "registered commands (logged as 'registered 8 command(s)')");
        List<String> errors = MsmRuntime.report().errors();
        helper.assertTrue(errors.stream().anyMatch(e -> e.contains("command/cmd_broken.json") && e.contains("lower case")
                && e.contains("msm_runtime_gametest")), "no error for the bad name: " + errors);
        helper.assertTrue(BuiltInRegistries.ITEM.containsKey(id("tab_zebra")), "sanity");
        helper.succeed();
    }
}
