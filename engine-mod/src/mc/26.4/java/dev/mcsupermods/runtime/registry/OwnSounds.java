package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.BlockDefinition;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.block.state.BlockBehaviour;

/**
 * Version seam (ADR 0105 D1, D2 and its amendment after B503): a block's own sound events. 26.4: a stub from B505, B514
 * fills it in (a {@code block_sound_set} entry named by key, fixed per world load).
 */
final class OwnSounds {
    private OwnSounds() {}

    /** The properties with the block's own sounds applied; unchanged until B514. */
    static BlockBehaviour.Properties soundTypeFor(Identifier id, BlockDefinition definition, BlockBehaviour.Properties props) {
        return props;
    }
}
