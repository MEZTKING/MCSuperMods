package dev.mcsupermods.runtime.scripting;

import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.Vec3;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;

/**
 * {@code Pos} (ADR 0032 D2): an immutable position. Block positions have integer coordinates, entity positions exact
 * ones. Host methods accept any object with numeric {@code x}, {@code y} and {@code z}, not only {@code Pos} objects.
 */
public record ScriptPos(double x, double y, double z) {
    static final ScriptType TYPE = ScriptType.of("Pos")
            .constant("x", ScriptPos.class, (api, p) -> p.x)
            .constant("y", ScriptPos.class, (api, p) -> p.y)
            .constant("z", ScriptPos.class, (api, p) -> p.z)
            .method("offset", 3, 3, ScriptPos.class, (api, p, args) -> api.pos(new ScriptPos(
                    p.x + ScriptValues.number(args, 0, "dx"),
                    p.y + ScriptValues.number(args, 1, "dy"),
                    p.z + ScriptValues.number(args, 2, "dz"))))
            .method("toString", 0, 0, ScriptPos.class, (api, p, args) -> p.toText());

    static ScriptPos of(BlockPos pos) {
        return new ScriptPos(pos.getX(), pos.getY(), pos.getZ());
    }

    static ScriptPos of(Vec3 v) {
        return new ScriptPos(v.x, v.y, v.z);
    }

    /** {@code 1, 64, -3}; integers without a fraction, as JavaScript prints numbers. */
    String toText() {
        return ScriptRuntime.numberToString(x, 10) + ", " + ScriptRuntime.numberToString(y, 10) + ", "
                + ScriptRuntime.numberToString(z, 10);
    }

    BlockPos block() {
        return BlockPos.containing(x, y, z);
    }

    Vec3 vec() {
        return new Vec3(x, y, z);
    }

    /** The position argument {@code i}: a {@code Pos} or any object with numeric {@code x}, {@code y}, {@code z}. */
    static ScriptPos arg(Object[] args, int i, String what) {
        Object value = i < args.length ? args[i] : null;
        if (value instanceof HostObject h && h.target() instanceof ScriptPos p) {
            return p;
        }
        if (!(value instanceof Scriptable s)) {
            throw ScriptRuntime.typeError(what + " is not a position { x, y, z }");
        }
        return new ScriptPos(coord(s, "x", what), coord(s, "y", what), coord(s, "z", what));
    }

    private static double coord(Scriptable s, String name, String what) {
        Object v = ScriptableObject.getProperty(s, name);
        double d = v == Scriptable.NOT_FOUND ? Double.NaN : Context.toNumber(v);
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw ScriptRuntime.typeError(what + "." + name + " is not a number");
        }
        return d;
    }
}
