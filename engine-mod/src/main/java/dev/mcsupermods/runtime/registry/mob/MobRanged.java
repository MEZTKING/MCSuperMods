package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.components.Goal;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.goals.MsmRangedAttackGoal;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import dev.mcsupermods.runtime.registry.MsmThrowableItem;
import dev.mcsupermods.runtime.registry.MsmThrownItem;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Predicate;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.goal.GoalSelector;
import net.minecraft.world.entity.ai.goal.target.HurtByTargetGoal;
import net.minecraft.world.entity.ai.goal.target.NearestAttackableTargetGoal;
import net.minecraft.world.entity.monster.RangedAttackMob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.Projectile;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.entity.projectile.arrow.AbstractArrow;
import net.minecraft.world.item.ArrowItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.ProjectileItem;
import net.minecraft.world.phys.Vec3;

/**
 * Ranged attacks, ADR 0070 D4 and D5 ({@code msm:ranged_attack}). Every body implements {@code RangedAttackMob} and
 * hands {@code performRangedAttack} here; the {@code ranged_attack} goal is {@link MsmRangedAttackGoal}.
 *
 * <p>A shot, aimed at a third of the target's height (as a skeleton aims), raised by the projectile's fall ({@link #drop}):
 * arrows ({@code ArrowItem}: arrow, tipped and spectral arrow) through {@code ProjectileUtil.getMobArrow} with a bow
 * as the weapon and {@code damage} as the base damage; a project item with {@code msm:throwable} as
 * {@link MsmThrownItem} with the mob as thrower (so its damage, gravity and hit events apply; the mob never runs out,
 * so the thrown copy never drops or returns); any other {@code ProjectileItem} through {@code asProjectile} and the
 * item's own {@code shoot}. Then the {@code sound}, the {@code shoot} animation of {@code msm:animated_model} through
 * {@link MobAnimations} (it plays once the name is triggerable) and {@code on_shoot} ({@code self} the mob,
 * {@code other} the target). An item that is none of these shoots nothing and logs one error per item id.
 */
public final class MobRanged {
    /** What a {@code projectile} id shoots. */
    public enum Projectiles {
        ARROW, THROWABLE, ITEM, NONE
    }

    /** Projectile ids already reported as not shootable, so each is logged once. */
    private static final Set<Identifier> REPORTED = ConcurrentHashMap.newKeySet();

    private final MsmMob mob;
    private final EntityDefinition definition;

    MobRanged(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.definition = definition;
    }

    /** How {@code id} is shot: an arrow, a project throwable, another vanilla projectile item, or nothing. */
    public static Projectiles kind(Identifier id) {
        Optional<Item> item = BuiltInRegistries.ITEM.getOptional(id);
        if (item.isEmpty() || item.get() == Items.AIR) {
            return Projectiles.NONE;
        }
        return switch (item.get()) {
            case ArrowItem _ -> Projectiles.ARROW;
            case MsmThrowableItem _ -> Projectiles.THROWABLE; // before ProjectileItem, which it also is
            case ProjectileItem _ -> Projectiles.ITEM;
            default -> Projectiles.NONE;
        };
    }

    /**
     * A {@code ranged_attack} goal entry of a mob with {@code msm:ranged_attack} (from {@code MobGoals}, inside the
     * {@code Mob} constructor; without the component {@code MobGoals} adds nothing): {@link MsmRangedAttackGoal} at
     * {@code priority} and the target goals of {@code goal}, as {@code melee_attack}: {@code retaliate} adds
     * {@code HurtByTargetGoal} (1), {@code targets} a {@code NearestAttackableTargetGoal} (2) with {@code must_see}.
     */
    public void addGoals(GoalSelector goalSelector, GoalSelector targetSelector, int priority, Goal.RangedAttack goal,
            EntityComponents.RangedAttack attack) {
        PathfinderMob self = mob.asMob();
        goalSelector.addGoal(priority, goal(shooter(), goal, attack));
        if (goal.retaliate()) {
            targetSelector.addGoal(1, new HurtByTargetGoal(self));
        }
        if (!goal.targets().isEmpty()) {
            Predicate<LivingEntity> types = MobGoals.ofTypes(goal.targets());
            targetSelector.addGoal(2, new NearestAttackableTargetGoal<>(self, LivingEntity.class, goal.mustSee(),
                    (target, level) -> types.test(target)));
        }
    }

