package dev.mcsupermods.runtime.scripting;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;

/** {@code Player extends Entity} (ADR 0032 D2) over a {@link ServerPlayer}. */
final class ScriptPlayer {
    private ScriptPlayer() {}

    static final ScriptType TYPE = ScriptType.extending("Player", ScriptEntity.TYPE)
            .live("isSneaking", ServerPlayer.class, (api, p) -> p.isShiftKeyDown())
            .live("isCreative", ServerPlayer.class, (api, p) -> p.isCreative())
            .live("heldItem", ServerPlayer.class, (api, p) -> {
                ItemStack held = p.getItemInHand(InteractionHand.MAIN_HAND);
                return held.isEmpty() ? null : BuiltInRegistries.ITEM.getKey(held.getItem()).toString();
            })
            .method("give", 1, 2, ServerPlayer.class, (api, p, args) -> {
                Item item = ScriptValues.entry(BuiltInRegistries.ITEM, ScriptValues.string(args, 0, "item"), "item");
                give(p, item, (int) Math.max(1, ScriptValues.number(args, 1, "count", 1)));
                return null;
            })
            .method("hasItem", 1, 1, ServerPlayer.class, (api, p, args) -> {
                Item item = ScriptValues.entry(BuiltInRegistries.ITEM, ScriptValues.string(args, 0, "item"), "item");
                for (int i = 0; i < p.getInventory().getContainerSize(); i++) {
                    if (p.getInventory().getItem(i).is(item)) {
                        return true;
                    }
                }
                return false;
            })
            .method("sendMessage", 1, 1, ServerPlayer.class, (api, p, args) -> {
                p.sendSystemMessage(Component.literal(ScriptValues.string(args, 0, "text")));
                return null;
            });

    /** As the {@code give_item} action: whole stacks into the inventory, what does not fit dropped at the feet. */
    private static void give(ServerPlayer player, Item item, int count) {
        int left = count;
        int max = item.getDefaultMaxStackSize();
        while (left > 0) {
            ItemStack stack = new ItemStack(item, Math.min(left, max));
            left -= stack.getCount();
            if (!player.addItem(stack) && !stack.isEmpty()) {
                Block.popResource(player.level(), player.blockPosition(), stack);
            }
        }
    }
}
