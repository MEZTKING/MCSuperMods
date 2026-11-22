package dev.mcsupermods.runtime.scripting;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.hud.HudServer;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import net.minecraft.core.Holder;
import net.minecraft.core.registries.Registries;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.network.protocol.game.ClientboundClearTitlesPacket;
import net.minecraft.network.protocol.game.ClientboundSetActionBarTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetSubtitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitleTextPacket;
import net.minecraft.network.protocol.game.ClientboundSetTitlesAnimationPacket;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.dialog.Dialog;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.stats.Stat;
import net.minecraft.stats.Stats;
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
 * bar are packets sent at once. Script API 1.5 (ADR 0089 D8): {@code showHud}, {@code hideHud} and {@code setHud}
 * go through {@link HudServer} as the {@code show_hud}, {@code hide_hud} and {@code set_hud} actions do; they return
 * {@code false} for an id that is not a HUD element of this game (logged once) or a number that is not finite. Script API
 * 1.7 (ADR 0111 D4, D6): {@code stat} and {@code addStat} read and add to a custom statistic (saved with the player;
 * {@code awardStat} also moves the scoreboard objectives that count it), and {@code openDialog} opens a dialog of the
 * {@code dialog} registry ({@code ServerPlayer.openDialog}, B525), {@code false} for an unknown id (logged once).
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
            })
            // Script API 1.5 (ADR 0089 D8): the player's HUD elements.
            .method("showHud", 1, 1, ServerPlayer.class, (api, p, args) -> HudServer.show(p, hudId(args)))
            .method("hideHud", 1, 1, ServerPlayer.class, (api, p, args) -> HudServer.hide(p, hudId(args)))
            .method("setHud", 2, 2, ServerPlayer.class, (api, p, args) -> {
                Identifier id = hudId(args);
                Object value = args[1];
                if (value instanceof Number n) {
                    return HudServer.set(p, id, n.doubleValue());
                }
                if (value instanceof CharSequence text) {
                    return HudServer.set(p, id, text.toString());
                }
                throw ScriptRuntime.typeError("value is not a number or a string");
            })
            // Script API 1.7 (ADR 0111 D4, D6): custom statistics and dialogs.
            .method("stat", 1, 1, ServerPlayer.class, (api, p, args) -> p.getStats().getValue(stat(args)))
            .method("addStat", 2, 2, ServerPlayer.class, (api, p, args) -> {
                Stat<Identifier> stat = stat(args);
                double amount = ScriptValues.number(args, 1, "amount");
                if (!Double.isFinite(amount)) {
                    throw ScriptRuntime.typeError("amount is not a finite number");
                }
                long current = p.getStats().getValue(stat);
                long wanted = Math.max(0, Math.min(Integer.MAX_VALUE, current + (long) Math.max(-Integer.MAX_VALUE, Math.min(Integer.MAX_VALUE,
                        Math.floor(amount)))));
                int change = (int) (wanted - current);
                if (change != 0) {
                    // awardStat also moves the scores of objectives counting this statistic.
                    p.awardStat(stat, change);
                }
                return p.getStats().getValue(stat);
            })
            .method("openDialog", 1, 1, ServerPlayer.class, (api, p, args) -> openDialog(p, args));

    /** Dialog ids {@code openDialog} did not find, each logged once per run. */
    private static final Set<Identifier> UNKNOWN_DIALOGS = ConcurrentHashMap.newKeySet();

    /** {@code openDialog(id)}: opens the dialog for the player; {@code false} (logged once) for an id that is no dialog. */
    private static boolean openDialog(ServerPlayer p, Object[] args) {
        Identifier id = ScriptValues.id(ScriptValues.string(args, 0, "dialog id"), "dialog id");
        Optional<Holder.Reference<Dialog>> dialog = p.level().getServer().registryAccess().lookupOrThrow(Registries.DIALOG)
                .get(ResourceKey.create(Registries.DIALOG, id));
        if (dialog.isEmpty()) {
            if (UNKNOWN_DIALOGS.add(id)) {
                MsmRuntime.LOGGER.warn("[{}] openDialog: {} is no dialog of this game", MsmRuntime.MOD_ID, id);
            }
            return false;
        }
        p.openDialog(dialog.get());
        return true;
    }

    /**
     * The custom statistic a {@code stat} or {@code addStat} call names (a project's {@code msm:stat} or any entry of the
     * {@code custom_stat} registry, vanilla's {@code minecraft:jump} too); an invalid or unknown id is a TypeError. The
     * registry's own {@code Identifier} instance is used: {@code Stats.CUSTOM} finds a statistic by identity (B525).
     */
    static Stat<Identifier> stat(Object[] args) {
        String text = ScriptValues.string(args, 0, "statistic id");
        Identifier registered = BuiltInRegistries.CUSTOM_STAT.getValue(ScriptValues.id(text, "statistic id"));
        if (registered == null) {
            throw ScriptRuntime.typeError("unknown statistic '" + text + "'");
        }
        return Stats.CUSTOM.get(registered);
    }

    /** The HUD element id of a {@code showHud}, {@code hideHud} or {@code setHud} call; an invalid id is a TypeError. */
    private static Identifier hudId(Object[] args) {
        return ScriptValues.id(ScriptValues.string(args, 0, "HUD element id"), "HUD element id");
    }

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
