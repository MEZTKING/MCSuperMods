package dev.mcsupermods.runtime.commands;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.arguments.BoolArgumentType;
import com.mojang.brigadier.arguments.DoubleArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.context.ParsedCommandNode;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.DynamicCommandExceptionType;
import com.mojang.brigadier.tree.ArgumentCommandNode;
import dev.mcsupermods.runtime.loader.CommandParser.Argument;
import java.util.Collection;
import java.util.Locale;
import java.util.stream.Collectors;
import net.minecraft.commands.CommandBuildContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.advancements.predicates.MinMaxBounds;
import net.minecraft.commands.arguments.AngleArgument;
import net.minecraft.commands.arguments.ComponentArgument;
import net.minecraft.commands.arguments.CompoundTagArgument;
import net.minecraft.commands.arguments.DimensionArgument;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.commands.arguments.GameModeArgument;
import net.minecraft.commands.arguments.HexColorArgument;
import net.minecraft.commands.arguments.IdentifierArgument;
import net.minecraft.commands.arguments.MessageArgument;
import net.minecraft.commands.arguments.ObjectiveArgument;
import net.minecraft.commands.arguments.ParticleArgument;
import net.minecraft.commands.arguments.RangeArgument;
import net.minecraft.commands.arguments.ResourceArgument;
import net.minecraft.commands.arguments.ResourceKeyArgument;
import net.minecraft.commands.arguments.ResourceOrIdArgument;
import net.minecraft.commands.arguments.ResourceOrTagArgument;
import net.minecraft.commands.arguments.ResourceOrTagKeyArgument;
import net.minecraft.commands.arguments.ScoreHolderArgument;
import net.minecraft.commands.arguments.SlotArgument;
import net.minecraft.commands.arguments.TeamArgument;
import net.minecraft.commands.arguments.TeamColorArgument;
import net.minecraft.commands.arguments.TimeArgument;
import net.minecraft.commands.arguments.UuidArgument;
import net.minecraft.commands.arguments.blocks.BlockPredicateArgument;
import net.minecraft.commands.arguments.blocks.BlockStateArgument;
import net.minecraft.commands.arguments.coordinates.BlockPosArgument;
import net.minecraft.commands.arguments.coordinates.RotationArgument;
import net.minecraft.commands.arguments.coordinates.Vec3Argument;
import net.minecraft.commands.arguments.item.ItemArgument;
import net.minecraft.commands.arguments.item.ItemPredicateArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.phys.Vec2;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.scores.ScoreHolder;

/**
 * The Brigadier argument type of each of MSM's 44 argument kinds and the values a running command hands on (ADR 0096
 * D1, D6; ADR 0111 D2 as amended after B525 for the last 32). The types follow {@code TargetFacts.commands.argumentTypes} (B444; the same on 26.3 and 26.4): integer
 * {@code brigadier:integer}, number {@code brigadier:double}, word and text {@code brigadier:string} (word, greedy),
 * boolean {@code brigadier:bool}, player, players and entity {@code minecraft:entity} (single player, players, single
 * entity), position {@code minecraft:vec3}, block_position {@code minecraft:block_pos}, item {@code minecraft:item_stack}
 * and block {@code minecraft:block_state}.
 *
 * <p>Macro values (the function's {@code $(name)}), exactly as the 26.3 eject's {@code ModCommands} (B457): integer an
 * int tag, number a double tag, word and text the text (raw: no quote or backslash is escaped, as vanilla macros), boolean
 * a byte tag, player the player's name, entity the entity's UUID, players the names separated by spaces, position {@code "x y z"} as
 * doubles, block_position {@code "x y z"} as integers, item and block the registry id (the components and block state
 * properties given are not passed). A left-out optional argument has no value.
 *
 * <p>Script values (the {@code command} event's {@code args}, JSON): the same values with JSON types: numbers, strings
 * and booleans; {@code player} the player's UUID (not the name); {@code players} an array of names; positions an array
 * of three numbers.
 *
 * <p>The 32 of ADR 0111 D2, macro value and script value the same unless said: dimension, effect, enchantment, biome,
 * entity type, structure, advancement, recipe and identifier the id; biome or tag and structure or tag the id or
 * {@code #tag}; dialog and loot table the id, or what was typed for one written in place; time the ticks (a whole number);
 * team colour the colour's name ({@code red}); hex colour {@code #RRGGBB}; rotation {@code "yaw pitch"} (script
 * {@code [yaw, pitch]}); angle a number; UUID, objective, team and score holder the name or text; score holders the names
 * separated by spaces (script an array); particle the particle type's id (its options are not passed, as for items);
 * game mode its name; item and block predicates and slot what was typed ({@code #minecraft:logs}, {@code hotbar.3});
 * text component what was typed (script the text it shows); int range what was typed (script {@code {min?, max?}});
 * NBT the compound as SNBT; message the text with its selectors resolved. {@link #typed} reads what was typed.
 */
