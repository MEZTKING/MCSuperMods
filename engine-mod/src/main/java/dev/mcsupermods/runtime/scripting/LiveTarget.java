package dev.mcsupermods.runtime.scripting;

/**
 * A host object target that stands for a game object which may be replaced while a script holds its wrapper; the
 * members of the wrapper's {@link ScriptType} always receive {@link #resolve()} (ADR 0065 D7).
 */
interface LiveTarget {
    /** The object this target stands for now. */
    Object resolve();
}
