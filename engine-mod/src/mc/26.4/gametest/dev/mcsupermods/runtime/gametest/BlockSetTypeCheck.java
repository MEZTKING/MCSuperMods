package dev.mcsupermods.runtime.gametest;

import net.minecraft.world.level.block.state.properties.BlockSetType;

/**
 * Version seam for the runtime GameTests (ADR 0038 D2, ADR 0067 D9): the vanilla constant the set type {@code wood}
 * must map to. 26.4-snapshot-7: {@code wood} is {@code DEFAULT_WOOD} (the per-wood oak-like constants are gone; the constructor takes a {@code block_sound_set} key and has no name).
 */
final class BlockSetTypeCheck {
    private BlockSetTypeCheck() {}

    /** The constant's Java name, for messages. */
    static final String WOOD_NAME = "DEFAULT_WOOD";

    static BlockSetType wood() {
        return BlockSetType.DEFAULT_WOOD;
    }
}
