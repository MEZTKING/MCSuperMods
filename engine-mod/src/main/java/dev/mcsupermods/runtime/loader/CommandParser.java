package dev.mcsupermods.runtime.loader;

import static dev.mcsupermods.runtime.loader.MsmCodecs.ID;
import static dev.mcsupermods.runtime.loader.MsmCodecs.closed;
import static dev.mcsupermods.runtime.loader.MsmCodecs.intRange;
import static dev.mcsupermods.runtime.loader.MsmCodecs.listOfLength;
import static dev.mcsupermods.runtime.loader.MsmCodecs.optional;
import static dev.mcsupermods.runtime.loader.MsmCodecs.required;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonPrimitive;
import com.mojang.serialization.Codec;
import com.mojang.serialization.DataResult;
import com.mojang.serialization.codecs.RecordCodecBuilder;
import dev.mcsupermods.runtime.events.Action;
import dev.mcsupermods.runtime.events.EventDefinition;
import dev.mcsupermods.runtime.events.Events;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import net.minecraft.resources.Identifier;

/**
 * Parses {@code msm/<namespace>/command/<path>.json} definitions (ADR 0096 D1, {@code ::msm::definition::Command}). Pure:
 * no registry is touched, so JUnit runs it over the conformance corpus. Rules:
 *
 * <ol>
 *   <li>{@code format} is required; another value than 1 is an error and nothing is registered.</li>
 *   <li>Closed ({@link Command#CODEC}, {@link Argument#CODEC}): an unknown key, a missing or empty {@code name}, more
 *       than 4 aliases or 8 arguments, a permission outside 0..4 or an unknown argument type is an error and nothing is
 *       registered.</li>
 *   <li>The literals ({@code name} and {@code aliases}) and argument names must be lower case {@code [a-z0-9_]}; an
 *       argument name used twice, an optional argument before a required one, a {@code text} argument that is not
 *       last, or {@code min} above {@code max} is an error and the command is not registered (Brigadier could not
 *       build it). An alias equal to the name or an earlier alias is dropped with a warning.</li>
 *   <li>{@code min} and {@code max} on an argument that is not {@code integer} or {@code number} are ignored with a
 *       warning.</li>
 *   <li>Events decode one by one: an event that fails is an error and the command registers without it;
 *       {@code event} and every {@code trigger_event} must name a declared event (an error otherwise; the command
 *       still registers). {@code play_animation} actions are dropped with a warning: a command source has no animation
 *       controllers.</li>
 *   <li>A command with both {@code function} and {@code event} runs both (the function first); with neither it only
 *       fires the script event (the validators report both cases, {@code commands.function-and-event},
 *       {@code commands.nothing-to-run}).</li>
 * </ol>
 */
public final class CommandParser {
    /** The scanner's kind folder. */
    public static final String KIND = "command";

    /** A literal or an argument name (B456's {@code COMMAND_NAME_PATTERN}). */
    public static final Pattern NAME = Pattern.compile("[a-z0-9_]+");

    private CommandParser() {}

    /** {@code CommandArgumentType}: the twelve kinds of value, each a vanilla Brigadier argument type (B444). */
    public enum ArgumentType {
        INTEGER, NUMBER, WORD, TEXT, BOOLEAN, PLAYER, PLAYERS, ENTITY, POSITION, BLOCK_POSITION, ITEM, BLOCK;

        public String serialName() {
            return name().toLowerCase(Locale.ROOT);
        }

        /** Whether {@code min} and {@code max} mean anything for this type. */
        public boolean ranged() {
            return this == INTEGER || this == NUMBER;
        }

        public static final Codec<ArgumentType> CODEC = MsmCodecs.named("type", values(), ArgumentType::serialName);
    }

    /** {@code CommandArgument}: one argument, its macro name {@code $(name)}. */
    public record Argument(String name, ArgumentType type, Optional<Double> min, Optional<Double> max, boolean optional) {
        public static final List<String> KEYS = List.of("name", "type", "min", "max", "optional");

        static final Codec<Double> FINITE = Codec.DOUBLE.validate(d -> Double.isFinite(d)
                ? DataResult.success(d)
                : DataResult.error(() -> "must be a finite number, got " + d));

