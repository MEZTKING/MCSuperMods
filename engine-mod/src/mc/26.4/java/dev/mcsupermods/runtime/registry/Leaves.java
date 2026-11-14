package dev.mcsupermods.runtime.registry;

import java.util.Optional;
import net.minecraft.world.level.block.sounds.AmbientLeavesBlockSoundPlayer;

/**
 * Version seam (ADR 0038 D2, ADR 0068 D6, D8): the "no ambient sound" argument of the leaves constructors
 * ({@code LeavesBlock}, {@code UntintedParticleLeavesBlock}); project leaves have no ambient sounds (ADR 0068 D9).
 * 26.4-snapshot-7: the parameter is an {@code Optional}; vanilla's tinted leaves pass {@code Optional.empty()} (checked
 * with {@code javap}, 2026-11-14).
 */
public final class Leaves {
    private Leaves() {}

    public static final Optional<AmbientLeavesBlockSoundPlayer> NO_AMBIENT_SOUND = Optional.empty();
}
