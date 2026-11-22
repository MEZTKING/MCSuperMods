package dev.mcsupermods.runtime.gametest;

import java.util.Optional;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.world.level.LevelReader;
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

    /** The sound event a block state plays when placed (from the world's {@code block_sound_set} entry). */
    static Identifier placeSound(LevelReader level, BlockState state) {
        return state.getSounds(level).placeSound().orElseThrow().value().location();
    }

    private static ResourceKey<BlockSoundSet> soundSet(String msmSoundType) {
        return switch (msmSoundType) {
            case "stone" -> BlockSoundSets.STONE;
            case "amethyst" -> BlockSoundSets.AMETHYST_BLOCK;
            case "glow_lichen" -> BlockSoundSets.GLOW_LICHEN;
            default -> throw new IllegalArgumentException("No test mapping for sound_type " + msmSoundType);
        };
    }
}
