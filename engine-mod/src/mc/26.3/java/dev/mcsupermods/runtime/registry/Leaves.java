package dev.mcsupermods.runtime.registry;

import net.minecraft.world.level.block.sounds.AmbientLeavesBlockSoundPlayer;

/**
 * Version seam (ADR 0038 D2, ADR 0068 D6, D8): the "no ambient sound" argument of the leaves constructors
 * ({@code LeavesBlock}, {@code UntintedParticleLeavesBlock}); project leaves have no ambient sounds (ADR 0068 D9).
 * 26.3: the parameter is an {@link AmbientLeavesBlockSoundPlayer}; vanilla's tinted leaves pass
 * {@code AmbientLeavesBlockSoundPlayer.noAmbientSound()} (checked with {@code javap}, 2026-11-14).
 */
public final class Leaves {
    private Leaves() {}

    public static final AmbientLeavesBlockSoundPlayer NO_AMBIENT_SOUND = AmbientLeavesBlockSoundPlayer.noAmbientSound();
}
