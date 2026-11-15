package dev.mcsupermods.runtime.registry.inventory;

import dev.mcsupermods.runtime.loader.ItemDefinition;
import dev.mcsupermods.runtime.registry.MsmItem;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.BundleItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

/**
 * A bundle ({@code msm:bundle}, ADR 0095 D4): vanilla's {@link BundleItem} with its capacity, insert and take-out
 * clicks, fullness bar, tooltip and selected item; the item triggers are {@link MsmItem}'s shared handling. The model
 * (vanilla's bundle shape with {@code minecraft:bundle/selected_item}) comes from lowering.
 */
public class MsmBundleItem extends BundleItem {
    private final Identifier id;
    private final ItemDefinition definition;

    public MsmBundleItem(Identifier id, ItemDefinition definition, Properties properties) {
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
