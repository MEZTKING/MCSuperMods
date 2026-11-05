package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.BlockDefinition;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.BlockHitResult;

/** Driver class for every {@code msm/<ns>/block/*.json} definition. */
public class MsmBlock extends Block {
    private final Identifier id;
    private final BlockDefinition definition;

    public MsmBlock(Identifier id, BlockDefinition definition, Properties properties) {
        super(properties);
        this.id = id;
        this.definition = definition;
    }

    public BlockDefinition definition() {
        return definition;
    }

    @Override
    protected InteractionResult useWithoutItem(BlockState state, Level level, BlockPos pos, Player player, BlockHitResult hit) {
        if (definition.onInteract() == null) {
            return InteractionResult.PASS;
        }
        if (level instanceof ServerLevel server) {
            EventRunner.run(id, definition.events(), definition.onInteract(), new EventContext(server, pos, player));
        }
        return InteractionResult.SUCCESS;
    }
}
