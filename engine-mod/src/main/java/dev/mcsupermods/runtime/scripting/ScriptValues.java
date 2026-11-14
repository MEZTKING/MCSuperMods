package dev.mcsupermods.runtime.scripting;

import java.util.Optional;
import net.minecraft.core.Registry;
import net.minecraft.resources.Identifier;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.Entity;
import org.mozilla.javascript.Context;
import org.mozilla.javascript.Function;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;
import org.mozilla.javascript.Undefined;

/** Argument conversion for host methods; every failure is a script {@code TypeError}. */
final class ScriptValues {
    private ScriptValues() {}

    /**
     * What a host getter or method returns for a script {@code null}; Java {@code null} means {@code undefined}
     * ({@link HostObject}).
     */
    static final Object NULL = new Object() {
        @Override
        public String toString() {
            return "null";
        }
    };

    static boolean present(Object[] args, int i) {
        return i < args.length && args[i] != null && !Undefined.isUndefined(args[i]);
    }

    static String string(Object[] args, int i, String what) {
        if (!present(args, i)) {
            throw ScriptRuntime.typeError(what + " is missing");
        }
        return Context.toString(args[i]);
    }

    static double number(Object[] args, int i, String what) {
        if (!present(args, i)) {
            throw ScriptRuntime.typeError(what + " is missing");
        }
        double d = Context.toNumber(args[i]);
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw ScriptRuntime.typeError(what + " is not a finite number");
        }
        return d;
    }

    static double number(Object[] args, int i, String what, double fallback) {
        return present(args, i) ? number(args, i, what) : fallback;
    }

    static Function function(Object[] args, int i, String what) {
        if (i >= args.length || !(args[i] instanceof Function fn)) {
            throw ScriptRuntime.typeError(what + " is not a function");
        }
        return fn;
    }

    /** A number member of an options object, or the fallback when the object or member is absent. */
    static double option(Object[] args, int i, String member, double fallback) {
        if (!present(args, i)) {
            return fallback;
        }
        if (!(args[i] instanceof Scriptable options)) {
            throw ScriptRuntime.typeError("options must be an object");
        }
        Object v = ScriptableObject.getProperty(options, member);
        if (v == Scriptable.NOT_FOUND || Undefined.isUndefined(v) || v == null) {
            return fallback;
        }
        double d = Context.toNumber(v);
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw ScriptRuntime.typeError("options." + member + " is not a finite number");
        }
        return d;
    }

    /** The options object argument {@code i}, or null when it is absent; anything else is a {@code TypeError}. */
    static Scriptable options(Object[] args, int i, String what) {
        if (!present(args, i)) {
            return null;
        }
        if (!(args[i] instanceof Scriptable options) || args[i] instanceof Function) {
            throw ScriptRuntime.typeError(what + " must be an object");
        }
        return options;
    }

    /** A member of an options object, or null when the object is null or the member is absent, undefined or null. */
    static Object member(Scriptable options, String name) {
        if (options == null) {
            return null;
        }
        Object v = ScriptableObject.getProperty(options, name);
        return v == Scriptable.NOT_FOUND || v == null || Undefined.isUndefined(v) ? null : v;
    }

    /** A string member of an options object, or the fallback. */
    static String stringMember(Scriptable options, String name, String fallback) {
        Object v = member(options, name);
        return v == null ? fallback : Context.toString(v);
    }

    /** A finite number member of an options object, or the fallback. */
    static double numberMember(Scriptable options, String name, double fallback) {
        Object v = member(options, name);
        if (v == null) {
            return fallback;
        }
        double d = Context.toNumber(v);
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            throw ScriptRuntime.typeError("options." + name + " is not a finite number");
        }
        return d;
    }

    /** A boolean member of an options object (JavaScript truthiness), or the fallback. */
    static boolean booleanMember(Scriptable options, String name, boolean fallback) {
        Object v = member(options, name);
        return v == null ? fallback : Context.toBoolean(v);
    }

    /** The game entity behind a script {@code Entity} or {@code Player} value; anything else is a {@code TypeError}. */
    static Entity entity(Object value, String what) {
        if (value instanceof HostObject h && h.target() instanceof Entity e) {
            return e;
        }
        throw ScriptRuntime.typeError(what + " is not an entity");
    }

    /** The server player behind a script {@code Player} value; anything else is a {@code TypeError}. */
    static ServerPlayer player(Object value, String what) {
        if (value instanceof HostObject h && h.target() instanceof ServerPlayer p) {
            return p;
        }
        throw ScriptRuntime.typeError(what + " is not a player");
    }

    /** A {@code RangeError} with {@code message}. */
    static RuntimeException rangeError(String message) {
        return ScriptRuntime.constructError("RangeError", message);
    }

    static Identifier id(String text, String what) {
        Identifier id = Identifier.tryParse(text);
        if (id == null) {
            throw ScriptRuntime.typeError(what + " '" + text + "' is not a valid id");
        }
        return id;
    }

    /** The registry entry named {@code text}, or a {@code TypeError} naming {@code what}. */
    static <T> T entry(Registry<T> registry, String text, String what) {
        Optional<T> value = registry.getOptional(id(text, what));
        if (value.isEmpty()) {
            throw ScriptRuntime.typeError("unknown " + what + " '" + text + "'");
        }
        return value.get();
    }
}
