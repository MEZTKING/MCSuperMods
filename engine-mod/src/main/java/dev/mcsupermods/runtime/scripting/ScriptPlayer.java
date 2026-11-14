package dev.mcsupermods.runtime.scripting;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ClientboundClearTitlesPacket;
import net.minecraft.network.protocol.game.ClientboundSetActionBarTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.GameType;
import net.minecraft.world.level.block.Block;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;

/**
 * {@code Player extends Entity} (ADR 0032 D2, ADR 0065 D1 to D4) over a {@link ServerPlayer}. XP and food writes
 * change the server state, and vanilla's {@code ServerPlayer.doTick} sends them on the player's next tick (it compares
 * with the last values sent); the game mode is sent at once by {@code ServerPlayer.setGameMode}; titles and the action
 * bar are packets sent at once.
 */
final class ScriptPlayer {
    private ScriptPlayer() {}

    /** Title fade in, stay and fade out in ticks when the script gives none (vanilla's {@code /title} defaults). */
    static final int FADE_IN = 10;
    static final int STAY = 70;
    static final int FADE_OUT = 20;

    static final ScriptType TYPE = ScriptType.extending("Player", ScriptEntity.TYPE)
            .live("isSneaking", ServerPlayer.class, (api, p) -> p.isShiftKeyDown())
            .live("isCreative", ServerPlayer.class, (api, p) -> p.isCreative())
            .live("heldItem", ServerPlayer.class, (api, p) -> {
                ItemStack held = p.getItemInHand(InteractionHand.MAIN_HAND);
                return held.isEmpty() ? null : BuiltInRegistries.ITEM.getKey(held.getItem()).toString();
            })
            .method("give", 1, 2, ServerPlayer.class, (api, p, args) -> {
                ItemStack stack = ScriptItems.spec(api, args, 0);
                int count = ScriptValues.present(args, 1) ? (int) Math.max(1, ScriptValues.number(args, 1, "count")) : stack.getCount();
                give(p, stack, count);
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
            })
            .live("inventory", ServerPlayer.class, (api, p) -> api.inventory(p))
            .live("xpLevel", ServerPlayer.class, (api, p) -> p.experienceLevel)
            .live("xpPoints", ServerPlayer.class, (api, p) -> p.totalExperience)
            .live("food", ServerPlayer.class, (api, p) -> p.getFoodData().getFoodLevel())
            .live("saturation", ServerPlayer.class, (api, p) -> (double) p.getFoodData().getSaturationLevel())
            .live("gameMode", ServerPlayer.class, (api, p) -> p.gameMode().getName())
            .method("addXp", 1, 1, ServerPlayer.class, (api, p, args) -> {
                p.giveExperiencePoints(intArg(args, 0, "points"));
                return null;
            })
            .method("addXpLevels", 1, 1, ServerPlayer.class, (api, p, args) -> {
                p.giveExperienceLevels(intArg(args, 0, "levels"));
                return null;
            })
            .method("setXpLevels", 1, 1, ServerPlayer.class, (api, p, args) -> {
                p.setExperienceLevels(Math.max(0, intArg(args, 0, "levels")));
                return null;
            })
            .method("setFood", 1, 2, ServerPlayer.class, (api, p, args) -> {
                int level = Math.clamp(intArg(args, 0, "level"), 0, 20);
                p.getFoodData().setFoodLevel(level);
                double saturation = ScriptValues.present(args, 1) ? ScriptValues.number(args, 1, "saturation")
                        : p.getFoodData().getSaturationLevel();
                p.getFoodData().setSaturation((float) Math.clamp(saturation, 0, level));
                return null;
            })
            .method("setGameMode", 1, 1, ServerPlayer.class, (api, p, args) -> {
                String name = ScriptValues.string(args, 0, "mode");
                GameType mode = GameType.byName(name, null);
                if (mode == null) {
                    throw ScriptRuntime.typeError("unknown game mode '" + name + "'");
                }
                return p.setGameMode(mode);
            })
            .method("showTitle", 1, 2, ServerPlayer.class, (api, p, args) -> {
                String title = ScriptValues.string(args, 0, "title");
                Scriptable options = ScriptValues.options(args, 1, "options");
                String subtitle = ScriptValues.stringMember(options, "subtitle", null);
                int fadeIn = ticks(options, "fadeIn", FADE_IN);
                int stay = ticks(options, "stay", STAY);
                int fadeOut = ticks(options, "fadeOut", FADE_OUT);
                if (p.connection != null) {
                    p.connection.send(new ClientboundSetTitlesAnimationPacket(fadeIn, stay, fadeOut));
                    p.connection.send(new ClientboundSetSubtitleTextPacket(Component.literal(subtitle == null ? "" : subtitle)));
                    p.connection.send(new ClientboundSetTitleTextPacket(Component.literal(title)));
                }
                return null;
            })
            .method("showActionBar", 1, 1, ServerPlayer.class, (api, p, args) -> {
                String text = ScriptValues.string(args, 0, "text");
                if (p.connection != null) {
                    p.connection.send(new ClientboundSetActionBarTextPacket(Component.literal(text)));
                }
                return null;
            })
            .method("clearTitle", 0, 0, ServerPlayer.class, (api, p, args) -> {
                if (p.connection != null) {
                    p.connection.send(new ClientboundClearTitlesPacket(false));
                }
                return null;
            });

    private static int intArg(Object[] args, int i, String what) {
        double d = ScriptValues.number(args, i, what);
        return (int) Math.max(Integer.MIN_VALUE, Math.min(Integer.MAX_VALUE, Math.floor(d)));
    }

    private static int ticks(Scriptable options, String name, int fallback) {
        double d = ScriptValues.numberMember(options, name, fallback);
        return (int) Math.max(0, Math.min(Integer.MAX_VALUE, Math.floor(d)));
    }

    /**
     * As the {@code give_item} action: {@code count} items of {@code template} (its components kept) in whole stacks
     * into the inventory, what does not fit dropped at the feet.
     */
    private static void give(ServerPlayer player, ItemStack template, int count) {
        int left = count;
        int max = Math.max(1, template.getMaxStackSize());
        while (left > 0) {
            ItemStack stack = template.copyWithCount(Math.min(left, max));
            left -= stack.getCount();
            if (!player.addItem(stack) && !stack.isEmpty()) {
                Block.popResource(player.level(), player.blockPosition(), stack);
            }
        }
    }
}
