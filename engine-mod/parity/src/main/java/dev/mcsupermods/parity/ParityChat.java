package dev.mcsupermods.parity;

import java.util.ArrayList;
import java.util.List;
import net.fabricmc.fabric.api.message.v1.ServerMessageEvents;

/**
 * Records the text of every {@code /say} (and other command chat message) the server
 * broadcasts, through Fabric API's {@link ServerMessageEvents#COMMAND_MESSAGE}. The sample mods'
 * {@code run_function} actions run functions that {@code say} a line, so a test observes the
 * function through this vanilla effect alone. Server thread only.
 */
final class ParityChat {
    private static final List<String> MESSAGES = new ArrayList<>();
    private static boolean registered;

    private ParityChat() {}

    /** Registers the listener once; called from the test classes' static initialisers. */
    static synchronized void register() {
        if (registered) {
            return;
        }
        registered = true;
        ServerMessageEvents.COMMAND_MESSAGE.register((message, source, params) ->
                MESSAGES.add(message.decoratedContent().getString()));
    }

    /** How many messages were recorded so far; pass it to {@link #since}. */
    static int mark() {
        return MESSAGES.size();
    }

    /** The messages recorded after {@code mark}. */
    static List<String> since(int mark) {
        return List.copyOf(MESSAGES.subList(Math.min(mark, MESSAGES.size()), MESSAGES.size()));
    }
}
