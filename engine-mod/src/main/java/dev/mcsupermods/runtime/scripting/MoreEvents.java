package dev.mcsupermods.runtime.scripting;

/**
 * The script events of Script API 1.7 that Fabric has an event for: {@code player.slept} and {@code player.woke} through
 * {@code EntitySleepEvents} (ADR 0111 D3 and its amendment after B525). The Mixin-fed events (crafted, picked up, ate,
 * advancement) are the Mixins' own. A stub from B526: B533 fills it in.
 */
public final class MoreEvents {
    private MoreEvents() {}

    /** Registers the listeners; nothing yet. */
    public static void init() {}
}
