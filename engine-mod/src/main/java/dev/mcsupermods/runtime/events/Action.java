package dev.mcsupermods.runtime.events;

import net.minecraft.resources.Identifier;

/** One action of an event (ADR 0025 D4). The spike implements two of the six types. */
public sealed interface Action {
    record PlaySound(Identifier sound, float volume, float pitch) implements Action {}

    record GiveItem(Identifier item, int count) implements Action {}
}
