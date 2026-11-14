package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.CrossbowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

/**
 * {@code msm:ranged_weapon} of type {@code crossbow} (ADR 0044 D3): vanilla's crossbow with a charge speed factor
 * (the charged ticks are scaled in {@code onUseTick} and {@code releaseUsing}, where vanilla compares them with the
 * charge duration), a velocity factor, an inaccuracy factor and a damage factor on arrows. {@code msm:on_use} fires as
 * on {@link MsmItem}.
 */
public class MsmCrossbowItem extends CrossbowItem {
    private final Identifier id;
    private final ItemDefinition definition;
    private final ItemComponents.RangedWeapon weapon;

    public MsmCrossbowItem(Identifier id, ItemDefinition definition, Properties properties) {
        super(properties);
        this.id = id;
        this.definition = definition;
        this.weapon = definition.components().rangedWeapon().orElseThrow();
    }

    public Identifier id() {
        return id;
    }

    public ItemDefinition definition() {
        return definition;
    }

    public ItemComponents.RangedWeapon weapon() {
        return weapon;
    }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        return MsmItem.useWithEvent(id, definition, level, player, hand, () -> super.use(level, player, hand));
    }

    @Override
    public void onUseTick(Level level, LivingEntity entity, ItemStack stack, int ticksRemaining) {
        super.onUseTick(level, entity, stack, MsmBowItem.scaledTimeLeft(getUseDuration(stack, entity), ticksRemaining, weapon.drawSpeed()));
    }

    @Override
    public boolean releaseUsing(ItemStack stack, Level level, LivingEntity entity, int timeLeft) {
        return super.releaseUsing(stack, level, entity, MsmBowItem.scaledTimeLeft(getUseDuration(stack, entity), timeLeft, weapon.drawSpeed()));
    }

    @Override
    protected void shootProjectile(LivingEntity shooter, Projectile projectile, int index, float velocity, float inaccuracy, float angle,
            LivingEntity target) {
        MsmBowItem.scaleDamage(projectile, weapon);
        super.shootProjectile(shooter, projectile, index, velocity * weapon.velocity(), inaccuracy * weapon.inaccuracy(), angle, target);
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
