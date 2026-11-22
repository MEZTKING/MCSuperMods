package dev.mcsupermods.runtime.gametest.spike5;

import static dev.mcsupermods.runtime.gametest.spike5.B525Help.R;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.ParseResults;
import com.mojang.brigadier.tree.ArgumentCommandNode;
import com.mojang.brigadier.tree.CommandNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import net.fabricmc.fabric.api.gametest.v1.GameTest;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.gametest.framework.GameTestHelper;
import net.minecraft.network.protocol.Packet;
import net.minecraft.network.protocol.game.ClientboundSystemChatPacket;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Blocks;

/**
 * B525 spike (throwaway), X30: every candidate argument type of {@code /b525arg} run by a player through
 * {@code Commands.performPrefixedCommand} (the path a typed command takes), with the value the command read, the chat
 * feedback or error the player got, and the argument node's type class on the server tree. Project content: the
 * spike's dialog and advancement.
 */
public class X30ArgumentGameTest {
    /** Type, then the inputs tried. */
    static final Map<String, List<String>> INPUTS = new LinkedHashMap<>();

    static {
        INPUTS.put("dimension", List.of("minecraft:the_nether", "msm_b525:nowhere"));
        INPUTS.put("time", List.of("3d", "20s", "5", "1.5t"));
        INPUTS.put("team_colour", List.of("red", "light_purple"));
        INPUTS.put("hex_colour", List.of("FF8800"));
        INPUTS.put("rotation", List.of("~10 ~-5", "90 0"));
        INPUTS.put("angle", List.of("~45", "-90"));
        INPUTS.put("uuid", List.of("dd12be42-52a9-4a91-a8a1-11c01849e498"));
        INPUTS.put("objective", List.of("b525obj", "missing_objective"));
        INPUTS.put("score_holder", List.of("@s", "Alex"));
        INPUTS.put("score_holders", List.of("*", "@a"));
        INPUTS.put("item_predicate", List.of("#minecraft:logs", "minecraft:diamond[minecraft:damage=0]"));
        INPUTS.put("block_predicate", List.of("#minecraft:logs", "minecraft:stone"));
        INPUTS.put("effect", List.of("minecraft:speed", "msm_b525:nope"));
        INPUTS.put("enchantment", List.of("minecraft:sharpness"));
        INPUTS.put("biome", List.of("minecraft:plains"));
        INPUTS.put("biome_or_tag", List.of("#minecraft:is_forest", "minecraft:desert"));
        INPUTS.put("structure", List.of("minecraft:village_plains", "msm_b525:nope"));
        INPUTS.put("structure_or_tag", List.of("#minecraft:village", "minecraft:stronghold"));
        INPUTS.put("entity_type", List.of("minecraft:pig"));
        INPUTS.put("particle", List.of("minecraft:flame", "minecraft:dust{color:[1.0,0.0,0.0],scale:1.0}"));
        INPUTS.put("game_mode", List.of("creative"));
        INPUTS.put("text", List.of("{text:\"hi\",color:\"gold\"}", "\"plain\""));
        INPUTS.put("int_range", List.of("1..5", "3"));
        INPUTS.put("identifier", List.of("msm_b525:thing"));
        INPUTS.put("team", List.of("b525team"));
        INPUTS.put("slot", List.of("hotbar.3", "armor.head"));
        INPUTS.put("nbt", List.of("{a:1b,b:\"x\"}"));
        INPUTS.put("message", List.of("hello there @s"));
        INPUTS.put("dialog", List.of("msm_b525:hello", "{type:\"minecraft:notice\",title:\"inline\"}"));
        INPUTS.put("loot_table", List.of("minecraft:chests/simple_dungeon"));
        INPUTS.put("advancement", List.of("msm_b525:spike/ate"));
        INPUTS.put("recipe", List.of("minecraft:oak_planks"));
    }

    static List<String> chat(List<Packet<?>> packets) {
        List<String> out = new ArrayList<>();
        for (Packet<?> p : packets) {
            if (p instanceof ClientboundSystemChatPacket chat) {
                out.add(chat.content().getString());
            }
        }
        return out;
    }

    @GameTest(maxTicks = 40)
    public void x30Arguments(GameTestHelper helper) {
        Map<String, Object> m = new LinkedHashMap<>();
        MinecraftServer server = helper.getLevel().getServer();
        helper.setBlock(new BlockPos(2, 0, 2), Blocks.OAK_LOG);
        try (B525Help.Ears ears = new B525Help.Ears(helper, new BlockPos(2, 1, 2), GameType.CREATIVE, "Typist")) {
            CommandSourceStack source = ears.player.createCommandSourceStack().withPermission(LevelBasedPermissionSet.GAMEMASTER);
            server.getCommands().performPrefixedCommand(source, "scoreboard objectives add b525obj dummy");
            server.getCommands().performPrefixedCommand(source, "team add b525team");
            ears.packets();
            CommandDispatcher<CommandSourceStack> dispatcher = server.getCommands().getDispatcher();
            CommandNode<CommandSourceStack> root = dispatcher.getRoot().getChild("b525arg");
            m.put("registeredTypes", List.copyOf(B525Mod.TYPES));
            m.put("commandBuilds", B525Mod.COMMAND_BUILDS.get());
            INPUTS.forEach((type, inputs) -> R.section("X30." + type, () -> {
                Map<String, Object> t = new LinkedHashMap<>();
                CommandNode<CommandSourceStack> lit = root == null ? null : root.getChild(type);
                CommandNode<CommandSourceStack> arg = lit == null ? null : lit.getChild("value");
                t.put("serverType", arg instanceof ArgumentCommandNode<?, ?> a ? a.getType().getClass().getName() : "missing");
                for (String input : inputs) {
                    String cmd = "b525arg " + type + " " + input;
                    ParseResults<CommandSourceStack> parsed = dispatcher.parse(cmd, source);
                    String parseErr = parsed.getExceptions().isEmpty() ? (parsed.getReader().canRead() ? "unread: " + parsed.getReader().getRemaining() : "")
                            : parsed.getExceptions().toString();
                    B525Mod.ARGS.remove(type);
                    server.getCommands().performPrefixedCommand(source, cmd);
                    t.put(input, "value " + B525Mod.ARGS.get(type) + (parseErr.isEmpty() ? "" : " | parse " + parseErr) + " | chat "
                            + chat(ears.packets()));
                }
                m.put(type, t);
            }));
        }
        R.put("X30", m);
        helper.succeed();
    }
}
