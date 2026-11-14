package dev.mcsupermods.parity;

import java.util.Optional;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.sounds.BlockSoundSet;
import net.minecraft.world.level.block.sounds.BlockSoundSets;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Version seam for the parity GameTests (ADR 0038 D2): whether a block state sounds like an mcdoc {@code sound_type}.
 * 26.4: compares {@code getSounds()} with the {@code block_sound_set} key of the same name
 * ({@code amethyst} is {@code amethyst_block}). Knows only the sound types the tests use.
 */
final class ParitySounds {
    private ParitySounds() {}

    static boolean hasSound(BlockState state, String msmSoundType) {
        return state.getSounds().equals(Optional.of(soundSet(msmSoundType)));
    }

    private static ResourceKey<BlockSoundSet> soundSet(String msmSoundType) {
        return switch (msmSoundType) {
            case "stone" -> BlockSoundSets.STONE;
            case "wood" -> BlockSoundSets.WOOD;
            case "glass" -> BlockSoundSets.GLASS;
            case "grass" -> BlockSoundSets.GRASS;
            default -> throw new IllegalArgumentException("No test mapping for sound_type " + msmSoundType);
        };
    }
}
