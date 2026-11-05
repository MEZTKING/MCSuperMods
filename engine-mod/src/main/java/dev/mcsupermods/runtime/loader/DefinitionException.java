package dev.mcsupermods.runtime.loader;

/** A definition file that cannot be used; the message names the problem. */
public final class DefinitionException extends Exception {
    public DefinitionException(String message) {
        super(message);
    }
}
