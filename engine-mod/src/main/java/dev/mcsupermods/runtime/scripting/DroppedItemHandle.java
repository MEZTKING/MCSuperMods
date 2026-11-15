package dev.mcsupermods.runtime.scripting;

import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.item.ItemStack;

/**
 * {@code DroppedItem} (Script API 1.6, ADR 0096 D4): an item lying in the world, as {@code World.itemsNear} finds it.
 * It is no {@code Entity} for scripts ({@code entitiesNear} keeps living entities only). The handle follows the item
 * entity across a dimension change as {@link EntityHandle} does. {@code item}, {@code pos}, {@code age} and
 * {@code owner} are read on every access; {@code remove()} and {@code setItem} do nothing once the item is gone (picked
 * up, merged into another stack, despawned or removed). {@code owner} is the entity that dropped or threw it while that
 * entity is loaded ({@code ItemEntity.getOwner()}), so a player who has left reads as no owner.
 */
final class DroppedItemHandle implements LiveTarget {
    private final EntityHandle handle;

    DroppedItemHandle(ItemEntity item) {
        this.handle = new EntityHandle(item);
    }

    @Override
    public ItemEntity resolve() {
        return (ItemEntity) handle.resolve();
    }

    static final ScriptType TYPE = ScriptType.of("DroppedItem")
            .live("item", ItemEntity.class, (api, e) -> api.item(new ItemRef(e.getItem())))
            .live("pos", ItemEntity.class, (api, e) -> api.pos(ScriptPos.of(e.position())))
            .live("age", ItemEntity.class, (api, e) -> (double) e.getAge())
            .live("owner", ItemEntity.class, (api, e) -> {
                Entity owner = e.getOwner();
                return owner == null ? null : owner.getStringUUID();
            })
            .method("remove", 0, 0, ItemEntity.class, (api, e, args) -> {
                e.discard();
                return null;
            })
            .method("setItem", 1, 1, ItemEntity.class, (api, e, args) -> {
                ItemStack stack = ScriptInventory.capped(ScriptItems.spec(api, args, 0));
                if (!e.isRemoved()) {
                    e.setItem(stack);
                }
                return null;
            });
}
