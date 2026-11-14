package dev.mcsupermods.runtime.scripting;

import java.util.HashMap;
import java.util.Map;
import org.mozilla.javascript.LambdaFunction;
import org.mozilla.javascript.ScriptRuntime;
import org.mozilla.javascript.Scriptable;
import org.mozilla.javascript.ScriptableObject;
import org.mozilla.javascript.Undefined;

/**
 * A Java object as a script sees it: the members of its {@link ScriptType}, read-only. Methods are bound to the
 * target (so {@code const f = e.cancel; f()} works), created on first access and cached per object, as are
 * {@code constant} properties and namespaces. Assigning to any property throws a {@code TypeError}. A
 * {@link LiveTarget} is resolved on every access, so an entity wrapper follows the entity across a dimension change.
 */
final class HostObject extends ScriptableObject {
    private final transient ScriptApi api;
    private final ScriptType type;
    private final transient Object target;
    private Map<String, Object> cache;

    HostObject(ScriptApi api, ScriptType type, Object target) {
        super(api.scope(), ScriptableObject.getObjectPrototype(api.scope()));
        this.api = api;
        this.type = type;
        this.target = target;
    }

    /** The current target: a {@link LiveTarget} resolves to the object it stands for now. */
    Object target() {
        return target instanceof LiveTarget live ? live.resolve() : target;
    }

    ScriptType type() {
        return type;
    }

    @Override
    public String getClassName() {
        return type.name();
    }

    @Override
    public Object get(String name, Scriptable start) {
        ScriptType.Member m = type.find(name);
        if (m == null) {
            return super.get(name, start);
        }
        if (m.kind() == ScriptType.Kind.PROPERTY && !m.constant()) {
            return value(m.getter().get(api, target()));
        }
        if (cache == null) {
            cache = new HashMap<>();
        }
        Object cached = cache.get(name);
        if (cached == null) {
            cached = switch (m.kind()) {
                case PROPERTY -> value(m.getter().get(api, target()));
                case NAMESPACE -> new HostObject(api, m.namespace(), target);
                case METHOD -> new LambdaFunction(api.scope(), name, m.maxArgs(), (cx, scope, thisObj, args) -> {
                    if (args.length < m.minArgs()) {
                        throw ScriptRuntime.typeError(type.name() + "." + name + " needs " + m.minArgs() + " argument(s), got "
                                + args.length);
                    }
                    return value(m.method().call(api, target(), args));
                });
            };
            cache.put(name, cached);
        }
        return cached;
    }

    @Override
    public boolean has(String name, Scriptable start) {
        return type.find(name) != null || super.has(name, start);
    }

    @Override
    public void put(String name, Scriptable start, Object value) {
        throw ScriptRuntime.typeError("cannot assign to " + type.name() + "." + name + ": script API objects are read-only");
    }

    @Override
    public void delete(String name) {
        // Members cannot be deleted; ignored as for a non-configurable property in sloppy mode.
    }

    @Override
    public Object[] getIds() {
        return type.memberNames().toArray();
    }

    private static Object value(Object v) {
        if (v == ScriptValues.NULL) {
            return null;
        }
        return v == null ? Undefined.instance : v;
    }
}