        public static final Codec<Argument> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("name", string(1, 32)).forGetter(Argument::name),
                required("type", ArgumentType.CODEC).forGetter(Argument::type),
                MsmCodecs.optional("min", FINITE).forGetter(Argument::min),
                MsmCodecs.optional("max", FINITE).forGetter(Argument::max),
                MsmCodecs.optional("optional", Codec.BOOL, false).forGetter(Argument::optional)).apply(i, Argument::new)), KEYS);

        Argument withoutRange() {
            return new Argument(name, type, Optional.empty(), Optional.empty(), optional);
        }
    }

    /**
     * A command definition v1.
     *
     * @param name       the literal, without the slash
     * @param aliases    other literals that run the same command
     * @param permission the permission level a source needs, 0..4
     * @param arguments  the arguments in order; optional ones only at the end
     * @param function   run as and at the source with permission level 2, the arguments as macro values
     * @param event      an event id declared in {@code events}
     * @param feedback   a language key sent to the source on success
     */
    public record Command(String name, List<String> aliases, int permission, List<Argument> arguments, Optional<Identifier> function,
            Optional<String> event, Optional<String> feedback, Events events) {
        public static final List<String> KEYS = List.of("format", "name", "aliases", "permission", "arguments", "function", "event",
                "feedback", "events");
        public static final int MAX_PERMISSION = 4;

        public static final Codec<Command> CODEC = closed(RecordCodecBuilder.create(i -> i.group(
                required("name", string(1, 64)).forGetter(Command::name),
                optional("aliases", listOfLength(string(1, 64), 0, 4), List.of()).forGetter(Command::aliases),
                optional("permission", intRange(0, MAX_PERMISSION), 0).forGetter(Command::permission),
                optional("arguments", listOfLength(Argument.CODEC, 0, 8), List.of()).forGetter(Command::arguments),
                optional("function", ID).forGetter(Command::function),
                optional("event", Codec.STRING).forGetter(Command::event),
                optional("feedback", Codec.STRING).forGetter(Command::feedback),
                optional("events", Events.CODEC, Events.NONE).forGetter(Command::events)).apply(i, Command::new)), KEYS);

        /** The name, then the aliases: every literal that runs this command. */
        public List<String> literals() {
            List<String> out = new ArrayList<>(aliases.size() + 1);
            out.add(name);
            out.addAll(aliases);
            return out;
        }

        Command withAliases(List<String> kept) {
            return new Command(name, List.copyOf(kept), permission, arguments, function, event, feedback, events);
        }

        Command withArguments(List<Argument> kept) {
            return new Command(name, aliases, permission, List.copyOf(kept), function, event, feedback, events);
        }

        Command withEvents(Events kept) {
            return new Command(name, aliases, permission, arguments, function, event, feedback, kept);
        }
    }

    /** A string of {@code min..max} characters (mcdoc {@code string @ min..max}). */
    static Codec<String> string(int min, int max) {
        return Codec.STRING.validate(s -> s.length() >= min && s.length() <= max
                ? DataResult.success(s)
                : DataResult.error(() -> "has " + s.length() + " character(s) (expected " + min + ".." + max + ")"));
    }

    /**
     * The command definitions among {@code definitions} that parse, by id in scan order; problems are added to
     * {@code errors} and {@code warnings}, each starting with the file it concerns.
     */
    public static Map<Identifier, Command> parseAll(List<RawDefinition> definitions, List<String> errors, List<String> warnings) {
        Map<Identifier, Command> out = new LinkedHashMap<>();
        for (RawDefinition raw : definitions) {
            if (!raw.kind().equals(KIND)) {
                continue;
            }
            ParseResult<Command> result = parse(raw.json());
            result.errors().forEach(e -> errors.add(raw.describe() + ": " + e));
            result.warnings().forEach(w -> warnings.add(raw.describe() + ": " + w));
            result.definition().ifPresent(def -> out.put(raw.id(), def));
        }
        return out;
    }

    /** Parses one command file. */
    public static ParseResult<Command> parse(JsonElement json) {
        if (!(json instanceof JsonObject object)) {
            return new ParseResult<>(Optional.empty(), List.of("top level must be an object"), List.of());
        }
        String formatError = checkFormat(object);
        if (formatError != null) {
            return new ParseResult<>(Optional.empty(), List.of(formatError), List.of());
        }
        DataResult<Command> decoded = Command.CODEC.parse(StrictJsonOps.INSTANCE, object);
        if (decoded.error().isPresent()) {
            return new ParseResult<>(Optional.empty(), List.of(decoded.error().get().message()), List.of());
        }
        Command def = decoded.getOrThrow();
        List<String> fatal = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        if (!NAME.matcher(def.name()).matches()) {
            fatal.add("name: '" + def.name() + "' is not lower case [a-z0-9_]");
        }
        List<String> aliases = new ArrayList<>();
        Set<String> seen = new HashSet<>(Set.of(def.name()));
        for (int i = 0; i < def.aliases().size(); i++) {
            String alias = def.aliases().get(i);
            if (!NAME.matcher(alias).matches()) {
                fatal.add("aliases[" + i + "]: '" + alias + "' is not lower case [a-z0-9_]");
            } else if (!seen.add(alias)) {
                warnings.add("aliases[" + i + "]: '" + alias + "' is already a literal of this command; dropped");
            } else {
                aliases.add(alias);
            }
        }
        if (aliases.size() != def.aliases().size()) {
            def = def.withAliases(aliases);
        }
        List<Argument> arguments = new ArrayList<>();
        Set<String> names = new HashSet<>();
        boolean optionalSeen = false;
        for (int i = 0; i < def.arguments().size(); i++) {
            Argument arg = def.arguments().get(i);
            String at = "arguments[" + i + "]";
            if (!NAME.matcher(arg.name()).matches()) {
                fatal.add(at + ".name: '" + arg.name() + "' is not lower case [a-z0-9_]");
            } else if (!names.add(arg.name())) {
                fatal.add(at + ".name: '" + arg.name() + "' is used by an earlier argument");
            }
            if (arg.optional()) {
                optionalSeen = true;
            } else if (optionalSeen) {
                fatal.add(at + ": a required argument after an optional one (optional arguments come only at the end)");
            }
            if (arg.type() == ArgumentType.TEXT && i != def.arguments().size() - 1) {
                fatal.add(at + ": a text argument takes the rest of the line, so it must be the last argument");
            }
            if (!arg.type().ranged() && (arg.min().isPresent() || arg.max().isPresent())) {
                warnings.add(at + ": min and max are only for integer and number arguments; ignored");
                arg = arg.withoutRange();
            } else if (arg.min().isPresent() && arg.max().isPresent() && arg.min().get() > arg.max().get()) {
                fatal.add(at + ": min " + arg.min().get() + " is above max " + arg.max().get());
            }
            arguments.add(arg);
        }
        def = def.withArguments(arguments);
        if (!fatal.isEmpty()) {
            return new ParseResult<>(Optional.empty(), List.copyOf(fatal), List.copyOf(warnings));
        }
        List<String> errors = new ArrayList<>(def.events().errors());
        List<String> dropped = new ArrayList<>();
        Events kept = def.events().withoutPlayAnimation(dropped);
        if (!dropped.isEmpty()) {
            warnings.addAll(dropped);
            def = def.withEvents(kept);
        }
        Events events = def.events();
        def.event().ifPresent(ref -> {
            Identifier id = Identifier.tryParse(ref);
            if (id == null || !events.contains(id)) {
                errors.add("event: names event " + ref + ", which is not declared in events (or was dropped)");
            }
        });
        for (Map.Entry<Identifier, EventDefinition> e : events.byId().entrySet()) {
            for (Action action : e.getValue().actions()) {
                if (action instanceof Action.TriggerEvent t && !events.contains(t.event())) {
                    errors.add("events: " + e.getKey() + ": trigger_event names event " + t.event()
                            + ", which is not declared in events (or was dropped)");
                }
            }
        }
        return new ParseResult<>(Optional.of(def), List.copyOf(errors), List.copyOf(warnings));
    }

    /** Returns an error message, or null when {@code format} is 1 (as {@code DefinitionParser}). */
    static String checkFormat(JsonObject object) {
        JsonElement format = object.get("format");
        if (format == null) {
            return "format: missing (expected " + DefinitionParser.FORMAT + ")";
        }
        if (!(format instanceof JsonPrimitive p) || !p.isNumber() || p.getAsDouble() != Math.rint(p.getAsDouble())) {
            return "format: must be an integer, got " + format;
        }
        double value = p.getAsDouble();
        if (value > DefinitionParser.FORMAT) {
            return "format " + p.getAsNumber() + " is newer than this runtime reads (" + DefinitionParser.FORMAT + "); update msm_runtime";
        }
        if (value < DefinitionParser.FORMAT) {
            return "format: " + p.getAsNumber() + " is not a known format (expected " + DefinitionParser.FORMAT + ")";
        }
        return null;
    }
}
