package dev.mcsupermods.runtime.events;

import net.minecraft.resources.Identifier;

/** Observes events as they run; used by GameTests and diagnostics. */
public interface EventListener {
    default void onEvent(Identifier owner, Identifier event, int depth, EventContext ctx) {}

    default void onAction(Identifier owner, Identifier event, Action action, EventContext ctx) {}
}
