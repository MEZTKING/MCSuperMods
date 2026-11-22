package dev.mcsupermods.runtime.scripting;

import java.util.ArrayDeque;
import java.util.Deque;
import net.fabricmc.fabric.api.entity.event.v1.EntitySleepEvents;
import net.minecraft.advancements.AdvancementHolder;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.item.ItemEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;

/**
 * The script events of Script API 1.7 (ADR 0111 D3 and its amendment after B525): {@code player.slept} and
 * {@code player.woke} through Fabric's {@code EntitySleepEvents}, and the entry points of the four Mixins that feed
 * {@code item.crafted} ({@code CraftedMixin}), {@code item.picked_up} ({@code ItemPickupMixin}), {@code player.ate}
 * ({@code ConsumeMixin}) and {@code player.advancement} ({@code AdvancementMixin} with {@code AdvancementRewardsMixin}).
 * Every entry point runs on the server thread, skips the client and anything that is not a {@link ServerPlayer}, and
 * builds no event data unless a script handles the event. The events are not cancellable: they report what happened.
 *
 * <ul>
 *   <li>{@code item.crafted}: once per craft, with the number made (a shift-click that crafts three times fires three
 *       times); every result slot that calls {@code ItemStack.onCraftedBy} counts: the 2 by 2 grid, the crafting table,
 *       furnaces and the other result slots of vanilla's menus.</li>
 *   <li>{@code item.picked_up}: the number taken from the ground, so a partial pickup into a nearly full inventory
 *       counts what went in.</li>
 *   <li>{@code player.ate}: once when a meal or a drink is finished; an interrupted meal fires nothing.</li>
 *   <li>{@code player.advancement}: once per completed advancement, by its own trigger or by {@code /advancement}; the
 *       recipe advancements ({@code <namespace>:recipes/...}, which unlock recipe book entries) are left out.</li>
 * </ul>
 */
public final class MoreEvents {
    /** The advancements being awarded on this thread, innermost last (a reward function may award another). */
    private static final ThreadLocal<Deque<AdvancementHolder>> AWARDING = ThreadLocal.withInitial(ArrayDeque::new);

    private static boolean registered;

    private MoreEvents() {}

    /** Registers the sleep listeners; called once from {@code MsmRuntime.onInitialize}. */
    public static void init() {
        if (registered) {
            return;
        }
        registered = true;
        EntitySleepEvents.START_SLEEPING.register((entity, pos) -> bed(entity, pos, ScriptEvents.PLAYER_SLEPT_EVENT));
        EntitySleepEvents.STOP_SLEEPING.register((entity, pos) -> bed(entity, pos, ScriptEvents.PLAYER_WOKE_EVENT));
    }

    private static ScriptHost host(MinecraftServer server, String event) {
        ScriptHost host = ScriptHost.current();
        return host != null && server != null && host.server() == server && host.handles(event) ? host : null;
    }

    private static void bed(LivingEntity entity, BlockPos pos, String event) {
        if (!(entity instanceof ServerPlayer player) || player.level().isClientSide()) {
            return;
        }
        ScriptHost host = host(player.level().getServer(), event);
        if (host != null) {
            host.fire(event, new ScriptEvents.PlayerBed(player.level(), player, ScriptPos.of(pos)));
        }
    }

    /** {@code CraftedMixin}: {@code amount} of {@code stack} were crafted by {@code player}. */
    public static void crafted(ItemStack stack, Player player, int amount) {
        if (!(player instanceof ServerPlayer sp) || player.level().isClientSide() || stack.isEmpty() || amount <= 0) {
            return;
        }
        ScriptHost host = host(sp.level().getServer(), ScriptEvents.ITEM_CRAFTED_EVENT);
        if (host != null) {
            host.fire(ScriptEvents.ITEM_CRAFTED_EVENT, new ScriptEvents.ItemTaken(sp.level(), sp, new ItemRef(stack.copyWithCount(amount)), amount));
        }
    }

    /**
     * {@code ItemPickupMixin}, head: a copy of the stack {@code item} holds before {@code player} touches it, or
     * {@link ItemStack#EMPTY} when no script would hear of a pickup (then {@link #pickedUp} does nothing).
     */
    public static ItemStack beforePickup(ItemEntity item, Player player) {
        if (!(player instanceof ServerPlayer sp) || player.level().isClientSide()
                || host(sp.level().getServer(), ScriptEvents.ITEM_PICKED_UP_EVENT) == null) {
            return ItemStack.EMPTY;
        }
        return item.getItem().copy();
    }

    /** {@code ItemPickupMixin}, return: fires {@code item.picked_up} when {@code player} took some of {@code before}. */
    public static void pickedUp(ItemEntity item, Player player, ItemStack before) {
        if (before.isEmpty() || !(player instanceof ServerPlayer sp)) {
            return;
        }
        int left = item.isRemoved() ? 0 : item.getItem().getCount();
        int taken = before.getCount() - left;
        if (taken <= 0) {
            return;
        }
        ScriptHost host = host(sp.level().getServer(), ScriptEvents.ITEM_PICKED_UP_EVENT);
        if (host != null) {
            host.fire(ScriptEvents.ITEM_PICKED_UP_EVENT, new ScriptEvents.ItemTaken(sp.level(), sp, new ItemRef(before.copyWithCount(taken)), taken));
        }
    }

    /** {@code ConsumeMixin}: {@code entity} finished eating or drinking one of {@code stack}. */
    public static void consumed(Level level, LivingEntity entity, ItemStack stack) {
        if (level.isClientSide() || !(entity instanceof ServerPlayer player) || stack.isEmpty()) {
            return;
        }
        ScriptHost host = host(player.level().getServer(), ScriptEvents.PLAYER_ATE_EVENT);
        if (host != null) {
            host.fire(ScriptEvents.PLAYER_ATE_EVENT, new ScriptEvents.PlayerAte(player.level(), player, new ItemRef(stack.copyWithCount(1))));
        }
    }

    /** {@code AdvancementMixin}, head of {@code PlayerAdvancements.award}: {@code holder} is being awarded. */
    public static void awarding(AdvancementHolder holder) {
        AWARDING.get().addLast(holder);
    }

    /** {@code AdvancementMixin}, return of {@code PlayerAdvancements.award}: the innermost award is over. */
    public static void awarded() {
        Deque<AdvancementHolder> stack = AWARDING.get();
        if (!stack.isEmpty()) {
            stack.removeLast();
        }
    }

    /**
     * {@code AdvancementRewardsMixin}, head of {@code AdvancementRewards.grant}: the advancement being awarded is complete
     * for {@code player}. A grant outside an award (none known) is ignored.
     */
    public static void completed(ServerPlayer player) {
        AdvancementHolder holder = AWARDING.get().peekLast();
        if (holder == null || player.level().isClientSide() || holder.id().getPath().startsWith("recipes/")) {
            return;
        }
        ScriptHost host = host(player.level().getServer(), ScriptEvents.PLAYER_ADVANCEMENT_EVENT);
        if (host != null) {
            host.fire(ScriptEvents.PLAYER_ADVANCEMENT_EVENT, new ScriptEvents.PlayerAdvancement(player.level(), player, holder.id().toString()));
        }
    }
}
