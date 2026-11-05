package dev.mcsupermods.runtime.scripting;

import net.minecraft.core.BlockPos;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.LambdaFunction;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/** A block position as a script sees it: {@code { x, y, z, offset(dx, dy, dz) }}. */
final class Pos {
    private Pos() {}

    static Scriptable of(Context cx, Scriptable scope, BlockPos pos) {
        Scriptable o = cx.newObject(scope);
        ScriptableObject.putProperty(o, "x", pos.getX());
        ScriptableObject.putProperty(o, "y", pos.getY());
        ScriptableObject.putProperty(o, "z", pos.getZ());
        ScriptableObject.putProperty(o, "offset", new LambdaFunction(scope, "offset", 3,
                (c, s, t, args) -> of(c, scope, pos.offset(intArg(args, 0), intArg(args, 1), intArg(args, 2)))));
        return o;
    }

    static BlockPos from(Object value) {
        if (!(value instanceof Scriptable s)) {
            throw ScriptRuntime.typeError("expected a position { x, y, z }");
        }
        return new BlockPos(coord(s, "x"), coord(s, "y"), coord(s, "z"));
    }

    private static int coord(Scriptable s, String name) {
        double d = Context.toNumber(ScriptableObject.getProperty(s, name));
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw ScriptRuntime.typeError("position." + name + " is not a number");
        }
        return (int) Math.floor(d);
    }

    static int intArg(Object[] args, int i) {
        if (i >= args.length) {
            return 0;
        }
        double d = Context.toNumber(args[i]);
        return Double.isNaN(d) ? 0 : (int) Math.floor(d);
    }
}
