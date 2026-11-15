package dev.mcsupermods.runtime.scripting;

/**
 * Fires the script event {@code command} when a player runs a project command (ADR 0096 D1). A stub until B455 (the body)
 * and B454 (the calls): it fires nothing.
 */
public final class CommandEvents {
    private CommandEvents() {}

    /**
     * Fires the {@code command} event for the command {@code commandId} with the arguments as JSON text; returns whether
     * a script handled it. The signature is a placeholder that B455 may widen.
     */
    public static boolean fire(String commandId, String argumentsJson) {
        return false;
    }
}
