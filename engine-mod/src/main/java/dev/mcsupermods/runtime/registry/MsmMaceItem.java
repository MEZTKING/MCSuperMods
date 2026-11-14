package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.loader.ItemDefinition;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.MaceItem;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

/**
 * {@code msm:tool} of type {@code mace} (ADR 0044 D3): vanilla's mace (smash attack included) with the tier's
 * durability, repair items and enchantment value, set by {@link MsmRegistrar}. {@code msm:on_use} fires as on
 * {@link MsmItem}.
 */
public class MsmMaceItem extends MaceItem {
    private final Identifier id;
    private final ItemDefinition definition;

    public MsmMaceItem(Identifier id, ItemDefinition definition, Properties properties) {
        super(properties);
        this.id = id;
        this.definition = definition;
    }

    public Identifier id() {
        return id;
    }

    public ItemDefinition definition() {
        return definition;
    }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        return MsmItem.useWithEvent(id, definition, level, player, hand, () -> super.use(level, player, hand));
    }

    @Override
    public void hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
        super.hurtEnemy(stack, target, attacker);
        MsmItem.hurtEnemyWithEvent(id, definition, target, attacker);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        return MsmItem.useOnWithEvent(id, definition, context, () -> super.useOn(context));
    }

    @Override
    public void inventoryTick(ItemStack stack, ServerLevel level, Entity owner, EquipmentSlot slot) {
        super.inventoryTick(stack, level, owner, slot);
        MsmItem.inventoryTickWithEvent(id, definition, level, owner, slot);
    }
}
