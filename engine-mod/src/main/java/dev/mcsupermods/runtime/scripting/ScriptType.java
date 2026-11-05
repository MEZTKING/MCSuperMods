package dev.mcsupermods.runtime.scripting;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * One object type of the script API (ADR 0032 D1/D2): its name, the type it extends and its own members. A type is
 * both what {@link HostObject} installs for scripts and what {@link ScriptApi#describe()} reports to the JUnit
 * contract test, so the two cannot drift apart. Members are properties (read on every access, or once per object
 * for {@code constant}s), methods with a parameter range, or namespaces (nested objects over the same target).
 */
public final class ScriptType {
    /** Member kinds, named as in {@code script-api-v1.json}. */
    public enum Kind {
        PROPERTY("property"), METHOD("method"), NAMESPACE("namespace");

        public final String jsonName;

        Kind(String jsonName) {
            this.jsonName = jsonName;
        }
    }

    /** Reads a property of a target; returns a script value, or null for {@code undefined}. */
    @FunctionalInterface
    public interface Getter<T> {
        Object get(ScriptApi api, T target);
    }

    /** Runs a method on a target; returns a script value, or null for {@code undefined}. */
    @FunctionalInterface
    public interface Method<T> {
        Object call(ScriptApi api, T target, Object[] args);
    }

    /** A member as installed: exactly one of {@code getter}, {@code method}, {@code namespace} is set. */
    record Member(String name, Kind kind, boolean constant, Getter<Object> getter, int minArgs, int maxArgs,
            Method<Object> method, ScriptType namespace) {}

    private final String name;
    private final ScriptType parent;
    private final Map<String, Member> own = new LinkedHashMap<>();
    private Set<String> allNames;

    private ScriptType(String name, ScriptType parent) {
        this.name = name;
        this.parent = parent;
    }

    public static ScriptType of(String name) {
        return new ScriptType(name, null);
    }

    public static ScriptType extending(String name, ScriptType parent) {
        return new ScriptType(name, parent);
    }

    public String name() {
        return name;
    }

    /** The type this one extends, or null. */
    public ScriptType parent() {
        return parent;
    }

    /** A property read on every access (live game state). */
    public <T> ScriptType live(String member, Class<T> on, Getter<T> getter) {
        return add(new Member(member, Kind.PROPERTY, false, (api, t) -> getter.get(api, on.cast(t)), 0, 0, null, null));
    }

    /** A property read once per object and cached (event snapshots, immutable values). */
    public <T> ScriptType constant(String member, Class<T> on, Getter<T> getter) {
        return add(new Member(member, Kind.PROPERTY, true, (api, t) -> getter.get(api, on.cast(t)), 0, 0, null, null));
    }

    /** A method taking {@code minArgs} to {@code maxArgs} arguments. */
    public <T> ScriptType method(String member, int minArgs, int maxArgs, Class<T> on, Method<T> method) {
        return add(new Member(member, Kind.METHOD, true, null, minArgs, maxArgs,
                (api, t, args) -> method.call(api, on.cast(t), args), null));
    }

    /** A nested object of type {@code sub} over the same target. */
    public ScriptType namespace(String member, ScriptType sub) {
        return add(new Member(member, Kind.NAMESPACE, true, null, 0, 0, null, sub));
    }

    private ScriptType add(Member m) {
        if (own.putIfAbsent(m.name(), m) != null) {
            throw new IllegalStateException(name + "." + m.name() + " defined twice");
        }
        allNames = null;
        return this;
    }

    /** The member of this type or an ancestor, or null. */
    Member find(String member) {
        Member m = own.get(member);
        if (m == null && parent != null) {
            return parent.find(member);
        }
        return m;
    }

    /** Every member name, ancestors first. */
    Set<String> memberNames() {
        Set<String> names = allNames;
        if (names == null) {
            names = new LinkedHashSet<>();
            if (parent != null) {
                names.addAll(parent.memberNames());
            }
            names.addAll(own.keySet());
            allNames = names = Collections.unmodifiableSet(names);
        }
        return names;
    }

    /** This type's own members (not inherited ones) and its parent's name, for the contract test. */
    public ScriptApi.TypeDescription describe() {
        Map<String, ScriptApi.MemberDescription> members = new LinkedHashMap<>();
        own.forEach((n, m) -> members.put(n, new ScriptApi.MemberDescription(m.kind().jsonName, m.minArgs(), m.maxArgs(),
                m.namespace() == null ? null : m.namespace().describe())));
        return new ScriptApi.TypeDescription(parent == null ? null : parent.name(), Collections.unmodifiableMap(members));
    }
}
