package dev.mcsupermods.runtime.registry.boat;

import dev.mcsupermods.runtime.loader.ItemDefinition;
import dev.mcsupermods.runtime.registry.MsmItem;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.entity.vehicle.boat.AbstractBoat;
import net.minecraft.world.item.BoatItem;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

/**
 * The item of an {@code msm:boat} definition (ADR 0110 D1): vanilla's {@link BoatItem} for the project's boat type, so a
 * use puts the boat on the block or water looked at as vanilla's boats do. The item's own events fire as on
 * {@link MsmItem} ({@code msm:on_use} before the boat is placed, {@code msm:on_hit}, {@code msm:on_use_on_block},
 * {@code msm:while_held}). The chest boat companion is a plain {@link BoatItem}: it has no definition of its own.
 */
public class MsmBoatItem extends BoatItem {
    private final Identifier id;
    private final ItemDefinition definition;
    private final EntityType<? extends AbstractBoat> boat;

    public MsmBoatItem(Identifier id, ItemDefinition definition, EntityType<? extends AbstractBoat> boat, Properties properties) {
        super(boat, properties);
        this.id = id;
        this.definition = definition;
        this.boat = boat;
    }

    public Identifier id() {
        return id;
    }

    public ItemDefinition definition() {
        return definition;
    }

    /** The entity type this item places. */
    public EntityType<? extends AbstractBoat> boat() {
        return boat;
    }

    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        return MsmItem.useWithEvent(id, definition, level, player, hand, () -> super.use(level, player, hand));
    }

    @Override
    public void hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
        super.hurtEnemy(stack, target, attacker);
        MsmItem.hurtEnemyWithEvent(id, definition, target, attacker);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        return MsmItem.useOnWithEvent(id, definition, context, () -> super.useOn(context));
    }

    @Override
    public void inventoryTick(ItemStack stack, ServerLevel level, Entity owner, EquipmentSlot slot) {
        super.inventoryTick(stack, level, owner, slot);
        MsmItem.inventoryTickWithEvent(id, definition, level, owner, slot);
    }
}
