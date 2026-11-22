package dev.mcsupermods.runtime.registry.fluid;

import dev.mcsupermods.runtime.MsmRuntime;
import dev.mcsupermods.runtime.components.ItemComponents;
import dev.mcsupermods.runtime.loader.LoadReport;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import net.fabricmc.fabric.api.creativetab.v1.CreativeModeTabEvents;
import net.fabricmc.fabric.api.event.player.UseBlockCallback;
import net.fabricmc.fabric.api.event.player.UseItemCallback;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.core.Registry;
import net.minecraft.core.cauldron.CauldronInteractions;
import net.minecraft.core.component.DataComponents;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.Identifier;
import net.minecraft.resources.ResourceKey;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.stats.Stats;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.food.FoodProperties;
import net.minecraft.world.item.CreativeModeTab;
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
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;
import net.minecraft.world.level.material.FluidState;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Cauldrons and bottles of project fluids (ADR 0108 D2, D3 and the amendment after B525), with no Mixin. Per registered
 * fluid with {@code cauldron}, the block {@code <ns>:<path>_cauldron} ({@link MsmCauldronBlock}: layered with
 * {@code levels}, else full only; always full only for a lava-like fluid); with {@code bottle}, the item
 * {@code <ns>:<path>_bottle} ({@link MsmBottleItem}, stacks of 16, in vanilla's Food and Drinks tab). A taken id is an
 * error and that companion is not registered; an unknown effect of a bottle is an error and the effect is left out.
 *
 * <p>Interactions, with vanilla's sounds and statistics:
 * <ul>
 *   <li>On a project cauldron ({@link #useOnProjectCauldron}): an empty bucket takes a full one (the fluid's bucket,
 *       leaving vanilla's empty cauldron); a bucket of a liquid that has a cauldron (the fluid's own, another project
 *       fluid's, or vanilla's water and lava; not powder snow, whose sound is a different type per version) empties into
 *       it and replaces its contents with a full cauldron of that liquid; on a layered one a glass bottle takes a level
 *       (giving the fluid's bottle) and the fluid's bottle adds one up to three.</li>
 *   <li>On vanilla's cauldrons (a {@code UseBlockCallback}, before the block's own interaction map, which cannot be
 *       added to): a project bucket whose fluid has a cauldron empties into vanilla's empty, water, lava or powder snow
 *       cauldron; a project bottle whose fluid has a layered cauldron makes vanilla's empty cauldron a level 1 one.</li>
 *   <li>A glass bottle used while looking at a source of a fluid with a bottle (a {@code UseItemCallback}, before vanilla's
 *       glass bottle, which would fill water from any {@code #minecraft:water} fluid) fills with the fluid's bottle; the
 *       source stays.</li>
 * </ul>
 * Both callbacks skip spectators and sneaking players with an item in hand, as vanilla's block use does.
 */
public final class MsmCauldrons {
    private MsmCauldrons() {}

    /** The vanilla tab the bottles join (vanilla's potions are there). */
    static final ResourceKey<CreativeModeTab> BOTTLE_TAB =
            ResourceKey.create(Registries.CREATIVE_MODE_TAB, Identifier.withDefaultNamespace("food_and_drinks"));
    /** How many bottles stack. */
    public static final int BOTTLE_STACK = 16;

    /**
     * The companions of one fluid.
     *
     * @param fluid    the fluid
     * @param cauldron its cauldron, or null
     * @param bottle   its bottle, or null
     */
    public record Companions(MsmFluids.Entry fluid, MsmCauldronBlock cauldron, MsmBottleItem bottle) {}

    private static final Map<Identifier, Companions> BY_FLUID = new LinkedHashMap<>();
    private static final Map<Item, Companions> BY_BUCKET = new IdentityHashMap<>();
    private static final Map<Item, Companions> BY_BOTTLE = new IdentityHashMap<>();
    private static final Map<Block, Companions> BY_LIQUID = new IdentityHashMap<>();
    private static boolean installed;

    /** The companions of the fluid {@code id}, if it has a cauldron or a bottle. */
    public static Optional<Companions> get(Identifier id) {
        return Optional.ofNullable(BY_FLUID.get(id));
    }

    /** The cauldron block id of a fluid: {@code <ns>:<path>_cauldron} (ADR 0108 D2). */
    public static Identifier cauldronId(Identifier id) {
        return id.withSuffix("_cauldron");
    }

    /** The bottle item id of a fluid: {@code <ns>:<path>_bottle} (ADR 0108 D3). */
    public static Identifier bottleId(Identifier id) {
        return id.withSuffix("_bottle");
    }

    /**
     * Registers the cauldron blocks and bottle items of the registered fluids and installs the use callbacks; returns the
     * report with this step's errors and warnings. Runs once, after every block and item of the registrar.
     */
    public static LoadReport register(LoadReport report) {
        List<String> errors = new ArrayList<>();
        List<String> warnings = new ArrayList<>();
        int cauldrons = 0;
        int bottles = 0;
        for (MsmFluids.Entry entry : MsmFluids.registered()) {
            FluidDefinition def = entry.definition();
            if ((def.cauldron().isEmpty() && def.bottle().isEmpty()) || BY_FLUID.containsKey(entry.id())) {
                continue;
            }
            String where = "fluid " + entry.id();
            MsmCauldronBlock cauldron = null;
            if (def.cauldron().isPresent()) {
                Identifier id = cauldronId(entry.id());
                if (BuiltInRegistries.BLOCK.containsKey(id)) {
                    errors.add(where + ": cauldron: block id " + id + " is already registered; the cauldron is not registered");
                } else {
                    cauldron = registerCauldron(id, entry);
                    cauldrons++;
                }
            }
            MsmBottleItem bottle = null;
            if (def.bottle().isPresent()) {
                Identifier id = bottleId(entry.id());
                if (BuiltInRegistries.ITEM.containsKey(id)) {
                    errors.add(where + ": bottle: item id " + id + " is already registered; the bottle is not registered");
                } else {
                    bottle = registerBottle(id, entry, def.bottle().get(), where, errors);
                    bottles++;
                }
            }
            if (cauldron == null && bottle == null) {
                continue;
            }
            Companions companions = new Companions(entry, cauldron, bottle);
            BY_FLUID.put(entry.id(), companions);
            BY_LIQUID.put(entry.block(), companions);
            if (cauldron != null) {
                BY_BUCKET.put(entry.bucket(), companions);
            }
            if (bottle != null) {
                BY_BOTTLE.put(bottle, companions);
            }
        }
        if (!installed) {
            installed = true;
            UseBlockCallback.EVENT.register(MsmCauldrons::useOnVanillaCauldron);
            UseItemCallback.EVENT.register(MsmCauldrons::useGlassBottle);
        }
        errors.forEach(m -> MsmRuntime.LOGGER.error("[{}] {}", MsmRuntime.MOD_ID, m));
        warnings.forEach(m -> MsmRuntime.LOGGER.warn("[{}] {}", MsmRuntime.MOD_ID, m));
        MsmRuntime.LOGGER.info("[{}] registered {} fluid cauldron(s) and {} fluid bottle(s)", MsmRuntime.MOD_ID, cauldrons, bottles);
        return report.withProblems(errors, warnings);
    }

    private static MsmCauldronBlock registerCauldron(Identifier id, MsmFluids.Entry entry) {
        ResourceKey<Block> key = ResourceKey.create(Registries.BLOCK, id);
        int light = entry.definition().light();
        BlockBehaviour.Properties props = BlockBehaviour.Properties.ofLegacyCopy(Blocks.CAULDRON)
                .setId(key)
                .overrideLootTable(Blocks.CAULDRON.getLootTable())
                .lightLevel(state -> light);
        boolean levels = entry.definition().cauldron().map(FluidDefinition.Cauldron::levels).orElse(false)
                && entry.definition().behavesLike() != FluidDefinition.Behaviour.LAVA;
        Block block = levels ? new MsmCauldronBlock.Layered(props, entry) : new MsmCauldronBlock.Full(props, entry);
        return (MsmCauldronBlock) Registry.register(BuiltInRegistries.BLOCK, key, block);
    }

    private static MsmBottleItem registerBottle(Identifier id, MsmFluids.Entry entry, FluidDefinition.Bottle spec, String where,
            List<String> errors) {
        ResourceKey<Item> key = ResourceKey.create(Registries.ITEM, id);
        Consumable.Builder drink = Consumable.builder()
                .consumeSeconds(FluidDefinition.BOTTLE_DRINK_SECONDS)
                .animation(ItemUseAnimation.DRINK)
                .sound(SoundEvents.GENERIC_DRINK)
                .hasConsumeParticles(false);
        for (ItemComponents.ConsumeEffect effect : spec.effects()) {
            Optional<Holder.Reference<MobEffect>> holder = BuiltInRegistries.MOB_EFFECT.get(effect.effect());
            if (holder.isEmpty()) {
                errors.add(where + ": bottle: effects: unknown mob effect " + effect.effect() + "; the effect is left out");
                continue;
            }
            drink = drink.onConsume(new ApplyStatusEffectsConsumeEffect(new MobEffectInstance(holder.get(), effect.ticks(), effect.amplifier()),
                    effect.chance()));
        }
        Item.Properties props = new Item.Properties().setId(key).stacksTo(BOTTLE_STACK).usingConvertsTo(Items.GLASS_BOTTLE);
        if (spec.food().isPresent()) {
            ItemComponents.Food food = spec.food().get();
            props = props.food(new FoodProperties(food.nutrition(), food.saturation(), food.canAlwaysEat()), drink.build());
        } else {
            props = props.component(DataComponents.CONSUMABLE, drink.build());
        }
        MsmBottleItem bottle = Registry.register(BuiltInRegistries.ITEM, key, new MsmBottleItem(props, entry.id(), entry.definition()));
        CreativeModeTabEvents.modifyOutputEvent(BOTTLE_TAB).register(output -> output.accept(bottle));
        return bottle;
    }

    // Interactions -------------------------------------------------------------------------------------------------

    /** The sound a bucket of the fluid makes emptying: lava's for lava-like, else water's. */
    static SoundEvent emptySound(FluidDefinition def) {
        return def.behavesLike() == FluidDefinition.Behaviour.LAVA ? SoundEvents.BUCKET_EMPTY_LAVA : SoundEvents.BUCKET_EMPTY;
    }

    /** A bucket that empties into a cauldron: the full cauldron it makes and the sound, or null for any other item. */
    private record Pour(BlockState into, SoundEvent sound) {}

    private static Pour pourOf(ItemStack stack) {
        if (stack.is(Items.WATER_BUCKET)) {
            return new Pour(Blocks.WATER_CAULDRON.defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, LayeredCauldronBlock.MAX_FILL_LEVEL),
                    SoundEvents.BUCKET_EMPTY);
        }
        if (stack.is(Items.LAVA_BUCKET)) {
            return new Pour(Blocks.LAVA_CAULDRON.defaultBlockState(), SoundEvents.BUCKET_EMPTY_LAVA);
        }
        return projectPour(stack);
    }

    private static Pour projectPour(ItemStack stack) {
        Companions c = stack.isEmpty() ? null : BY_BUCKET.get(stack.getItem());
        return c == null || c.cauldron() == null ? null : new Pour(c.cauldron().fullState(), emptySound(c.fluid().definition()));
    }

    /**
     * A project cauldron's own interactions; null when {@code stack} is none of them (vanilla's default then, through the
     * empty dispatcher).
     */
    static InteractionResult useOnProjectCauldron(MsmCauldronBlock cauldron, ItemStack stack, BlockState state, Level level, BlockPos pos,
            Player player, InteractionHand hand) {
        MsmFluids.Entry fluid = cauldron.fluid();
        if (stack.is(Items.BUCKET)) {
            return CauldronInteractions.fillBucket(state, level, pos, player, hand, stack, new ItemStack(fluid.bucket()), cauldron::isFullState,
                    MsmFluids.pickupSound(fluid.definition()));
        }
        Pour pour = pourOf(stack);
        if (pour != null) {
            return CauldronInteractions.emptyBucket(level, pos, player, hand, stack, pour.into(), pour.sound());
        }
        if (!(cauldron instanceof MsmCauldronBlock.Layered)) {
            return null;
        }
        Companions companions = BY_FLUID.get(fluid.id());
        MsmBottleItem bottle = companions == null ? null : companions.bottle();
        if (bottle == null) {
            return null;
        }
        int lvl = state.getValue(LayeredCauldronBlock.LEVEL);
        if (stack.is(Items.GLASS_BOTTLE)) {
            if (!level.isClientSide()) {
                player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(bottle)));
                player.awardStat(Stats.USE_CAULDRON);
                player.awardStat(Stats.ITEM_USED.get(stack.getItem()));
                LayeredCauldronBlock.lowerFillLevel(state, level, pos);
                level.playSound(null, pos, SoundEvents.BOTTLE_FILL, SoundSource.BLOCKS, 1.0f, 1.0f);
                level.gameEvent(null, GameEvent.FLUID_PICKUP, pos);
            }
            return InteractionResult.SUCCESS;
        }
        if (stack.is(bottle) && lvl < LayeredCauldronBlock.MAX_FILL_LEVEL) {
            if (!level.isClientSide()) {
                player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(Items.GLASS_BOTTLE)));
                player.awardStat(Stats.USE_CAULDRON);
                player.awardStat(Stats.ITEM_USED.get(stack.getItem()));
                level.setBlockAndUpdate(pos, state.setValue(LayeredCauldronBlock.LEVEL, lvl + 1));
                level.playSound(null, pos, SoundEvents.BOTTLE_EMPTY, SoundSource.BLOCKS, 1.0f, 1.0f);
                level.gameEvent(null, GameEvent.FLUID_PLACE, pos);
            }
            return InteractionResult.SUCCESS;
        }
        return null;
    }

    /** Whether the player's use skips the block, as vanilla's: spectators, and sneaking with an item in hand. */
    private static boolean skipsBlocks(Player player) {
        return player.isSpectator() || (player.isSecondaryUseActive() && (!player.getMainHandItem().isEmpty() || !player.getOffhandItem().isEmpty()));
    }

    private static boolean isVanillaCauldron(BlockState state) {
        return state.is(Blocks.CAULDRON) || state.is(Blocks.WATER_CAULDRON) || state.is(Blocks.LAVA_CAULDRON) || state.is(Blocks.POWDER_SNOW_CAULDRON);
    }

    /** A project bucket or bottle on one of vanilla's cauldrons. */
    static InteractionResult useOnVanillaCauldron(Player player, Level level, InteractionHand hand, BlockHitResult hit) {
        if (BY_FLUID.isEmpty() || skipsBlocks(player)) {
            return InteractionResult.PASS;
        }
        BlockPos pos = hit.getBlockPos();
        BlockState state = level.getBlockState(pos);
        if (!isVanillaCauldron(state)) {
            return InteractionResult.PASS;
        }
        ItemStack stack = player.getItemInHand(hand);
        Pour pour = projectPour(stack);
        if (pour != null) {
            return CauldronInteractions.emptyBucket(level, pos, player, hand, stack, pour.into(), pour.sound());
        }
        Companions c = stack.isEmpty() ? null : BY_BOTTLE.get(stack.getItem());
        if (c != null && state.is(Blocks.CAULDRON) && c.cauldron() instanceof MsmCauldronBlock.Layered layered) {
            if (!level.isClientSide()) {
                player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(Items.GLASS_BOTTLE)));
                player.awardStat(Stats.USE_CAULDRON);
                player.awardStat(Stats.ITEM_USED.get(stack.getItem()));
                level.setBlockAndUpdate(pos, layered.defaultBlockState().setValue(LayeredCauldronBlock.LEVEL, 1));
                level.playSound(null, pos, SoundEvents.BOTTLE_EMPTY, SoundSource.BLOCKS, 1.0f, 1.0f);
                level.gameEvent(null, GameEvent.FLUID_PLACE, pos);
            }
            return InteractionResult.SUCCESS;
        }
        return InteractionResult.PASS;
    }

    /** A glass bottle used on a source of a fluid with a bottle: the fluid's bottle instead of vanilla's water bottle. */
    static InteractionResult useGlassBottle(Player player, Level level, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);
        if (BY_BOTTLE.isEmpty() || player.isSpectator() || !stack.is(Items.GLASS_BOTTLE)) {
            return InteractionResult.PASS;
        }
        Vec3 eye = player.getEyePosition();
        Vec3 to = eye.add(player.getViewVector(1.0f).scale(player.blockInteractionRange()));
        BlockHitResult hit = level.clip(new ClipContext(eye, to, ClipContext.Block.OUTLINE, ClipContext.Fluid.SOURCE_ONLY, player));
        if (hit.getType() != HitResult.Type.BLOCK) {
            return InteractionResult.PASS;
        }
        BlockPos pos = hit.getBlockPos();
        FluidState fluid = level.getFluidState(pos);
        if (fluid.isEmpty() || !fluid.isSource() || !level.mayInteract(player, pos)) {
            return InteractionResult.PASS;
        }
        Companions c = BY_LIQUID.get(fluid.createLegacyBlock().getBlock());
        if (c == null || c.bottle() == null) {
            return InteractionResult.PASS;
        }
        if (!level.isClientSide()) {
            player.setItemInHand(hand, ItemUtils.createFilledResult(stack, player, new ItemStack(c.bottle())));
            player.awardStat(Stats.ITEM_USED.get(stack.getItem()));
            level.playSound(null, player.getX(), player.getY(), player.getZ(), SoundEvents.BOTTLE_FILL, SoundSource.NEUTRAL, 1.0f, 1.0f);
            level.gameEvent(player, GameEvent.FLUID_PICKUP, pos);
        }
        return InteractionResult.SUCCESS;
    }
}
