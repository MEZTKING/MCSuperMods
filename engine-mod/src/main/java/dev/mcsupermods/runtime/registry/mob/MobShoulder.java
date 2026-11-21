package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;

/**
 * Shoulder pets (ADR 0098 D4, `msm:shoulder`): the pet perched on its owner's shoulder, a synched and saved flag that both sides place every tick. A stub until B479: every hook does nothing, so a mob behaves exactly as before.
 */
public final class MobShoulder {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobShoulder(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** The right-click hook of {@link MobDriver#mobInteract}; null passes the click on, as every module does. */
    InteractionResult mobInteract(Player player, InteractionHand hand) {
        return null;
    }
}
