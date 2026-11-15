package dev.mcsupermods.runtime.hud;

import dev.mcsupermods.runtime.loader.HudParser;
import dev.mcsupermods.runtime.loader.LoadReport;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * HUD elements on the server (ADR 0089 D1 to D6): the {@code hud} definitions, the values computed per player and
 * their sync to the client. A stub until B416: it reads no definition and registers nothing.
 */
public final class HudServer {
    private HudServer() {}

    /**
     * Parses the scanned {@code hud} definitions and returns {@code report} with the HUD elements registered and any
     * errors and warnings; called once from {@code MsmRuntime.onInitialize}, after the vehicles.
     */
    public static LoadReport init(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<Identifier> elements = HudParser.parseAll(report.definitions(), errors, warnings);
        return report.withHudElements(elements, errors, warnings);
    }
}
