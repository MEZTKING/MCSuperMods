package dev.mcsupermods.runtime.gametest;

import java.util.Objects;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SignBlock;

/**
 * Version seam for the runtime GameTests (ADR 0038 D2, ADR 0094 D6): a project sign's own wood type copies the sounds of
 * its {@code wood_type} (B446 needs no runtime seam for it: {@code WoodTypeBuilder.copyOf(...).build(...)} is the same
 * source on both versions). 26.4-snapshot-7: the wood type holds {@code block_sound_set} keys
 * ({@code blockSoundSet()}, {@code hangingSignSoundSet()}), and the blocks sound as vanilla's sign of that wood.
 */
final class FurnitureSeamCheck {
    private FurnitureSeamCheck() {}

    /** A problem with the signs' sounds, or null. */
    static String problem(SignBlock sign, Block vanillaSign, SignBlock hanging, Block vanillaHanging) {
        var own = sign.type();
        var base = ((SignBlock) vanillaSign).type();
        if (!Objects.equals(own.blockSoundSet(), base.blockSoundSet()) || !Objects.equals(own.hangingSignSoundSet(), base.hangingSignSoundSet())) {
            return "sign wood type sounds " + own.blockSoundSet() + " differ from " + base.name() + "'s " + base.blockSoundSet();
        }
        var hangingBase = ((SignBlock) vanillaHanging).type();
        if (!Objects.equals(hanging.type().hangingSignSoundSet(), hangingBase.hangingSignSoundSet())) {
            return "hanging sign wood type sounds differ from " + hangingBase.name() + "'s";
        }
        if (!Objects.equals(sign.defaultBlockState().getSounds(), vanillaSign.defaultBlockState().getSounds())) {
            return "the sign block sounds as " + sign.defaultBlockState().getSounds() + ", not as " + base.name();
        }
        if (!Objects.equals(hanging.defaultBlockState().getSounds(), vanillaHanging.defaultBlockState().getSounds())) {
            return "the hanging sign block sounds as " + hanging.defaultBlockState().getSounds() + ", not as " + hangingBase.name();
        }
        return null;
    }
}
