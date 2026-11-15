package dev.mcsupermods.runtime.commands;

import dev.mcsupermods.runtime.loader.CommandParser;
import dev.mcsupermods.runtime.loader.LoadReport;
import java.util.ArrayList;
import java.util.List;
import net.minecraft.resources.Identifier;

/**
 * Project commands (ADR 0096 D1): one literal command tree per {@code command} definition, registered with Fabric's
 * {@code CommandRegistrationCallback}. A stub until B454: it reads no definition and registers nothing.
 */
public final class MsmCommands {
    private MsmCommands() {}

    /**
     * Parses the scanned {@code command} definitions, registers the command callback and returns {@code report} with the
     * commands registered and any errors and warnings; called once from {@code MsmRuntime.onInitialize}, after the
     * registrar and the vehicles.
     */
    public static LoadReport init(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        List<Identifier> commands = CommandParser.parseAll(report.definitions(), errors, warnings);
        return report.withCommands(commands, errors, warnings);
    }
}
