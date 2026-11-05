package dev.mcsupermods.runtime.scripting;

import java.util.Optional;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.LambdaFunction;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/** The level a script event happened in: {@code setBlock(pos, id)}, {@code getBlock(pos)}. Spike subset of ADR 0032. */
final class ScriptWorld {
    private ScriptWorld() {}

    static Scriptable of(Context cx, Scriptable scope, ServerLevel level) {
        Scriptable o = cx.newObject(scope);
        ScriptableObject.putProperty(o, "setBlock", new LambdaFunction(scope, "setBlock", 2, (c, s, t, args) -> {
            if (args.length < 2) {
                throw ScriptRuntime.typeError("setBlock(pos, id) needs two arguments");
            }
            Block block = block(Context.toString(args[1]));
            level.setBlockAndUpdate(Pos.from(args[0]), block.defaultBlockState());
            return Context.getUndefinedValue();
        }));
        ScriptableObject.putProperty(o, "getBlock", new LambdaFunction(scope, "getBlock", 1, (c, s, t, args) ->
                BuiltInRegistries.BLOCK.getKey(level.getBlockState(Pos.from(args.length > 0 ? args[0] : null)).getBlock()).toString()));
        return o;
    }

    private static Block block(String id) {
        Identifier parsed = Identifier.tryParse(id);
        Optional<Block> block = parsed == null ? Optional.empty() : BuiltInRegistries.BLOCK.getOptional(parsed);
        if (block.isEmpty()) {
            throw ScriptRuntime.typeError("unknown block '" + id + "'");
        }
        return block.get();
    }
}
