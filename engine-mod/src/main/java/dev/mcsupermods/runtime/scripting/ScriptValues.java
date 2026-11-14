package dev.mcsupermods.runtime.scripting;

import java.util.Optional;
import net.minecraft.core.Registry;
import net.minecraft.resources.Identifier;
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
