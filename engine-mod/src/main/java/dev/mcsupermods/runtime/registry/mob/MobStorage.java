package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;

/**
 * Mount storage (ADR 0098 D3, `msm:storage`): a chest or inventory on a mob, opened by sneak-use or the inventory route, saved with the mob and dropped on death. A stub until B479: every hook does nothing, so a mob behaves exactly as before.
 */
public final class MobStorage {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobStorage(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** The right-click hook of {@link MobDriver#mobInteract}; null passes the click on, as every module does. */
    InteractionResult mobInteract(Player player, InteractionHand hand) {
        return null;
    }
}
