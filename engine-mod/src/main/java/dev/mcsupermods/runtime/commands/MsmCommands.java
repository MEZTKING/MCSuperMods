package dev.mcsupermods.runtime.commands;

import com.google.gson.JsonObject;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.events.EventContext;
import dev.mcsupermods.runtime.events.EventRunner;
import dev.mcsupermods.runtime.loader.CommandParser;
import dev.mcsupermods.runtime.loader.CommandParser.Command;
import dev.mcsupermods.runtime.loader.LoadReport;
import dev.mcsupermods.runtime.loader.RawDefinition;
import dev.mcsupermods.runtime.scripting.CommandEvents;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.minecraft.commands.CommandBuildContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.core.BlockPos;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.server.permissions.LevelBasedPermissionSet;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.phys.Vec3;

/**
 * Project commands (ADR 0096 D1): one literal command tree per literal ({@code name} and each alias) of every
 * {@code command} definition, registered with Fabric's {@link CommandRegistrationCallback}. Definitions are frozen at
 * start; the trees are built again whenever the callback runs (at every server start and every {@code /reload}, on a
 * worker thread, B440 S8), and after a reload the command trees are sent again to every player.
 *
 * <ul>
 *   <li>A literal that another project command already has is a load error at start and is dropped (the first command
 *       in scan order keeps it); a command left without literals is not registered.</li>
 *   <li>A literal the dispatcher already has when the callback runs (a vanilla command, or another mod's registered
 *       earlier) is a load error, logged once per server run and kept in {@link #lastRegistrationErrors()}; that literal
 *       is not registered and the vanilla command stays.</li>
 *   <li>Running a command, in this order: the arguments are read ({@link CommandArguments}); with {@code function}, the
 *       macro values are written to command storage {@code <mod id>:args} and
 *       {@code function <id> with storage <mod id>:args} runs as and at the source with
 *       {@link LevelBasedPermissionSet#GAMEMASTER} (queued in the running command's execution, so its results are seen
 *       once the command returns); with {@code event}, the event's actions run with the source entity as self and other
 *       (the player when it is one; none for the console or a command block) at the source's position; then the
 *       script event {@code command} fires ({@link CommandEvents#fire}); then {@code feedback} is sent to the source.
 *       The command returns 1.</li>
 * </ul>
 */
public final class MsmCommands {
    /** One registered command: its definition, the mod that shipped it and the literals it kept. */
    public record Registered(Identifier id, String modId, Command def, List<String> literals) {
        /** The command storage of the macro values, {@code <mod id>:args} (as the eject). */
        public Identifier storage() {
            return Identifier.fromNamespaceAndPath(modId, "args");
        }
    }

    private static volatile List<Registered> commands = List.of();
    private static volatile List<String> lastRegistrationErrors = List.of();
    /** Registration errors logged in this server run, so a {@code /reload} does not log them again. */
    private static final Set<String> LOGGED = ConcurrentHashMap.newKeySet();
    private static boolean registered;

    private MsmCommands() {}