public final class CommandArguments {
    private CommandArguments() {}

    /** The Brigadier type of {@code arg}; {@code min} and {@code max} bound integers (truncated) and numbers. */
    public static ArgumentType<?> type(Argument arg, CommandBuildContext buildContext) {
        return switch (arg.type()) {
            case INTEGER -> arg.min().isEmpty() && arg.max().isEmpty() ? IntegerArgumentType.integer()
                    : IntegerArgumentType.integer(arg.min().map(d -> (int) (double) d).orElse(Integer.MIN_VALUE),
                            arg.max().map(d -> (int) (double) d).orElse(Integer.MAX_VALUE));
            case NUMBER -> arg.min().isEmpty() && arg.max().isEmpty() ? DoubleArgumentType.doubleArg()
                    : DoubleArgumentType.doubleArg(arg.min().orElse(-Double.MAX_VALUE), arg.max().orElse(Double.MAX_VALUE));
            case WORD -> StringArgumentType.word();
            case TEXT -> StringArgumentType.greedyString();
            case BOOLEAN -> BoolArgumentType.bool();
            case PLAYER -> EntityArgument.player();
            case PLAYERS -> EntityArgument.players();
            case ENTITY -> EntityArgument.entity();
            case POSITION -> Vec3Argument.vec3();
            case BLOCK_POSITION -> BlockPosArgument.blockPos();
            case ITEM -> ItemArgument.item(buildContext);
            case BLOCK -> BlockStateArgument.block(buildContext);
            // ADR 0111 D2 as amended after B525: the 32 types that work on both versions and reach the client's tree.
            case DIMENSION -> DimensionArgument.dimension();
            case TIME -> TimeArgument.time();
            case TEAM_COLOUR -> TeamColorArgument.teamColor();
            case HEX_COLOUR -> HexColorArgument.hexColor();
            case ROTATION -> RotationArgument.rotation();
            case ANGLE -> AngleArgument.angle();
            case UUID -> UuidArgument.uuid();
            case OBJECTIVE -> ObjectiveArgument.objective();
            case SCORE_HOLDER -> ScoreHolderArgument.scoreHolder();
            case SCORE_HOLDERS -> ScoreHolderArgument.scoreHolders();
            case ITEM_PREDICATE -> ItemPredicateArgument.itemPredicate(buildContext);
            case BLOCK_PREDICATE -> BlockPredicateArgument.blockPredicate(buildContext);
            case EFFECT -> ResourceArgument.resource(buildContext, Registries.MOB_EFFECT);
            case ENCHANTMENT -> ResourceArgument.resource(buildContext, Registries.ENCHANTMENT);
            case BIOME -> ResourceArgument.resource(buildContext, Registries.BIOME);
            case BIOME_OR_TAG -> ResourceOrTagArgument.resourceOrTag(buildContext, Registries.BIOME);
            // Key types: a registry-checked argument over structures disconnects every client (B525).
            case STRUCTURE -> ResourceKeyArgument.key(Registries.STRUCTURE);
            case STRUCTURE_OR_TAG -> ResourceOrTagKeyArgument.resourceOrTagKey(Registries.STRUCTURE);
            case ENTITY_TYPE -> ResourceArgument.resource(buildContext, Registries.ENTITY_TYPE);
            case PARTICLE -> ParticleArgument.particle(buildContext);
            case GAME_MODE -> GameModeArgument.gameMode();
            case TEXT_COMPONENT -> ComponentArgument.textComponent(buildContext);
            case INT_RANGE -> RangeArgument.intRange();
            case IDENTIFIER -> IdentifierArgument.id();
            case TEAM -> TeamArgument.team();
            case SLOT -> SlotArgument.slot();
            case NBT -> CompoundTagArgument.compoundTag();
            case MESSAGE -> MessageArgument.message();
            case DIALOG -> ResourceOrIdArgument.dialog(buildContext);
            case LOOT_TABLE -> ResourceOrIdArgument.lootTable(buildContext);
            case ADVANCEMENT -> ResourceKeyArgument.key(Registries.ADVANCEMENT);
            case RECIPE -> ResourceKeyArgument.key(Registries.RECIPE);
        };
    }

