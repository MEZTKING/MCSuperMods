package dev.mcsupermods.runtime.gametest.spike5;

import com.google.gson.JsonParser;
import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.ArgumentType;
import com.mojang.brigadier.arguments.BoolArgumentType;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.builder.LiteralArgumentBuilder;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import com.mojang.brigadier.exceptions.DynamicCommandExceptionType;
import com.mojang.serialization.Codec;
import dev.mcsupermods.runtime.loader.FluidParser;
import dev.mcsupermods.runtime.loader.ParseResult;
import dev.mcsupermods.runtime.registry.fluid.FluidDefinition;
import dev.mcsupermods.runtime.registry.fluid.MsmFluid;
import dev.mcsupermods.runtime.registry.fluid.MsmFluids;
import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Function;
import java.util.stream.Collectors;
import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.command.v2.CommandRegistrationCallback;
import net.fabricmc.fabric.api.entity.event.v1.EntitySleepEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.fabricmc.fabric.api.gamerule.v1.GameRuleBuilder;
import net.fabricmc.fabric.api.gamerule.v1.GameRuleEvents;
import net.minecraft.commands.CommandBuildContext;
import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.AngleArgument;
import net.minecraft.commands.arguments.ComponentArgument;
import net.minecraft.commands.arguments.CompoundTagArgument;
import net.minecraft.commands.arguments.DimensionArgument;
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
import net.minecraft.commands.arguments.coordinates.RotationArgument;
import net.minecraft.commands.arguments.item.ItemPredicateArgument;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Registry;
import net.minecraft.core.cauldron.CauldronInteraction;
import net.minecraft.core.cauldron.CauldronInteractions;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.StatFormatter;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.BucketItem;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.ItemUseAnimation;
import net.minecraft.world.item.ItemUtils;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.Consumable;
import net.minecraft.world.item.consume_effects.ApplyStatusEffectsConsumeEffect;
import net.minecraft.world.level.ClipContext;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LayeredCauldronBlock;
import net.minecraft.world.level.block.state.BlockBehaviour;
import net.minecraft.world.level.block.state.pattern.BlockInWorld;
import net.minecraft.world.level.gamerules.GameRule;
import net.minecraft.world.level.gamerules.GameRuleCategory;
import net.minecraft.world.level.gamerules.GameRuleType;
import net.minecraft.world.level.gamerules.GameRuleTypeVisitor;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.level.material.MapColor;
import net.minecraft.world.level.material.PushReaction;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraft.world.flag.FeatureFlagSet;

/**
 * B525 spike (throwaway) main entrypoint, namespace {@code msm_b525}: two mixing fluids with their own liquid blocks
 * (X25), two cauldrons and a bottle (X26, X27), game rules by Fabric's builder and straight into the vanilla registry
 * (X31), three custom statistics (X32), the command {@code /b525arg} with one literal per candidate argument type (X30),
 * Fabric's sleep events (X33) and the glass bottle and vanilla cauldron callbacks.
 */
public final class B525Mod implements ModInitializer {
    public static final String NS = "msm_b525";
    public static final Map<String, Object> STARTUP = new TreeMap<>();
    /** Every hook that fired (Mixins and Fabric events), in order. */
    public static final List<String> EVENTS = new CopyOnWriteArrayList<>();
    /** The last value each {@code /b525arg <type>} read. */
    public static final Map<String, String> ARGS = new java.util.concurrent.ConcurrentHashMap<>();
    /** How many times the command callback has run (start and every /reload). */
    public static final java.util.concurrent.atomic.AtomicInteger COMMAND_BUILDS = new java.util.concurrent.atomic.AtomicInteger();

    /** X33: the advancement being awarded on this thread (set and cleared by the spike's award Mixin). */
    public static final ThreadLocal<net.minecraft.advancements.AdvancementHolder> AWARDING = new ThreadLocal<>();
    public static final ThreadLocal<Boolean> AWARDING_WAS_DONE = new ThreadLocal<>();

    public static final Map<String, MsmFluids.Fluids> FLUIDS = new LinkedHashMap<>();
    public static final Map<String, Block> BLOCKS = new LinkedHashMap<>();
    public static final Map<String, Item> ITEMS = new LinkedHashMap<>();

    /** X27: when true, the glass bottle callback fills a project bottle from a project source. */
    public static volatile boolean bottleRoute;
    /** X26: when true, the use callback pours a project bucket or bottle into vanilla's empty cauldron. */
    public static volatile boolean cauldronRoute;

