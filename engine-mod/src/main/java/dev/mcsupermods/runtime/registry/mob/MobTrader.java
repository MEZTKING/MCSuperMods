package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;

/**
 * Trading (ADR 0098 D1, `msm:trader`): offers per level, the trade screen, experience, restocking and `on_trade`. A stub until B474: every hook does nothing, so a mob behaves exactly as before.
 */
public final class MobTrader {
    private final MsmMob mob;
    private final EntityDefinition definition;

    MobTrader(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** The right-click hook of {@link MobDriver#mobInteract}; null passes the click on, as every module does. */
    InteractionResult mobInteract(Player player, InteractionHand hand) {
        return null;
    }
}
