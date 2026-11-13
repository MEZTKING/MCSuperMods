package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import net.minecraft.core.Direction;
import net.minecraft.core.Position;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.item.ProjectileItem;
import net.minecraft.world.level.Level;

/**
 * {@code msm:throwable} (ADR 0056 D3): using the item throws a copy as {@link MsmThrownItem}, at once
 * ({@code charge_ticks} 0, as a snowball) or on release after holding use for {@code charge_ticks} (as a trident).
 * {@code msm:on_use} fires first, as on {@link MsmItem}. What the stack loses depends on {@code after_throw}:
 * {@code consume}, {@code drop} and {@code return} take one item (none in creative, as vanilla's {@code consume});
 * {@code keep} takes none. With {@code msm:durability}, {@code keep} damages the held stack by one and {@code drop} and
 * {@code return} damage the thrown copy by one. A dispenser throws it through {@link ProjectileItem} when
 * {@code dispensable}.
 */
public class MsmThrowableItem extends MsmItem implements ProjectileItem {
    /** The use duration while charging, as vanilla's trident and bow. */
    static final int USE_DURATION = 72000;
    /** Vanilla's dispenser power for snowballs ({@code DispenseConfig.DEFAULT}) relative to the thrown speed 1.5. */
    static final float DISPENSE_POWER_FACTOR = 1.1f / ItemComponents.Throwable.DEFAULT_SPEED;

    private final ItemComponents.Throwable throwable;
    private final SoundEvent sound;

    MsmThrowableItem(Identifier id, ItemDefinition definition, SoundEvent sound, Properties properties) {
        super(id, definition, properties);
        this.throwable = definition.components().throwable().orElseThrow();
        this.sound = sound;
    }

    public ItemComponents.Throwable throwable() {
        return throwable;
    }

    /** Fails on cooldown; otherwise {@code msm:on_use} fires and the item is thrown or starts charging. */
    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (player.getCooldowns().isOnCooldown(stack)) {
            return InteractionResult.FAIL;
        }
        return MsmItem.useWithEvent(id(), definition(), level, player, hand, () -> {
            if (throwable.chargeTicks() > 0) {
                player.startUsingItem(hand);
                return InteractionResult.CONSUME;
            }
            throwFrom(level, player, hand, stack);
            return InteractionResult.SUCCESS;
        });
    }

    @Override
    public int getUseDuration(ItemStack stack, LivingEntity entity) {
        return throwable.chargeTicks() > 0 ? USE_DURATION : 0;
    }

    /** {@code SPEAR} while charging (the arm raised behind the head); none for a throw on use. */
    @Override
    public ItemUseAnimation getUseAnimation(ItemStack stack) {
        return throwable.chargeTicks() > 0 ? ItemUseAnimation.SPEAR : ItemUseAnimation.NONE;
    }

    /** Throws when use was held for at least {@code charge_ticks}; an earlier release does nothing. */
    @Override
    public boolean releaseUsing(ItemStack stack, Level level, LivingEntity entity, int timeLeft) {
        if (throwable.chargeTicks() <= 0 || !(entity instanceof Player player)) {
            return false;
        }
        int held = getUseDuration(stack, entity) - timeLeft;
        if (held < throwable.chargeTicks()) {
            return false;
        }
        InteractionHand hand = player.getUsedItemHand();
        throwFrom(level, player, hand, stack);
        return true;
    }

    /** Spawns the projectile (server), plays the sound, applies {@code after_throw} and the cooldown. */
    void throwFrom(Level level, Player player, InteractionHand hand, ItemStack stack) {
        ItemStack thrown = stack.copyWithCount(1);
        ItemStack cooldownKey = stack.copyWithCount(1);
        boolean infinite = player.hasInfiniteMaterials();
        ItemComponents.AfterThrow mode = throwable.afterThrow();
        boolean carriesItem = (mode == ItemComponents.AfterThrow.DROP || mode == ItemComponents.AfterThrow.RETURN) && !infinite;
        if (carriesItem && thrown.isDamageableItem()) {
            thrown.setDamageValue(thrown.getDamageValue() + 1);
        }
        level.playSound(null, player.getX(), player.getY(), player.getZ(), sound, SoundSource.NEUTRAL, 0.5f,
                0.4f / (level.getRandom().nextFloat() * 0.4f + 0.8f));
        if (level instanceof ServerLevel server) {
            boolean broken = thrown.isDamageableItem() && thrown.getDamageValue() >= thrown.getMaxDamage();
            Projectile.spawnProjectileFromRotation((l, owner, s) -> {
                MsmThrownItem entity = new MsmThrownItem(l, owner, s);
                entity.setCarriesItem(carriesItem && !broken);
                return entity;
            }, server, thrown, player, 0.0f, throwable.speed(), throwable.inaccuracy());
        }
        player.awardStat(Stats.ITEM_USED.get(this));
        switch (mode) {
            case CONSUME, DROP, RETURN -> stack.consume(1, player);
            case KEEP -> {
                if (stack.isDamageableItem()) {
                    stack.hurtAndBreak(1, player, hand);
                }
            }
        }
        if (throwable.cooldownTicks() > 0) {
            player.getCooldowns().addCooldown(cooldownKey, throwable.cooldownTicks());
        }
    }

    /** The dispenser's projectile: a copy of one item, which does not come back ({@code after_throw} needs a thrower). */
    @Override
    public Projectile asProjectile(Level level, Position position, ItemStack stack, Direction direction) {
        MsmThrownItem entity = new MsmThrownItem(level, position.x(), position.y(), position.z(), stack.copyWithCount(1));
        entity.setCarriesItem(throwable.afterThrow() == ItemComponents.AfterThrow.DROP || throwable.afterThrow() == ItemComponents.AfterThrow.RETURN);
        return entity;
    }

    /** Vanilla's snowball dispense settings, with the power scaled by {@code speed}. */
    @Override
    public DispenseConfig createDispenseConfig() {
        return DispenseConfig.builder().power(throwable.speed() * DISPENSE_POWER_FACTOR).build();
    }
}
