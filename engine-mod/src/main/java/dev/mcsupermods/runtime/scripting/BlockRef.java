package dev.mcsupermods.runtime.scripting;

import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.state.BlockState;

/** {@code BlockRef} (ADR 0032 D2): a block at the time of the event; a snapshot, not a live view. */
public record BlockRef(BlockState state, BlockPos pos) {
    static final ScriptType TYPE = ScriptType.of("BlockRef")
            .constant("id", BlockRef.class, (api, b) -> BuiltInRegistries.BLOCK.getKey(b.state.getBlock()).toString())
            .constant("state", BlockRef.class, (api, b) -> BlockStateParser.serialize(b.state))
            .constant("pos", BlockRef.class, (api, b) -> api.pos(ScriptPos.of(b.pos)));

    public BlockRef {
        pos = pos.immutable();
    }
}
