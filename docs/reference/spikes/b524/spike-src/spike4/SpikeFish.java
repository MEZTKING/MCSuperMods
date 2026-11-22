package dev.mcsupermods.runtime.gametest.spike4;

import dev.mcsupermods.runtime.registry.MsmEntity;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Bucketable;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * B524 spike (throwaway), X20: the runtime's water body ({@link MsmEntity}, {@code swim}) with vanilla's bucketable
 * contract, written from the interface's signatures: a synched "from bucket" flag (saved, keeps the mob from
 * despawning), vanilla's default bucket data plus the runtime's variant, and the water bucket pickup first on a click.
 */
public class SpikeFish extends MsmEntity implements Bucketable {
    public static final EntityDataAccessor<Boolean> FROM_BUCKET = SynchedEntityData.defineId(SpikeFish.class, EntityDataSerializers.BOOLEAN);

    public SpikeFish(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(FROM_BUCKET, false);
    }

    @Override
    public boolean fromBucket() {
        return entityData.get(FROM_BUCKET);
    }

    @Override
    public void setFromBucket(boolean from) {
        entityData.set(FROM_BUCKET, from);
    }

    @Override
    public void saveToBucketTag(ItemStack stack) {
        Bucketable.saveDefaultDataToBucketTag(this, stack);
        int variant = entityData.get(variantData());
        CustomData.update(net.minecraft.core.component.DataComponents.BUCKET_ENTITY_DATA, stack, tag -> tag.putInt("Variant", variant));
    }

    @Override
    public void loadFromBucketTag(CompoundTag tag) {
        Bucketable.loadDefaultDataFromBucketTag(this, tag);
        tag.getInt("Variant").ifPresent(v -> entityData.set(variantData(), v));
    }

    @Override
    public ItemStack getBucketItemStack() {
        return new ItemStack(B524Mod.fishBucket);
    }

    @Override
    public SoundEvent getPickupSound() {
        return SoundEvents.BUCKET_FILL_FISH;
    }

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        return Bucketable.bucketMobPickup(player, hand, this).orElseGet(() -> super.mobInteract(player, hand));
    }

    @Override
    public boolean requiresCustomPersistence() {
        return super.requiresCustomPersistence() || fromBucket();
    }

    @Override
    public boolean removeWhenFarAway(double distance) {
        return !fromBucket() && super.removeWhenFarAway(distance);
    }

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        super.addAdditionalSaveData(output);
        output.putBoolean("FromBucket", fromBucket());
    }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        super.readAdditionalSaveData(input);
        setFromBucket(input.getBooleanOr("FromBucket", false));
    }
}
