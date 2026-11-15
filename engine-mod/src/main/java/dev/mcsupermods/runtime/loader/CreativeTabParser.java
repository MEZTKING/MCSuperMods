package dev.mcsupermods.runtime.loader;

import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/creative_tab/<path>.json} definitions (ADR 0096 D2). A stub until B454: it returns no
 * definitions and reports nothing.
 */
public final class CreativeTabParser {
    /** The scanner's kind folder. */
    public static final String KIND = "creative_tab";

    private CreativeTabParser() {}

    /**
     * The ids of the creative tab definitions among {@code definitions} that parse; problems are added to {@code errors}
     * and {@code warnings}, each starting with the file it concerns.
     */
    public static List<Identifier> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        return List.of();
    }
}
