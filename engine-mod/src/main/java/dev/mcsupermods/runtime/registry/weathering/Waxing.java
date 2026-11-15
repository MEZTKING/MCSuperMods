package dev.mcsupermods.runtime.registry.weathering;

import dev.mcsupermods.runtime.components.BlockComponents;
import dev.mcsupermods.runtime.registry.BlockExtras;
import java.util.Collections;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.LevelEvent;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.gameevent.GameEvent;

/**
 * Waxing, unwaxing and scraping of project blocks (ADR 0094 D9). Vanilla's honeycomb and axes know only vanilla's copper
 * (measured at B440, S5: both pass on project blocks), so the runtime's {@code UseBlockCallback} in {@code BlockExtras}
 * calls these first: {@code minecraft:honeycomb} waxes a weathering block into its {@code msm:waxable} {@code into}; an axe
 * (an item whose {@code block_transformer} is {@code minecraft:axe}) unwaxes a waxed copy back into its one source, or
 * scrapes a weathering block one stage back. Only project blocks are touched: vanilla copper keeps vanilla's own rules,
 * also when a project block names it as {@code next} or {@code into}. Shared state properties are copied; the other half of
 * a door follows. Lightning does not scrape project blocks (limit Q6).
 */
public final class Waxing {
    private Waxing() {}

    /** A weathering block's {@code msm:waxable} {@code into}, by block id, as declared; checked by {@link Weathering.Maps}. */
    private static final Map<Identifier, Identifier> DECLARED = new LinkedHashMap<>();
    /** Every block the registrar made from a definition (and its companions): the only blocks waxed, unwaxed or scraped here. */
    private static final Set<Block> PROJECT = Collections.newSetFromMap(new IdentityHashMap<>());

    /** Records a registered project block and its {@code msm:waxable}; called once per block by {@code BlockExtras.apply}. */
    public static void add(Block block, BlockComponents components) {
        PROJECT.add(block);
        components.waxable().ifPresent(w -> DECLARED.put(BuiltInRegistries.BLOCK.getKey(block), w.into()));
    }

    static Map<Identifier, Identifier> declared() {
        return Collections.unmodifiableMap(DECLARED);
    }

    /**
     * Honeycomb on a waxable project block: the block becomes its waxed copy, vanilla's wax-on level event (particles and
     * the {@code item.honeycomb.wax_on} sound on the client) plays and one honeycomb is used outside creative. PASS for
     * anything else, so vanilla's honeycomb still waxes vanilla copper.
     */
    public static InteractionResult wax(Player player, Level level, InteractionHand hand, BlockPos pos, BlockState state, ItemStack stack) {
        if (!stack.is(Items.HONEYCOMB)) {
            return InteractionResult.PASS;
        }
        Optional<BlockState> waxed = target(state, Weathering.maps().waxInto());
        if (waxed.isEmpty()) {
            return InteractionResult.PASS;
        }
        if (!level.isClientSide()) {
            Weathering.replace(level, pos, state, waxed.get());
            // A null source: the waxing player's own client shows the effect too (its client predicts nothing, B464a).
            level.levelEvent(null, LevelEvent.PARTICLES_WAX_ON, pos, 0);
            level.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(player, waxed.get()));
            stack.consume(1, player);
        }
        return InteractionResult.SUCCESS;
    }

    /**
     * An axe on a project block that is neither stripped nor vanilla's: a waxed copy is unwaxed ({@code item.axe.wax_off})
     * and a weathering block with a previous stage is scraped ({@code item.axe.scrape}), each with vanilla's particles; the
     * axe takes 1 damage (none in creative). PASS when neither applies. The caller has checked the axe and the shield
     * rule ({@code BlockExtras}).
     */
    public static InteractionResult axe(Player player, Level level, InteractionHand hand, BlockPos pos, BlockState state, ItemStack stack) {
        Optional<BlockState> scraped = target(state, Weathering.maps().previous());
        Optional<BlockState> unwaxed = scraped.isPresent() ? Optional.empty() : target(state, Weathering.maps().unwaxInto());
        if (scraped.isEmpty() && unwaxed.isEmpty()) {
            return InteractionResult.PASS;
        }
        BlockState into = scraped.orElseGet(unwaxed::get);
        if (!level.isClientSide()) {
            SoundEvent sound = scraped.isPresent() ? SoundEvents.AXE_SCRAPE.value() : SoundEvents.AXE_WAX_OFF.value();
            Weathering.replace(level, pos, state, into);
            level.playSound(null, pos, sound, SoundSource.BLOCKS, 1.0f, 1.0f);
            // A null source, as for wax on: the acting player sees the particles too (B464a).
            level.levelEvent(null, scraped.isPresent() ? LevelEvent.PARTICLES_SCRAPE : LevelEvent.PARTICLES_WAX_OFF, pos, 0);
            level.gameEvent(GameEvent.BLOCK_CHANGE, pos, GameEvent.Context.of(player, into));
            stack.hurtAndBreak(1, player, hand.asEquipmentSlot());
        }
        return InteractionResult.SUCCESS;
    }

    /** The state {@code state}'s project block turns into through {@code map}, with the shared properties copied. */
    private static Optional<BlockState> target(BlockState state, Map<Identifier, Identifier> map) {
        if (!PROJECT.contains(state.getBlock())) {
            return Optional.empty();
        }
        Identifier into = map.get(BuiltInRegistries.BLOCK.getKey(state.getBlock()));
        if (into == null || !BuiltInRegistries.BLOCK.containsKey(into)) {
            return Optional.empty();
        }
        return Optional.of(BlockExtras.copyProperties(state, BuiltInRegistries.BLOCK.getValue(into).defaultBlockState()));
    }
}
