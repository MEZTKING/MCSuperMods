package dev.mcsupermods.runtime.registry.projectile;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.registry.MsmThrowableItem;
import dev.mcsupermods.runtime.registry.MsmThrownItem;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.core.Direction;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.LivingEntity;
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
 * Projectile creation shared by mobs ({@code msm:ranged_attack}, ADR 0070 D4) and vehicle weapons (ADR 0090 D6): what a
 * {@code projectile} item id shoots ({@link #kind}), the projectile made for a mob ({@link #forMob}) or from a point such as
 * a vehicle's muzzle ({@link #at}), and the launch ({@link #launch}).
 *
 * <ul>
 *   <li>{@link Kind#ARROW}: an {@code ArrowItem} (arrow, tipped and spectral arrow), with {@code damage} as its base
 *       damage; a bow is the weapon.</li>
 *   <li>{@link Kind#THROWABLE}: a project item with {@code msm:throwable} as {@link MsmThrownItem} with the shooter as
 *       thrower, so its damage, gravity and hit events apply ({@code on_hit_block} with {@code explode} makes a shell);
 *       it never carries its item, so it never drops or returns.</li>
 *   <li>{@link Kind#ITEM}: any other vanilla {@code ProjectileItem} (snowball, egg, fire charge, wind charge...) through
 *       {@code asProjectile} and the item's own {@code shoot}.</li>
 *   <li>{@link Kind#NONE}: anything else shoots nothing; callers log it once per id through {@link #reportOnce}.</li>
 * </ul>
 */
public final class Projectiles {
    /** What a {@code projectile} id shoots. */
    public enum Kind {
        ARROW, THROWABLE, ITEM, NONE
    }

    /** Projectile ids already reported as not shootable, by the field naming them, so each is logged once per field. */
    private static final Set<String> REPORTED = ConcurrentHashMap.newKeySet();

    private Projectiles() {}

    /** How {@code id} is shot: an arrow, a project throwable, another vanilla projectile item, or nothing. */
    public static Kind kind(Identifier id) {
        Optional<Item> item = BuiltInRegistries.ITEM.getOptional(id);
        if (item.isEmpty() || item.get() == Items.AIR) {
            return Kind.NONE;
        }
        return switch (item.get()) {
            case ArrowItem _ -> Kind.ARROW;
            case MsmThrowableItem _ -> Kind.THROWABLE; // before ProjectileItem, which it also is
            case ProjectileItem _ -> Kind.ITEM;
            default -> Kind.NONE;
        };
    }

    /**
     * Logs that {@code who}'s {@code what} names {@code id}, which shoots nothing, the first time {@code id} is seen for
     * that {@code what} (one error per item id for {@code msm:ranged_attack}, as before B417); {@code result} ends the
     * message (such as "the mob shoots nothing").
     */
    public static void reportOnce(Identifier id, Identifier who, String what, String result) {
        if (REPORTED.add(what + " " + id)) {
            MsmRuntime.LOGGER.error("[{}] {}: {} projectile {} is neither an arrow, a vanilla projectile item nor an item with "
                    + "msm:throwable; {}", MsmRuntime.MOD_ID, who, what, id, result);
        }
    }

    /**
     * A mob's projectile, where vanilla puts a mob's shot: an arrow through {@code ProjectileUtil.getMobArrow} (power
     * {@code power}, base damage {@code damage}), a throwable at the mob's eyes, another projectile item a little below
     * them. Not yet in the level: {@link #launch} it. Null for {@link Kind#NONE}.
     */
    public static Projectile forMob(ServerLevel level, LivingEntity shooter, Kind kind, ItemStack stack, float power, float damage) {
        return switch (kind) {
            case ARROW -> {
                AbstractArrow arrow = ProjectileUtil.getMobArrow(shooter, stack, power, new ItemStack(Items.BOW));
                arrow.setBaseDamage(damage);
                yield arrow;
            }
            case THROWABLE -> thrown(level, shooter, stack);
            case ITEM -> {
                Projectile p = ((ProjectileItem) stack.getItem()).asProjectile(level,
                        new Vec3(shooter.getX(), shooter.getEyeY() - 0.1, shooter.getZ()), stack, shooter.getDirection());
                p.setOwner(shooter);
                yield p;
            }
            case NONE -> null;
        };
    }

    /**
     * A projectile owned by {@code owner} starting at {@code start} (a vehicle's muzzle) and facing {@code direction}: an
     * arrow with base damage {@code damage} (only picked up again in creative when {@code pickUp} is false, as vanilla's
     * Infinity), a throwable, or another projectile item. Not yet in the level: {@link #launch} it. Null for
     * {@link Kind#NONE}.
     */
    public static Projectile at(ServerLevel level, LivingEntity owner, Kind kind, ItemStack stack, Vec3 start, Vec3 direction, float damage,
            boolean pickUp) {
        Projectile projectile = switch (kind) {
            case ARROW -> {
                AbstractArrow arrow = ((ArrowItem) stack.getItem()).createArrow(level, stack, owner, new ItemStack(Items.BOW));
                arrow.setBaseDamage(damage);
                if (!pickUp) {
                    arrow.pickup = AbstractArrow.Pickup.CREATIVE_ONLY;
                }
                yield arrow;
            }
            case THROWABLE -> thrown(level, owner, stack);
            case ITEM -> {
                Projectile p = ((ProjectileItem) stack.getItem()).asProjectile(level, start, stack,
                        Direction.getApproximateNearest(direction.x, direction.y, direction.z));
                p.setOwner(owner);
                yield p;
            }
            case NONE -> null;
        };
        if (projectile != null) {
            projectile.snapTo(start.x, start.y, start.z, projectile.getYRot(), projectile.getXRot());
        }
        return projectile;
    }

    private static MsmThrownItem thrown(ServerLevel level, LivingEntity owner, ItemStack stack) {
        MsmThrownItem thrown = new MsmThrownItem(level, owner, stack.copy());
        thrown.setCarriesItem(false);
        return thrown;
    }

    /**
     * Adds {@code projectile} to the level and shoots it along {@code (dx, dy, dz)} at {@code speed} with
     * {@code inaccuracy}: a projectile item through its own {@code shoot}, the rest through {@code Projectile.shoot}.
     */
    public static Projectile launch(ServerLevel level, Projectile projectile, Kind kind, ItemStack stack, double dx, double dy, double dz,
            float speed, float inaccuracy) {
        if (kind == Kind.ITEM) {
            ProjectileItem projectileItem = (ProjectileItem) stack.getItem();
            return Projectile.spawnProjectile(projectile, level, stack, p -> projectileItem.shoot(p, dx, dy, dz, speed, inaccuracy));
        }
        return Projectile.spawnProjectileUsingShoot(projectile, level, stack, dx, dy, dz, speed, inaccuracy);
    }
}
