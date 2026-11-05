package dev.mcsupermods.runtime.events;

import java.util.List;

/** A named list of actions. */
public record EventDefinition(List<Action> actions) {}
