package dev.mcsupermods.runtime.loader;

import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/key_bind/<path>.json} definitions (ADR 0088 D3). A stub until B411: it returns no
 * definitions and reports nothing.
 */
public final class KeyBindParser {
    /** The scanner's kind folder. */
    public static final String KIND = "key_bind";

    private KeyBindParser() {}

    /**
     * The ids of the key bind definitions among {@code definitions} that parse; problems are added to {@code errors} and
     * {@code warnings}, each starting with the file it concerns.
     */
    public static List<Identifier> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        return List.of();
    }
}
