package dev.mcsupermods.runtime.gametest;

import net.minecraft.world.level.block.state.properties.BlockSetType;

/**
 * Version seam for the runtime GameTests (ADR 0038 D2, ADR 0067 D9): the vanilla constant the set type {@code wood}
 * must map to. 26.3: {@code wood} is {@code OAK} (26.3 also has a constant per wood, {@code SPRUCE} to {@code MANGROVE}, which 26.4 dropped).
 */
final class BlockSetTypeCheck {
    private BlockSetTypeCheck() {}

    /** The constant's Java name, for messages. */
    static final String WOOD_NAME = "OAK";

    static BlockSetType wood() {
        return BlockSetType.OAK;
    }
}
