package dev.mcsupermods.runtime.gametest;

import java.util.Optional;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.block.sounds.BlockSoundSet;
import net.minecraft.world.level.block.sounds.BlockSoundSets;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Version seam for the runtime GameTests (ADR 0038 D2): whether a block state sounds like an mcdoc {@code sound_type}.
 * 26.4: compares {@code getSounds()} with the {@code block_sound_set} key of the same name
 * ({@code amethyst} is {@code amethyst_block}). Knows only the sound types the tests use.
 */
final class BlockSoundCheck {
    private BlockSoundCheck() {}

    static boolean hasSound(BlockState state, String msmSoundType) {
        return state.getSounds().equals(Optional.of(soundSet(msmSoundType)));
    }

    private static ResourceKey<BlockSoundSet> soundSet(String msmSoundType) {
        return switch (msmSoundType) {
            case "stone" -> BlockSoundSets.STONE;
            case "amethyst" -> BlockSoundSets.AMETHYST_BLOCK;
            default -> throw new IllegalArgumentException("No test mapping for sound_type " + msmSoundType);
        };
    }
}
