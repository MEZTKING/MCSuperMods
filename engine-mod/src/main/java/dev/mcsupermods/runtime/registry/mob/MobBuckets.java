package dev.mcsupermods.runtime.registry.mob;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.EntityComponents;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.MsmMob;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Registry;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Bucketable;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUtils;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.MobBucketItem;
import net.minecraft.world.item.component.CustomData;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.material.Fluids;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;

/**
 * Fish buckets of project mobs (ADR 0109 D1 and its amendment after B524, {@code msm:bucketable} on a {@code swim} mob):
 * vanilla's {@link Bucketable} contract, which every body implements and hands to this module, and the bucket item
 * {@code <ns>:<path>_bucket} ({@link EntityComponents.Bucketable#itemId}).
 *
 * <p>With {@code water} (the default) the item is vanilla's {@link MobBucketItem} with water, stacking to 1, with an empty
 * {@code bucket_entity_data}: a water bucket used on the mob takes it ({@link Bucketable#bucketMobPickup}), and the bucket
 * places water and the mob, which keeps its custom name, health, variant and "from a bucket" (it never despawns).
 * Without {@code water} the item is {@link DryBucketItem}: an empty bucket takes the mob, and using the bucket on a block
 * puts the mob on that block's face and gives the empty bucket back, with no water. The bucket data is vanilla's default
 * data ({@code Bucketable.saveDefaultDataToBucketTag}) plus the variant id under {@code Variant} ({@code MobVariants.KEY}).
 * The item goes into the Tools and Utilities tab, after vanilla's buckets.
 */
public final class MobBuckets {
    /** The bucket item of each bucketable entity type. */
    private static final Map<EntityType<?>, Item> ITEMS = new ConcurrentHashMap<>();
    private static final ResourceKey<net.minecraft.world.item.CreativeModeTab> TOOLS = ResourceKey.create(Registries.CREATIVE_MODE_TAB,
            Identifier.withDefaultNamespace("tools_and_utilities"));

    private final MsmMob mob;
    /** Null without {@code msm:bucketable} (or on a mob that does not swim, which the parser already refuses). */
    private final EntityComponents.Bucketable bucketable;
    private boolean fromBucket;

    MobBuckets(MsmMob mob, EntityDefinition definition) {
        this.mob = mob;
        this.bucketable = definition == null || definition.components().movementOrDefault().mode() != EntityComponents.MovementMode.SWIM
                ? null : definition.components().bucketable().orElse(null);
    }

