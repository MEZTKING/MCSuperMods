package dev.mcsupermods.runtime.gametest;

import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.SignBlock;

/**
 * Version seam for the runtime GameTests (ADR 0038 D2, ADR 0094 D6): a project sign's own wood type copies the sounds of
 * its {@code wood_type} (B446 needs no runtime seam for it: {@code WoodTypeBuilder.copyOf(...).build(...)} is the same
 * source on both versions). 26.3: {@code WoodType.soundType()} and {@code hangingSignSoundType()} are {@code SoundType}s,
 * and the blocks sound as vanilla's sign of that wood.
 */
final class FurnitureSeamCheck {
    private FurnitureSeamCheck() {}

    /** A problem with the signs' sounds, or null. */
    static String problem(SignBlock sign, Block vanillaSign, SignBlock hanging, Block vanillaHanging) {
        var own = sign.type();
        var base = ((SignBlock) vanillaSign).type();
        if (own.soundType() != base.soundType() || own.hangingSignSoundType() != base.hangingSignSoundType()) {
            return "sign wood type sounds " + own.soundType() + " differ from " + base.name() + "'s " + base.soundType();
        }
        var hangingBase = ((SignBlock) vanillaHanging).type();
        if (hanging.type().hangingSignSoundType() != hangingBase.hangingSignSoundType()) {
            return "hanging sign wood type sounds differ from " + hangingBase.name() + "'s";
        }
        if (sign.defaultBlockState().getSoundType() != vanillaSign.defaultBlockState().getSoundType()) {
            return "the sign block sounds as " + sign.defaultBlockState().getSoundType() + ", not as " + base.name();
        }
        if (hanging.defaultBlockState().getSoundType() != vanillaHanging.defaultBlockState().getSoundType()) {
            return "the hanging sign block sounds as " + hanging.defaultBlockState().getSoundType() + ", not as " + hangingBase.name();
        }
        return null;
    }
}
