package dev.mcsupermods.parity;

import net.minecraft.world.level.block.SoundType;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Version seam for the parity GameTests (ADR 0038 D2): whether a block state sounds like an mcdoc {@code sound_type}.
 * 26.3: compares {@code getSoundType()} with the vanilla {@link SoundType} constant of the same name.
 * Knows only the sound types the tests use.
 */
final class ParitySounds {
    private ParitySounds() {}

    static boolean hasSound(BlockState state, String msmSoundType) {
        return state.getSoundType() == soundType(msmSoundType);
    }

    private static SoundType soundType(String msmSoundType) {
        return switch (msmSoundType) {
            case "stone" -> SoundType.STONE;
            case "wood" -> SoundType.WOOD;
            case "glass" -> SoundType.GLASS;
            case "grass" -> SoundType.GRASS;
            default -> throw new IllegalArgumentException("No test mapping for sound_type " + msmSoundType);
        };
    }
}
