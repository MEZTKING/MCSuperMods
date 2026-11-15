package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.loader.VehicleDefinition;
import java.util.List;
import net.minecraft.core.Direction;
import net.minecraft.core.component.DataComponents;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.FluidTags;
import net.minecraft.world.Containers;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * A vehicle's item (ADR 0090 D5), registered under the vehicle's own id (item and entity type registries are separate).
 * Using it raycasts with fluids, as vanilla's boat item does: on a block (for {@code places_on} {@code ground} or
 * {@code any}) or on water ({@code water} or {@code any}) it places the vehicle facing the player's look, where its
 * hitbox is free, fires {@code on_place} and uses the item up outside creative. The vehicle's kept state rides in
 * {@code minecraft:custom_data} under {@value #STATE}: {@code fuel}, {@code damage}, {@code paint} (a paint id) and
 * {@code ammo} (rounds by weapon id), read only by this item; the custom name is vanilla's {@code minecraft:custom_name},
 * which vanilla's spawn settings put on the vehicle.
 */
public class MsmVehicleItem extends Item {
    /** The key of the kept state in {@code minecraft:custom_data}. */
    public static final String STATE = "msm_vehicle";

    private final Identifier id;

    public MsmVehicleItem(Identifier id, Properties properties) {
        super(properties);
        this.id = id;
    }

    public Identifier vehicleId() {
        return id;
    }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        MsmVehicles.Entry entry = MsmVehicles.entry(id).orElse(null);
        if (entry == null) {
            return InteractionResult.PASS;
        }
        BlockHitResult hit = getPlayerPOVHitResult(level, player, ClipContext.Fluid.ANY);
        if (hit.getType() != HitResult.Type.BLOCK) {
            return InteractionResult.PASS;
        }
        Vec3 at = spot(entry.definition(), level, hit);
        if (at == null) {
            return InteractionResult.FAIL;
        }
        if (level instanceof ServerLevel server) {
            MsmVehicle vehicle = place(server, entry, stack, player, at, player.getYRot());
            if (vehicle == null) {
                return InteractionResult.FAIL;
            }
            stack.consume(1, player);
        }
        return InteractionResult.SUCCESS;
    }

    /**
     * Where a vehicle goes for {@code hit}, or null when its {@code places_on} refuses the surface: on water at the hit
     * point; on a block's top at the hit point; against a block's side or bottom moved out by half the hitbox.
     */
    static Vec3 spot(VehicleDefinition def, Level level, BlockHitResult hit) {
        boolean water = level.getFluidState(hit.getBlockPos()).is(FluidTags.WATER);
        VehicleDefinition.PlacesOn where = def.placesOn();
        if (water ? where == VehicleDefinition.PlacesOn.GROUND : where == VehicleDefinition.PlacesOn.WATER) {
            return null;
        }
        Vec3 at = hit.getLocation();
        Direction face = hit.getDirection();
        if (water || face == Direction.UP) {
            return at;
        }
        if (face == Direction.DOWN) {
            return at.add(0, -def.height(), 0);
        }
        double out = def.width() / 2 + 0.01;
        return at.add(face.getStepX() * out, 0, face.getStepZ() * out);
    }

    /**
     * Places a vehicle of {@code entry} at {@code at} facing {@code yaw}, with the state kept in {@code stack} and
     * vanilla's spawn settings of the stack (custom name, entity data) applied, then fires {@code on_place}. Null when the
     * hitbox is not free; public for GameTests and scripts.
     */
    public static MsmVehicle place(ServerLevel level, MsmVehicles.Entry entry, ItemStack stack, Player player, Vec3 at, float yaw) {
        @SuppressWarnings("unchecked")
        EntityType<MsmVehicle> type = (EntityType<MsmVehicle>) entry.type();
        MsmVehicle vehicle = type.create(level, EntitySpawnReason.SPAWN_ITEM_USE);
        if (vehicle == null) {
            return null;
        }
        vehicle.snapTo(at.x, at.y, at.z, yaw, 0);
        EntityType.<MsmVehicle>createDefaultStackConfig(level, stack, player).apply(vehicle);
        if (!level.noCollision(vehicle, vehicle.getBoundingBox().deflate(0.01))) {
            return null;
        }
        readState(vehicle, stack);
        level.addFreshEntity(vehicle);
        level.gameEvent(player, GameEvent.ENTITY_PLACE, at);
        entry.definition().onPlace().ifPresent(event -> vehicle.fire(level, event, player));
        return vehicle;
    }

    /**
     * Picks {@code vehicle} up for {@code player} (ADR 0090 D5): the item with the kept state goes to the player (or
     * drops at their feet when the inventory is full), the storage's contents drop, the vehicle is removed.
     */
    public static void pickUp(MsmVehicle vehicle, Player player) {
        if (!(vehicle.level() instanceof ServerLevel level) || vehicle.isRemoved()) {
            return;
        }
        ItemStack stack = stackOf(vehicle);
        List<ItemStack> contents = vehicle.storage().map(VehicleStorage::takeAll).orElse(List.of());
        for (ItemStack content : contents) {
            Containers.dropItemStack(level, vehicle.getX(), vehicle.getY(), vehicle.getZ(), content);
        }
        vehicle.discard();
        if (!player.addItem(stack) && !stack.isEmpty()) {
            Containers.dropItemStack(level, player.getX(), player.getY(), player.getZ(), stack);
        }
    }

    /** The vehicle's item with its kept state and custom name. */
    public static ItemStack stackOf(MsmVehicle vehicle) {
        ItemStack stack = new ItemStack(vehicle.item());
        CompoundTag state = writeState(vehicle);
        if (!state.isEmpty()) {
            CustomData.update(DataComponents.CUSTOM_DATA, stack, tag -> tag.put(STATE, state));
        }
        if (vehicle.getCustomName() != null) {
            stack.set(DataComponents.CUSTOM_NAME, vehicle.getCustomName());
        }
        return stack;
    }

    /** The kept state: fuel, damage, paint and ammunition, each only when not the default. */
    static CompoundTag writeState(MsmVehicle vehicle) {
        CompoundTag state = new CompoundTag();
        if (vehicle.fuel().fuel() > 0) {
            state.putInt("fuel", vehicle.fuel().fuel());
        }
        if (vehicle.getDamage() > 0) {
            state.putFloat("damage", vehicle.getDamage());
        }
        vehicle.paint().current().ifPresent(p -> state.putString("paint", p.id()));
        CompoundTag ammo = new CompoundTag();
        List<VehicleDefinition.Weapon> weapons = vehicle.definition().weapons();
        for (int i = 0; i < weapons.size(); i++) {
            if (weapons.get(i).ammo().isPresent() && vehicle.ammo(i) > 0) {
                ammo.putInt(weapons.get(i).id(), vehicle.ammo(i));
            }
        }
        if (!ammo.isEmpty()) {
            state.put("ammo", ammo);
        }
        return state;
    }

    /** Applies the state kept in {@code stack} (clamped to this vehicle type's limits). */
    static void readState(MsmVehicle vehicle, ItemStack stack) {
        CustomData data = stack.get(DataComponents.CUSTOM_DATA);
        if (data == null) {
            return;
        }
        CompoundTag state = data.copyTag().getCompoundOrEmpty(STATE);
        if (state.isEmpty()) {
            return;
        }
        vehicle.fuel().setFuel(state.getIntOr("fuel", 0));
        vehicle.setDamage(Math.max(0, Math.min(state.getFloatOr("damage", 0), vehicle.health().max() - 0.001f)));
        vehicle.paint().set(state.getString("paint").orElse(null));
        CompoundTag ammo = state.getCompoundOrEmpty("ammo");
        List<VehicleDefinition.Weapon> weapons = vehicle.definition().weapons();
        for (int i = 0; i < weapons.size(); i++) {
            vehicle.weapons().setAmmo(i, ammo.getIntOr(weapons.get(i).id(), 0));
        }
    }
}