    /**
     * Parses the scanned {@code command} definitions, registers the command callback and returns {@code report} with the
     * commands registered and any errors and warnings; called once from {@code MsmRuntime.onInitialize}, after the
     * registrar and the vehicles.
     */
    public static LoadReport init(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        Map<Identifier, Command> parsed = CommandParser.parseAll(report.definitions(), errors, warnings);
        Map<Identifier, String> mods = new HashMap<>();
        for (RawDefinition raw : report.definitions()) {
            if (raw.kind().equals(CommandParser.KIND)) {
                mods.put(raw.id(), raw.modId());
            }
        }
        Map<String, Identifier> claimed = new LinkedHashMap<>();
        List<Registered> out = new ArrayList<>();
        parsed.forEach((id, def) -> {
            List<String> literals = new ArrayList<>();
            for (String literal : def.literals()) {
                Identifier owner = claimed.get(literal);
                if (owner != null) {
                    errors.add("command " + id + ": /" + literal + " is already a literal of project command " + owner + "; dropped");
                } else {
                    claimed.put(literal, id);
                    literals.add(literal);
                }
            }
            if (literals.isEmpty()) {
                errors.add("command " + id + ": no literal left; not registered");
                return;
            }
            out.add(new Registered(id, mods.getOrDefault(id, id.getNamespace()), def, List.copyOf(literals)));
        });
        errors.forEach(message -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message));
        warnings.forEach(message -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, message));
        commands = List.copyOf(out);
        register();
        return report.withCommands(out.stream().map(Registered::id).toList(), errors, warnings);
    }

    /** The registered commands, in scan order. */
    public static List<Registered> commands() {
        return commands;
    }

    /** The command {@code id}, if it was registered. */
    public static Optional<Registered> command(Identifier id) {
        return commands.stream().filter(c -> c.id().equals(id)).findFirst();
    }

    /** The literals refused the last time the trees were built (vanilla or another mod has them). */
    public static List<String> lastRegistrationErrors() {
        return lastRegistrationErrors;
    }

    private static void register() {
        if (registered) {
            return;
        }
        registered = true;
        CommandRegistrationCallback.EVENT.register((dispatcher, buildContext, selection) -> registerAll(dispatcher, buildContext));
        // B440 S8: the callback runs again on /reload, but the players still have the old trees until they are sent.
        ServerLifecycleEvents.END_DATA_PACK_RELOAD.register((server, resources, success) -> {
            for (ServerPlayer player : server.getPlayerList().getPlayers()) {
                server.getCommands().sendCommands(player);
            }
        });
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> LOGGED.clear());
    }

    /**
     * Registers every command's literals into {@code dispatcher} and returns the refused ones' errors (the
     * {@link CommandRegistrationCallback} listener; GameTests call it on a fresh dispatcher).
     */
    public static List<String> registerAll(CommandDispatcher<CommandSourceStack> dispatcher, CommandBuildContext buildContext) {
        List<String> errors = new ArrayList<>();
        for (Registered cmd : commands) {
            for (String literal : cmd.literals()) {
                if (dispatcher.getRoot().getChild(literal) != null) {
                    errors.add("command " + cmd.id() + ": /" + literal
                            + " is already a command of the game or another mod; this literal is not registered");
                    continue;
                }
                dispatcher.register(CommandBuilder.build(literal, cmd.def(), buildContext, (context, present) -> run(cmd, context, present)));
            }
        }
        for (String message : errors) {
            if (LOGGED.add(message)) {
                MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, message);
            }
        }
        lastRegistrationErrors = List.copyOf(errors);
        return errors;
    }

    /** Runs {@code cmd} with the first {@code present} arguments given. */
    static int run(Registered cmd, CommandContext<CommandSourceStack> context, int present) throws CommandSyntaxException {
        CommandSourceStack source = context.getSource();
        Command def = cmd.def();
        CompoundTag macros = new CompoundTag();
        JsonObject args = new JsonObject();
        for (int i = 0; i < present; i++) {
            CommandArguments.put(context, def.arguments().get(i), macros, args);
        }
        MinecraftServer server = source.getServer();
        if (def.function().isPresent()) {
            Identifier storage = cmd.storage();
            server.getCommandStorage().set(storage, macros);
            server.getCommands().performPrefixedCommand(source.withPermission(LevelBasedPermissionSet.GAMEMASTER),
                    "function " + def.function().get() + " with storage " + storage);
        }
        def.event().ifPresent(event -> {
            Identifier eventId = Identifier.tryParse(event);
            if (eventId != null) {
                EventRunner.fire(cmd.id(), def.events(), eventId, context(source));
            }
        });
        CommandEvents.fire(cmd.id(), def.name(), source, args);
        def.feedback().ifPresent(key -> source.sendSuccess(() -> Component.translatable(key), false));
        return 1;
    }

    /**
     * The event context of a command (ADR 0096 D1): the source entity is self and, when living, other (the player when it
     * is one, else the entity, which {@code run_function} then runs as); offsets from the block at the source's position,
     * effects at the position. The console and command blocks have no entity.
     */
    static EventContext context(CommandSourceStack source) {
        Entity entity = source.getEntity();
        Player player = entity instanceof Player p ? p : null;
        Vec3 pos = source.getPosition();
        return new EventContext(source.getLevel(), BlockPos.containing(pos), pos, player, player == null ? entity : null, null,
                entity instanceof LivingEntity living ? living : null, EventContext.Source.ITEM);
    }
}
