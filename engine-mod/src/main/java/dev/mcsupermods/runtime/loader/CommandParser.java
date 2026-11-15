package dev.mcsupermods.runtime.loader;

import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/command/<path>.json} definitions (ADR 0096 D1). A stub until B454: it returns no
 * definitions and reports nothing.
 */
public final class CommandParser {
    /** The scanner's kind folder. */
    public static final String KIND = "command";

    private CommandParser() {}

    /**
     * The ids of the command definitions among {@code definitions} that parse; problems are added to {@code errors}
     * and {@code warnings}, each starting with the file it concerns.
     */
    public static List<Identifier> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        return List.of();
    }
}
