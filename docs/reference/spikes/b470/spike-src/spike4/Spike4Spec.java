package dev.mcsupermods.runtime.gametest.spike4;

/**
 * B470 spike (throwaway): one test fluid. {@code tint} is null for no tint source; {@code copyVanilla} copies the
 * vanilla liquid's drag, fall distance multiplier and fog on 26.4 (Fluid.Properties getters, observation only); {@code effects}
 * makes the fluid's own entityInside apply EXTINGUISH (water) or LAVA_IGNITE and lavaHurt (lava).
 */
public record Spike4Spec(String path, String behaves, int tickDelay, int slope, int dropOff, boolean infinite, int light,
        Integer tint, float resistance, boolean copyVanilla, boolean effects) {
}
