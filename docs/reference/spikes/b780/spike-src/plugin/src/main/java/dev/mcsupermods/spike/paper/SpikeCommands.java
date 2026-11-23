package dev.mcsupermods.spike.paper;

import com.mojang.brigadier.Command;
import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.arguments.BoolArgumentType;
import com.mojang.brigadier.arguments.DoubleArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import io.papermc.paper.command.brigadier.CommandSourceStack;
import io.papermc.paper.command.brigadier.Commands;
import io.papermc.paper.command.brigadier.argument.ArgumentTypes;
import io.papermc.paper.command.brigadier.argument.resolvers.ArgumentResolver;
import io.papermc.paper.registry.RegistryKey;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import net.kyori.adventure.text.logger.slf4j.ComponentLogger;
import org.bukkit.entity.Entity;

/** The commands registered at bootstrap: the function bridge's signal commands (P9) and one per argument type (P8). */
final class SpikeCommands {
    static final AtomicInteger SIGNALS = new AtomicInteger();

    private SpikeCommands() {
    }

    /** MSM's 44 argument types (ADR 0111) and the Paper argument each maps to; absent: no native Paper argument. */
    static Map<String, ArgumentType<?>> argumentTypes() {
        Map<String, ArgumentType<?>> m = new LinkedHashMap<>();
        m.put("integer", IntegerArgumentType.integer());
        m.put("number", DoubleArgumentType.doubleArg());
        m.put("word", StringArgumentType.word());
        m.put("text", StringArgumentType.greedyString());
        m.put("boolean", BoolArgumentType.bool());
        m.put("player", ArgumentTypes.player());
        m.put("players", ArgumentTypes.players());
        m.put("entity", ArgumentTypes.entities());
        m.put("position", ArgumentTypes.finePosition(true));
        m.put("block_position", ArgumentTypes.blockPosition());
        m.put("item", ArgumentTypes.itemStack());
        m.put("block", ArgumentTypes.blockState());
        m.put("dimension", ArgumentTypes.world());
        m.put("time", ArgumentTypes.time());
        m.put("team_colour", ArgumentTypes.namedColor());
        m.put("hex_colour", ArgumentTypes.hexColor());
        m.put("rotation", ArgumentTypes.rotation());
        m.put("angle", ArgumentTypes.angle());
        m.put("uuid", ArgumentTypes.uuid());
        m.put("item_predicate", ArgumentTypes.itemPredicate());
        m.put("block_predicate", ArgumentTypes.blockInWorldPredicate());
        m.put("effect", ArgumentTypes.resource(RegistryKey.MOB_EFFECT));
        m.put("enchantment", ArgumentTypes.resource(RegistryKey.ENCHANTMENT));
        m.put("biome", ArgumentTypes.resourceKey(RegistryKey.BIOME));
        m.put("structure", ArgumentTypes.resourceKey(RegistryKey.STRUCTURE));
        m.put("entity_type", ArgumentTypes.resource(RegistryKey.ENTITY_TYPE));
        m.put("particle", ArgumentTypes.resource(RegistryKey.PARTICLE_TYPE));
        m.put("game_mode", ArgumentTypes.gameMode());
        m.put("text_component", ArgumentTypes.component());
        m.put("int_range", ArgumentTypes.integerRange());
        m.put("identifier", ArgumentTypes.key());
        m.put("message", ArgumentTypes.signedMessage());
        m.put("dialog", ArgumentTypes.resource(RegistryKey.DIALOG));
        return m;
    }

    static String describe(CommandSourceStack source) {
        Entity executor = source.getExecutor();
        return "sender=" + source.getSender().getName() + " executor=" + (executor == null ? "none" : executor.getName())
                + " at=" + source.getLocation().getBlockX() + "," + source.getLocation().getBlockY() + ","
                + source.getLocation().getBlockZ() + " in " + source.getLocation().getWorld().getKey();
    }

    static void registerBootstrap(String id, Commands commands, ComponentLogger log) {
        // The function bridge (ADR 0115 D5): /msm_signal_<ns> <word>, for the spike's own pack and the sample's.
        for (String ns : new String[] {id, "msm_sample_game_modes"}) {
            if (!ns.equals(id) && SpikeBootstrap.class.getResource("/sample_pack") == null) {
                continue;
            }
            String literal = "msm_signal_" + ns;
            var node = Commands.literal(literal)
                    .then(Commands.argument("word", StringArgumentType.word()).executes(ctx -> {
                        int n = SIGNALS.incrementAndGet();
                        log.info("[msm_spike] {} signal #{} {} {} ({})", id, n, literal, StringArgumentType.getString(ctx, "word"),
                                describe(ctx.getSource()));
                        return Command.SINGLE_SUCCESS;
                    })).build();
            log.info("[msm_spike] {} registered {} -> {}", id, literal, commands.register(node, "MSM function bridge (spike)"));
        }
        // P8: one literal per argument type under /<id>_args.
        LiteralArgumentBuilder<CommandSourceStack> args = Commands.literal(id + "_args");
        for (Map.Entry<String, ArgumentType<?>> e : argumentTypes().entrySet()) {
            String type = e.getKey();
            args.then(Commands.literal(type).then(Commands.argument("value", e.getValue()).executes(ctx -> {
                Object value = ctx.getArgument("value", Object.class);
                Object shown = value;
                if (value instanceof ArgumentResolver<?> resolver) {
                    try {
                        shown = resolver.resolve(ctx.getSource());
                    } catch (Exception ex) {
                        shown = "resolve failed: " + ex.getMessage();
                    }
                }
                log.info("[msm_spike] {} arg {} = {} ({})", id, type, shown, value.getClass().getSimpleName());
                return Command.SINGLE_SUCCESS;
            })));
        }
        log.info("[msm_spike] {} registered {}", id, commands.register(args.build()));
        // P6: the same literal from two plugins.
        log.info("[msm_spike] {} registered msmshared -> {}", id, commands.register(Commands.literal("msmshared").executes(ctx -> {
            log.info("[msm_spike] {} ran msmshared", id);
            return Command.SINGLE_SUCCESS;
        }).build()));
    }
}
