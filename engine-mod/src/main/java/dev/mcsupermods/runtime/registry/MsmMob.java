package dev.mcsupermods.runtime.registry;

import dev.mcsupermods.runtime.events.AnimationTarget;
import dev.mcsupermods.runtime.loader.EntityDefinition;
import dev.mcsupermods.runtime.registry.mob.MobDriver;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.resources.Identifier;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.control.LookControl;
import net.minecraft.world.entity.ai.control.MoveControl;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;

/**
 * Every runtime mob body ({@link MsmEntity}, {@link MsmAnimal}, {@link MsmMonster} and their GeckoLib subclasses;
 * ADR 0070 D2). A body overrides the vanilla callbacks and only delegates to its {@link MobDriver}, which holds the
 * behaviour every body shares; this interface is what the driver and its modules see of the body.
 */
public interface MsmMob extends AnimationTarget, Merchant {
    /** The body's driver, built on first use from the definition of the body's entity type. */
    MobDriver driver();

    /** The body as a vanilla mob; every body is a {@link PathfinderMob}. */
    default PathfinderMob asMob() {
        return (PathfinderMob) this;
    }

    /** The definition this entity was registered from. */
    default EntityDefinition definition() {
        return driver().definition();
    }

    /** The entity type id, the owner of the definition's events. */
    default Identifier definitionId() {
        return driver().id();
    }

    /** The body class's variant index accessor ({@code DATA_VARIANT}, ADR 0071 D4). */
    EntityDataAccessor<Integer> variantData();

    /** The body class's triggered animation accessor ({@code DATA_ANIM}, ADR 0072 D2). */
    EntityDataAccessor<Integer> animData();

    /** The body class's roosting flag ({@code DATA_ROOSTING}, ADR 0109 D3 as amended). */
    EntityDataAccessor<Boolean> roostingData();

    /** The body class's playing dead flag ({@code DATA_PLAYING_DEAD}, ADR 0109 D4, D5). */
    EntityDataAccessor<Boolean> playingDeadData();

    /** Replaces the protected {@code moveControl} and {@code lookControl} fields (ADR 0070 D3); {@code null} keeps one. */
    void setControls(MoveControl move, LookControl look);

    /** Goes through {@code MobAnimations}; the GeckoLib bodies also trigger the GeckoLib animation. */
    @Override
    default void playAnimation(String controller, String animation) {
        driver().animations().play(controller, animation);
    }

    // Merchant (ADR 0098 D1, B474): the body is the merchant of its trading menu, because vanilla's menu treats the
    // merchant as an entity (a shift-click plays the trade sound at it). Everything goes to the driver's MobTrader; a mob
    // without msm:trader has no offers and never opens the menu.

    @Override
    default void setTradingPlayer(Player player) {
        driver().trader().setTradingPlayer(player);
    }

    @Override
    default Player getTradingPlayer() {
        return driver().trader().getTradingPlayer();
    }

    @Override
    default MerchantOffers getOffers() {
        return driver().trader().getOffers();
    }

    @Override
    default void overrideOffers(MerchantOffers offers) {
        driver().trader().overrideOffers(offers);
    }

    @Override
    default void notifyTrade(MerchantOffer offer) {
        driver().trader().notifyTrade(offer);
    }

    @Override
    default void notifyTradeUpdated(ItemStack stack) {
        driver().trader().notifyTradeUpdated(stack);
    }

    @Override
    default int getVillagerXp() {
        return driver().trader().getVillagerXp();
    }

    @Override
    default void overrideXp(int xp) {
        driver().trader().overrideXp(xp);
    }

    @Override
    default boolean showProgressBar() {
        return driver().trader().showProgressBar();
    }

    @Override
    default SoundEvent getNotifyTradeSound() {
        return driver().trader().getNotifyTradeSound();
    }

    @Override
    default boolean canRestock() {
        return driver().trader().canRestock();
    }

    @Override
    default boolean isClientSide() {
        return driver().trader().isClientSide();
    }

    @Override
    default boolean stillValid(Player player) {
        return driver().trader().stillValid(player);
    }
}