    /** Puts {@code arg}'s macro value into {@code macros} and its script value into {@code json}. */
    public static void put(CommandContext<CommandSourceStack> context, Argument arg, CompoundTag macros, JsonObject json)
            throws CommandSyntaxException {
        String name = arg.name();
        switch (arg.type()) {
            case INTEGER -> {
                int value = IntegerArgumentType.getInteger(context, name);
                macros.putInt(name, value);
                json.addProperty(name, value);
            }
            case NUMBER -> {
                double value = DoubleArgumentType.getDouble(context, name);
                macros.putDouble(name, value);
                json.addProperty(name, value);
            }
            case WORD, TEXT -> {
                String value = StringArgumentType.getString(context, name);
                macros.putString(name, value);
                json.addProperty(name, value);
            }
            case BOOLEAN -> {
                boolean value = BoolArgumentType.getBool(context, name);
                macros.putBoolean(name, value);
                json.addProperty(name, value);
            }
            case PLAYER -> {
                // The macro gets the name, not the UUID: vanilla commands such as give refuse a UUID for a player
                // (B464a). The script event keeps the UUID (Script API 1.6 documents it).
                ServerPlayer player = EntityArgument.getPlayer(context, name);
                macros.putString(name, player.getName().getString());
                json.addProperty(name, player.getStringUUID());
            }
            case ENTITY -> {
                String value = EntityArgument.getEntity(context, name).getStringUUID();
                macros.putString(name, value);
                json.addProperty(name, value);
            }
            case PLAYERS -> {
                Collection<ServerPlayer> players = EntityArgument.getPlayers(context, name);
                macros.putString(name, players.stream().map(p -> p.getName().getString()).collect(Collectors.joining(" ")));
                JsonArray names = new JsonArray();
                players.forEach(p -> names.add(p.getName().getString()));
                json.add(name, names);
            }
            case POSITION -> {
                Vec3 pos = Vec3Argument.getVec3(context, name);
                macros.putString(name, pos.x + " " + pos.y + " " + pos.z);
                json.add(name, triple(pos.x, pos.y, pos.z));
            }
            case BLOCK_POSITION -> {
                BlockPos pos = BlockPosArgument.getBlockPos(context, name);
                macros.putString(name, pos.getX() + " " + pos.getY() + " " + pos.getZ());
                json.add(name, triple(pos.getX(), pos.getY(), pos.getZ()));
            }
            case ITEM -> {
                String value = BuiltInRegistries.ITEM.getKey(ItemArgument.getItem(context, name).item().value()).toString();
                macros.putString(name, value);
                json.addProperty(name, value);
            }
            case BLOCK -> {
                String value = BuiltInRegistries.BLOCK.getKey(BlockStateArgument.getBlock(context, name).getState().getBlock()).toString();
                macros.putString(name, value);
                json.addProperty(name, value);
            }
            case DIMENSION -> text(macros, json, name, DimensionArgument.getDimension(context, name).dimension().identifier().toString());
            case TIME -> {
                int ticks = IntegerArgumentType.getInteger(context, name);
                macros.putInt(name, ticks);
                json.addProperty(name, ticks);
            }
            case TEAM_COLOUR -> text(macros, json, name, TeamColorArgument.getTeamColor(context, name).getSerializedName());
            case HEX_COLOUR -> text(macros, json, name, String.format(Locale.ROOT, "#%06X", HexColorArgument.getHexColor(context, name) & 0xFFFFFF));
            case ROTATION -> {
                // Typed as yaw then pitch; the parsed Vec2 holds the pitch in x and the yaw in y (B525).
                Vec2 rotation = RotationArgument.getRotation(context, name).getRotation(context.getSource());
                macros.putString(name, rotation.y + " " + rotation.x);
                JsonArray pair = new JsonArray();
                pair.add(rotation.y);
                pair.add(rotation.x);
                json.add(name, pair);
            }
            case ANGLE -> {
                float angle = AngleArgument.getAngle(context, name);
                macros.putFloat(name, angle);
                json.addProperty(name, angle);
            }
            case UUID -> text(macros, json, name, UuidArgument.getUuid(context, name).toString());
            case OBJECTIVE -> text(macros, json, name, ObjectiveArgument.getObjective(context, name).getName());
            case SCORE_HOLDER -> text(macros, json, name, ScoreHolderArgument.getName(context, name).getScoreboardName());
            case SCORE_HOLDERS -> {
                Collection<ScoreHolder> holders = ScoreHolderArgument.getNames(context, name);
                macros.putString(name, holders.stream().map(ScoreHolder::getScoreboardName).collect(Collectors.joining(" ")));
                JsonArray names = new JsonArray();
                holders.forEach(h -> names.add(h.getScoreboardName()));
                json.add(name, names);
            }
            case ITEM_PREDICATE -> {
                ItemPredicateArgument.getItemPredicate(context, name);
                text(macros, json, name, typed(context, name));
            }
            case BLOCK_PREDICATE -> {
                BlockPredicateArgument.getBlockPredicate(context, name);
                text(macros, json, name, typed(context, name));
            }
            case EFFECT -> text(macros, json, name, ResourceArgument.getResource(context, name, Registries.MOB_EFFECT).key().identifier().toString());
            case ENCHANTMENT -> text(macros, json, name,
                    ResourceArgument.getResource(context, name, Registries.ENCHANTMENT).key().identifier().toString());
            case BIOME -> text(macros, json, name, ResourceArgument.getResource(context, name, Registries.BIOME).key().identifier().toString());
            case BIOME_OR_TAG -> text(macros, json, name, ResourceOrTagArgument.getResourceOrTag(context, name, Registries.BIOME).asPrintable());
            case STRUCTURE -> text(macros, json, name, ResourceKeyArgument.getStructure(context, name).key().identifier().toString());
            case STRUCTURE_OR_TAG -> text(macros, json, name,
                    ResourceOrTagKeyArgument.getResourceOrTagKey(context, name, Registries.STRUCTURE, NO_STRUCTURE).asPrintable());
            case ENTITY_TYPE -> text(macros, json, name,
                    ResourceArgument.getResource(context, name, Registries.ENTITY_TYPE).key().identifier().toString());
            case PARTICLE -> text(macros, json, name,
                    String.valueOf(BuiltInRegistries.PARTICLE_TYPE.getKey(ParticleArgument.getParticle(context, name).getType())));
            case GAME_MODE -> text(macros, json, name, GameModeArgument.getGameMode(context, name).getName());
            case TEXT_COMPONENT -> {
                String plain = ComponentArgument.getResolvedComponent(context, name).getString();
                macros.putString(name, typed(context, name));
                json.addProperty(name, plain);
            }
            case INT_RANGE -> {
                MinMaxBounds.Bounds<Integer> bounds = RangeArgument.Ints.getRange(context, name).bounds();
                macros.putString(name, typed(context, name));
                JsonObject range = new JsonObject();
                bounds.min().ifPresent(min -> range.addProperty("min", min));
                bounds.max().ifPresent(max -> range.addProperty("max", max));
                json.add(name, range);
            }
            case IDENTIFIER -> text(macros, json, name, IdentifierArgument.getId(context, name).toString());
            case TEAM -> text(macros, json, name, TeamArgument.getTeam(context, name).getName());
            case SLOT -> {
                SlotArgument.getSlot(context, name);
                text(macros, json, name, typed(context, name));
            }
            case NBT -> text(macros, json, name, CompoundTagArgument.getCompoundTag(context, name).toString());
            case MESSAGE -> text(macros, json, name, MessageArgument.getMessage(context, name).getString());
            case DIALOG -> text(macros, json, name, ResourceOrIdArgument.getDialog(context, name).unwrapKey()
                    .map(k -> k.identifier().toString()).orElseGet(() -> typed(context, name)));
            case LOOT_TABLE -> text(macros, json, name, ResourceOrIdArgument.getLootTable(context, name).unwrapKey()
                    .map(k -> k.identifier().toString()).orElseGet(() -> typed(context, name)));
            case ADVANCEMENT -> text(macros, json, name, ResourceKeyArgument.getAdvancement(context, name).id().toString());
            case RECIPE -> text(macros, json, name, ResourceKeyArgument.getRecipe(context, name).id().identifier().toString());
        }
    }

