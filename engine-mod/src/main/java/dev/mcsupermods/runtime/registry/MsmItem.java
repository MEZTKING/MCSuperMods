package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.events.TickLimiter;
import dev.mcsupermods.runtime.loader.ItemDefinition;
import java.util.Optional;
import java.util.function.Supplier;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.context.UseOnContext;
import net.minecraft.world.level.Level;

/**
 * Driver class for {@code msm/<ns>/item/*.json} definitions (bows, crossbows and maces use
 * {@link MsmBowItem}, {@link MsmCrossbowItem} and {@link MsmMaceItem}). Food, consumables, tools,
 * armour, shields, death protection and durability are vanilla data components set on the
 * properties by {@link MsmRegistrar}; this class handles {@code msm:on_use} and the item triggers of ADR 0061 D1
 * ({@code msm:on_hit}, {@code msm:on_use_on_block}, {@code msm:while_held}, {@code msm:while_worn}), whose shared
 * handling every MSM item class calls.
 */
public class MsmItem extends Item {
    private final Identifier id;
    private final ItemDefinition definition;

    public MsmItem(Identifier id, ItemDefinition definition, Properties properties) {
        super(properties);
        this.id = id;
        this.definition = definition;
    }

    public Identifier id() {
        return id;
    }

    public ItemDefinition definition() {
        return definition;
    }

    /**
     * {@code msm:on_use}: fires the event, then starts the cooldown. Food still starts eating
     * afterwards (the vanilla behaviour of {@code super.use}).
     */
    @Override
    public InteractionResult use(Level level, Player player, InteractionHand hand) {
        return useWithEvent(id, definition, level, player, hand, () -> super.use(level, player, hand));
    }

    /**
     * The {@code msm:on_use} handling shared by every MSM item class ({@code MsmItem}, {@code MsmBowItem},
     * {@code MsmCrossbowItem}, {@code MsmMaceItem}): on cooldown the use fails; otherwise the event fires, the cooldown
     * starts and the vanilla use ({@code vanillaUse}) follows, a {@code PASS} turning into {@code SUCCESS}.
     */
    static InteractionResult useWithEvent(Identifier id, ItemDefinition definition, Level level, Player player, InteractionHand hand,
            Supplier<InteractionResult> vanillaUse) {
        Optional<ItemComponents.OnUse> onUse = definition.components().onUse();
        if (onUse.isEmpty()) {
            return vanillaUse.get();
        }
        ItemStack stack = player.getItemInHand(hand);
        if (player.getCooldowns().isOnCooldown(stack)) {
            return InteractionResult.FAIL;
        }
        if (level instanceof ServerLevel server) {
            EventRunner.fire(id, definition.events(), onUse.get().event(), EventContext.forItem(server, player));
        }
        if (onUse.get().cooldownTicks() > 0) {
            player.getCooldowns().addCooldown(stack, onUse.get().cooldownTicks());
        }
        InteractionResult vanilla = vanillaUse.get();
        return vanilla == InteractionResult.PASS ? InteractionResult.SUCCESS : vanilla;
    }

    @Override
    public void hurtEnemy(ItemStack stack, LivingEntity target, LivingEntity attacker) {
        super.hurtEnemy(stack, target, attacker);
        hurtEnemyWithEvent(id, definition, target, attacker);
    }

    @Override
    public InteractionResult useOn(UseOnContext context) {
        return useOnWithEvent(id, definition, context, () -> super.useOn(context));
    }

    @Override
    public void inventoryTick(ItemStack stack, ServerLevel level, Entity owner, EquipmentSlot slot) {
        super.inventoryTick(stack, level, owner, slot);
        inventoryTickWithEvent(id, definition, level, owner, slot);
    }

    /**
     * {@code msm:on_hit} (ADR 0061 D1). It hooks {@code hurtEnemy}, not {@code postHurtEnemy}: on 26.3 and 26.4 vanilla
     * calls {@code hurtEnemy} for a player's hit, a mob's melee hit ({@code Mob.doHurtTarget}) and a spear stab
     * ({@code LivingEntity.stabAttack}), but {@code postHurtEnemy} only for a player's hit, so a mob holding the item
     * would never fire. Server side only.
     */
    static void hurtEnemyWithEvent(Identifier id, ItemDefinition definition, LivingEntity target, LivingEntity attacker) {
        Optional<ItemComponents.OnHit> onHit = definition.components().onHit();
        if (onHit.isPresent() && attacker.level() instanceof ServerLevel server) {
            EventRunner.fire(id, definition.events(), onHit.get().event(), EventContext.forItemHit(server, attacker, target));
        }
    }