    public static GameRule<Boolean> FLAG;
    public static GameRule<Integer> COUNT;
    public static GameRule<Boolean> VANILLA_FLAG;

    public static Identifier id(String path) {
        return Identifier.fromNamespaceAndPath(NS, path);
    }

    /** The registered (canonical) Identifier of a custom stat: {@code custom_stat} maps values by identity. */
    public static Identifier stat(String path) {
        return BuiltInRegistries.CUSTOM_STAT.getValue(id(path));
    }

    static Block block(String path) {
        return BLOCKS.get(path);
    }

    static Item item(String path) {
        return ITEMS.get(path);
    }

    @Override
    public void onInitialize() {
        STARTUP.put("fluidModel", MsmFluid.MODEL);
        fluids();
        cauldrons();
        gameRules();
        stats();
        CommandRegistrationCallback.EVENT.register((dispatcher, ctx, selection) -> {
            COMMAND_BUILDS.incrementAndGet();
            commands(dispatcher, ctx);
        });
        EntitySleepEvents.START_SLEEPING.register((entity, pos) -> event(entity, "fabric START_SLEEPING at " + pos.toShortString()));
        EntitySleepEvents.STOP_SLEEPING.register((entity, pos) -> event(entity, "fabric STOP_SLEEPING at " + pos.toShortString()));
        UseItemCallback.EVENT.register(B525Mod::useItem);
        UseBlockCallback.EVENT.register(B525Mod::useBlock);
        System.out.println("[b525] startup " + STARTUP);
    }

    static void event(LivingEntity entity, String what) {
        if (!entity.level().isClientSide()) {
            EVENTS.add(what + " by " + entity.getName().getString() + " tick " + entity.level().getGameTime());
        }
    }

    // X25: fluids ------------------------------------------------------------------------------------------------

    private void fluids() {
        fluid("mix_lava", "{\"format\":1,\"behaves_like\":\"lava\",\"flow\":{\"tick_delay\":10}}", List.of(
                new B525Liquid.Mix("water", Blocks.CRYING_OBSIDIAN, Blocks.COBBLED_DEEPSLATE),
                new B525Liquid.Mix(NS + ":mix_goo", Blocks.GOLD_BLOCK, Blocks.IRON_BLOCK)));
        fluid("mix_goo", "{\"format\":1,\"behaves_like\":\"water\"}", List.of(
                new B525Liquid.Mix("lava", Blocks.EMERALD_BLOCK, Blocks.DIAMOND_BLOCK)));
        // Lava-like with one rule (goo only) whose block never runs vanilla's own checks (super) and schedules the fluid tick itself.
        fluid("mix_strict", "{\"format\":1,\"behaves_like\":\"lava\",\"flow\":{\"tick_delay\":10}}", List.of(
                new B525Liquid.Mix(NS + ":mix_goo", Blocks.GOLD_BLOCK, Blocks.IRON_BLOCK)));
    }

    private void fluid(String path, String json, List<B525Liquid.Mix> mixes) {
        try {
            ParseResult<FluidDefinition> parsed = FluidParser.parse(JsonParser.parseString(json));
            FluidDefinition def = parsed.definition().orElseThrow(() -> new IllegalStateException("fluid " + path + ": " + parsed.errors()));
            Identifier id = id(path);
            ResourceKey<Block> blockKey = ResourceKey.create(Registries.BLOCK, id);
            ResourceKey<Item> bucketKey = ResourceKey.create(Registries.ITEM, id(path + "_bucket"));
            MsmFluids.Fluids fluids = MsmFluid.register(id, def, bucketKey, () -> BLOCKS.get(path), () -> ITEMS.get(path + "_bucket"));
            FLUIDS.put(path, fluids);
            int light = def.light();
            BlockBehaviour.Properties props = BlockBehaviour.Properties.of().setId(blockKey).mapColor(MapColor.WATER).replaceable().noCollision()
                    .strength(100.0f, def.explosionResistance()).pushReaction(PushReaction.POPPED).noLootTable().liquid().lightLevel(s -> light);
            BLOCKS.put(path, Registry.register(BuiltInRegistries.BLOCK, blockKey, new B525Liquid(fluids.source(), props, id, mixes, path.equals("mix_strict"))));
            ITEMS.put(path + "_bucket", Registry.register(BuiltInRegistries.ITEM, bucketKey,
                    new BucketItem(fluids.source(), new Item.Properties().setId(bucketKey).craftRemainder(Items.BUCKET).stacksTo(1))));
            STARTUP.put("fluid." + path, "ok " + BuiltInRegistries.FLUID.getKey(fluids.still()) + " / " + BuiltInRegistries.FLUID.getKey(fluids.flowing()));
        } catch (Throwable t) {
            STARTUP.put("fluid." + path + ".error", t.toString());
            t.printStackTrace(System.out);
        }
    }