    /**
     * Registers the bucket item for a definition with {@code msm:bucketable} on a {@code swim} mob and returns it; empty for
     * every other mob, and when the bucket's id is already taken (logged).
     */
    public static Optional<Item> itemFor(Identifier id, EntityDefinition definition, EntityType<? extends Mob> type) {
        Optional<EntityComponents.Bucketable> component = definition.components().bucketable();
        if (component.isEmpty() || definition.components().movementOrDefault().mode() != EntityComponents.MovementMode.SWIM) {
            return Optional.empty();
        }
        Identifier itemId = EntityComponents.Bucketable.itemId(id);
        if (BuiltInRegistries.ITEM.containsKey(itemId)) {
            MsmRuntime.LOGGER.error("[{}] {}: the bucket id {} is already registered; msm:bucketable has no bucket", MsmRuntime.MOD_ID, id, itemId);
            return Optional.empty();
        }
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, itemId);
        Item.Properties properties = new Item.Properties().setId(key).stacksTo(1).component(DataComponents.BUCKET_ENTITY_DATA, CustomData.EMPTY);
        component.get().itemName().ifPresent(properties::overrideDescription);
        Item item = component.get().water()
                ? new MobBucketItem(type, Fluids.WATER, SoundEvents.BUCKET_EMPTY_FISH, properties)
                : new DryBucketItem(type, properties);
        Registry.register(BuiltInRegistries.ITEM, key, item);
        ITEMS.put(type, item);
        CreativeModeTabEvents.modifyOutputEvent(TOOLS).register(output -> output.accept(item));
        return Optional.of(item);
    }

    /** The bucket item registered for {@code type}, if any. */
    public static Optional<Item> bucketOf(EntityType<?> type) {
        return Optional.ofNullable(ITEMS.get(type));
    }

    /** Whether the mob can be taken into a bucket. */
    public boolean enabled() {
        return bucketable != null && ITEMS.containsKey(mob.asMob().getType());
    }

    // Bucketable, as the bodies hand it over

    public boolean fromBucket() {
        return fromBucket;
    }

    public void setFromBucket(boolean from) {
        fromBucket = from;
    }

    /** Vanilla's default bucket data (name, health, persistence and the other mob flags), plus the variant id. */
    public void saveToBucketTag(ItemStack stack) {
        PathfinderMob body = mob.asMob();
        Bucketable.saveDefaultDataToBucketTag(body, stack);
        mob.driver().variants().id().ifPresent(variant -> CustomData.update(DataComponents.BUCKET_ENTITY_DATA, stack,
                tag -> tag.putString(MobVariants.KEY, variant)));
    }

    public void loadFromBucketTag(CompoundTag tag) {
        Bucketable.loadDefaultDataFromBucketTag(mob.asMob(), tag);
        tag.getString(MobVariants.KEY).ifPresent(mob.driver().variants()::setById);
    }

    public ItemStack getBucketItemStack() {
        Item item = ITEMS.get(mob.asMob().getType());
        return item == null ? ItemStack.EMPTY : new ItemStack(item);
    }

    public SoundEvent getPickupSound() {
        return SoundEvents.BUCKET_FILL_FISH;
    }

    /**
     * Second step of {@code mobInteract} (after mount storage): a water bucket (or, without {@code water}, an empty bucket)
     * takes the mob. {@code null} passes on.
     */
    InteractionResult mobInteract(Player player, InteractionHand hand) {
        if (!enabled()) {
            return null;
        }
        PathfinderMob body = mob.asMob();
        ItemStack held = player.getItemInHand(hand);
        if (bucketable.water()) {
            if (!held.is(Items.WATER_BUCKET)) {
                return null;
            }
            return pickup(player, hand, body).orElse(null);
        }
        if (!held.is(Items.BUCKET) || !body.isAlive()) {
            return null;
        }
        body.playSound(getPickupSound(), 1.0f, 1.0f);
        ItemStack bucket = getBucketItemStack();
        saveToBucketTag(bucket);
        player.setItemInHand(hand, ItemUtils.createFilledResult(held, player, bucket, false));
        if (body.level() instanceof ServerLevel) {
            body.discard();
        }
        return InteractionResult.SUCCESS;
    }

    /** Vanilla's pickup for a body, which every runtime body is (they all implement {@link Bucketable}). */
    @SuppressWarnings("unchecked")
    private static <T extends net.minecraft.world.entity.LivingEntity & Bucketable> Optional<InteractionResult> pickup(Player player,
            InteractionHand hand, PathfinderMob body) {
        return Bucketable.bucketMobPickup(player, hand, (T) body);
    }

    /** A mob from a bucket stays (vanilla's fish rule); otherwise the earlier answer. */
    boolean requiresCustomPersistence(boolean earlier) {
        return earlier || fromBucket;
    }

    void addAdditionalSaveData(ValueOutput output) {
        if (bucketable != null) {
            output.putBoolean("FromBucket", fromBucket);
        }
    }

    void readAdditionalSaveData(ValueInput input) {
        if (bucketable != null) {
            fromBucket = input.getBooleanOr("FromBucket", false);
        }
    }

    /**
     * The bucket of a mob that lives without water: used on a block it puts the mob on that face (as vanilla's buckets,
     * {@code EntitySpawnReason.BUCKET}), loads the bucket data and gives the empty bucket back.
     */
    public static final class DryBucketItem extends Item {
        private final EntityType<? extends Mob> type;

        public DryBucketItem(EntityType<? extends Mob> type, Item.Properties properties) {
            super(properties);
            this.type = type;
        }

        @Override
        public InteractionResult useOn(UseOnContext context) {
            if (!(context.getLevel() instanceof ServerLevel level)) {
                return InteractionResult.SUCCESS;
            }
            ItemStack stack = context.getItemInHand();
            BlockPos at = context.getClickedPos().relative(context.getClickedFace());
            Mob spawned = type.spawn(level, stack, context.getPlayer(), at, EntitySpawnReason.BUCKET, true, false);
            if (spawned == null) {
                return InteractionResult.FAIL;
            }
            if (spawned instanceof Bucketable bucketable) {
                bucketable.loadFromBucketTag(stack.getOrDefault(DataComponents.BUCKET_ENTITY_DATA, CustomData.EMPTY).copyTag());
                bucketable.setFromBucket(true);
            }
            level.playSound(null, at, SoundEvents.BUCKET_EMPTY_FISH, net.minecraft.sounds.SoundSource.NEUTRAL, 1.0f, 1.0f);
            level.gameEvent(context.getPlayer(), GameEvent.ENTITY_PLACE, at);
            Player player = context.getPlayer();
            if (player != null && !player.getAbilities().instabuild) {
                player.setItemInHand(context.getHand(), new ItemStack(Items.BUCKET));
            }
            return InteractionResult.SUCCESS;
        }
    }
}
