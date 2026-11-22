package dev.mcsupermods.runtime.commands;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.arguments.BoolArgumentType;
import com.mojang.brigadier.arguments.DoubleArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import dev.mcsupermods.runtime.loader.CommandParser.Argument;
import java.util.Collection;
import java.util.stream.Collectors;
import net.minecraft.commands.CommandBuildContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.commands.arguments.blocks.BlockStateArgument;
import net.minecraft.commands.arguments.coordinates.BlockPosArgument;
import net.minecraft.commands.arguments.coordinates.Vec3Argument;
import net.minecraft.commands.arguments.item.ItemArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.phys.Vec3;

/**
 * The Brigadier argument type of each of MSM's twelve argument kinds and the values a running command hands on (ADR 0096
 * D1, D6). The types follow {@code TargetFacts.commands.argumentTypes} (B444; the same on 26.3 and 26.4): integer
 * {@code brigadier:integer}, number {@code brigadier:double}, word and text {@code brigadier:string} (word, greedy),
 * boolean {@code brigadier:bool}, player, players and entity {@code minecraft:entity} (single player, players, single
 * entity), position {@code minecraft:vec3}, block_position {@code minecraft:block_pos}, item {@code minecraft:item_stack}
 * and block {@code minecraft:block_state}.
 *
 * <p>Macro values (the function's {@code $(name)}), exactly as the 26.3 eject's {@code ModCommands} (B457): integer an
 * int tag, number a double tag, word and text the text (raw: no quote or backslash is escaped, as vanilla macros), boolean
 * a byte tag, player the player's name, entity the entity's UUID, players the names separated by spaces, position {@code "x y z"} as
 * doubles, block_position {@code "x y z"} as integers, item and block the registry id (the components and block state
 * properties given are not passed). A left-out optional argument has no value.
 *
 * <p>Script values (the {@code command} event's {@code args}, JSON): the same values with JSON types: numbers, strings
 * and booleans; {@code player} the player's UUID (not the name); {@code players} an array of names; positions an array
 * of three numbers.
 */
public final class CommandArguments {
    private CommandArguments() {}

    /** The Brigadier type of {@code arg}; {@code min} and {@code max} bound integers (truncated) and numbers. */
    public static ArgumentType<?> type(Argument arg, CommandBuildContext buildContext) {
        return switch (arg.type()) {
            case INTEGER -> arg.min().isEmpty() && arg.max().isEmpty() ? IntegerArgumentType.integer()
                    : IntegerArgumentType.integer(arg.min().map(d -> (int) (double) d).orElse(Integer.MIN_VALUE),
                            arg.max().map(d -> (int) (double) d).orElse(Integer.MAX_VALUE));
            case NUMBER -> arg.min().isEmpty() && arg.max().isEmpty() ? DoubleArgumentType.doubleArg()
                    : DoubleArgumentType.doubleArg(arg.min().orElse(-Double.MAX_VALUE), arg.max().orElse(Double.MAX_VALUE));
            case WORD -> StringArgumentType.word();
            case TEXT -> StringArgumentType.greedyString();
            case BOOLEAN -> BoolArgumentType.bool();
            case PLAYER -> EntityArgument.player();
            case PLAYERS -> EntityArgument.players();
            case ENTITY -> EntityArgument.entity();
            case POSITION -> Vec3Argument.vec3();
            case BLOCK_POSITION -> BlockPosArgument.blockPos();
            case ITEM -> ItemArgument.item(buildContext);
            case BLOCK -> BlockStateArgument.block(buildContext);
            // ADR 0111 D2's types are in the format since B527; B533 builds them.
            default -> throw new UnsupportedOperationException("argument type '" + arg.type().serialName()
                    + "' is not built by this runtime yet");
        };
    }

    /** Puts {@code arg}'s macro value into {@code macros} and its script value into {@code json}. */
    public static void put(CommandContext<CommandSourceStack> context, Argument arg, CompoundTag macros, JsonObject json)
            throws CommandSyntaxException {
        String name = arg.name();
        switch (arg.type()) {
            case INTEGER -> {
                int value = IntegerArgumentType.getInteger(context, name);
                macros.putInt(name, value);
                json.addProperty(name, value);
            }
            case NUMBER -> {
                double value = DoubleArgumentType.getDouble(context, name);
                macros.putDouble(name, value);
                json.addProperty(name, value);
            }
            case WORD, TEXT -> {
                String value = StringArgumentType.getString(context, name);
                macros.putString(name, value);
                json.addProperty(name, value);
            }
            case BOOLEAN -> {
                boolean value = BoolArgumentType.getBool(context, name);
                macros.putBoolean(name, value);
                json.addProperty(name, value);
            }
            case PLAYER -> {
                // The macro gets the name, not the UUID: vanilla commands such as give refuse a UUID for a player
                // (B464a). The script event keeps the UUID (Script API 1.6 documents it).
                ServerPlayer player = EntityArgument.getPlayer(context, name);
                macros.putString(name, player.getName().getString());
                json.addProperty(name, player.getStringUUID());
            }
            case ENTITY -> {
                String value = EntityArgument.getEntity(context, name).getStringUUID();
                macros.putString(name, value);
                json.addProperty(name, value);
            }
            case PLAYERS -> {
                Collection<ServerPlayer> players = EntityArgument.getPlayers(context, name);
                macros.putString(name, players.stream().map(p -> p.getName().getString()).collect(Collectors.joining(" ")));
                JsonArray names = new JsonArray();
                players.forEach(p -> names.add(p.getName().getString()));
                json.add(name, names);
            }
            case POSITION -> {
                Vec3 pos = Vec3Argument.getVec3(context, name);
                macros.putString(name, pos.x + " " + pos.y + " " + pos.z);
                json.add(name, triple(pos.x, pos.y, pos.z));
            }
            case BLOCK_POSITION -> {
                BlockPos pos = BlockPosArgument.getBlockPos(context, name);
                macros.putString(name, pos.getX() + " " + pos.getY() + " " + pos.getZ());
                json.add(name, triple(pos.getX(), pos.getY(), pos.getZ()));
            }
            case ITEM -> {
                String value = BuiltInRegistries.ITEM.getKey(ItemArgument.getItem(context, name).item().value()).toString();
                macros.putString(name, value);
                json.addProperty(name, value);
            }
            case BLOCK -> {
                String value = BuiltInRegistries.BLOCK.getKey(BlockStateArgument.getBlock(context, name).getState().getBlock()).toString();
                macros.putString(name, value);
                json.addProperty(name, value);
            }
        }
    }

    private static JsonArray triple(double x, double y, double z) {
        JsonArray out = new JsonArray();
        out.add(x);
        out.add(y);
        out.add(z);
        return out;
    }

    private static JsonArray triple(int x, int y, int z) {
        JsonArray out = new JsonArray();
        out.add(x);
        out.add(y);
        out.add(z);
        return out;
    }
}
