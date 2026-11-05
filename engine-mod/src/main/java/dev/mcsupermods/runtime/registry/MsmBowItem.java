package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import net.minecraft.resources.Identifier;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.item.BowItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/**
 * {@code msm:ranged_weapon} of type {@code bow} (ADR 0044 D3): vanilla's bow with a draw speed factor (the drawn
 * ticks are scaled before vanilla turns them into power), a velocity factor, an inaccuracy factor and a damage factor on
 * the arrow's base damage. Arrows stay vanilla arrows. {@code msm:on_use} fires as on {@link MsmItem}.
 */
public class MsmBowItem extends BowItem {
    /** Vanilla's arrow base damage ({@code AbstractArrow.ARROW_BASE_DAMAGE}, private; 2.0 on 26.3 and 26.4). */
    static final double VANILLA_ARROW_BASE_DAMAGE = 2.0;

    private final Identifier id;
    private final ItemDefinition definition;
    private final ItemComponents.RangedWeapon weapon;

    public MsmBowItem(Identifier id, ItemDefinition definition, Properties properties) {
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
    public boolean releaseUsing(ItemStack stack, Level level, LivingEntity entity, int timeLeft) {
        return super.releaseUsing(stack, level, entity, scaledTimeLeft(getUseDuration(stack, entity), timeLeft, weapon.drawSpeed()));
    }

    @Override
    protected void shootProjectile(LivingEntity shooter, Projectile projectile, int index, float velocity, float inaccuracy, float angle,
            LivingEntity target) {
        scaleDamage(projectile, weapon);
        super.shootProjectile(shooter, projectile, index, velocity * weapon.velocity(), inaccuracy * weapon.inaccuracy(), angle, target);
    }

    /**
     * The remaining use ticks as vanilla should see them: the ticks used so far ({@code duration - timeLeft}) times
     * {@code drawSpeed}, so a factor of 2 reaches full power in half the time.
     */
    static int scaledTimeLeft(int duration, int timeLeft, float drawSpeed) {
        if (drawSpeed == 1.0f) {
            return timeLeft;
        }
        long used = Math.round((double) (duration - timeLeft) * drawSpeed);
        return (int) Math.max(Integer.MIN_VALUE, duration - used);
    }

    /** Sets an arrow's base damage to vanilla's times {@code damage_multiplier}; other projectiles are unchanged. */
    static void scaleDamage(Projectile projectile, ItemComponents.RangedWeapon weapon) {
        if (weapon.damageMultiplier() != 1.0f && projectile instanceof AbstractArrow arrow) {
            arrow.setBaseDamage(VANILLA_ARROW_BASE_DAMAGE * weapon.damageMultiplier());
        }
    }
}
