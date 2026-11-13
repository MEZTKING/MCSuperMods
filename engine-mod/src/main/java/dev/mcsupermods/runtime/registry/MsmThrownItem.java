package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import java.util.Optional;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Registry;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.MobCategory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.projectile.throwableitemprojectile.ThrowableItemProjectile;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.ValueInput;
import net.minecraft.world.level.storage.ValueOutput;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.HitResult;

/**
 * The one projectile entity of every throwable, {@code msm_runtime:thrown_item} (ADR 0056 D3). It carries a copy of
 * the thrown item (drawn by vanilla's {@code ThrownItemRenderer}) and reads its behaviour from that item's
 * {@code msm:throwable}: gravity, {@code damage} and {@code on_hit_entity} on an entity hit, {@code on_hit_block} on a
 * block hit, then {@code after_throw} ({@code drop}: the item drops where it lands; {@code return}: back into the
 * thrower's inventory, or at their feet when it is full or the thrower is gone, where it lands when there is no thrower)
 * and the entity is discarded. Hit events run with {@link EventContext#forThrownHit}: {@code self} is the thrower,
 * {@code other} the living entity hit.
 */
public class MsmThrownItem extends ThrowableItemProjectile {
    public static final Identifier ID = Identifier.fromNamespaceAndPath(MsmRuntime.MOD_ID, "thrown_item");
    private static final String CARRIES_ITEM = "msm_carries_item";

    private static EntityType<MsmThrownItem> type;

    /** Whether the item comes back ({@code drop}, {@code return}); false for creative throws and broken copies. */
    private boolean carriesItem;

    public MsmThrownItem(EntityType<? extends MsmThrownItem> type, Level level) {
        super(type, level);
    }

    public MsmThrownItem(Level level, LivingEntity owner, ItemStack stack) {
        super(type(), owner, level, stack);
    }

    public MsmThrownItem(Level level, double x, double y, double z, ItemStack stack) {
        super(type(), x, y, z, level, stack);
    }

    /**
     * The entity type, registered once from {@code MsmRegistrar.registerAll} whether or not any definition has a
     * throwable, so client and server registries always agree. Snowball settings: 0.25 by 0.25, no loot table,
     * tracking range 4, update interval 10 (read from {@code EntityTypes.<clinit>} of the 26.3 jar).
     */
    public static EntityType<MsmThrownItem> type() {
        if (type == null) {
            throw new IllegalStateException(ID + " is not registered yet");
        }
        return type;
    }

    static void register() {
        if (type != null) {
            return;
        }
        ResourceKey<EntityType<?>> key = ResourceKey.create(Registries.ENTITY_TYPE, ID);
        type = Registry.register(BuiltInRegistries.ENTITY_TYPE, key,
                EntityType.Builder.<MsmThrownItem>of(MsmThrownItem::new, MobCategory.MISC)
                        .noLootTable()
                        .sized(0.25f, 0.25f)
                        .clientTrackingRange(4)
                        .updateInterval(10)
                        .build(key));
    }

    public void setCarriesItem(boolean carriesItem) {
        this.carriesItem = carriesItem;
    }

    public boolean carriesItem() {
        return carriesItem;
    }

    /** Shown when the entity has no item (never for a throw by the runtime). */
    @Override
    protected Item getDefaultItem() {
        return Items.SNOWBALL;
    }

    /** The {@code msm:throwable} of the carried item, if it is a throwable. */
    public Optional<ItemComponents.Throwable> throwable() {
        return getItem().getItem() instanceof MsmThrowableItem item ? Optional.of(item.throwable()) : Optional.empty();
    }

    @Override
    protected double getDefaultGravity() {
        return throwable().map(t -> (double) t.gravity()).orElse(super.getDefaultGravity());
    }

    @Override
    protected void onHitEntity(EntityHitResult result) {
        super.onHitEntity(result);
        if (!(level() instanceof ServerLevel level)) {
            return;
        }
        Optional<ItemComponents.Throwable> throwable = throwable();
        Entity target = result.getEntity();
        if (throwable.isPresent() && throwable.get().damage() > 0) {
            target.hurtServer(level, damageSources().thrown(this, getOwner()), throwable.get().damage());
        }
        LivingEntity living = target instanceof LivingEntity l ? l : null;
        throwable.flatMap(ItemComponents.Throwable::onHitEntity).ifPresent(hit ->
                fire(level, hit.event(), EventContext.forThrownHit(level, result.getLocation(), target.blockPosition(), getOwner(), living, null)));
    }

    @Override
    protected void onHitBlock(BlockHitResult result) {
        super.onHitBlock(result);
        if (!(level() instanceof ServerLevel level)) {
            return;
        }
        BlockPos pos = result.getBlockPos();
        throwable().flatMap(ItemComponents.Throwable::onHitBlock).ifPresent(hit ->
                fire(level, hit.event(), EventContext.forThrownHit(level, result.getLocation(), pos, getOwner(), null, pos)));
    }

    private void fire(ServerLevel level, Identifier event, EventContext ctx) {
        if (getItem().getItem() instanceof MsmThrowableItem item) {
            EventRunner.fire(item.id(), item.definition().events(), event, ctx);
        }
    }

    /** The hit (entity or block, through {@code super}), then {@code after_throw}; the entity is discarded. */
    @Override
    protected void onHit(HitResult result) {
        super.onHit(result);
        if (level() instanceof ServerLevel level && !isRemoved()) {
            if (carriesItem) {
                land(level);
            }
            discard();
        }
    }

    private void land(ServerLevel level) {
        ItemStack stack = getItem().copy();
        if (stack.isEmpty()) {
            return;
        }
        ItemComponents.AfterThrow mode = throwable().map(ItemComponents.Throwable::afterThrow).orElse(ItemComponents.AfterThrow.DROP);
        if (mode == ItemComponents.AfterThrow.RETURN && getOwner() instanceof Player player && player.isAlive()) {
            player.getInventory().add(stack); // takes what fits from the stack
            if (!stack.isEmpty() && player.level() instanceof ServerLevel playerLevel) {
                player.spawnAtLocation(playerLevel, stack);
            }
            return;
        }
        if (mode == ItemComponents.AfterThrow.DROP || mode == ItemComponents.AfterThrow.RETURN) {
            spawnAtLocation(level, stack);
        }
    }

    @Override
    protected void addAdditionalSaveData(ValueOutput output) {
        super.addAdditionalSaveData(output);
        output.putBoolean(CARRIES_ITEM, carriesItem);
    }

    @Override
    protected void readAdditionalSaveData(ValueInput input) {
        super.readAdditionalSaveData(input);
        carriesItem = input.getBooleanOr(CARRIES_ITEM, false);
    }
}
