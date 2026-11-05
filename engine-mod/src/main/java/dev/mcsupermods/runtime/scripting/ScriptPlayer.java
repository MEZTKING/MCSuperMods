package dev.mcsupermods.runtime.scripting;

import java.util.Optional;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.Block;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.LambdaFunction;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/** A player as a script sees it: {@code name}, {@code give(id, count)}. Spike subset of ADR 0032. */
final class ScriptPlayer {
    private ScriptPlayer() {}

    static Scriptable of(Context cx, Scriptable scope, ServerPlayer player) {
        Scriptable o = cx.newObject(scope);
        ScriptableObject.putProperty(o, "name", player.getPlainTextName());
        ScriptableObject.putProperty(o, "give", new LambdaFunction(scope, "give", 2, (c, s, t, args) -> {
            String id = args.length > 0 ? Context.toString(args[0]) : "";
            int count = args.length > 1 ? Math.max(1, Pos.intArg(args, 1)) : 1;
            give(player, id, count);
            return Context.getUndefinedValue();
        }));
        return o;
    }

    private static void give(ServerPlayer player, String id, int count) {
        Identifier parsed = Identifier.tryParse(id);
        Optional<Item> item = parsed == null ? Optional.empty() : BuiltInRegistries.ITEM.getOptional(parsed);
        if (item.isEmpty()) {
            throw ScriptRuntime.typeError("unknown item '" + id + "'");
        }
        int left = count;
        int max = item.get().getDefaultMaxStackSize();
        while (left > 0) {
            ItemStack stack = new ItemStack(item.get(), Math.min(left, max));
            left -= stack.getCount();
            if (!player.addItem(stack) && !stack.isEmpty()) {
                Block.popResource(player.level(), player.blockPosition(), stack);
            }
        }
    }
}