    @SuppressWarnings("unchecked")
    private <T extends PathfinderMob & RangedAttackMob> T shooter() {
        return (T) mob.asMob(); // every body implements RangedAttackMob (ADR 0070 D2)
    }

    private static <T extends PathfinderMob & RangedAttackMob> MsmRangedAttackGoal<T> goal(T shooter, Goal.RangedAttack goal,
            EntityComponents.RangedAttack attack) {
        return new MsmRangedAttackGoal<>(shooter, goal.speed(), attack.chargeTicks(), attack.intervalTicks(), attack.range(),
                goal.strafe());
    }

    /**
     * How far a projectile falls over {@code horizontal} blocks at {@code speed} blocks per tick, added to the aim: the
     * gravity summed over the ticks of flight, {@code g * t * (t + 1) / 2} with {@code t = horizontal / speed} (drag
     * left out). For a skeleton's arrow (speed 1.6, gravity 0.05) at 15 blocks this is 2.4 blocks, close to vanilla's
     * fixed fifth of the distance (3); unlike the fixed fifth it also holds at short range, other speeds and the
     * gravity of a project throwable, and is 0 for a projectile without gravity.
     */
    static double drop(double horizontal, double speed, double gravity) {
        double ticks = horizontal / speed;
        return gravity * ticks * (ticks + 1) / 2;
    }

    /** {@code RangedAttackMob.performRangedAttack}: one shot at {@code target}; nothing without {@code msm:ranged_attack}. */
    public void performRangedAttack(LivingEntity target, float power) {
        PathfinderMob self = mob.asMob();
        if (definition == null || !(self.level() instanceof ServerLevel level)) {
            return;
        }
        Optional<EntityComponents.RangedAttack> component = definition.components().rangedAttack();
        if (component.isEmpty()) {
            return;
        }
        EntityComponents.RangedAttack attack = component.get();
        Identifier id = attack.projectile();
        Projectiles kind = kind(id);
        if (kind == Projectiles.NONE) {
            if (REPORTED.add(id)) {
                MsmRuntime.LOGGER.error("[{}] {}: msm:ranged_attack projectile {} is neither an arrow, a vanilla projectile item nor an "
                        + "item with msm:throwable; the mob shoots nothing", MsmRuntime.MOD_ID, mob.definitionId(), id);
            }
            return;
        }
        Item item = BuiltInRegistries.ITEM.getValue(id);
        ItemStack stack = new ItemStack(item);
        Projectile projectile = switch (kind) {
            case ARROW -> {
                AbstractArrow arrow = ProjectileUtil.getMobArrow(self, stack, power, new ItemStack(Items.BOW));
                arrow.setBaseDamage(attack.damage());
                yield arrow;
            }
            case THROWABLE -> {
                MsmThrownItem thrown = new MsmThrownItem(level, self, stack.copy());
                thrown.setCarriesItem(false);
                yield thrown;
            }
            default -> {
                Projectile p = ((ProjectileItem) item).asProjectile(level, new Vec3(self.getX(), self.getEyeY() - 0.1, self.getZ()), stack,
                        self.getDirection());
                p.setOwner(self);
                yield p;
            }
        };
        double dx = target.getX() - self.getX();
        double dz = target.getZ() - self.getZ();
        double dy = target.getY(1.0 / 3.0) - projectile.getY() + drop(Math.sqrt(dx * dx + dz * dz), attack.speed(), projectile.getGravity());
        if (kind == Projectiles.ITEM) {
            ProjectileItem projectileItem = (ProjectileItem) item;
            Projectile.spawnProjectile(projectile, level, stack,
                    p -> projectileItem.shoot(p, dx, dy, dz, attack.speed(), attack.inaccuracy()));
        } else {
            Projectile.spawnProjectileUsingShoot(projectile, level, stack, dx, dy, dz, attack.speed(), attack.inaccuracy());
        }

        BuiltInRegistries.SOUND_EVENT.getOptional(attack.sound()).ifPresent(sound ->
                self.playSound(sound, 1.0f, 1.0f / (self.getRandom().nextFloat() * 0.4f + 0.8f)));
        definition.components().animatedModel().shoot()
                .ifPresent(name -> mob.playAnimation(EntityDefinition.TRIGGERED_CONTROLLER, name));
        attack.onShoot().ifPresent(event -> EventRunner.fire(mob.definitionId(), definition.events(), event,
                EventContext.forEntity(level, self, target instanceof Player p ? p : null, target)));
    }
}
