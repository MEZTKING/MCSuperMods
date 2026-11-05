package dev.mcsupermods.runtime.scripting;

/**
 * Thrown from the instruction observer when one top-level script call runs past its wall-clock budget
 * (ADR 0031 D3). An {@link Error}, not an exception, so a script's own {@code try}/{@code catch} cannot
 * swallow it; the host catches and logs it.
 */
public final class ScriptTimeout extends Error {
    public ScriptTimeout(String message) {
        super(message, null, false, false);
    }
}
