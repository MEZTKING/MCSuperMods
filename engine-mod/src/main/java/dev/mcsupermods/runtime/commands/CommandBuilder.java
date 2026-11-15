package dev.mcsupermods.runtime.commands;

import com.mojang.brigadier.builder.ArgumentBuilder;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.builder.RequiredArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import dev.mcsupermods.runtime.loader.CommandParser.Argument;
import dev.mcsupermods.runtime.loader.CommandParser.Command;
import java.util.List;
import net.minecraft.commands.CommandBuildContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.server.permissions.PermissionCheck;

/**
 * Builds one literal's Brigadier tree for a command definition (ADR 0096 D1), as the eject's {@code ModCommands} does:
 * the literal, {@code requires} the permission level when it is above 0, then one argument node per argument in order;
 * every node from the last required argument on runs the command with the number of arguments given (optional arguments
 * only come at the end, checked by {@code CommandParser}).
 */
public final class CommandBuilder {
    /** Runs a command given the first {@code present} arguments. */
    @FunctionalInterface
    public interface Runner {
        int run(CommandContext<CommandSourceStack> context, int present) throws CommandSyntaxException;
    }

    /** {@code Commands.LEVEL_*} by permission level 0..4. */
    private static final List<PermissionCheck> LEVELS = List.of(Commands.LEVEL_ALL, Commands.LEVEL_MODERATORS, Commands.LEVEL_GAMEMASTERS,
            Commands.LEVEL_ADMINS, Commands.LEVEL_OWNERS);

    private CommandBuilder() {}

    /** The tree of {@code literal} (the definition's name or one of its aliases). */
    public static LiteralArgumentBuilder<CommandSourceStack> build(String literal, Command def, CommandBuildContext buildContext, Runner runner) {
        LiteralArgumentBuilder<CommandSourceStack> root = Commands.literal(literal);
        if (def.permission() > 0) {
            root.requires(Commands.hasPermission(LEVELS.get(def.permission())));
        }
        List<Argument> args = def.arguments();
        int lastRequired = -1;
        for (int i = 0; i < args.size(); i++) {
            if (!args.get(i).optional()) {
                lastRequired = i;
            }
        }
        ArgumentBuilder<CommandSourceStack, ?> chain = null;
        for (int i = args.size() - 1; i >= 0; i--) {
            Argument arg = args.get(i);
            RequiredArgumentBuilder<CommandSourceStack, ?> node = Commands.argument(arg.name(), CommandArguments.type(arg, buildContext));
            if (chain != null) {
                node.then(chain);
            }
            if (i >= lastRequired) {
                int present = i + 1;
                node.executes(context -> runner.run(context, present));
            }
            chain = node;
        }
        if (chain != null) {
            root.then(chain);
        }
        if (lastRequired < 0) {
            root.executes(context -> runner.run(context, 0));
        }
        return root;
    }
}
