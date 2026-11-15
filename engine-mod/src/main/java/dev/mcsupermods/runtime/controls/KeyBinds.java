package dev.mcsupermods.runtime.controls;

import dev.mcsupermods.runtime.loader.KeyBindParser;
import dev.mcsupermods.runtime.loader.LoadReport;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Project key binds on the server (ADR 0088 D3, D4, D7): the {@code key_bind} definitions, the held set per player and
 * the press, release and hold events. A stub until B411: it reads no definition and registers nothing.
 */
public final class KeyBinds {
    private KeyBinds() {}

    /**
     * Parses the scanned {@code key_bind} definitions and returns {@code report} with the key binds registered and any
     * errors and warnings; called once from {@code MsmRuntime.onInitialize}, after the vehicles.
     */
    public static LoadReport init(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<Identifier> keyBinds = KeyBindParser.parseAll(report.definitions(), errors, warnings);
        return report.withKeyBinds(keyBinds, errors, warnings);
    }
}
