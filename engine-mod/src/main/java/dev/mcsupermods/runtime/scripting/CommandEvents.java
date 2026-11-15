package dev.mcsupermods.runtime.scripting;

import com.google.gson.JsonObject;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.resources.Identifier;

/**
 * Fires the script event {@code command} (Script API 1.6, ADR 0096 D1, D4) when a project command runs:
 * {@code MsmCommands.run} calls it after the command's function and event, before its feedback. The event names the
 * command by its definition id and its name (the primary literal, also when an alias was typed), the source entity
 * (none for the console or a command block) and the arguments as {@code MsmCommands} read them: numbers, strings and
 * booleans, {@code players} as an array of names, positions as arrays of three numbers.
 */
public final class CommandEvents {
    private CommandEvents() {}

    /**
     * Fires the {@code command} event for the command {@code commandId} (named {@code name}) run by {@code source};
     * returns whether a script handles the event (whether any handler ran). Server thread only.
     */
    public static boolean fire(Identifier commandId, String name, CommandSourceStack source, JsonObject arguments) {
        ScriptHost host = ScriptHost.current();
        if (host == null || host.server() != source.getServer() || !host.handles(ScriptEvents.COMMAND_EVENT)) {
            return false;
        }
        host.fire(ScriptEvents.COMMAND_EVENT, new ScriptEvents.Command(source.getLevel(), commandId.toString(), name,
                source.getEntity(), arguments.deepCopy()));
        return true;
    }
}