    /** Refused {@code structure_or_tag} ids, as vanilla's {@code /locate} words it. */
    private static final DynamicCommandExceptionType NO_STRUCTURE = new DynamicCommandExceptionType(
            id -> Component.literal("There is no structure or structure tag \"" + id + "\""));

    private static void text(CompoundTag macros, JsonObject json, String name, String value) {
        macros.putString(name, value);
        json.addProperty(name, value);
    }

    /** What was typed for argument {@code name}, exactly (Brigadier's parsed node range over the input). */
    static String typed(CommandContext<CommandSourceStack> context, String name) {
        for (CommandContext<CommandSourceStack> c = context; c != null; c = c.getChild()) {
            for (ParsedCommandNode<CommandSourceStack> node : c.getNodes()) {
                if (node.getNode() instanceof ArgumentCommandNode<?, ?> arg && arg.getName().equals(name)) {
                    return node.getRange().get(c.getInput());
                }
            }
        }
        return "";
    }

    private static JsonArray triple(double x, double y, double z) {
        JsonArray out = new JsonArray();
        out.add(x);
        out.add(y);
        out.add(z);
        return out;
    }

    private static JsonArray triple(int x, int y, int z) {
        JsonArray out = new JsonArray();
        out.add(x);
        out.add(y);
        out.add(z);
        return out;
    }
}
