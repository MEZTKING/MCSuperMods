package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.events.Explosions;
import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.util.List;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.tags.TagKey;
import net.minecraft.world.Containers;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.gamerules.GameRules;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.Vec3;

/**
 * Health, repair and destruction (ADR 0090 D5, D9). Damage counts up one for one in {@link MsmVehicle}'s synched
 * damage (vanilla's vehicle damage counter) and never heals by itself; at {@code health.max} (default 40) the vehicle is
 * destroyed. Hits from damage types in {@code immune_to} do nothing. A sneaking player's hit on an empty vehicle with
 * {@code pick_up} picks it up ({@link MsmVehicleItem#pickUp}); a creative player's other hit breaks it at once without
 * the item (vanilla's rule for vehicles). Using a {@code repair} item takes its {@code amount} of damage away.
 *
 * <p>Destroyed: {@code on_destroy} fires (the vehicle is still there; the player is who destroyed it, when a player did),
 * passengers get out, the vehicle is removed, an explosion of {@code health.explodes} power happens at its place (it
 * hurts entities and breaks no blocks, as the {@code explode} action's default), and then the storage's contents and the
 * vehicle's item drop. The item drops unless the gamerule {@code entity_drops} is off, a creative player broke it, or
 * the destroying damage was an explosion or fire (ADR 0090 D9).
 */
public final class VehicleHealth {
    /** Hurt time after a hit, as boats wobble. */
    static final int HURT_TICKS = 10;

    private final MsmVehicle vehicle;

    VehicleHealth(MsmVehicle vehicle) {
        this.vehicle = vehicle;
    }

    /** The damage the vehicle takes before it is destroyed. */
    public float max() {
        return vehicle.definition().health().max();
    }

    /** Whether {@code source} is in {@code immune_to} (a damage type id or a {@code #} damage type tag). */
    public boolean immune(DamageSource source) {
        for (String entry : vehicle.definition().health().immuneTo()) {
            if (entry.startsWith("#")) {
                Identifier tag = Identifier.tryParse(entry.substring(1));
                if (tag != null && source.is(TagKey.create(Registries.DAMAGE_TYPE, tag))) {
                    return true;
                }
            } else {
                Identifier id = Identifier.tryParse(entry);
                if (id != null && source.is(ResourceKey.create(Registries.DAMAGE_TYPE, id))) {
                    return true;
                }
            }
        }
        return false;
    }

    boolean hurt(ServerLevel level, DamageSource source, float amount) {
        if (vehicle.isRemoved() || vehicle.invulnerableTo(source) || immune(source)) {
            return false;
        }
        Entity attacker = source.getEntity();
        if (attacker instanceof Player player && source.getDirectEntity() == player) {
            if (player.isSecondaryUseActive() && vehicle.definition().pickUp() && vehicle.getPassengers().isEmpty()) {
                MsmVehicleItem.pickUp(vehicle, player);
                return true;
            }
            if (player.hasInfiniteMaterials()) {
                destroy(level, source, false);
                return true;
            }
        }
        vehicle.setHurtDir(-vehicle.getHurtDir());
        vehicle.setHurtTime(HURT_TICKS);
        vehicle.markHurtForHealth();
        vehicle.setDamage(vehicle.getDamage() + amount);
        vehicle.gameEvent(GameEvent.ENTITY_DAMAGE, attacker);
        if (vehicle.getDamage() >= max()) {
            destroy(level, source, true);
        }
        return true;
    }

    /** A repair item in the hand: takes its amount of damage away (server) and answers SUCCESS; null otherwise. */
    InteractionResult repair(Player player, ItemStack stack) {
        if (vehicle.getDamage() <= 0) {
            return null;
        }
        for (VehicleDefinition.Repair repair : vehicle.definition().health().repair()) {
            if (MsmVehicles.matches(stack, repair.item())) {
                if (!vehicle.level().isClientSide()) {
                    vehicle.setDamage(Math.max(0, vehicle.getDamage() - repair.amount()));
                    stack.consume(1, player);
                    vehicle.level().playSound(null, vehicle.getX(), vehicle.getY(), vehicle.getZ(), SoundEvents.ANVIL_USE, SoundSource.NEUTRAL,
                            0.5f, 1.4f);
                }
                return InteractionResult.SUCCESS;
            }
        }
        return null;
    }

    /** Destroys the vehicle (see the class comment); {@code dropItem} false for a creative player's hit. */
    public void destroy(ServerLevel level, DamageSource source, boolean dropItem) {
        if (vehicle.isRemoved()) {
            return;
        }
        Player player = source.getEntity() instanceof Player p ? p : null;
        vehicle.definition().onDestroy().ifPresent(event -> vehicle.fire(level, event, player));
        if (vehicle.isRemoved()) {
            return; // an on_destroy action removed it
        }
        vehicle.ejectPassengers();
        Vec3 at = vehicle.position();
        List<ItemStack> contents = vehicle.storage().map(VehicleStorage::takeAll).orElse(List.of());
        boolean item = dropItem && level.getGameRules().get(GameRules.ENTITY_DROPS) && !source.is(DamageTypeTags.IS_EXPLOSION)
                && !source.is(DamageTypeTags.IS_FIRE);
        vehicle.remove(Entity.RemovalReason.KILLED);
        vehicle.gameEvent(GameEvent.ENTITY_DIE);
        vehicle.definition().health().explodes().filter(power -> power > 0).ifPresent(power ->
                Explosions.explode(level, vehicle, player, at, power, false, false));
        for (ItemStack stack : contents) {
            Containers.dropItemStack(level, at.x, at.y, at.z, stack);
        }
        if (item) {
            Containers.dropItemStack(level, at.x, at.y, at.z, new ItemStack(vehicle.item()));
        }
    }
}