    // X26, X27: cauldrons and the bottle -----------------------------------------------------------------------

    private void cauldrons() {
        ResourceKey<Item> bottleKey = ResourceKey.create(Registries.ITEM, id("goo_bottle"));
        Consumable drink = Consumable.builder().consumeSeconds(1.6f).animation(ItemUseAnimation.DRINK).sound(SoundEvents.GENERIC_DRINK)
                .hasConsumeParticles(false).onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(MobEffects.SPEED, 200, 1))).build();
        ITEMS.put("goo_bottle", Registry.register(BuiltInRegistries.ITEM, bottleKey, new B525Bottle(new Item.Properties().setId(bottleKey)
                .stacksTo(16).food(new FoodProperties(1, 0.1f, true), drink).usingConvertsTo(Items.GLASS_BOTTLE))));
        ResourceKey<Block> gooKey = ResourceKey.create(Registries.BLOCK, id("goo_cauldron"));
        BLOCKS.put("goo_cauldron", Registry.register(BuiltInRegistries.BLOCK, gooKey, new B525Cauldrons.Layered(
                BlockBehaviour.Properties.ofLegacyCopy(Blocks.CAULDRON).setId(gooKey), () -> item("mix_goo_bucket"), () -> item("goo_bottle"))));
        ResourceKey<Block> lavaKey = ResourceKey.create(Registries.BLOCK, id("mix_lava_cauldron"));
        BLOCKS.put("mix_lava_cauldron", Registry.register(BuiltInRegistries.BLOCK, lavaKey, new B525Cauldrons.Full(
                BlockBehaviour.Properties.ofLegacyCopy(Blocks.CAULDRON).setId(lavaKey).lightLevel(s -> 15), () -> item("mix_lava_bucket"))));
        // Route (a): vanilla's empty cauldron map takes the lava-like bucket through reflection (put is package-private).
        try {
            Method put = CauldronInteraction.Dispatcher.class.getDeclaredMethod("put", Item.class, CauldronInteraction.class);
            put.setAccessible(true);
            CauldronInteraction pour = (state, level, pos, player, hand, stack) -> {
                B525Cauldrons.log(level, "vanilla EMPTY map: mix_lava_bucket poured (reflection route)");
                return CauldronInteractions.emptyBucket(level, pos, player, hand, stack, block("mix_lava_cauldron").defaultBlockState(),
                        SoundEvents.BUCKET_EMPTY_LAVA);
            };
            put.invoke(CauldronInteractions.EMPTY, item("mix_lava_bucket"), pour);
            STARTUP.put("cauldron.reflectionPut", "ok");
        } catch (Throwable t) {
            STARTUP.put("cauldron.reflectionPut", t.toString());
        }
    }

    /** X26 route (b): our bucket or bottle on vanilla's empty cauldron, before the block sees it. */
    static InteractionResult useBlock(Player player, Level level, net.minecraft.world.InteractionHand hand, BlockHitResult hit) {
        if (!cauldronRoute) {
            return InteractionResult.PASS;
        }
        BlockPos pos = hit.getBlockPos();
        if (!level.getBlockState(pos).is(Blocks.CAULDRON)) {
            return InteractionResult.PASS;
        }
        ItemStack stack = player.getItemInHand(hand);
        if (stack.is(item("mix_goo_bucket"))) {
            B525Cauldrons.log(level, "UseBlockCallback: mix_goo_bucket on vanilla cauldron");
            return CauldronInteractions.emptyBucket(level, pos, player, hand, stack,
                    block("goo_cauldron").defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 3), SoundEvents.BUCKET_EMPTY);
        }
        if (stack.is(item("goo_bottle"))) {
            B525Cauldrons.log(level, "UseBlockCallback: goo_bottle on vanilla cauldron");
            if (!level.isClientSide()) {
                player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(Items.GLASS_BOTTLE)));
                level.setBlockAndUpdate(pos, block("goo_cauldron").defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 1));
                level.playSound(null, pos, SoundEvents.BOTTLE_EMPTY, SoundSource.BLOCKS, 1.0f, 1.0f);
            }
            return InteractionResult.SUCCESS;
        }
        return InteractionResult.PASS;
    }

    /** X27: a glass bottle used on a project source (route on only when {@link #bottleRoute}). */
    static InteractionResult useItem(Player player, Level level, net.minecraft.world.InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (!stack.is(Items.GLASS_BOTTLE) || level.isClientSide()) {
            return InteractionResult.PASS;
        }
        Vec3 eye = player.getEyePosition();
        Vec3 to = eye.add(player.getViewVector(1.0f).scale(player.blockInteractionRange()));
        BlockHitResult hit = level.clip(new ClipContext(eye, to, ClipContext.Block.OUTLINE, ClipContext.Fluid.SOURCE_ONLY, player));
        FluidState fluid = hit.getType() == HitResult.Type.BLOCK ? level.getFluidState(hit.getBlockPos()) : null;
        String seen = fluid == null ? "nothing" : BuiltInRegistries.FLUID.getKey(fluid.getType()) + (fluid.isSource() ? " source" : "");
        EVENTS.add("UseItemCallback glass bottle sees " + seen + " route " + bottleRoute);
        if (bottleRoute && fluid != null && fluid.createLegacyBlock().getBlock() == block("mix_goo")) {
            player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(item("goo_bottle"))));
            level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.BOTTLE_FILL, SoundSource.NEUTRAL, 1.0f, 1.0f);
            return InteractionResult.SUCCESS;
        }
        return InteractionResult.PASS;
    }

    // X31: game rules --------------------------------------------------------------------------------------------

    private void gameRules() {
        try {
            FLAG = GameRuleBuilder.forBoolean(true).category(GameRuleCategory.MISC).buildAndRegister(id("spike_flag"));
            COUNT = GameRuleBuilder.forInteger(3).range(0, 10).category(GameRuleCategory.PLAYER).buildAndRegister(id("spike_count"));
            GameRuleEvents.changeCallback(COUNT).register((value, server) -> EVENTS.add("fabric game rule changed spike_count -> " + value));
            STARTUP.put("gamerule.fabric", "ok " + FLAG.id() + " " + COUNT.id() + " description " + COUNT.getDescriptionId());
        } catch (Throwable t) {
            STARTUP.put("gamerule.fabric.error", t.toString());
            t.printStackTrace(System.out);
        }
        try {
            VANILLA_FLAG = Registry.register(BuiltInRegistries.GAME_RULE, id("spike_vanilla"), new GameRule<>(GameRuleCategory.MOBS,
                    GameRuleType.BOOL, BoolArgumentType.bool(), GameRuleTypeVisitor::visitBoolean, Codec.BOOL, b -> b ? 1 : 0, false,
                    FeatureFlagSet.of()));
            STARTUP.put("gamerule.vanilla", "ok " + VANILLA_FLAG.id() + " description " + VANILLA_FLAG.getDescriptionId());
        } catch (Throwable t) {
            STARTUP.put("gamerule.vanilla.error", t.toString());
            t.printStackTrace(System.out);
        }
    }

    // X32: statistics --------------------------------------------------------------------------------------------

    private void stats() {
        for (Map.Entry<String, StatFormatter> e : Map.of("spike_stat", StatFormatter.DEFAULT, "spike_distance", StatFormatter.DISTANCE,
                "spike_time", StatFormatter.TIME).entrySet()) {
            try {
                Identifier id = id(e.getKey());
                Registry.register(BuiltInRegistries.CUSTOM_STAT, id, id);
                var stat = Stats.CUSTOM.get(id, e.getValue());
                STARTUP.put("stat." + e.getKey(), "ok " + stat.getName());
            } catch (Throwable t) {
                STARTUP.put("stat." + e.getKey() + ".error", t.toString());
            }
        }
    }

    // X30: argument types ----------------------------------------------------------------------------------------

    @FunctionalInterface
    interface Reader {
        String read(CommandContext<CommandSourceStack> c) throws CommandSyntaxException;
    }

    /** The candidate types, in the order the report lists them. */
    static final List<String> TYPES = new CopyOnWriteArrayList<>();

    private static void arg(LiteralArgumentBuilder<CommandSourceStack> root, String name, Function<Void, ArgumentType<?>> type, Reader reader) {
        try {
            ArgumentType<?> t = type.apply(null);
            root.then(Commands.literal(name).then(Commands.argument("value", t).executes(c -> {
                String value = reader.read(c);
                ARGS.put(name, value);
                c.getSource().sendSuccess(() -> Component.literal("b525arg " + name + " = " + value), false);
                return 1;
            })));
            if (!TYPES.contains(name)) {
                TYPES.add(name);
            }
        } catch (Throwable t) {
            STARTUP.put("arg." + name + ".error", t.toString());
        }
    }

    private static final DynamicCommandExceptionType NO_STRUCTURE = new DynamicCommandExceptionType(o -> Component.literal("no structure " + o));

    static void commands(CommandDispatcher<CommandSourceStack> dispatcher, CommandBuildContext ctx) {
        LiteralArgumentBuilder<CommandSourceStack> root = Commands.literal("b525arg");
        arg(root, "dimension", v -> DimensionArgument.dimension(), c -> DimensionArgument.getDimension(c, "value").dimension().identifier().toString());
        arg(root, "time", v -> TimeArgument.time(), c -> String.valueOf(IntegerArgumentType.getInteger(c, "value")));
        arg(root, "team_colour", v -> TeamColorArgument.teamColor(), c -> TeamColorArgument.getTeamColor(c, "value").getSerializedName());
        arg(root, "hex_colour", v -> HexColorArgument.hexColor(), c -> Integer.toHexString(HexColorArgument.getHexColor(c, "value")));
        arg(root, "rotation", v -> RotationArgument.rotation(), c -> {
            var r = RotationArgument.getRotation(c, "value").getRotation(c.getSource());
            return r.x + " " + r.y;
        });
        arg(root, "angle", v -> AngleArgument.angle(), c -> String.valueOf(AngleArgument.getAngle(c, "value")));
        arg(root, "uuid", v -> UuidArgument.uuid(), c -> UuidArgument.getUuid(c, "value").toString());
        arg(root, "objective", v -> ObjectiveArgument.objective(), c -> ObjectiveArgument.getObjective(c, "value").getName());
        arg(root, "score_holder", v -> ScoreHolderArgument.scoreHolder(), c -> ScoreHolderArgument.getName(c, "value").getScoreboardName());
        arg(root, "score_holders", v -> ScoreHolderArgument.scoreHolders(),
                c -> ScoreHolderArgument.getNames(c, "value").stream().map(h -> h.getScoreboardName()).sorted().collect(Collectors.joining(",")));
        arg(root, "item_predicate", v -> ItemPredicateArgument.itemPredicate(ctx), c -> {
            var p = ItemPredicateArgument.getItemPredicate(c, "value");
            return "oak_log " + p.test(new ItemStack(Items.OAK_LOG)) + ", diamond " + p.test(new ItemStack(Items.DIAMOND));
        });
        arg(root, "block_predicate", v -> BlockPredicateArgument.blockPredicate(ctx), c -> {
            var p = BlockPredicateArgument.getBlockPredicate(c, "value");
            BlockPos below = BlockPos.containing(c.getSource().getPosition()).below();
            return "below " + BuiltInRegistries.BLOCK.getKey(c.getSource().getLevel().getBlockState(below).getBlock()) + " "
                    + p.test(new BlockInWorld(c.getSource().getLevel(), below, true));
        });
        arg(root, "effect", v -> ResourceArgument.resource(ctx, Registries.MOB_EFFECT),
                c -> ResourceArgument.getResource(c, "value", Registries.MOB_EFFECT).key().identifier().toString());
        arg(root, "enchantment", v -> ResourceArgument.resource(ctx, Registries.ENCHANTMENT),
                c -> ResourceArgument.getResource(c, "value", Registries.ENCHANTMENT).key().identifier().toString());
        arg(root, "biome", v -> ResourceArgument.resource(ctx, Registries.BIOME),
                c -> ResourceArgument.getResource(c, "value", Registries.BIOME).key().identifier().toString());
        arg(root, "biome_or_tag", v -> ResourceOrTagArgument.resourceOrTag(ctx, Registries.BIOME),
                c -> ResourceOrTagArgument.getResourceOrTag(c, "value", Registries.BIOME).asPrintable());
        arg(root, "structure", v -> ResourceKeyArgument.key(Registries.STRUCTURE),
                c -> ResourceKeyArgument.getStructure(c, "value").key().identifier().toString());
        // First client run: a ResourceArgument over the structure registry (not synced to clients) makes every client that
        // gets the command tree fail with "Registry minecraft:worldgen/structure not found" and disconnect. Only on request.
        if (Boolean.getBoolean("b525.structureResource")) {
            arg(root, "structure_resource", v -> ResourceArgument.resource(ctx, Registries.STRUCTURE),
                    c -> ResourceArgument.getResource(c, "value", Registries.STRUCTURE).key().identifier().toString());
        }
        arg(root, "structure_or_tag", v -> ResourceOrTagKeyArgument.resourceOrTagKey(Registries.STRUCTURE),
                c -> ResourceOrTagKeyArgument.getResourceOrTagKey(c, "value", Registries.STRUCTURE, NO_STRUCTURE).asPrintable());
        arg(root, "entity_type", v -> ResourceArgument.resource(ctx, Registries.ENTITY_TYPE),
                c -> ResourceArgument.getResource(c, "value", Registries.ENTITY_TYPE).key().identifier().toString());
        arg(root, "particle", v -> ParticleArgument.particle(ctx),
                c -> String.valueOf(BuiltInRegistries.PARTICLE_TYPE.getKey(ParticleArgument.getParticle(c, "value").getType())));
        arg(root, "game_mode", v -> GameModeArgument.gameMode(), c -> GameModeArgument.getGameMode(c, "value").getName());
        arg(root, "text", v -> ComponentArgument.textComponent(ctx), c -> ComponentArgument.getRawComponent(c, "value").getString());
        arg(root, "int_range", v -> RangeArgument.intRange(), c -> String.valueOf(RangeArgument.Ints.getRange(c, "value")));
        arg(root, "identifier", v -> IdentifierArgument.id(), c -> IdentifierArgument.getId(c, "value").toString());
        arg(root, "team", v -> TeamArgument.team(), c -> TeamArgument.getTeam(c, "value").getName());
        arg(root, "slot", v -> SlotArgument.slot(), c -> String.valueOf(SlotArgument.getSlot(c, "value")));
        arg(root, "nbt", v -> CompoundTagArgument.compoundTag(), c -> CompoundTagArgument.getCompoundTag(c, "value").toString());
        arg(root, "message", v -> MessageArgument.message(), c -> MessageArgument.getMessage(c, "value").getString());
        arg(root, "dialog", v -> ResourceOrIdArgument.dialog(ctx), c -> String.valueOf(ResourceOrIdArgument.getDialog(c, "value").unwrapKey()
                .map(k -> k.identifier().toString()).orElse("inline")));
        arg(root, "loot_table", v -> ResourceOrIdArgument.lootTable(ctx), c -> String.valueOf(ResourceOrIdArgument.getLootTable(c, "value").unwrapKey()
                .map(k -> k.identifier().toString()).orElse("inline")));
        arg(root, "advancement", v -> ResourceKeyArgument.key(Registries.ADVANCEMENT),
                c -> ResourceKeyArgument.getAdvancement(c, "value").id().toString());
        arg(root, "recipe", v -> ResourceKeyArgument.key(Registries.RECIPE), c -> ResourceKeyArgument.getRecipe(c, "value").id().identifier().toString());
        dispatcher.register(root);
    }

    /** The bottle item: a drink (food, an effect) that leaves a glass bottle; {@code finishUsingItem} is the on_drink event. */
    public static final class B525Bottle extends Item {
        public B525Bottle(Properties properties) {
            super(properties);
        }

        @Override
        public ItemStack finishUsingItem(ItemStack stack, Level level, LivingEntity entity) {
            String before = B525Help.item(stack);
            ItemStack out = super.finishUsingItem(stack, level, entity);
            if (!level.isClientSide()) {
                EVENTS.add("goo_bottle finishUsingItem (on_drink) by " + entity.getName().getString() + " stack before " + before + " result "
                        + B525Help.item(out) + " speed " + (entity.hasEffect(MobEffects.SPEED) ? entity.getEffect(MobEffects.SPEED).getAmplifier() : -1)
                        + (entity instanceof ServerPlayer p ? " food " + p.getFoodData().getFoodLevel() : ""));
            }
            return out;
        }
    }
}
