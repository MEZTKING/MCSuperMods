package dev.mcsupermods.runtime.registry.vehicle;

import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.VehicleParser;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Project vehicles (ADR 0090): one entity type and one item per {@code vehicle} definition. A stub until B412: it reads
 * no definition and registers nothing.
 */
public final class MsmVehicles {
    private MsmVehicles() {}

    /**
     * Parses the scanned {@code vehicle} definitions, registers their entity types and items, and returns {@code report}
     * with the vehicle types registered and any errors and warnings; called once from {@code MsmRuntime.onInitialize},
     * after the registrar and before the key binds and HUD elements (which may name a vehicle).
     */
    public static LoadReport register(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<Identifier> vehicles = VehicleParser.parseAll(report.definitions(), errors, warnings);
        return report.withVehicles(vehicles, errors, warnings);
    }
}