    /**
     * {@code msm:on_use_on_block} (ADR 0061 D1), as {@link #useWithEvent} on both sides: on cooldown the use fails;
     * otherwise the event fires on the server, the cooldown starts and the vanilla {@code useOn} follows, a
     * {@code PASS} turning into {@code SUCCESS}, so the click is consumed and {@code use} (and {@code msm:on_use})
     * does not run for it. Without a player (a dispenser) vanilla runs alone.
     */
    static InteractionResult useOnWithEvent(Identifier id, ItemDefinition definition, UseOnContext context,
            Supplier<InteractionResult> vanillaUseOn) {
        Optional<ItemComponents.OnUseOnBlock> onUseOn = definition.components().onUseOnBlock();
        Player player = context.getPlayer();
        if (onUseOn.isEmpty() || player == null) {
            return vanillaUseOn.get();
        }
        ItemStack stack = context.getItemInHand();
        if (player.getCooldowns().isOnCooldown(stack)) {
            return InteractionResult.FAIL;
        }
        if (context.getLevel() instanceof ServerLevel server) {
            EventRunner.fire(id, definition.events(), onUseOn.get().event(),
                    EventContext.forItemUseOn(server, player, context.getClickedPos(), context.getClickLocation()));
        }
        if (onUseOn.get().cooldownTicks() > 0) {
            player.getCooldowns().addCooldown(stack, onUseOn.get().cooldownTicks());
        }
        InteractionResult vanilla = vanillaUseOn.get();
        return vanilla == InteractionResult.PASS ? InteractionResult.SUCCESS : vanilla;
    }

    /**
     * {@code msm:while_held} and {@code msm:while_worn} (ADR 0061 D1, D4). Vanilla reports each stack once per tick:
     * {@code Inventory.tick} passes {@code MAINHAND} for the selected slot and {@code null} for the rest of the main
     * inventory, and {@code EntityEquipment.tick} passes each equipment slot; a player's main hand lives in the
     * inventory, not in the equipment map, so it is never reported twice (proven by {@code MsmTriggerGameTest}). A
     * {@code null} slot (a backpack slot) never fires. A firing happens when {@code (game time + entity id)} is a
     * multiple of the interval, which staggers holders, and only within the shared {@link TickLimiter}.
     */
    static void inventoryTickWithEvent(Identifier id, ItemDefinition definition, ServerLevel level, Entity owner, EquipmentSlot slot) {
        ItemComponents c = definition.components();
        if (slot == null || !c.ticksInInventory()) {
            return;
        }
        c.whileHeld().ifPresent(held -> {
            boolean inHand = switch (held.hand()) {
                case MAIN -> slot == EquipmentSlot.MAINHAND;
                case OFF -> slot == EquipmentSlot.OFFHAND;
                case EITHER -> slot == EquipmentSlot.MAINHAND || slot == EquipmentSlot.OFFHAND;
            };
            if (inHand && due(level, owner, held.intervalTicks()) && TickLimiter.tryFire(level)) {
                EventRunner.fire(id, definition.events(), held.event(), EventContext.forHolder(level, owner));
            }
        });
        c.whileWorn().ifPresent(worn -> {
            if (c.armor().isPresent() && slot == wornSlot(c.armor().get().slot()) && due(level, owner, worn.intervalTicks())
                    && TickLimiter.tryFire(level)) {
                EventRunner.fire(id, definition.events(), worn.event(), EventContext.forHolder(level, owner));
            }
        });
    }

    /** Whether an interval trigger of {@code owner} is due this game tick (staggered by entity id, ADR 0061 D4). */
    static boolean due(ServerLevel level, Entity owner, int interval) {
        return Math.floorMod(level.getGameTime() + owner.getId(), (long) interval) == 0;
    }

    /** The equipment slot an {@code msm:armor} piece is worn in. */
    static EquipmentSlot wornSlot(ItemComponents.ArmorSlot slot) {
        return switch (slot) {
            case HELMET -> EquipmentSlot.HEAD;
            case CHESTPLATE -> EquipmentSlot.CHEST;
            case LEGGINGS -> EquipmentSlot.LEGS;
            case BOOTS -> EquipmentSlot.FEET;
            case HORSE, WOLF -> EquipmentSlot.BODY;
        };
    }
}
