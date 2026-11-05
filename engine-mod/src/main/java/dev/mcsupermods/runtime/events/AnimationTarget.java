package dev.mcsupermods.runtime.events;

/**
 * An entity that can play a named animation. Implemented by the runtime's entity driver class, so
 * that the event runner never refers to GeckoLib types; without GeckoLib it plays nothing.
 */
public interface AnimationTarget {
    void playAnimation(String controller, String animation);
}
