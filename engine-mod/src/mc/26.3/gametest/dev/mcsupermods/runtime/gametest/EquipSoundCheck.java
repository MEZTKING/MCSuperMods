package dev.mcsupermods.runtime.gametest;

import net.minecraft.resources.Identifier;
import net.minecraft.world.item.equipment.Equippable;

/**
 * Version seam for the runtime GameTests (ADR 0038 D2): whether an {@code equippable} component
 * plays a sound event. 26.3: {@code equipSound()} is a {@code Holder<SoundEvent>}.
 */
final class EquipSoundCheck {
    private EquipSoundCheck() {}

    static boolean plays(Equippable equippable, Identifier sound) {
        return equippable.equipSound().is(sound);
    }
}
